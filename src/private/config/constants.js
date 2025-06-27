const path = require('path');
const sharedConstants = require('../../../shared/constants.js');

const BOARD_MODES = {
    UNI: 'unified',
    IND: 'individual'
};

// Check if running in debug mode from npm scripts
const isDebugMode = process.env.LOG_LEVEL === 'DEBUG';

module.exports = {
    // Import all shared constants
    ...sharedConstants,
    
    // Server-specific variables
    PORT: process.env.PORT || 3000,
    SAVE_FILE: path.join(__dirname, '../bingoState.json'),
    COLUMNS: ['A', 'B', 'C', 'D', 'E'],
    BOARDS_DIR: path.join(__dirname, '../boards'),
    IMAGES_DIR: path.join(__dirname, '../../public/images/cells'),
    OFFLINE_MODE: isDebugMode || process.env.OFFLINE_MODE === 'true',
    LOGIN_PAGE: '/login.html',
    
    BOARD_MODES,
    BOARD_MODE: process.env.BOARD_MODE || BOARD_MODES.UNI,
    UNIFIED_BOARD_ID: 'server-01'
};
