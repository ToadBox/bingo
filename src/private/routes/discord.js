const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const constants = require('../config/constants');
const boardModel = require('../models/boardModel');
const express = require('express');
const passport = require('passport');
const axios = require('axios');
const authService = require('../services/authService');

class DiscordCommands {
    constructor() {
        this.client = null;
        this.boardModel = boardModel;
    }

    async initialize() {
        if (!process.env.DISCORD_BOT_TOKEN) {
            throw new Error('Discord bot token not provided');
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.client.once('ready', () => {
            logger.info('Discord bot is ready', { 
                tag: this.client.user.tag,
                id: this.client.user.id 
            });
            this.setupCommands();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleCommand(interaction);
        });

        await this.client.login(process.env.DISCORD_BOT_TOKEN);
        return this.client;
    }

    async setupCommands() {
        if (!process.env.TOADBOX) {
            logger.warn('TOADBOX guild ID not set, Discord commands will not be registered');
            return;
        }

        const commands = [
            new SlashCommandBuilder()
                .setName('bingo')
                .setDescription('Interact with bingo boards')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('Show board status')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('help')
                        .setDescription('Show help information')
                )
        ];

        try {
            const guild = this.client.guilds.cache.get(process.env.TOADBOX);
            
            if (!guild) {
                logger.error('ToadBox guild not found', { guildId: process.env.TOADBOX });
                return;
            }

            await guild.commands.set(commands);
            logger.info('Discord commands registered for ToadBox', { 
                guildId: process.env.TOADBOX,
                commandCount: commands.length 
            });
        } catch (error) {
            logger.error('Failed to register Discord commands', { 
                error: error.message 
            });
        }
    }

    async handleCommand(interaction) {
        try {
        // Check if command is from ToadBox
            if (interaction.guildId !== process.env.TOADBOX) {
            logger.warn('Command attempted from unauthorized guild', {
                guildId: interaction.guildId,
                userId: interaction.user.id
            });
            await interaction.reply({
                    content: 'This bot only works in the ToadBox server.', 
                ephemeral: true
            });
            return;
        }

            const { commandName } = interaction;
        
            if (commandName === 'bingo') {
                const subcommand = interaction.options.getSubcommand();
                
                switch (subcommand) {
                    case 'status':
                        await this.handleStatusCommand(interaction);
                        break;
                    case 'help':
                        await this.handleHelpCommand(interaction);
                        break;
                    default:
                    await interaction.reply({
                            content: 'Unknown subcommand.', 
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            logger.error('Error handling Discord command', {
                error: error.message,
                command: interaction.commandName,
                userId: interaction.user.id
            });
            
            const errorMessage = 'An error occurred while processing your command.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
                    } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    async handleStatusCommand(interaction) {
        try {
            const boards = await this.boardModel.getAllBoards({
                includePublic: true,
                limit: 5
            });

            const embed = new EmbedBuilder()
                .setTitle('🎯 ToadBox Bingo Status')
                .setColor(0x00AE86)
                .setTimestamp();

            if (boards.length === 0) {
                embed.setDescription('No boards found.');
            } else {
                embed.setDescription(`Found ${boards.length} recent boards:`);
                
                boards.slice(0, 5).forEach((board, index) => {
                    const createdBy = board.creator_username || 'server';
                    const url = board.creator_username 
                        ? `/${board.creator_username}/${board.slug}`
                        : `/server/${board.slug}`;
                    
                    embed.addFields({
                        name: `${index + 1}. ${board.title}`,
                        value: `Created by: ${createdBy}\nURL: ${url}`,
                        inline: true
                    });
                });
            }

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error in status command', { error: error.message });
                await interaction.reply({
                content: 'Failed to fetch board status.', 
                    ephemeral: true
                });
            }
        }

    async handleHelpCommand(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎯 ToadBox Bingo Help')
            .setColor(0x00AE86)
            .setDescription('Available commands:')
            .addFields(
                {
                    name: '/bingo status',
                    value: 'Show current board status and recent boards',
                    inline: false
                },
                {
                    name: '/bingo help',
                    value: 'Show this help message',
                    inline: false
                },
                {
                    name: 'Web Interface',
                    value: 'Visit the website to create and manage boards interactively!',
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}

const router = express.Router();

// Discord authentication route
router.get('/discord', passport.authenticate('discord', {
  scope: ['identify', 'email', 'guilds']
}));

// Discord callback route
router.get('/discord/callback', async (req, res, next) => {
  passport.authenticate('discord', async (err, user, info) => {
    if (err) {
      logger.error('Discord authentication error', { error: err.message });
      return res.redirect('/login?error=discord_auth_failed');
    }
    
    if (!user) {
      logger.warn('No user returned from Discord auth', { info });
      return res.redirect('/login?error=discord_auth_failed');
    }
    
    try {
      // Extract Discord user info
      const { id, username, email, accessToken, refreshToken } = user;
      
      logger.info('Discord authentication successful', { 
        discordId: id, 
        username 
      });
      
      // Fetch user guilds
      let guildInfo = null;
      try {
        const response = await axios.get('https://discord.com/api/users/@me/guilds', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        
        if (response.status === 200) {
          guildInfo = response.data;
          logger.debug('Retrieved Discord guild info', { 
            guildCount: guildInfo.length,
            discordId: id 
          });
        }
      } catch (guildError) {
        logger.error('Failed to fetch Discord guilds', {
          error: guildError.message
        });
      }
      
      // Find guild IDs to store for approval logic
      const guilds = guildInfo || [];
      const guildIds = guilds.map(g => g.id).join(',');
      const approvedGuildIds = process.env.APPROVED_DISCORD_GUILDS 
        ? process.env.APPROVED_DISCORD_GUILDS.split(',') 
        : [];
        
      // Check if user is in any approved guilds
      const isInApprovedGuild = guilds.some(guild => approvedGuildIds.includes(guild.id));
      
      if (isInApprovedGuild) {
        logger.info('Discord user is in approved guild', { 
          discordId: id,
          username
        });
      }
      
      // Create or update user through auth service
      const userData = {
        username: username,
        email: email,
        auth_provider: 'discord',
        auth_id: id,
        discord_guild_id: guildIds
      };
      
      const { sessionToken, user: dbUser } = await authService.authenticateDiscordUser(userData);
      
      // Set auth token cookie
      res.cookie('auth_token', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // If admin, set admin token
      if (dbUser.is_admin === 1) {
        res.cookie('admin_token', sessionToken, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }
      
      // Check approval status and redirect accordingly
      if (dbUser.approval_status === 'pending') {
        return res.redirect('/pending-approval.html');
      } else {
        return res.redirect('/');
      }
    } catch (error) {
      logger.error('Failed to process Discord authentication', {
        error: error.message
      });
      res.redirect('/login?error=discord_auth_failed');
    }
  })(req, res, next);
});

module.exports = { DiscordCommands, router };
