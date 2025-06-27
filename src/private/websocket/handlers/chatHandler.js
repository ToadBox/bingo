// WebSocket Chat Handler
// Handles real-time chat messages, typing indicators, and mention notifications

const sharedConstants = require('../../../../shared/constants.js');
const logger = require('../../utils/logger.js');
const boardChatModel = require('../../models/boardChatModel');

class ChatHandler {
  /**
   * Register chat-related WebSocket event handlers
   * @param {Object} socket - Socket instance
   * @param {Object} wsServer - WebSocketServer instance
   */
  registerHandlers(socket, wsServer) {
    // Send a chat message
    socket.on('chat:message', async (data, callback) => {
      try {
        const { boardId, message } = data;
        
        if (!boardId || !message) {
          return callback({ error: 'Board ID and message are required' });
        }
        
        // Check if this is a command
        let command = null;
        let args = [];
        
        if (message.startsWith('/')) {
          const parts = message.substring(1).split(' ');
          command = parts[0].toLowerCase();
          args = parts.slice(1);
        }
        
        const userId = socket.user.id;
        
        // Add the message to the database
        const chatMessage = await boardChatModel.addChatMessage({
          boardId,
          userId,
          message,
          command
        });
        
        // Get username for the message
        const username = socket.user.username;
        
        // Format message data for broadcasting
        const messageData = {
          id: chatMessage.id,
          boardId,
          userId,
          username,
          message: chatMessage.message,
          command: chatMessage.command,
          mentions: chatMessage.mentions,
          timestamp: chatMessage.created_at
        };
        
        // Broadcast the message to all clients in the room including the sender
        wsServer.broadcastToBoard(boardId, 'chat:message', messageData);
        
        callback({ success: true, message: messageData });
      } catch (error) {
        logger.error('Error in chat:message handler', {
          error: error.message,
          userId: socket.user?.id,
          boardId: data?.boardId
        });
        callback({ error: 'Failed to send message' });
      }
    });

    // Process a chat command
    socket.on('chat:command', async (data, callback) => {
      try {
        const { boardId, command, args } = data;
        
        if (!boardId || !command) {
          return callback({ error: 'Board ID and command are required' });
        }
        
        const userId = socket.user.id;
        
        // Process the command
        const result = await boardChatModel.processCommand({
          boardId,
          userId,
          command,
          args: args || []
        });
        
        // If command processing failed
        if (!result.success) {
          return callback({ error: result.message });
        }
        
        // For commands that modify the room state, broadcast to all clients
        if (['clear'].includes(command)) {
          wsServer.broadcastToBoard(boardId, 'chat:system', {
            message: result.message,
            command,
            timestamp: new Date().toISOString()
          });
        }
        
        callback({ success: true, result });
      } catch (error) {
        logger.error('Error in chat:command handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
        callback({ error: 'Failed to process command' });
      }
    });

    // Get chat history
    socket.on('chat:history', async (data, callback) => {
      try {
        const { boardId, limit, offset, beforeId, afterId } = data;
        
        if (!boardId) {
          return callback({ error: 'Board ID is required' });
        }
        
        // Get chat messages from the database
        const messages = await boardChatModel.getBoardChatMessages(boardId, {
          limit: limit || 50,
          offset: offset || 0,
          beforeId,
          afterId
        });
        
        callback({
          success: true,
          messages
        });
      } catch (error) {
        logger.error('Error in chat:history handler', {
          error: error.message,
          userId: socket.user?.id,
          boardId: data?.boardId
        });
        callback({ error: 'Failed to get chat history' });
      }
    });

    // Delete a chat message
    socket.on('chat:delete', async (data, callback) => {
      try {
        const { boardId, messageId } = data;
        
        if (!boardId || !messageId) {
          return callback({ error: 'Board ID and message ID are required' });
        }
        
        const userId = socket.user.id;
        const isAdmin = socket.user.is_admin === 1;
        
        // Delete the message
        const success = await boardChatModel.deleteChatMessage(
          messageId,
          userId,
          isAdmin
        );
        
        if (!success) {
          return callback({ error: 'Failed to delete message' });
        }
        
        // Broadcast the deletion to all clients in the room
        wsServer.broadcastToBoard(boardId, 'chat:deleted', {
          boardId,
          messageId,
          userId,
          timestamp: new Date().toISOString()
        });
        
        callback({ success: true });
      } catch (error) {
        logger.error('Error in chat:delete handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
        callback({ error: 'Failed to delete message' });
      }
    });

    // User typing in chat indication
    socket.on('chat:typing', (data) => {
      try {
        const { boardId, isTyping } = data;
        
        if (!boardId) {
          return;
        }
        
        // Broadcast typing indicator to all clients in the room except the sender
        socket.to(`board:${boardId}`).emit('chat:typing', {
          userId: socket.user.id,
          username: socket.user.username,
          isTyping,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error in chat:typing handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
      }
    });
  }

  async handleChatMessage(socket, data, wsServer) {
    try {
      const { boardId, message, command } = data;
      
      if (!boardId || !message?.trim()) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Board ID and message are required',
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

      // Check if chat is enabled for this board
      if (!board.settings?.chatEnabled) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Chat is disabled for this board',
          code: sharedConstants.ERROR_CODES.RESOURCE_FORBIDDEN
        });
        return;
      }

      // Process mentions (users starting with @)
      const mentions = this.extractMentions(message);
      
      // Check if this is a command message
      const isCommand = message.startsWith('/');
      let processedCommand = null;
      
      if (isCommand) {
        processedCommand = await this.processCommand(socket, message, boardId, wsServer);
        if (processedCommand && processedCommand.handled) {
          return; // Command was handled, don't save as chat message
        }
      }

      // Create chat message
      const boardChatModel = require('../../models/boardChatModel.js');
      const chatMessage = await boardChatModel.create({
        boardId,
        userId: socket.user?.userId,
        message: message.trim(),
        command: processedCommand?.command || null,
        mentions: mentions.length > 0 ? JSON.stringify(mentions) : null
      });

      // Prepare message data for broadcast
      const messageData = {
        id: chatMessage.id,
        boardId,
        userId: socket.user?.userId,
        username: socket.user?.username || 'Anonymous',
        message: chatMessage.message,
        command: chatMessage.command,
        mentions,
        createdAt: chatMessage.createdAt
      };

      // Broadcast message to all users in the board
      wsServer.toBoardRoom(boardId, sharedConstants.WEBSOCKET.EVENTS.CHAT_MESSAGE, {
        boardId,
        message: messageData
      });

      // Send mention notifications
      if (mentions.length > 0) {
        await this.sendMentionNotifications(boardId, messageData, mentions, socket.user);
      }

      logger.info('Chat message sent', {
        userId: socket.user?.userId || 'anonymous',
        username: socket.user?.username || 'Anonymous',
        boardId,
        messageId: chatMessage.id,
        mentions: mentions.length,
        isCommand,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error handling chat message:', error, {
        socketId: socket.id,
        boardId: data?.boardId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to send chat message',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async handleTyping(socket, data, wsServer) {
    try {
      const { boardId, isTyping } = data;
      
      if (!boardId) {
        return; // Silently ignore missing boardId
      }

      // Broadcast typing indicator to other users in the board
      socket.to(boardId).emit('chat:typing', {
        boardId,
        userId: socket.user?.userId,
        username: socket.user?.username || 'Anonymous',
        isTyping,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Error handling typing indicator:', error, {
        socketId: socket.id,
        boardId: data?.boardId,
        requestId: socket.requestId
      });
    }
  }

  extractMentions(message) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(message)) !== null) {
      const username = match[1];
      if (!mentions.includes(username)) {
        mentions.push(username);
      }
    }
    
    return mentions;
  }

  async processCommand(socket, message, boardId, wsServer) {
    const parts = message.trim().split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (command) {
        case '/help':
          return this.handleHelpCommand(socket, boardId);
        
        case '/users':
          return this.handleUsersCommand(socket, boardId, wsServer);
        
        case '/clear':
          return this.handleClearCommand(socket, boardId, args, wsServer);
        
        case '/theme':
          return this.handleThemeCommand(socket, boardId, args, wsServer);
        
        case '/reset':
          return this.handleResetCommand(socket, boardId, args, wsServer);
        
        case '/watch':
          return this.handleWatchCommand(socket, boardId, args);
        
        default:
          // Unknown command, let it be saved as a regular message
          return { command, handled: false };
      }
    } catch (error) {
      logger.error('Error processing command:', error, {
        command,
        boardId,
        userId: socket.user?.userId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: `Failed to execute command: ${command}`,
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
      
      return { command, handled: true };
    }
  }

  handleHelpCommand(socket, boardId) {
    const helpMessage = [
      'Available Commands:',
      '/help - Show this help message',
      '/users - List users in this board',
      '/clear [all|my] - Clear chat messages',
      '/theme [light|dark] - Change board theme',
      '/reset - Reset board (admin only)',
      '/watch - Get board status and stats'
    ].join('\n');

    socket.emit('chat:system', {
      boardId,
      message: helpMessage,
      type: 'help'
    });

    return { command: '/help', handled: true };
  }

  handleUsersCommand(socket, boardId, wsServer) {
    const boardUsers = wsServer.getBoardUsers(boardId);
    const userList = boardUsers.map(user => 
      user.isAnonymous ? `${user.username} (anonymous)` : user.username
    ).join(', ');

    const message = `Users in this board (${boardUsers.length}): ${userList || 'None'}`;

    socket.emit('chat:system', {
      boardId,
      message,
      type: 'users'
    });

    return { command: '/users', handled: true };
  }

  async handleClearCommand(socket, boardId, args, wsServer) {
    const scope = args[0] || 'my';
    
    if (scope === 'all' && (!socket.user || socket.user.isAnonymous)) {
      socket.emit('chat:system', {
        boardId,
        message: 'Only authenticated users can clear all messages',
        type: 'error'
      });
      return { command: '/clear', handled: true };
    }

    const boardChatModel = require('../../models/boardChatModel.js');
    
    if (scope === 'all') {
      // Clear all messages (requires authentication)
      await boardChatModel.clearBoardMessages(boardId);
      
      // Notify all users
      wsServer.toBoardRoom(boardId, 'chat:cleared', {
        boardId,
        clearedBy: socket.user.username,
        scope: 'all'
      });
    } else {
      // Clear only user's messages
      if (socket.user && !socket.user.isAnonymous) {
        await boardChatModel.clearUserMessages(boardId, socket.user.userId);
      }
      
      socket.emit('chat:system', {
        boardId,
        message: 'Your messages have been cleared',
        type: 'clear'
      });
    }

    return { command: '/clear', handled: true };
  }

  async handleThemeCommand(socket, boardId, args, wsServer) {
    const theme = args[0];
    
    if (!theme || !['light', 'dark'].includes(theme)) {
      socket.emit('chat:system', {
        boardId,
        message: 'Usage: /theme [light|dark]',
        type: 'error'
      });
      return { command: '/theme', handled: true };
    }

    // For now, just broadcast the theme change
    // In a full implementation, you might save this to board settings
    wsServer.toBoardRoom(boardId, 'board:theme_changed', {
      boardId,
      theme,
      changedBy: socket.user?.username || 'Anonymous'
    });

    return { command: '/theme', handled: true };
  }

  async handleResetCommand(socket, boardId, args, wsServer) {
    // Only allow admins or board owners to reset
    if (!socket.user || socket.user.isAnonymous) {
      socket.emit('chat:system', {
        boardId,
        message: 'Authentication required to reset board',
        type: 'error'
      });
      return { command: '/reset', handled: true };
    }

    const boardModel = require('../../models/boardModel.js');
    const board = await boardModel.getById(boardId);
    
    if (!board) {
      socket.emit('chat:system', {
        boardId,
        message: 'Board not found',
        type: 'error'
      });
      return { command: '/reset', handled: true };
    }

    // Check if user is admin or board owner
    if (!socket.user.isAdmin && board.createdBy !== socket.user.username) {
      socket.emit('chat:system', {
        boardId,
        message: 'Only board owners and admins can reset the board',
        type: 'error'
      });
      return { command: '/reset', handled: true };
    }

    // Reset all cells
    await boardModel.resetBoard(boardId);

    // Notify all users
    wsServer.toBoardRoom(boardId, sharedConstants.WEBSOCKET.EVENTS.BOARD_UPDATED, {
      boardId,
      board: {
        id: board.id,
        title: board.title,
        settings: board.settings,
        cells: [] // Empty cells after reset
      }
    });

    wsServer.toBoardRoom(boardId, 'chat:system', {
      boardId,
      message: `Board reset by ${socket.user.username}`,
      type: 'reset'
    });

    return { command: '/reset', handled: true };
  }

  async handleWatchCommand(socket, boardId, args) {
    try {
      const boardModel = require('../../models/boardModel.js');
      const board = await boardModel.getById(boardId);
      
      if (!board) {
        socket.emit('chat:system', {
          boardId,
          message: 'Board not found',
          type: 'error'
        });
        return { command: '/watch', handled: true };
      }

      const cells = await boardModel.getCells(boardId);
      const totalCells = cells.length;
      const markedCells = cells.filter(cell => cell.marked).length;
      const completionPercentage = totalCells > 0 ? ((markedCells / totalCells) * 100).toFixed(1) : 0;

      const statusMessage = [
        `Board: ${board.title}`,
        `Cells: ${markedCells}/${totalCells} marked (${completionPercentage}%)`,
        `Size: ${board.settings?.size || 5}x${board.settings?.size || 5}`,
        `Public: ${board.isPublic ? 'Yes' : 'No'}`,
        `Created: ${new Date(board.createdAt).toLocaleDateString()}`
      ].join('\n');

      socket.emit('chat:system', {
        boardId,
        message: statusMessage,
        type: 'watch'
      });

    } catch (error) {
      socket.emit('chat:system', {
        boardId,
        message: 'Failed to get board status',
        type: 'error'
      });
    }

    return { command: '/watch', handled: true };
  }

  async sendMentionNotifications(boardId, messageData, mentions, sender) {
    try {
      if (!sender || sender.isAnonymous) return;

      const userModel = require('../../models/userModel.js');
      const notificationModel = require('../../models/notificationModel.js');
      const boardMemberModel = require('../../models/boardMemberModel.js');

      for (const mentionedUsername of mentions) {
        // Skip self-mentions
        if (mentionedUsername === sender.username) continue;

        // Find the mentioned user
        const mentionedUser = await userModel.getByUsername(mentionedUsername);
        if (!mentionedUser) continue;

        // Check if user is a member of the board with mention notifications enabled
        const membership = await boardMemberModel.getByBoardIdAndUserId(boardId, mentionedUser.id);
        if (membership && membership.mentionNotifications) {
          await notificationModel.create({
            userId: mentionedUser.id,
            message: `${sender.username} mentioned you in a chat message`,
            type: 'mention',
            data: JSON.stringify({
              boardId,
              messageId: messageData.id,
              message: messageData.message,
              mentionedBy: sender.username
            })
          });
        }
      }
    } catch (error) {
      logger.error('Error sending mention notifications:', error);
    }
  }
}

module.exports = new ChatHandler(); 