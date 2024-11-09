const path = require('path');

module.exports = {
    PORT: process.env.PORT || 3000,
    SAVE_FILE: path.join(__dirname, '../bingoState.json'),
    COLUMNS: ['A', 'B', 'C', 'D', 'E'],
    BOARDS_DIR: path.join(__dirname, '../boards'),
    DEFAULT_BOARD_TITLE: 'New Bingo Board',
    OFFLINE_MODE: process.env.OFFLINE_MODE === 'true'
};
