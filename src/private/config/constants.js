const path = require('path');

const BOARD_MODES = {
    UNI: 'unified',
    IND: 'individual'
};

module.exports = {
    // General Variables
    PORT: process.env.PORT || 3000,
    SAVE_FILE: path.join(__dirname, '../bingoState.json'),
    COLUMNS: ['A', 'B', 'C', 'D', 'E'],
    BOARDS_DIR: path.join(__dirname, '../boards'),
    IMAGES_DIR: path.join(__dirname, '../../public/images/cells'),
    DEFAULT_BOARD_TITLE: 'New Board, use /bingo title to change',
    OFFLINE_MODE: process.env.OFFLINE_MODE === 'true',
    
    // Board Variables
    BOARD_SIZE: 5,
    CACHE_TTL: 300, // 5 minutes
    
    // Image Variables
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    COMPRESSION_THRESHOLD: 1024 * 1024, // 1MB

    BOARD_MODES,
    BOARD_MODE: process.env.BOARD_MODE || BOARD_MODES.UNI,
    UNIFIED_BOARD_ID: 'server-01'
};
