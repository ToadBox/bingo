const path = require('path');

module.exports = {
    // General Variables
    PORT: process.env.PORT || 3000,
    COLUMNS: ['A', 'B', 'C', 'D', 'E'],
    IMAGES_DIR: path.join(__dirname, '../../public/images/cells'),
    DEFAULT_BOARD_TITLE: 'New Board',
    LOGIN_PAGE: '/login.html',
    
    // Board Variables
    DEFAULT_BOARD_SIZE: 5,
    MIN_BOARD_SIZE: 3,
    MAX_BOARD_SIZE: 9,
    
    // Image Variables
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    COMPRESSION_THRESHOLD: 1024 * 1024, // 1MB
    
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
