const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { BOARDS_DIR, COLUMNS } = require('../config/constants');
const { downloadAndSaveImage } = require('../utils/imageHandler');

class BoardService {
    getBoardPath(boardId) {
        const cleanId = boardId.replace(/^(user-|server-)/, '');
        const prefix = boardId.startsWith('server-') ? 'server-' : 'user-';
        return path.join(BOARDS_DIR, `${prefix}${cleanId}-board.json`);
    }

    createNewBoard(userId, userName) {
        const cleanUserId = userId.replace(/^user-/, '');
        return {
            id: `user-${cleanUserId}`,
            createdBy: userName,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            title: `${userName}'s Bingo Board`,
            cells: this.createEmptyGrid()
        };
    }

    createEmptyGrid() {
        return Array(5).fill().map((_, rowIndex) =>
            Array(5).fill().map((_, colIndex) => ({
                label: `${COLUMNS[colIndex]}${rowIndex + 1}`,
                value: '',
                marked: false
            }))
        );
    }

    loadBoard(boardId) {
        const boardPath = this.getBoardPath(boardId);
        logger.debug('Loading board', { 
            boardId, 
            path: boardPath,
            exists: fs.existsSync(boardPath)
        });
        
        if (fs.existsSync(boardPath)) {
            try {
                const savedState = fs.readFileSync(boardPath, 'utf8');
                const board = JSON.parse(savedState);
                logger.info('Board loaded successfully', { 
                    boardId,
                    title: board.title,
                    path: boardPath
                });
                return board;
            } catch (error) {
                logger.error('Error parsing board file', {
                    boardId,
                    path: boardPath,
                    error: error.message
                });
                return null;
            }
        }
        logger.warn('Board file not found', { boardId, path: boardPath });
        return null;
    }

    saveBoard(board) {
        board.lastUpdated = Date.now();
        const boardPath = this.getBoardPath(board.id);
        logger.debug('Saving board', { boardId: board.id, path: boardPath });
        
        try {
            fs.writeFileSync(boardPath, JSON.stringify(board, null, 2));
            logger.info('Board saved successfully', { boardId: board.id });
            return true;
        } catch (error) {
            logger.error('Failed to save board', { boardId: board.id, error: error.message });
            throw error;
        }
    }

    async setCellContent(board, row, col, content) {
        try {
            if (content.match(/^https?:\/\/.*\.(jpg|jpeg|png)(\?.*)?$/i)) {
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

    getAllBoards() {
        logger.debug('Fetching all boards');
        try {
            const boards = fs.readdirSync(BOARDS_DIR)
                .filter(file => file.endsWith('-board.json'))
                .map(file => {
                    const board = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), 'utf8'));
                    return {
                        id: board.id,
                        title: board.title,
                        createdBy: board.createdBy,
                        lastUpdated: board.lastUpdated,
                        cells: board.cells
                    };
                })
                .sort((a, b) => b.lastUpdated - a.lastUpdated);
            logger.info('Boards fetched successfully', { count: boards.length });
            return boards;
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
}

module.exports = new BoardService();
