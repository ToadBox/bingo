const logger = require('../../utils/logger');
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
}

module.exports = new ChatHandler(); 