const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const logger = require('./utils/logger');
const DiscordCommands = require('./routes/discord');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const { isAuthenticated } = require('./middleware/auth');
const constants = require('./config/constants');
const sharedConstants = require('../../shared/constants.js');
const boardService = require('./services/boardService');
const database = require('./models/database');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const adminUsersRoutes = require('./routes/admin/users');
const imageRoutes = require('./routes/images');
const configLoader = require('./utils/configLoader');
const chatRoutes = require('./routes/chat');
const websocketServer = require('./websocket');

class Server {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
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

        // Initialize WebSocket server
        this.setupWebSockets();
        
        this.setupShutdownHandlers();
    }

    setupMiddleware() {
        // Trust proxy
        this.app.set('trust proxy', 1);
        
        // Security and parsing middleware
        this.app.use(express.json());
        // Add cookie parser middleware
        this.app.use(cookieParser());

        // Add session middleware to prevent login loops
        this.app.use(session({
            secret: process.env.SESSION_SECRET || 'bingo-session-secret',
            resave: false,
            saveUninitialized: true,
            cookie: { 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
        }));

        // Add cookie debugging middleware
        this.app.use((req, res, next) => {
            const originalSetCookie = res.setHeader;
            
            // Intercept setHeader calls to log Set-Cookie
            res.setHeader = function(name, value) {
                if (name === 'Set-Cookie') {
                    logger.debug('Setting cookie', { 
                        path: req.path, 
                        cookies: Array.isArray(value) ? value : [value] 
                    });
                }
                return originalSetCookie.call(this, name, value);
            };
            
            next();
        });

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

        // Enhanced rate limiting with shared constants
        const apiLimiter = rateLimit({
            windowMs: sharedConstants.API.RATE_LIMIT_WINDOW_MS,
            max: sharedConstants.API.RATE_LIMIT_MAX_REQUESTS,
            message: {
                error: sharedConstants.getErrorResponse('RATE_LIMIT_EXCEEDED').message,
                code: sharedConstants.ERROR_CODES.RATE_LIMIT_EXCEEDED
            },
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: true,
            skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
            keyGenerator: (req) => `${req.ip}_${req.path}`,
            handler: (req, res) => {
                logger.warn('Rate limit exceeded', {
                    ip: req.ip,
                    path: req.path,
                    userAgent: req.get('User-Agent')
                });
                
                const response = sharedConstants.getErrorResponse('RATE_LIMIT_EXCEEDED', req.id);
                res.status(429).json(response);
            }
        });

        // More restrictive limits for authentication endpoints
        const authLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 10, // 10 attempts per window
            message: {
                error: 'Too many authentication attempts, please try again later.',
                code: sharedConstants.ERROR_CODES.RATE_LIMIT_EXCEEDED
            },
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: true,
            keyGenerator: (req) => `auth_${req.ip}`,
            handler: (req, res) => {
                logger.warn('Auth rate limit exceeded', {
                    ip: req.ip,
                    path: req.path,
                    userAgent: req.get('User-Agent')
                });
                
                res.status(429).json({
                    error: 'Too many authentication attempts, please try again later.',
                    code: sharedConstants.ERROR_CODES.RATE_LIMIT_EXCEEDED,
                    requestId: req.id
                });
            }
        });

        this.app.use('/api/', apiLimiter);
        this.app.use('/api/auth/', authLimiter);

        // Apply authentication middleware globally
        this.app.use(isAuthenticated);

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

        // Authentication routes
        this.app.use('/api/auth', authRoutes);

        // API routes
        this.app.use('/api', apiRoutes);
        
        // User routes
        this.app.use('/api/users', userRoutes);

        // Notification routes
        this.app.use('/api/notifications', notificationRoutes);

        // Admin routes
        this.app.use('/api/admin/users', adminUsersRoutes);

        // Image routes
        this.app.use('/api/images', imageRoutes);

        // Board view route
        this.app.get('/board/:boardId', (req, res) => {
            logger.debug('Serving board page', { boardId: req.params.boardId });
            res.sendFile(path.join(__dirname, '../public/board.html'));
        });

        // Admin page - requires authentication
        this.app.get('/admin', (req, res) => {
            logger.debug('Serving admin page');
            res.sendFile(path.join(__dirname, '../public/admin.html'));
        });

        // Redirect root to login page or index based on auth status
        this.app.get('/', (req, res) => {
            // User is already authenticated via middleware
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // Login page - direct access
        this.app.get('/login.html', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/login.html'));
        });

        // Redirect to login page for unauthenticated access
        this.app.get('/login', (req, res) => {
            res.redirect(constants.LOGIN_PAGE);
        });

        // Chat routes - protected with authentication
        this.app.use('/api/chat', isAuthenticated, chatRoutes);

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

    setupWebSockets() {
        // Initialize WebSocket server with HTTP server
        this.io = websocketServer.initialize(this.server);
        
        logger.info('WebSocket server attached to HTTP server');
        
        // Handle WebSocket server shutdown
        this.server.on('close', () => {
            if (this.io) {
                this.io.close();
                logger.info('WebSocket server closed');
            }
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
                try {
                    await this.client.destroy();
                    logger.info('Discord bot disconnected');
                } catch (error) {
                    logger.error('Error disconnecting Discord bot', { error: error.message });
                }
            }
            
            // Clean up any database connections or file handles
            try {
                if (boardService && typeof boardService.cleanup === 'function') {
                    await boardService.cleanup();
                    logger.info('Board service cleaned up');
                }
            } catch (error) {
                logger.error('Error cleaning up board service', { error: error.message });
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
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', { 
                error: error.message,
                stack: error.stack
            });
            shutdown('UNCAUGHT_EXCEPTION');
        });
        
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection', { 
                reason: reason.toString(),
                stack: reason.stack || 'No stack trace available'
            });
            shutdown('UNHANDLED_REJECTION');
        });
    }

    async start() {
        try {
            // Load configuration
            configLoader.loadConfig();
            
            // Initialize database
            await database.initialize();
            
            // Connect to Discord if not in offline mode
            if (!constants.OFFLINE_MODE && this.client && process.env.DISCORD_BOT_TOKEN) {
                await this.client.login(process.env.DISCORD_BOT_TOKEN);
            }
            
            // Continue with normal startup
            const PORT = process.env.PORT || 3000;
            
            // Use this.server instead of this.app for listening
            this.server.listen(PORT, () => {
                logger.info(`Server running on port ${PORT}`);
            });
            
            // Track active connections for graceful shutdown
            this.server.on('connection', connection => {
                this.connections.add(connection);
                connection.on('close', () => {
                    this.connections.delete(connection);
                });
            });
        } catch (error) {
            logger.error('Failed to start server', error);
            process.exit(1);
        }
    }
}

// Export server class
module.exports = Server;

// Start server if this file is run directly
if (require.main === module) {
    const server = new Server();
    server.start().catch(error => {
        logger.error('Server startup failed', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    });
}