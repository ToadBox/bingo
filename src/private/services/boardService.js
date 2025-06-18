const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { downloadAndSaveImage } = require('../utils/imageHandler');
const NodeCache = require('node-cache');
const {
    BOARDS_DIR,
    COLUMNS,
    BOARD_SIZE,
    CACHE_TTL,
    BOARD_MODES,
    BOARD_MODE,
    UNIFIED_BOARD_ID
} = require('../config/constants');

const CACHE_CONFIG = {
    PROD: {
        enabled: true,
        maxAge: 5 * 60 * 1000, // 5 minutes
        maxSize: 100 // maximum number of boards to cache
    },
    DEBUG: {
        enabled: false,
        maxAge: 0,
        maxSize: 0
    }
};

const ALLOWED_UNIFIED_COMMANDS = ['set', 'clear', 'mark', 'unmark', 'image', 'password'];

class BoardService {
    constructor(mode = BOARD_MODE) {
        logger.info('Initializing BoardService', { 
            mode,
            boardsDir: BOARDS_DIR,
            defaultMode: BOARD_MODE,
            envMode: process.env.BOARD_MODE
        });

        this.mode = process.env.BOARD_MODE || mode;
        this.environment = process.env.NODE_ENV || 'development';
        
        // Initialize cache config
        this.cacheConfig = CACHE_CONFIG[this.environment === 'production' ? 'PROD' : 'DEBUG'];
        
        // Initialize LRU cache with config
        this.boardCache = new Map();
        this.cacheTimestamps = new Map();

        // Track last modified times
        this.lastModified = new Map();
        this.etags = new Map();

        // Add file descriptor cache
        this.fileHandles = new Map();
        
        // Ensure boards directory exists
        if (!fsSync.existsSync(BOARDS_DIR)) {
            fsSync.mkdirSync(BOARDS_DIR, { recursive: true });
            logger.info('Created boards directory', { path: BOARDS_DIR });
        }

        logger.info('BoardService initialized', { 
            mode: this.mode,
            isUnified: this.mode === BOARD_MODES.UNI
        });

        // Pre-load file handles for better performance
        this._initializeFileHandles();
    }

    getCacheConfig() {
        return this.cacheConfig;
    }

    clearCache() {
        this.boardCache.clear();
        this.cacheTimestamps.clear();
        logger.debug('Cache cleared');
    }

    _shouldCache(board) {
        if (!this.cacheConfig.enabled) return false;
        if (!board) return false;
        
        // Don't cache boards that are too large
        const boardSize = JSON.stringify(board).length;
        if (boardSize > 1024 * 1024) { // 1MB limit
            logger.warn('Board too large to cache', { 
                boardId: board.id, 
                size: boardSize 
            });
            return false;
        }
        
        return true;
    }

    _pruneCache() {
        if (this.boardCache.size <= this.cacheConfig.maxSize) return;

        const now = Date.now();
        for (const [boardId, timestamp] of this.cacheTimestamps) {
            // Remove expired entries
            if (now - timestamp > this.cacheConfig.maxAge) {
                this.boardCache.delete(boardId);
                this.cacheTimestamps.delete(boardId);
                logger.debug('Removed expired cache entry', { boardId });
            }
            
            // Break if we're under the limit
            if (this.boardCache.size <= this.cacheConfig.maxSize) break;
        }
    }

    getBoardPath(boardId) {
        if (!boardId || typeof boardId !== 'string') {
            logger.error('Invalid board ID', { boardId });
            throw new Error('Invalid board ID');
        }

        logger.info('Getting board path', { 
            boardId,
            mode: this.mode,
            isUnified: this.mode === BOARD_MODES.UNI
        });

        // In unified mode, always return the server board path
        if (this.mode === BOARD_MODES.UNI) {
            const boardPath = path.join(BOARDS_DIR, `${UNIFIED_BOARD_ID}-board.json`);
            logger.info('Using unified board path', { boardPath });
            return boardPath;
        }

        // Existing path logic for individual mode
        const sanitizedId = boardId.replace(/[^a-zA-Z0-9\-_]/g, '');
        const prefix = sanitizedId.startsWith('server-') ? 'server-' : 'user-';
        const cleanId = sanitizedId.replace(/^(user-|server-)/, '');
        const boardPath = path.join(BOARDS_DIR, `${prefix}${cleanId}-board.json`);
        
        logger.info('Using individual board path', { boardPath });
        return boardPath;
    }

    createNewBoard(userId, userName) {
        if (!userId || !userName) {
            throw new Error('User ID and name are required');
        }

        const cleanUserId = userId.replace(/[^a-zA-Z0-9\-_]/g, '');
        const board = {
            id: `user-${cleanUserId}`,
            createdBy: userName.slice(0, 100), // Limit username length
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            title: `${userName}'s Bingo Board`.slice(0, 200),
            cells: this.createEmptyGrid(),
            editHistory: [] // Add edit history array
        };

        return board;
    }

    createEmptyGrid() {
        return Array(BOARD_SIZE).fill().map((_, rowIndex) =>
            Array(BOARD_SIZE).fill().map((_, colIndex) => ({
                label: `${COLUMNS[colIndex]}${rowIndex + 1}`,
                value: '',
                marked: false
            }))
        );
    }

    async loadBoard(requestedId) {
        const boardId = this.getBoardId(requestedId);
        const filePath = this.getBoardPath(boardId);
        
        logger.info('Loading board', { 
            requestedId,
            boardId,
            filePath,
            mode: this.mode
        });

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const board = JSON.parse(data);
            logger.info('Board loaded successfully', { boardId: board.id });
            return board;
        } catch (error) {
            logger.error('Failed to load board', {
                error: error.message,
                boardId,
                filePath,
                mode: this.mode
            });
            return null;
        }
    }

    async saveBoard(board) {
        logger.debug('Saving board', { 
            boardId: board.id,
            title: board.title,
            cellCount: board.cells.flat().filter(cell => cell.value).length,
            markedCount: board.cells.flat().filter(cell => cell.marked).length
        });
        if (!this.isValidBoard(board)) {
            throw new Error('Invalid board data');
        }

        board.lastUpdated = Date.now();
        const boardPath = this.getBoardPath(board.id);

        try {
            await fs.writeFile(boardPath, JSON.stringify(board, null, 2));
            logger.info('Board saved successfully', { boardId: board.id });
            return true;
        } catch (error) {
            logger.error('Failed to save board', { 
                boardId: board.id, 
                error: error.message 
            });
            throw error;
        }
    }

    async setCellContent(board, row, col, content) {
        if (!this.isValidCellPosition(row, col)) {
            throw new Error('Invalid cell position');
        }

        if (content === undefined || content === null || typeof content !== 'string') {
            throw new Error('Invalid content');
        }

        try {
            // Handle empty string case for clearing cells
            if (content === '') {
                board.cells[row][col].value = '';
                // Also unmark the cell when clearing
                board.cells[row][col].marked = false;
                logger.debug('Cleared cell content', { 
                    boardId: board.id, 
                    row, 
                    col 
                });
                return this.saveBoard(board);
            }
            
            // Let imageHandler handle all URL validation and processing
            if (content.startsWith('http')) {
                const localPath = await downloadAndSaveImage(content);
                board.cells[row][col].value = `image:${localPath}`;
            } else {
                board.cells[row][col].value = content;
            }
            return this.saveBoard(board);
        } catch (error) {
            logger.error('Failed to set cell content', { 
                boardId: board.id, 
                row, 
                col, 
                error: error.message 
            });
            throw error;
        }
    }

    async getAllBoards() {
        const startTime = process.hrtime();
        logger.debug('Fetching boards');
        
        try {
            if (this.mode === BOARD_MODES.UNI) {
                const serverBoard = await this.loadBoard(UNIFIED_BOARD_ID);
                const duration = this._getElapsedMs(startTime);
                logger.debug('Unified board fetched', { duration });
                return serverBoard ? [serverBoard] : [];
            }

            const files = await fs.readdir(BOARDS_DIR);
            const readStart = process.hrtime();
            
            const boards = await Promise.all(
                files
                    .filter(file => file.endsWith('-board.json'))
                    .map(async file => {
                        const fileStart = process.hrtime();
                        const content = await fs.readFile(path.join(BOARDS_DIR, file), 'utf8');
                        const board = JSON.parse(content);
                        const duration = this._getElapsedMs(fileStart);
                        logger.debug('Board file read', { file, duration });
                        return board;
                    })
            );
            
            const readDuration = this._getElapsedMs(readStart);
            logger.debug('All board files read', { count: boards.length, duration: readDuration });
            
            const sortedBoards = boards.sort((a, b) => b.lastUpdated - a.lastUpdated);
            const totalDuration = this._getElapsedMs(startTime);
            
            logger.info('Boards fetched successfully', { 
                count: sortedBoards.length,
                readDuration,
                totalDuration 
            });
            
            return sortedBoards;
        } catch (error) {
            logger.error('Failed to fetch boards', { 
                error: error.message,
                duration: this._getElapsedMs(startTime)
            });
            throw error;
        }
    }

    parseCell(cell) {
        const col = cell[0].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const row = parseInt(cell.substring(1), 10) - 1;
        return { row, col };
    }

    isValidBoard(board) {
        // Basic validation
        if (!board || typeof board !== 'object') return false;
        if (!board.id || !board.cells) return false;
        
        // Make sure the cells array has the correct structure
        if (!Array.isArray(board.cells)) return false;
        if (board.cells.length !== BOARD_SIZE) return false;
        
        // Make sure each row has the correct number of cells
        for (const row of board.cells) {
            if (!Array.isArray(row) || row.length !== BOARD_SIZE) return false;
        }
        
        // Initialize edit history if it doesn't exist
        if (!board.editHistory) {
            board.editHistory = [];
        }
        
        return true;
    }

    isValidCellPosition(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    async _loadBoardFromDisk(boardId) {
        const fileName = `${boardId}-board.json`;
        const handle = this.fileHandles.get(fileName);
        
        if (handle) {
            const { size } = await handle.stat();
            const buffer = Buffer.alloc(size);
            await handle.read(buffer, 0, size, 0);
            return JSON.parse(buffer.toString());
        }
        
        // Fallback to regular file read
        const content = await fs.readFile(path.join(BOARDS_DIR, fileName), 'utf8');
        return JSON.parse(content);
    }

    isCommandAllowed(command) {
        if (this.mode !== BOARD_MODES.UNI) {
            return true; // All commands allowed in non-unified mode
        }
        
        return ALLOWED_UNIFIED_COMMANDS.includes(command.toLowerCase());
    }

    async handleCommand(command, ...args) {
        if (!this.isCommandAllowed(command)) {
            throw new Error(`Command '${command}' is not allowed in unified mode`);
        }

        switch (command.toLowerCase()) {
            case 'set':
                const [board, cell, type, content] = args;
                const { row, col } = this.parseCell(cell);
                return await this.setCellContent(board, row, col, content);
            case 'mark':
                const [markBoard, markCell] = args;
                const markPos = this.parseCell(markCell);
                markBoard.cells[markPos.row][markPos.col].marked = true;
                return await this.saveBoard(markBoard);
            case 'unmark':
                const [unmarkBoard, unmarkCell] = args;
                const unmarkPos = this.parseCell(unmarkCell);
                unmarkBoard.cells[unmarkPos.row][unmarkPos.col].marked = false;
                return await this.saveBoard(unmarkBoard);
            case 'clear':
                const [clearBoard, clearCell] = args;
                const clearPos = this.parseCell(clearCell);
                clearBoard.cells[clearPos.row][clearPos.col].value = '';
                clearBoard.cells[clearPos.row][clearPos.col].marked = false;
                return await this.saveBoard(clearBoard);
            case 'image':
                // Image generation is handled in DiscordCommands
                return args[0]; // Just return the board
            case 'password':
                // Password is handled in DiscordCommands
                return null;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    async getBoards(req) {
        try {
            const boards = await this._loadBoards();
            
            // Generate ETag based on last modified times
            const etagValue = this._generateETag(boards);
            
            // Check if client's version matches
            if (req.headers['if-none-match'] === etagValue) {
                return { status: 304 }; // Not Modified
            }

            return {
                status: 200,
                data: boards,
                headers: {
                    'ETag': etagValue,
                    'Cache-Control': 'private, no-cache'
                }
            };
        } catch (error) {
            throw error;
        }
    }

    _generateETag(data) {
        return `"${require('crypto')
            .createHash('md5')
            .update(JSON.stringify(data))
            .digest('hex')}"`;
    }

    _getElapsedMs(startTime) {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        return (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
    }

    async _initializeFileHandles() {
        try {
            const files = await fs.readdir(BOARDS_DIR);
            for (const file of files) {
                if (file.endsWith('-board.json')) {
                    const handle = await fs.open(path.join(BOARDS_DIR, file), 'r');
                    this.fileHandles.set(file, handle);
                }
            }
            logger.debug('File handles initialized', { 
                count: this.fileHandles.size 
            });
        } catch (error) {
            logger.error('Failed to initialize file handles', { 
                error: error.message 
            });
        }
    }

    // Don't forget to close handles on shutdown
    async cleanup() {
        for (const handle of this.fileHandles.values()) {
            await handle.close();
        }
        this.fileHandles.clear();
    }

    getBoardId(requestedId) {
        logger.info('Getting board ID', {
            requestedId,
            mode: this.mode,
            isUnified: this.mode === BOARD_MODES.UNI
        });
        
        // In unified mode, always return the unified board ID
        if (this.mode === BOARD_MODES.UNI) {
            return UNIFIED_BOARD_ID;
        }

        // For individual mode, validate and return the requested ID
        if (!requestedId || typeof requestedId !== 'string') {
            throw new Error('Invalid board ID requested');
        }
        return requestedId;
    }

    /**
     * Get the history of a cell
     * @param {string} boardId - Board ID
     * @param {number} row - Cell row
     * @param {number} col - Cell column
     * @param {Object} options - Query options
     * @returns {Array} - Array of history entries
     */
    async getCellHistory(boardId, row, col, options = {}) {
        try {
            if (this.mode === 'database') {
                // Initialize boardModel if not already loaded
                if (!this.boardModel) {
                    this.boardModel = require('../models/boardModel');
                }

                // Get the cell history from database
                return await this.boardModel.getCellHistory(boardId, row, col, options);
            } else {
                // JSON mode - get history from board's editHistory
                const board = await this.loadBoard(boardId);
                if (!board || !board.editHistory) {
                    return [];
                }

                // Find entries for this cell
                const columnLetter = COLUMNS[col];
                const cellId = `${columnLetter}${row + 1}`;

                const history = board.editHistory
                    .filter(entry => entry.cellId === cellId)
                    .map(entry => ({
                        id: entry.timestamp, // Use timestamp as ID
                        cell_id: cellId,
                        value: entry.value || '',
                        type: entry.type || 'text',
                        marked: entry.marked || false,
                        created_at: new Date(entry.timestamp).toISOString(),
                        created_by: null,
                        user_name: board.createdBy || 'Unknown'
                    }))
                    .sort((a, b) => b.id - a.id); // Sort by timestamp (newest first)

                // Apply pagination
                const { limit = 20, offset = 0 } = options;
                return history.slice(offset, offset + limit);
            }
        } catch (error) {
            logger.error('Failed to get cell history', {
                error: error.message,
                boardId, row, col
            });
            return [];
        }
    }

    /**
     * Get board settings
     * @param {string} boardId - Board ID
     * @returns {Object} - Board settings
     */
    async getBoardSettings(boardId) {
        try {
            if (this.mode === 'database') {
                // Initialize boardModel if not already loaded
                if (!this.boardModel) {
                    this.boardModel = require('../models/boardModel');
                }
                
                const settings = await this.boardModel.getBoardSettings(boardId);
                if (settings) {
                    return settings;
                }
            }
            
            // JSON mode or fallback - return default settings
            const config = require('../utils/configLoader');
            return config.get('boards.defaultSettings', {
                chatEnabled: true,
                mentionNotifications: true,
                editNotifications: true,
                publicChat: true,
                requireApproval: false
            });
        } catch (error) {
            logger.error('Failed to get board settings', {
                error: error.message,
                boardId
            });
            
            // Return default settings on error
            return {
                chatEnabled: true,
                mentionNotifications: true,
                editNotifications: true,
                publicChat: true,
                requireApproval: false
            };
        }
    }

    /**
     * Update board settings
     * @param {string} boardId - Board ID
     * @param {Object} settings - Board settings
     * @returns {boolean} - Success status
     */
    async updateBoardSettings(boardId, settings) {
        try {
            if (this.mode === 'database') {
                // Initialize boardModel if not already loaded
                if (!this.boardModel) {
                    this.boardModel = require('../models/boardModel');
                }
                
                return await this.boardModel.updateBoardSettings(boardId, settings);
            } else {
                // JSON mode - store settings in memory
                // Since we can't persist in JSON mode, we'll just return success
                logger.info('Settings updated in memory only (JSON mode)', {
                    boardId,
                    settings
                });
                return true;
            }
        } catch (error) {
            logger.error('Failed to update board settings', {
                error: error.message,
                boardId
            });
            return false;
        }
    }

    /**
     * Update a cell
     * @param {string} boardId - Board ID
     * @param {string} cellId - Cell ID (e.g. "A1")
     * @param {string} value - Cell value
     * @param {boolean} marked - Whether the cell is marked
     * @param {string} type - Cell type (text, image)
     * @returns {Object} - Updated cell and success status
     */
    async updateCell(boardId, cellId, value, marked, type = 'text') {
        try {
            logger.debug('Updating cell', { 
                boardId, 
                cellId, 
                value: !!value, 
                marked, 
                type 
            });
            
            if (this.mode === 'database') {
                // Initialize boardModel if not already loaded
                if (!this.boardModel) {
                    this.boardModel = require('../models/boardModel');
                }
                
                // Parse cell ID to get row and column
                const cellPosition = this.parseCell(cellId);
                
                // Find or create board in database
                let board = await this.boardModel.getBoardByUUID(boardId);
                
                if (!board) {
                    // Try to load from JSON and import
                    const jsonBoard = await this.loadBoard(boardId);
                    
                    if (jsonBoard) {
                        // We need to get the user ID, but since this operation might be 
                        // happening without a user request, we'll use a system user ID
                        board = await this.boardModel.importFromJson(jsonBoard, 1); // ID 1 is usually system
                    } else {
                        return { success: false, error: 'Board not found' };
                    }
                }
                
                // Update cell in database
                const cell = await this.boardModel.updateCell(board.id, cellPosition.row, cellPosition.col, {
                    value,
                    type: type || 'text',
                    marked: !!marked
                });
                
                if (!cell) {
                    return { success: false, error: 'Failed to update cell' };
                }
                
                return {
                    success: true,
                    cell: {
                        value: cell.value,
                        marked: !!cell.marked,
                        type: cell.type || 'text'
                    }
                };
            } else {
                // Legacy JSON mode
                const board = await this.loadBoard(boardId);
                
                if (!board) {
                    return { success: false, error: 'Board not found' };
                }
                
                // Parse cell ID
                const cellPosition = this.parseCell(cellId);
                
                if (!this.isValidCellPosition(cellPosition.row, cellPosition.col)) {
                    return { success: false, error: 'Invalid cell position' };
                }
                
                // Update the cell
                const cell = board.cells[cellPosition.row][cellPosition.col];
                cell.value = value !== undefined ? value : cell.value;
                cell.marked = marked !== undefined ? !!marked : cell.marked;
                cell.type = type || cell.type || 'text';
                
                // Add to edit history if it exists
                if (board.editHistory) {
                    const history = {
                        cellId,
                        timestamp: Date.now(),
                        value: cell.value,
                        marked: cell.marked
                    };
                    
                    board.editHistory.push(history);
                    
                    // Limit history size
                    const maxHistoryItems = 100;
                    if (board.editHistory.length > maxHistoryItems) {
                        board.editHistory = board.editHistory.slice(-maxHistoryItems);
                    }
                }
                
                // Save the board
                await this.saveBoard(board);
                
                return {
                    success: true,
                    cell: {
                        value: cell.value,
                        marked: cell.marked,
                        type: cell.type || 'text'
                    }
                };
            }
        } catch (error) {
            logger.error('Failed to update cell', {
                error: error.message,
                boardId, cellId
            });
            return { success: false, error: 'Internal server error' };
        }
    }

    /**
     * Get a board by ID
     * @param {string} boardId - Board ID
     * @returns {Object|null} - Board or null if not found
     */
    async getBoard(boardId) {
        try {
            if (this.mode === 'database') {
                if (!this.boardModel) {
                    // Lazy load the board model to avoid circular dependencies
                    this.boardModel = require('../models/boardModel');
                }
                const board = await this.boardModel.getBoardByUUID(boardId);
                if (!board) {
                    // Try legacy JSON as fallback
                    return await this.loadBoard(boardId);
                }
                
                // Format for frontend compatibility
                return {
                    id: board.uuid,
                    title: board.title,
                    createdBy: null, // For compatibility with old format
                    createdAt: new Date(board.created_at).getTime(),
                    lastUpdated: new Date(board.last_updated).getTime(),
                    cells: board.cells,
                    editHistory: [] // For compatibility with old format
                };
            } else {
                // Legacy mode - get board from JSON files
                return await this.loadBoard(boardId);
            }
        } catch (error) {
            logger.error('Failed to get board', {
                error: error.message,
                boardId
            });
            return null;
        }
    }

    /**
     * Delete a board
     * @param {string} boardId - Board ID
     * @returns {boolean} - Success status
     */
    async deleteBoard(boardId) {
        try {
            logger.info('Deleting board', { boardId });
            
            if (this.mode === 'database') {
                // Initialize boardModel if not already loaded
                if (!this.boardModel) {
                    this.boardModel = require('../models/boardModel');
                }
                
                // Find board in database
                const board = await this.boardModel.getBoardByUUID(boardId);
                
                if (board) {
                    // Delete board from database
                    const success = await this.boardModel.deleteBoard(board.id);
                    
                    if (!success) {
                        logger.warn('Failed to delete board from database', { boardId });
                    } else {
                        logger.info('Board deleted from database', { boardId });
                    }
                }
            }
            
            // Always try to delete the JSON file as well
            try {
                const boardPath = this.getBoardPath(boardId);
                
                // Check if file exists before attempting to delete
                const fileExists = await fs.access(boardPath)
                    .then(() => true)
                    .catch(() => false);
                
                if (fileExists) {
                    await fs.unlink(boardPath);
                    logger.info('Board JSON file deleted', { boardId, path: boardPath });
                } else {
                    logger.warn('Board JSON file not found', { boardId, path: boardPath });
                    // Only return false if we're in JSON mode and file doesn't exist
                    if (this.mode !== 'database') {
                        return false;
                    }
                }
                
                // Clear from cache if present
                this.boardCache.delete(boardId);
                this.cacheTimestamps.delete(boardId);
                this.lastModified.delete(boardId);
                this.etags.delete(boardId);
                
                return true;
            } catch (error) {
                logger.error('Failed to delete board JSON file', { 
                    error: error.message,
                    boardId 
                });
                return this.mode === 'database'; // Return true in database mode, false in JSON mode
            }
        } catch (error) {
            logger.error('Failed to delete board', {
                error: error.message,
                boardId
            });
            return false;
        }
    }
}

module.exports = new BoardService();
