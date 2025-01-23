const { SlashCommandBuilder } = require('discord.js');
const boardService = require('../services/boardService');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class DiscordCommands {
    constructor(boardService) {
        this.boardService = boardService;
        this.allowedGuildId = process.env.TOADBOX;
        
        if (!this.allowedGuildId) {
            logger.warn('TOADBOX guild ID not set in environment variables');
        }
    }

    setupCommands() {
        return [
            new SlashCommandBuilder()
                .setName('bingo')
                .setDescription('Manage bingo boards')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription('Create a new bingo board')
                        .addStringOption(option =>
                            option.setName('title')
                            .setDescription('Title for the new board')
                            .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Set content in a bingo cell')
                        .addStringOption(option =>
                            option.setName('cell')
                            .setDescription('Cell to update (e.g., A4)')
                            .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('type')
                            .setDescription('Type of content to set')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Text', value: 'text' },
                                { name: 'Image URL', value: 'image' }
                            )
                        )
                        .addStringOption(option =>
                            option.setName('content')
                            .setDescription('Text or image URL to set in the cell')
                            .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('mark')
                        .setDescription('Mark a cell with an X')
                        .addStringOption(option =>
                            option.setName('cell').setDescription('Cell to mark (e.g., A4)').setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('unmark')
                        .setDescription('Remove the X from a cell')
                        .addStringOption(option =>
                            option.setName('cell').setDescription('Cell to unmark (e.g., A4)').setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('title')
                        .setDescription('Set the bingo card title')
                        .addStringOption(option =>
                            option.setName('text').setDescription('New title for the bingo card').setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('clear')
                        .setDescription('Clear a cell\'s content')
                        .addStringOption(option =>
                            option.setName('cell').setDescription('Cell to clear (e.g., A4)').setRequired(true)
                        )
                )
        ];
    }

    async register(client) {
        try {
            // Register commands only for the specific guild
            const guild = client.guilds.cache.get(this.allowedGuildId);
            
            if (!guild) {
                logger.error('ToadBox guild not found', { guildId: this.allowedGuildId });
                return;
            }

            // Fetch and delete existing guild commands
            const existingCommands = await guild.commands.fetch();
            for (const command of existingCommands.values()) {
                await guild.commands.delete(command);
            }

            // Register new commands for the specific guild
            const commands = this.setupCommands();
            await guild.commands.set(commands);
            
            logger.info('Discord commands registered for ToadBox', { 
                guildId: this.allowedGuildId,
                commandCount: commands.length 
            });
        } catch (error) {
            logger.error('Failed to register Discord commands', { error: error.message });
            throw error;
        }
    }

    async handleCommand(interaction) {
        logger.info('Handling Discord command', {
            command: interaction.commandName,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            username: interaction.user.tag
        });

        // Check if command is from ToadBox
        if (interaction.guildId !== this.allowedGuildId) {
            logger.warn('Command attempted from unauthorized guild', {
                guildId: interaction.guildId,
                userId: interaction.user.id
            });
            await interaction.reply({
                content: '❌ This bot is only available in ToadBox.',
                ephemeral: true
            });
            return;
        }

        const command = interaction.commandName;
        
        try {
            // Check if command is allowed before proceeding
            if (!this.boardService.isCommandAllowed(command)) {
                logger.info('Command not allowed in unified mode', {
                    command,
                    userId: interaction.user.id
                });
                await interaction.reply({
                    content: `⚠️ The command \`/${command}\` is not available in unified mode. Only basic board operations (set, clear, mark, unmark) are allowed.`,
                    ephemeral: true
                });
                return;
            }

            // Use UNIFIED_BOARD_ID in unified mode, otherwise use guildId
            const boardId = this.boardService.mode === constants.BOARD_MODES.UNI 
                ? constants.UNIFIED_BOARD_ID 
                : interaction.guildId;

            logger.info('Loading board for command', {
                boardId,
                mode: this.boardService.mode,
                command
            });

            const board = await this.boardService.loadBoard(boardId);
            if (!board) {
                logger.error('Failed to load unified board', { boardId });
                await interaction.reply({
                    content: '❌ Error loading the unified board. Please contact an administrator.',
                    ephemeral: true
                });
                return;
            }

            logger.info('Board loaded successfully', {
                boardId: board.id,
                title: board.title,
                command
            });

            switch (command) {
                case 'bingo':
                    const subcommand = interaction.options.getSubcommand();
                    logger.info('Processing bingo subcommand', {
                        subcommand,
                        mode: this.boardService.mode
                    });

                    if (this.boardService.mode === constants.BOARD_MODES.UNI && 
                        !['show', 'help'].includes(subcommand)) {
                        logger.info('Advanced operation attempted in unified mode', {
                            subcommand,
                            userId: interaction.user.id
                        });
                        await interaction.reply({
                            content: '⚠️ Only basic board operations are available in unified mode.',
                            ephemeral: true
                        });
                        return;
                    }
                    await this.handleSubcommand(interaction, board);
                    break;

                default:
                    logger.warn('Unknown command received', { command });
                    await interaction.reply({
                        content: '❌ Unknown command',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Discord command error', { 
                error: error.message,
                command: interaction?.commandName,
                stack: error.stack,
                user: interaction.user.tag,
                guildId: interaction.guildId
            });
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                ephemeral: true
            });
        }
    }

    async handleSubcommand(interaction, board) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set':
                case 'mark':
                case 'unmark':
                case 'clear':
                    // These commands are always allowed
                    await this.handleBasicOperation(interaction, board, subcommand);
                    break;

                case 'show':
                case 'help':
                    // These commands are view-only and always allowed
                    await this.handleViewOperation(interaction, board, subcommand);
                    break;

                default:
                    // All other commands are checked against unified mode
                    if (this.boardService.mode === constants.BOARD_MODES.UNI) {
                        throw new Error('This command is not available in unified mode');
                    }
                    await this.handleAdvancedOperation(interaction, board, subcommand);
            }
        } catch (error) {
            throw error;
        }
    }

    async handleBasicOperation(interaction, board, operation) {
        const cell = interaction.options.getString('cell');
        const value = interaction.options.getString('value');

        logger.info('Handling basic operation', {
            operation,
            cell,
            value,
            boardId: board.id,
            userId: interaction.user.id
        });

        try {
            switch (operation) {
                case 'set':
                    await this.boardService.setCellValue(board, cell, value);
                    logger.info('Cell value set', { cell, value, boardId: board.id });
                    await interaction.reply(`Set cell ${cell} to "${value}"`);
                    break;

                case 'mark':
                    await this.boardService.markCell(board, cell);
                    logger.info('Cell marked', { cell, boardId: board.id });
                    await interaction.reply(`Marked cell ${cell} with an X`);
                    break;

                case 'unmark':
                    await this.boardService.unmarkCell(board, cell);
                    logger.info('Cell unmarked', { cell, boardId: board.id });
                    await interaction.reply(`Removed the X from cell ${cell}`);
                    break;

                case 'clear':
                    await this.boardService.clearCell(board, cell);
                    logger.info('Cell cleared', { cell, boardId: board.id });
                    await interaction.reply(`Cleared cell ${cell}`);
                    break;
            }
        } catch (error) {
            logger.error('Failed to perform basic operation', {
                operation,
                cell,
                value,
                boardId: board.id,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async handleViewOperation(interaction, board, operation) {
        switch (operation) {
            case 'show':
                // Existing show logic
                break;

            case 'help':
                const helpText = this.boardService.mode === constants.BOARD_MODES.UNI
                    ? this.getUnifiedModeHelp()
                    : this.getStandardModeHelp();
                await interaction.reply({
                    content: helpText,
                    ephemeral: true
                });
                break;
        }
    }

    getUnifiedModeHelp() {
        return `
**Available Commands in Unified Mode:**
• \`/bingo set <cell> <value>\` - Set a cell's value
• \`/bingo mark <cell>\` - Mark a cell as complete
• \`/bingo unmark <cell>\` - Remove mark from a cell
• \`/bingo clear <cell>\` - Clear a cell's contents

Note: Advanced board management commands are disabled in unified mode.`;
    }

    async handleAdvancedOperation(interaction, board, subcommand) {
        // Implementation of advanced operation handling
        throw new Error('Advanced operation handling not implemented');
    }
}

module.exports = DiscordCommands;
