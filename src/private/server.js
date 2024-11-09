const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const discordCommands = require('./routes/discord');
const apiRoutes = require('./routes/api');
const constants = require('./config/constants');

class Server {
    constructor() {
        this.app = express();
        
        // Only initialize Discord client if not in offline mode
        if (!constants.OFFLINE_MODE) {
            this.client = new Client({ 
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent
                ] 
            });
        }
        
        this.setupMiddleware();
        this.setupRoutes();
        
        // Only setup Discord bot if not in offline mode
        if (!constants.OFFLINE_MODE) {
            this.setupDiscordBot();
        }
    }

    setupMiddleware() {
        // Security and parsing middleware
        this.app.use(express.json());
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                }
            }
        }));
        
        // Rate limiting
        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100
        });
        this.app.use('/api/', apiLimiter);

        // Static files and caching
        this.app.use(express.static(path.join(__dirname, '../public')));
        this.app.use('/images/cells', express.static(path.join(__dirname, '../public/images/cells')));
        
        // Cache control
        this.app.use((req, res, next) => {
            if (req.url.match(/\.(css|js|jpg|png|gif)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
            } else {
                res.setHeader('Cache-Control', 'no-cache');
            }
            next();
        });
    }

    setupRoutes() {
        // API routes
        this.app.use('/api', apiRoutes);

        // Board view route
        this.app.get('/board/:boardId', (req, res) => {
            logger.debug('Serving board page', { boardId: req.params.boardId });
            res.sendFile(path.join(__dirname, '../public/board.html'));
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            logger.error('Unhandled error', { 
                error: err.message,
                stack: err.stack,
                path: req.path
            });
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupDiscordBot() {
        this.client.once('ready', async () => {
            logger.info('Discord bot is ready', { username: this.client.user.tag });
            await discordCommands.register(this.client);
        });

        this.client.on('interactionCreate', async interaction => {
            try {
                await discordCommands.handleCommand(interaction);
            } catch (error) {
                logger.error('Discord command error', { 
                    error: error.message,
                    command: interaction?.commandName
                });
            }
        });

        // Handle Discord errors
        this.client.on('error', error => {
            logger.error('Discord client error', { error: error.message });
        });
    }

    async start() {
        try {
            // Start Express server
            await new Promise(resolve => {
                this.app.listen(constants.PORT, () => {
                    logger.info(`Server is running on http://localhost:${constants.PORT} ${constants.OFFLINE_MODE ? '(OFFLINE MODE)' : ''}`);
                    resolve();
                });
            });

            // Start Discord bot only if not in offline mode
            if (!constants.OFFLINE_MODE) {
                await this.client.login(process.env.TOKEN);
                logger.info('Discord bot logged in successfully');
            }
        } catch (error) {
            logger.error('Failed to start server', { error: error.message });
            process.exit(1);
        }
    }
}

// Create and start server
const server = new Server();
server.start().catch(error => {
    logger.error('Critical server error', { error: error.message });
    process.exit(1);
});