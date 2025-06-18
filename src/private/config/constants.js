const path = require('path');

const BOARD_MODES = {
    UNI: 'unified',
    IND: 'individual'
};

// Check if running in debug mode from npm scripts
const isDebugMode = process.env.LOG_LEVEL === 'DEBUG';

module.exports = {
    // General Variables
    PORT: process.env.PORT || 3000,
    SAVE_FILE: path.join(__dirname, '../bingoState.json'),
    COLUMNS: ['A', 'B', 'C', 'D', 'E'],
    BOARDS_DIR: path.join(__dirname, '../boards'),
    IMAGES_DIR: path.join(__dirname, '../../public/images/cells'),
    DEFAULT_BOARD_TITLE: 'New Board, use /bingo title to change',
    OFFLINE_MODE: isDebugMode || process.env.OFFLINE_MODE === 'true',
    LOGIN_PAGE: '/login.html',
    
    // Board Variables
    DEFAULT_BOARD_SIZE: 5,
    MIN_BOARD_SIZE: 3,
    MAX_BOARD_SIZE: 9,
    CACHE_TTL: 300, // 5 minutes
    
    // Image Variables
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    COMPRESSION_THRESHOLD: 1024 * 1024, // 1MB

    BOARD_MODES,
    BOARD_MODE: process.env.BOARD_MODE || BOARD_MODES.UNI,
    UNIFIED_BOARD_ID: 'server-01',
    
    // WebSocket Configuration
    WEBSOCKET_PING_INTERVAL: 30000, // 30 seconds
    WEBSOCKET_PING_TIMEOUT: 10000, // 10 seconds
    
    // API Rate Limiting
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: 500, // 500 requests per window
    
    // Version History
    MAX_BOARD_VERSIONS: 50, // Maximum number of board versions to keep
    AUTO_VERSION_THRESHOLD: 10 // Create a version after this many cell changes
};
