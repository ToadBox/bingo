const logger = require('../../utils/logger');
const boardService = require('../../services/boardService');

class BoardHandler {
  /**
   * Register board-related WebSocket event handlers
   * @param {Object} socket - Socket instance
   * @param {Object} wsServer - WebSocketServer instance
   */
  registerHandlers(socket, wsServer) {
    // Join a board room
    socket.on('board:join', async (data, callback) => {
      try {
        const { boardId } = data;
        if (!boardId) {
          return callback({ error: 'Board ID is required' });
        }
        
        // Check if the board exists
        const board = await boardService.getBoard(boardId);
        if (!board) {
          return callback({ error: 'Board not found' });
        }
        
        // Check if the user has access to the board
        // TODO: Implement board access control
        
        // Join the board room
        const activeUsers = wsServer.joinBoardRoom(socket, boardId);
        
        // Send active users to the client
        callback({
          success: true,
          activeUsers
        });
        
      } catch (error) {
        logger.error('Error in board:join handler', {
          error: error.message,
          userId: socket.user?.id,
          boardId: data?.boardId
        });
        callback({ error: 'Failed to join board' });
      }
    });

    // Leave a board room
    socket.on('board:leave', async (data, callback) => {
      try {
        const { boardId } = data;
        if (!boardId) {
          return callback({ error: 'Board ID is required' });
        }
        
        // Leave the board room
        wsServer.leaveBoardRoom(socket, boardId);
        
        callback({ success: true });
      } catch (error) {
        logger.error('Error in board:leave handler', {
          error: error.message,
          userId: socket.user?.id,
          boardId: data?.boardId
        });
        callback({ error: 'Failed to leave board' });
      }
    });

    // Cell update event
    socket.on('cell:update', async (data, callback) => {
      try {
        const { boardId, row, col, value, type, marked } = data;
        
        if (!boardId || row === undefined || col === undefined) {
          return callback({ error: 'Invalid cell update data' });
        }
        
        // Check if the board exists
        const board = await boardService.getBoard(boardId);
        if (!board) {
          return callback({ error: 'Board not found' });
        }
        
        // Update the cell
        const userId = socket.user.id;
        const success = await boardService.updateCell(
          boardId,
          row,
          col,
          { value, type, marked },
          userId
        );
        
        if (!success) {
          return callback({ error: 'Failed to update cell' });
        }
        
        // Get username for the update
        const username = socket.user.username;
        
        // Broadcast the update to all clients in the room except the sender
        socket.to(`board:${boardId}`).emit('cell:updated', {
          boardId,
          row,
          col,
          value,
          type,
          marked,
          userId,
          username,
          timestamp: new Date().toISOString()
        });
        
        callback({ success: true });
      } catch (error) {
        logger.error('Error in cell:update handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
        callback({ error: 'Failed to update cell' });
      }
    });

    // Get cell history
    socket.on('cell:history', async (data, callback) => {
      try {
        const { boardId, row, col, limit, offset } = data;
        
        if (!boardId || row === undefined || col === undefined) {
          return callback({ error: 'Invalid cell history request' });
        }
        
        // Check if the board exists
        const board = await boardService.getBoard(boardId);
        if (!board) {
          return callback({ error: 'Board not found' });
        }
        
        // Get cell history
        const history = await boardService.getCellHistory(boardId, row, col, {
          limit: limit || 20,
          offset: offset || 0
        });
        
        callback({
          success: true,
          history
        });
      } catch (error) {
        logger.error('Error in cell:history handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
        callback({ error: 'Failed to get cell history' });
      }
    });

    // User typing indicator
    socket.on('user:typing', (data) => {
      try {
        const { boardId, isTyping, cellPosition } = data;
        
        if (!boardId) {
          return;
        }
        
        // Broadcast typing indicator to all clients in the room except the sender
        socket.to(`board:${boardId}`).emit('user:typing', {
          userId: socket.user.id,
          username: socket.user.username,
          isTyping,
          cellPosition,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error in user:typing handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
      }
    });
    
    // Board cursor position update
    socket.on('cursor:move', (data) => {
      try {
        const { boardId, position } = data;
        
        if (!boardId || !position) {
          return;
        }
        
        // Broadcast cursor position to all clients in the room except the sender
        socket.to(`board:${boardId}`).emit('cursor:moved', {
          userId: socket.user.id,
          username: socket.user.username,
          position,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error in cursor:move handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
      }
    });
  }
}

module.exports = new BoardHandler(); 