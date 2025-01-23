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

const ALLOWED_UNIFIED_COMMANDS = ['set', 'clear', 'mark', 'unmark'];

class BoardService {
    constructor(mode = BOARD_MODES.STD) {
        this.mode = mode;
        this.environment = process.env.NODE_ENV || 'development';
        this.cacheConfig = CACHE_CONFIG[this.environment === 'production' ? 'PROD' : 'DEBUG'];
        
        // Initialize LRU cache with config
        this.boardCache = new Map();
        this.cacheTimestamps = new Map();

        logger.info('Initializing BoardService', { 
            mode: this.mode,
            boardsDir: BOARDS_DIR 
        });
        // Ensure boards directory exists
        if (!fsSync.existsSync(BOARDS_DIR)) {
            fsSync.mkdirSync(BOARDS_DIR, { recursive: true });
        }
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
            throw new Error('Invalid board ID');
        }

        // In unified mode, always return the server board path
        if (this.mode === BOARD_MODES.UNI) {
            return path.join(BOARDS_DIR, `${UNIFIED_BOARD_ID}-board.json`);
        }

        // Existing path logic for individual mode
        const sanitizedId = boardId.replace(/[^a-zA-Z0-9\-_]/g, '');
        const prefix = sanitizedId.startsWith('server-') ? 'server-' : 'user-';
        const cleanId = sanitizedId.replace(/^(user-|server-)/, '');
        
        return path.join(BOARDS_DIR, `${prefix}${cleanId}-board.json`);
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
            cells: this.createEmptyGrid()
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

    async loadBoard(boardId) {
        logger.debug('Loading board', { 
            boardId, 
            mode: this.mode,
            cacheEnabled: this.cacheConfig.enabled,
            isCached: this.boardCache.has(boardId)
        });

        try {
            // In unified mode, always load the server board
            if (this.mode === BOARD_MODES.UNI) {
                boardId = UNIFIED_BOARD_ID;
            }

            // Check cache if enabled
            if (this.cacheConfig.enabled) {
                const cached = this.boardCache.get(boardId);
                const timestamp = this.cacheTimestamps.get(boardId);
                
                if (cached && timestamp) {
                    const age = Date.now() - timestamp;
                    if (age < this.cacheConfig.maxAge) {
                        logger.debug('Board retrieved from cache', { boardId, age });
                        return cached;
                    }
                }
            }

            // Load board from disk
            const board = await this._loadBoardFromDisk(boardId);

            // Cache if appropriate
            if (this._shouldCache(board)) {
                this._pruneCache();
                this.boardCache.set(boardId, board);
                this.cacheTimestamps.set(boardId, Date.now());
                logger.debug('Board added to cache', { boardId });
            }

            return board;

        } catch (error) {
            logger.error('Error loading board', { 
                boardId, 
                error: error.message 
            });
            throw error;
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

        if (!content || typeof content !== 'string') {
            throw new Error('Invalid content');
        }

        try {
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
        logger.debug('Fetching boards');
        try {
            if (this.mode === BOARD_MODES.UNI) {
                // In unified mode, only return the server board
                const serverBoard = await this.loadBoard(UNIFIED_BOARD_ID);
                return serverBoard ? [serverBoard] : [];
            }

            const files = await fs.readdir(BOARDS_DIR);
            const boards = await Promise.all(
                files
                    .filter(file => file.endsWith('-board.json'))
                    .map(async file => {
                        const content = await fs.readFile(path.join(BOARDS_DIR, file), 'utf8');
                        const board = JSON.parse(content);
                        return {
                            id: board.id,
                            title: board.title,
                            createdBy: board.createdBy,
                            lastUpdated: board.lastUpdated,
                            cells: board.cells
                        };
                    })
            );
            
            const sortedBoards = boards.sort((a, b) => b.lastUpdated - a.lastUpdated);
            logger.info('Boards fetched successfully', { count: sortedBoards.length });
            return sortedBoards;
        } catch (error) {
            logger.error('Failed to fetch boards', { error: error.message });
            throw error;
        }
    }

    parseCell(cell) {
        const col = cell[0].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const row = parseInt(cell.substring(1), 10) - 1;
        return { row, col };
    }

    isValidBoard(board) {
        // Implement board structure validation logic
        return true;
    }

    isValidCellPosition(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    async _loadBoardFromDisk(boardId) {
        const boardPath = this.getBoardPath(boardId);
        
        try {
            await fs.access(boardPath);
        } catch {
            logger.warn('Board file not found', { boardId, path: boardPath });
            return null;
        }

        const savedState = await fs.readFile(boardPath, 'utf8');
        const board = JSON.parse(savedState);

        // Validate board structure
        if (!this.isValidBoard(board)) {
            throw new Error('Invalid board structure');
        }

        logger.info('Board loaded successfully', { 
            boardId,
            title: board.title
        });

        return board;
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

        // Existing command handling logic
        switch (command.toLowerCase()) {
            case 'set':
            case 'clear':
            case 'mark':
            case 'unmark':
                return await this[`handle${command.charAt(0).toUpperCase() + command.slice(1)}`](...args);
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }
}

module.exports = new BoardService();
