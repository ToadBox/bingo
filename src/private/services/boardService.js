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

        // Track last modified times
        this.lastModified = new Map();
        this.etags = new Map();

        // Add file descriptor cache
        this.fileHandles = new Map();
        
        // Pre-load file handles for better performance
        this._initializeFileHandles();

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
        const startTime = process.hrtime();
        logger.debug('Fetching boards');
        
        try {
            if (this.mode === BOARD_MODES.UNI) {
                const serverBoard = await this.loadBoard(UNIFIED_BOARD_ID);
                this._logPerformance('getAllBoards (unified)', startTime);
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
        // Implement board structure validation logic
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
}

module.exports = new BoardService();
