const express = require('express');
const http = require('http');
const { Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const logger = require('./utils/logger');
const DiscordCommands = require('./routes/discord');
const authRoutes = require('./routes/auth');
const boardsRoutes = require('./routes/boards');
const { isAuthenticated } = require('./middleware/auth');
const constants = require('./config/constants');
const database = require('./models/database');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin/users');
const chatRoutes = require('./routes/chat');
const imageRoutes = require('./routes/images');
const websocketServer = require('./websocket');
const configLoader = require('./utils/configLoader');
const startupChecks = require('./utils/startupChecks');
const requestTracking = require('./middleware/requestTracking');
const performanceMonitoring = require('./middleware/performanceMonitoring');
const adminErrorReportsRoutes = require('./routes/admin/errorReports');
const { buildDevServerUrl } = require('./utils/devRedirect');
const globalCache = require('./utils/globalCache');

class Server {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.isShuttingDown = false;
        this.connections = new Set();
        this.discordEnabled = false;
        
        // Initialize global cache first
        globalCache.initialize();
        
        // Check if Discord should be enabled
        this.checkDiscordAvailability();
        
        // Only initialize Discord client if Discord is enabled
        if (this.discordEnabled) {
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
        this.setupErrorHandling();
        this.setupGracefulShutdown();
    }

    /**
     * Get global cache instance
     */
    getCache() {
        return globalCache;
    }

    /**
     * Check if Discord should be enabled
     */
    checkDiscordAvailability() {
        try {
            // Check if we're in offline mode
            if (process.env.OFFLINE_MODE === 'true') {
                logger.discord.info('Discord disabled: Offline mode enabled');
                this.discordEnabled = false;
                return;
            }

            // Check if Discord bot token is provided
            if (!process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN.trim() === '') {
                logger.discord.info('Discord disabled: No bot token provided');
                this.discordEnabled = false;
                return;
            }

            // Check if Discord client credentials are provided for OAuth
            if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
                logger.discord.warn('Discord OAuth disabled: Missing client credentials');
                // Bot can still work without OAuth
            }

            this.discordEnabled = true;
            logger.discord.info('Discord bot enabled');
        } catch (error) {
            logger.discord.error('Error checking Discord availability', {
                error: error.message
            });
            this.discordEnabled = false;
        }
    }

    setupMiddleware() {
        // Request tracking & performance monitoring should be first so that
        // later middleware can leverage the generated requestId and metrics
        this.app.use(requestTracking);
        this.app.use(performanceMonitoring);

        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "wss:", "ws:"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // limit each IP to 1000 requests per windowMs
            message: 'Too many requests from this IP, please try again later.',
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use(limiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(cookieParser());

        // Session configuration
        this.app.use(session({
            secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
        }));

        // Static files - serve React build in production, keep public assets
        if (process.env.NODE_ENV === 'production') {
            // In production, serve the React build
            this.app.use(express.static('frontend/dist'));
            // Also serve remaining public assets (images, manifest)
            this.app.use('/assets', express.static('src/public'));
        } else {
            // In development, serve remaining public assets and let React dev server handle the frontend
            this.app.use('/assets', express.static('src/public'));
            // Note: React dev server runs on port 3001 and proxies API calls to this server
        }
    }

    setupRoutes() {
        // Authentication routes
        this.app.use('/api/auth', authRoutes);
        
        // Configure Discord OAuth routes if Discord is enabled
        // Note: Discord routes are configured within the auth router itself

        // Board routes
        this.app.use('/api/boards', boardsRoutes);
        
        // User routes
        this.app.use('/api/users', userRoutes);
        
        // Notification routes
        this.app.use('/api/notifications', isAuthenticated, notificationRoutes);
        
        // Admin routes – mount specialised endpoints first to avoid them being
        // swallowed by the broader '/api/admin' router.
        this.app.use('/api/admin/error-reports', isAuthenticated, adminErrorReportsRoutes);
        this.app.use('/api/admin', isAuthenticated, adminRoutes);
        
        // Chat routes
        this.app.use('/api/chat', chatRoutes);
        
        // Image routes
        this.app.use('/api/images', imageRoutes);

        // Board routes with new URL structure - serve React app
        this.app.get('/boards', isAuthenticated, (req, res) => {
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                // In development, redirect to React dev server
                res.redirect(buildDevServerUrl(req, '/boards'));
            }
        });

        // Create board page
        this.app.get('/boards/create', isAuthenticated, (req, res) => {
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                res.redirect(buildDevServerUrl(req, '/boards/create'));
            }
        });

        // Anonymous board routes: /anonymous/:slug
        this.app.get('/anonymous/:slug', isAuthenticated, async (req, res, next) => {
            const { slug } = req.params;
            
            try {
                // Check if anonymous board exists
                const boardModel = require('./models/boardModel');
                const board = await boardModel.getBoardByAnonymousSlug(slug);
                
                if (board) {
                    // Serve the board page
                    res.sendFile('board.html', { root: 'src/public' });
                } else {
                    // Board not found, continue to next middleware (likely 404)
                    next();
                }
            } catch (error) {
                logger.board.error('Error checking anonymous board existence', {
                    error: error.message,
                    slug
                });
                next();
            }
        });

        // Individual board routes: /:username/:slug
        this.app.get('/:username/:slug', isAuthenticated, async (req, res, next) => {
            const { username, slug } = req.params;
            
            // Skip if this looks like a static file, API route, or anonymous route
            if (username.includes('.') || username.startsWith('api') || username.startsWith('css') || username.startsWith('js') || username === 'anonymous') {
                return next();
            }
            
            try {
                // Check if board exists
                const boardModel = require('./models/boardModel');
                const board = await boardModel.getBoardByUsernameAndSlug(username, slug);
                
                if (board) {
                    // Serve the board page
                    res.sendFile('board.html', { root: 'src/public' });
                } else {
                    // Board not found, continue to next middleware (likely 404)
                    next();
                }
            } catch (error) {
                logger.board.error('Error checking board existence', {
                    error: error.message,
                    username,
                    slug
                });
                next();
            }
        });

        // Legacy board route redirect
        this.app.get('/board/:boardId', isAuthenticated, (req, res) => {
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                res.redirect(buildDevServerUrl(req, `/board/${req.params.boardId}`));
            }
        });

        // Home page - require authentication
        this.app.get('/', isAuthenticated, (req, res) => {
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                res.redirect(buildDevServerUrl(req, '/'));
            }
        });

        // Admin page
        this.app.get('/admin', isAuthenticated, (req, res) => {
            if (!req.user.is_admin) {
                return res.status(403).send('Access denied');
            }
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                res.redirect(buildDevServerUrl(req, '/admin'));
            }
        });

        // Login route - serve React app (no auth required)
        this.app.get('/login', (req, res) => {
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                res.redirect(buildDevServerUrl(req, '/login'));
            }
        });

        // Version endpoint
        this.app.get('/api/version', (req, res) => {
            res.json({
                version: process.env.npm_package_version || '1.0.0',
                timestamp: Date.now()
            });
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Catch-all route for React SPA - must be last route
        this.app.get('*', (req, res) => {
            // Skip API routes and static files
            if (req.path.startsWith('/api/') || req.path.includes('.')) {
                return res.status(404).json({ error: 'Not Found' });
            }
            
            if (process.env.NODE_ENV === 'production') {
                res.sendFile('index.html', { root: 'frontend/dist' });
            } else {
                // In development, redirect to React dev server
                res.redirect(buildDevServerUrl(req, req.path));
            }
        });
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            logger.api.warn('404 Not Found', {
                method: req.method,
                path: req.path,
                ip: req.ip
            });
            res.status(404).json({ error: 'Not Found' });
        });

        // Global error handler
        this.app.use((err, req, res, next) => {
            logger.api.error('Unhandled error', {
                error: err.message,
                stack: err.stack,
                method: req.method,
                path: req.path
            });
            
            res.status(500).json({ 
                error: process.env.NODE_ENV === 'production' 
                    ? 'Internal Server Error' 
                    : err.message 
            });
        });
    }

    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            if (this.isShuttingDown) {
                logger.warn('Force shutdown initiated');
                process.exit(1);
            }

            this.isShuttingDown = true;
            logger.info(`Received ${signal}, starting graceful shutdown...`);

            // Stop accepting new connections
            this.server.close(() => {
                logger.info('HTTP server closed');
            });

            // Close existing connections
            for (const connection of this.connections) {
                connection.destroy();
            }

            // Close Discord client
            if (this.discordEnabled && this.client) {
                try {
                    this.client.destroy();
                    logger.info('Discord client closed');
                } catch (error) {
                    logger.error('Error closing Discord client', {
                        error: error.message
                    });
                }
            }

            // Close database connection
            try {
                await database.close();
                logger.info('Database connection closed');
            } catch (error) {
                logger.error('Error closing database connection', {
                    error: error.message
                });
            }

            logger.info('Graceful shutdown completed');
            process.exit(0);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    async start() {
        try {
            // Load configuration first
            configLoader.loadConfig();
            
            // Initialize database (includes migrations)
            await database.initialize();
            
            // Run startup configuration checks (without migrations)
            await startupChecks.runChecks();
            
            // Initialize Discord bot if enabled
            if (this.discordEnabled && this.client && process.env.DISCORD_BOT_TOKEN) {
                try {
                    await this.client.login(process.env.DISCORD_BOT_TOKEN);
                    logger.discord.info('Discord bot connected successfully');
                    
                    // Initialize Discord commands
                    try {
                        const { DiscordCommands } = require('./routes/discord');
                        const discordCommands = new DiscordCommands();
                        await discordCommands.initialize();
                        logger.discord.info('Discord commands initialized');
                    } catch (commandError) {
                        logger.discord.warn('Discord commands failed to initialize', { 
                            error: commandError.message 
                        });
                    }
                } catch (error) {
                    logger.discord.error('Failed to connect Discord bot', {
                        error: error.message
                    });
                    logger.discord.warn('Continuing without Discord functionality');
                    this.discordEnabled = false;
                }
            }

            // Initialize WebSocket server
            websocketServer.initialize(this.server);
            logger.websocket.info('WebSocket server initialized');

            // Track connections for graceful shutdown
            this.server.on('connection', (connection) => {
                this.connections.add(connection);
                connection.on('close', () => {
                    this.connections.delete(connection);
                });
            });

            // Start HTTP server
            const port = process.env.PORT || 3000;
            this.server.listen(port, () => {
                logger.info(`Server started successfully`, {
                    port,
                    env: process.env.NODE_ENV,
                    discordEnabled: this.discordEnabled,
                    websocketEnabled: true
                });
            });

        } catch (error) {
            logger.error('Failed to start server', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }
}

module.exports = Server;

// Start server if this file is run directly
if (require.main === module) {
    const server = new Server();
    
    server.start().catch(error => {
        logger.server.error('Failed to start server', { error: error.message });
        process.exit(1);
    });
}

// Export global cache for use in other modules
module.exports.getCache = () => globalCache;