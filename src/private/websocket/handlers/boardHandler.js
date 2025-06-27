const boardModel = require('../../models/boardModel');
const logger = require('../../utils/logger');

class BoardHandler {
    constructor(io) {
        this.io = io;
        this.boardModel = boardModel;
    }

    async handleGetBoard(socket, data) {
        try {
            const { boardId } = data;
            
            if (!boardId) {
                socket.emit('error', { message: 'Board ID is required' });
                return;
            }

            const board = await this.boardModel.getBoardByUUID(boardId);
            
            if (!board) {
                socket.emit('error', { message: 'Board not found' });
                return;
            }

            // Format for frontend compatibility
            const formattedBoard = {
                id: board.uuid,
                title: board.title,
                createdBy: null, // For compatibility with old format
                createdAt: new Date(board.created_at).getTime(),
                lastUpdated: new Date(board.last_updated).getTime(),
                cells: board.cells,
                editHistory: [] // For compatibility with old format
            };

            socket.emit('board:data', formattedBoard);
            
            logger.websocket.info('Board data sent to client', {
                boardId,
                socketId: socket.id
            });
        } catch (error) {
            logger.websocket.error('Failed to get board', {
                error: error.message,
                boardId: data.boardId,
                socketId: socket.id
            });
            socket.emit('error', { message: 'Failed to get board' });
        }
    }

    async handleUpdateCell(socket, data) {
        try {
            const { boardId, cellId, value, marked, type = 'text' } = data;
            
            if (!boardId || cellId === undefined) {
                socket.emit('error', { message: 'Board ID and cell ID are required' });
                return;
            }

            // Parse cell coordinates from cellId (e.g., "A1" -> row: 0, col: 0)
            const row = parseInt(cellId.substring(1)) - 1;
            const col = cellId.charCodeAt(0) - 65; // A=0, B=1, etc.

            const board = await this.boardModel.getBoardByUUID(boardId);
            
            if (!board) {
                socket.emit('error', { message: 'Board not found' });
                return;
            }

            const success = await this.boardModel.updateCell(
                board.id, // Use internal board ID
                cellId,
                value,
                marked,
                type
            );

            if (success) {
                // Broadcast the update to all clients in the board room
                this.io.to(`board-${boardId}`).emit('cell:updated', {
                    cellId,
                    value,
                    marked,
                    type,
                    updatedBy: socket.user?.username || 'Anonymous',
                    timestamp: Date.now()
                });

                logger.websocket.info('Cell updated via WebSocket', {
                    boardId,
                    cellId,
                    value: value?.substring(0, 50) || '',
                    marked,
                    type,
                    socketId: socket.id
                });
            } else {
                socket.emit('error', { message: 'Failed to update cell' });
            }
        } catch (error) {
            logger.websocket.error('Failed to update cell via WebSocket', {
                error: error.message,
                boardId: data.boardId,
                cellId: data.cellId,
                socketId: socket.id
            });
            socket.emit('error', { message: 'Failed to update cell' });
        }
    }

    async handleGetCellHistory(socket, data) {
        try {
            const { boardId, cellId, limit = 10, offset = 0 } = data;
            
            if (!boardId || !cellId) {
                socket.emit('error', { message: 'Board ID and cell ID are required' });
                return;
            }

            // Parse cell coordinates
            const row = parseInt(cellId.substring(1)) - 1;
            const col = cellId.charCodeAt(0) - 65;

            const board = await this.boardModel.getBoardByUUID(boardId);
            
            if (!board) {
                socket.emit('error', { message: 'Board not found' });
                return;
            }

            const history = await this.boardModel.getCellHistory(board.id, row, col, {
                limit,
                offset
            });

            socket.emit('cell:history', {
                cellId,
                history
            });

            logger.websocket.info('Cell history sent to client', {
                boardId,
                cellId,
                historyCount: history.length,
                socketId: socket.id
            });
        } catch (error) {
            logger.websocket.error('Failed to get cell history', {
                error: error.message,
                boardId: data.boardId,
                cellId: data.cellId,
                socketId: socket.id
            });
            socket.emit('error', { message: 'Failed to get cell history' });
        }
    }

    handleJoinBoard(socket, data) {
        const { boardId } = data;
        
        if (!boardId) {
            socket.emit('error', { message: 'Board ID is required' });
            return;
        }

        socket.join(`board-${boardId}`);
        
        logger.websocket.info('Client joined board room', {
            boardId,
            socketId: socket.id,
            userId: socket.user?.id
        });

        socket.emit('board:joined', { boardId });
    }

    handleLeaveBoard(socket, data) {
        const { boardId } = data;
        
        if (!boardId) {
            socket.emit('error', { message: 'Board ID is required' });
            return;
        }

        socket.leave(`board-${boardId}`);
        
        logger.websocket.info('Client left board room', {
            boardId,
            socketId: socket.id,
            userId: socket.user?.id
        });

        socket.emit('board:left', { boardId });
    }
}

module.exports = BoardHandler; 