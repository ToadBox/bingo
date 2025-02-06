const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const DiscordCommands = require('./routes/discord');
const apiRoutes = require('./routes/api');
const constants = require('./config/constants');
const boardService = require('./services/boardService');

class Server {
    constructor() {
        this.app = express();
        this.isShuttingDown = false;
        this.connections = new Set();
        
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

        this.setupShutdownHandlers();
    }

    setupMiddleware() {
        // Trust proxy
        this.app.set('trust proxy', 1);
        
        // Security and parsing middleware
        this.app.use(express.json());

        // Updated Helmet configuration
        const helmetConfig = {
            contentSecurityPolicy: {
                useDefaults: false,
                directives: {
                    defaultSrc: ["'self'", "https://earthviewinc.com"],
                    scriptSrc: [
                        "'self'",
                        "'unsafe-inline'",
                        "'unsafe-eval'",
                        "https://static.cloudflareinsights.com",
                        "https://*.cloudflareinsights.com"
                    ],
                    scriptSrcElem: [
                        "'self'",
                        "'unsafe-inline'",
                        "'unsafe-eval'",
                        "https://static.cloudflareinsights.com",
                        "https://*.cloudflareinsights.com"
                    ],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: [
                        "'self'",
                        "data:",
                        "https://earthviewinc.com",
                        "https://*.earthviewinc.com",
                        "https://*.cloudflareinsights.com"
                    ],
                    connectSrc: [
                        "'self'",
                        "https://*.cloudflareinsights.com",
                        "https://*.bingo.toadbox.net"
                    ],
                    iconSrc: ["'self'", "https://earthviewinc.com"],
                    workerSrc: ["'self'", "blob:"],
                    frameSrc: ["'none'"],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"]
                }
            },
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: { policy: "same-origin" },
            crossOriginResourcePolicy: { policy: "cross-origin" },
            referrerPolicy: { policy: "strict-origin-when-cross-origin" }
        };

        // Apply Helmet with config
        this.app.use(helmet(helmetConfig));
        
        // Additional CORS headers
        this.app.use((req, res, next) => {
            res.header('Cross-Origin-Resource-Policy', 'cross-origin');
            res.header('Access-Control-Allow-Origin', '*');
            next();
        });

        // Rate limiting
        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 500,
            message: 'Too many requests from this IP, please try again later.',
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: true,
            skip: (req) => req.ip === '127.0.0.1',
            keyGenerator: (req) => req.ip + req.path
        });
        this.app.use('/api/', apiLimiter);

        // Static files and caching
        this.app.use(express.static(path.join(__dirname, '../public'), {
            setHeaders: (res, path) => {
                if (path.endsWith('.js')) {
                    res.setHeader('Content-Type', 'application/javascript');
                }
                if (path.match(/\.(css|js|jpg|png|gif)$/)) {
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                } else {
                    res.setHeader('Cache-Control', 'no-cache');
                }
            }
        }));
        
        // Cache control middleware
        this.app.use((req, res, next) => {
            if (req.path.endsWith('.html') || req.path === '/') {
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
            }
            else if (req.path.match(/\.(js|css)$/)) {
                res.set('Cache-Control', 'public, max-age=0, must-revalidate');
            }
            next();
        });
    }

    setupRoutes() {
        // Add request logging middleware
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                logger.debug('Request completed', {
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    duration: Date.now() - start
                });
            });
            next();
        });

        // API routes
        this.app.use('/api', apiRoutes);

        // Board view route
        this.app.get('/board/:boardId', (req, res) => {
            logger.debug('Serving board page', { boardId: req.params.boardId });
            res.sendFile(path.join(__dirname, '../public/board.html'));
        });

        // Improved error handling
        this.app.use((err, req, res, next) => {
            const status = err.status || 500;
            const message = status === 500 ? 'Internal server error' : err.message;

            logger.error('Request error', {
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method,
                status
            });

            res.status(status).json({
                error: message,
                requestId: req.id
            });
        });
    }

    setupDiscordBot() {
        this.client.once('ready', async () => {
            logger.info('Discord bot is ready', { username: this.client.user.tag });
            const discordCommands = new DiscordCommands(boardService);
            await discordCommands.register(this.client);
        });

        this.client.on('interactionCreate', async interaction => {
            try {
                const discordCommands = new DiscordCommands(boardService);
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

    setupShutdownHandlers() {
        // Track connections
        this.app.on('connection', connection => {
            this.connections.add(connection);
            connection.on('close', () => this.connections.delete(connection));
        });

        // Graceful shutdown handler
        const shutdown = async (signal) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            logger.info(`Received ${signal}, starting graceful shutdown`);

            // Stop accepting new connections
            this.server?.close(() => {
                logger.info('HTTP server closed');
            });

            // Close existing connections
            this.connections.forEach(conn => conn.end());
            this.connections.clear();

            // Disconnect Discord bot if running
            if (!constants.OFFLINE_MODE && this.client) {
                await this.client.destroy();
                logger.info('Discord bot disconnected');
            }

            // Allow ongoing requests to finish (max 30s)
            setTimeout(() => {
                logger.error('Forcing shutdown after timeout');
                process.exit(1);
            }, 30000);

            process.exit(0);
        };

        // Register shutdown handlers
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    async start() {
        try {
            // Start Express server with server reference
            this.server = this.app.listen(constants.PORT, () => {
                logger.info(`Server is running on http://localhost:${constants.PORT} ${constants.OFFLINE_MODE ? '(OFFLINE MODE)' : ''}`);
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