// WebSocket Board Handler
// Handles real-time board updates, cell changes, and user presence

const sharedConstants = require('../../../../shared/constants.js');
const logger = require('../../utils/logger.js');

class BoardHandler {
  
  async handleJoinBoard(socket, data, wsServer) {
    try {
      const { boardId, boardPassword } = data;
      
      if (!boardId) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Board ID is required',
          code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD
        });
        return;
      }

      // Verify board exists and user has access
      const boardModel = require('../../models/boardModel.js');
      const board = await boardModel.getById(boardId);
      
      if (!board) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Board not found',
          code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND
        });
        return;
      }

      // Check if board requires password (for anonymous private boards)
      if (board.boardPassword && boardPassword !== board.boardPassword) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Invalid board password',
          code: sharedConstants.ERROR_CODES.AUTH_INVALID
        });
        return;
      }

      // Check if board is public or user has access
      if (!board.isPublic && socket.user.isAnonymous && !board.boardPassword) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Access denied to private board',
          code: sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
        });
        return;
      }

      // Join the board room
      wsServer.joinBoardRoom(socket, boardId);
      
      // Load current board state with cells
      const cells = await boardModel.getCells(boardId);
      
      // Send current board state to the user
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.BOARD_UPDATED, {
        boardId,
        board: {
          id: board.id,
          title: board.title,
          settings: board.settings,
          cells: cells || []
        }
      });

      // Get current users in the board
      const boardUsers = wsServer.getBoardUsers(boardId);
      
      socket.emit('board:users', {
        boardId,
        users: boardUsers
      });

      logger.info('User joined board', {
        userId: socket.user?.userId || 'anonymous',
        username: socket.user?.username || 'Anonymous',
        boardId,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error joining board:', error, {
        socketId: socket.id,
        boardId: data?.boardId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to join board',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async handleLeaveBoard(socket, data, wsServer) {
    try {
      const { boardId } = data;
      
      if (!boardId) {
        return; // Silently ignore missing boardId for leave events
      }

      wsServer.leaveBoardRoom(socket, boardId);
      
      logger.info('User left board', {
        userId: socket.user?.userId || 'anonymous',
        username: socket.user?.username || 'Anonymous',
        boardId,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error leaving board:', error, {
        socketId: socket.id,
        boardId: data?.boardId,
        requestId: socket.requestId
      });
    }
  }

  async handleCellUpdate(socket, data, wsServer) {
    try {
      const { boardId, cellId, row, col, value, type = 'text' } = data;
      
      if (!boardId || (cellId === undefined && (row === undefined || col === undefined))) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Board ID and cell position are required',
          code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD
        });
        return;
      }

      // Verify user has edit access to the board
      const boardModel = require('../../models/boardModel.js');
      const board = await boardModel.getById(boardId);
      
      if (!board) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Board not found',
          code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND
        });
        return;
      }

      // Check edit permissions
      if (!board.isPublic && socket.user.isAnonymous) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Edit access denied',
          code: sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
        });
        return;
      }

      // Update the cell
      const cellData = {
        boardId,
        row,
        col,
        value,
        type,
        updatedBy: socket.user?.username || 'Anonymous'
      };

      let updatedCell;
      if (cellId) {
        updatedCell = await boardModel.updateCell(cellId, cellData);
      } else {
        updatedCell = await boardModel.updateCellByPosition(boardId, row, col, cellData);
      }

      // Create cell history entry
      const cellHistoryModel = require('../../models/cellHistoryModel.js');
      await cellHistoryModel.create({
        cellId: updatedCell.id,
        value,
        type,
        marked: updatedCell.marked,
        createdBy: socket.user?.userId
      });

      // Broadcast cell update to all users in the board
      wsServer.toBoardRoom(boardId, sharedConstants.WEBSOCKET.EVENTS.CELL_EDITED, {
        boardId,
        cell: updatedCell
      });

      // Send notifications to board members if enabled
      await this.sendCellUpdateNotifications(boardId, updatedCell, socket.user);

      logger.info('Cell updated', {
        userId: socket.user?.userId || 'anonymous',
        username: socket.user?.username || 'Anonymous',
        boardId,
        cellId: updatedCell.id,
        row,
        col,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error updating cell:', error, {
        socketId: socket.id,
        boardId: data?.boardId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to update cell',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async handleCellMark(socket, data, wsServer) {
    try {
      const { boardId, cellId, row, col, marked } = data;
      
      if (!boardId || (cellId === undefined && (row === undefined || col === undefined))) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Board ID and cell position are required',
          code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD
        });
        return;
      }

      // Get the cell to mark
      const boardModel = require('../../models/boardModel.js');
      let cell;
      
      if (cellId) {
        cell = await boardModel.getCellById(cellId);
      } else {
        cell = await boardModel.getCellByPosition(boardId, row, col);
      }

      if (!cell) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Cell not found',
          code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND
        });
        return;
      }

      // Toggle marked state if not specified
      const newMarkedState = marked !== undefined ? marked : !cell.marked;
      
      // Update cell marked state
      const updatedCell = await boardModel.updateCell(cell.id, {
        marked: newMarkedState,
        updatedBy: socket.user?.username || 'Anonymous'
      });

      // Create cell history entry
      const cellHistoryModel = require('../../models/cellHistoryModel.js');
      await cellHistoryModel.create({
        cellId: cell.id,
        value: cell.value,
        type: cell.type,
        marked: newMarkedState,
        createdBy: socket.user?.userId
      });

      // Broadcast appropriate event
      const event = newMarkedState 
        ? sharedConstants.WEBSOCKET.EVENTS.CELL_MARKED 
        : sharedConstants.WEBSOCKET.EVENTS.CELL_UNMARKED;

      wsServer.toBoardRoom(boardId, event, {
        boardId,
        cell: updatedCell
      });

      logger.info('Cell marked/unmarked', {
        userId: socket.user?.userId || 'anonymous',
        username: socket.user?.username || 'Anonymous',
        boardId,
        cellId: cell.id,
        marked: newMarkedState,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error marking cell:', error, {
        socketId: socket.id,
        boardId: data?.boardId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to mark cell',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async sendCellUpdateNotifications(boardId, cell, user) {
    try {
      // Only send notifications for authenticated users
      if (!user || user.isAnonymous) return;

      const boardMemberModel = require('../../models/boardMemberModel.js');
      const notificationModel = require('../../models/notificationModel.js');
      
      // Get board members who have edit notifications enabled
      const members = await boardMemberModel.getByBoardId(boardId, {
        editNotifications: true,
        excludeUserId: user.userId
      });

      for (const member of members) {
        await notificationModel.create({
          userId: member.userId,
          message: `${user.username} updated a cell in the board`,
          type: 'edit',
          data: JSON.stringify({
            boardId,
            cellId: cell.id,
            row: cell.row,
            col: cell.col,
            updatedBy: user.username
          })
        });
      }
    } catch (error) {
      logger.error('Error sending cell update notifications:', error);
    }
  }
}

module.exports = new BoardHandler(); 