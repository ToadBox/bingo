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
    CACHE_TTL
} = require('../config/constants');

// Initialize cache with automatic key deletion
const boardCache = new NodeCache({ 
    stdTTL: CACHE_TTL,
    checkperiod: 60,
    useClones: false
});

class BoardService {
    constructor() {
        // Ensure boards directory exists
        if (!fsSync.existsSync(BOARDS_DIR)) {
            fsSync.mkdirSync(BOARDS_DIR, { recursive: true });
        }
    }

    getBoardPath(boardId) {
        if (!boardId || typeof boardId !== 'string') {
            throw new Error('Invalid board ID');
        }

        // Strict sanitization of boardId
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
        try {
            // Check cache first
            const cached = boardCache.get(boardId);
            if (cached) {
                logger.debug('Board retrieved from cache', { boardId });
                return cached;
            }

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

            boardCache.set(boardId, board);
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
        if (!this.isValidBoard(board)) {
            throw new Error('Invalid board data');
        }

        board.lastUpdated = Date.now();
        const boardPath = this.getBoardPath(board.id);

        try {
            await fs.writeFile(boardPath, JSON.stringify(board, null, 2));
            boardCache.set(board.id, board);
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
        logger.debug('Fetching all boards');
        try {
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
}

module.exports = new BoardService();
