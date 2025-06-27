const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const boardChatModel = require('../models/boardChatModel');
const boardModel = require('../models/boardModel');
const { 
  createValidator, 
  validatePagination, 
  validateBoardId 
} = require('../middleware/validation');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler, 
  validateRequired 
} = require('../utils/responseHelpers');

/**
 * Get chat messages for a board
 */
router.get('/:boardId', validateBoardId, validatePagination, asyncHandler(async (req, res) => {
    const { boardId } = req.params;
  const { limit, offset } = req.pagination;
    const beforeId = req.query.beforeId;
    const afterId = req.query.afterId;
    
    // Verify that the board exists
    const board = await boardModel.getBoardById(boardId);
    
    if (!board) {
    return sendError(res, 404, 'Board not found', null, 'Chat');
    }
    
    // Check if chat is enabled for this board
    const db = require('../models/database').getDb();
    const settings = await db.get('SELECT chat_enabled FROM board_settings WHERE board_id = ?', [boardId]);
    
    if (settings && settings.chat_enabled === 0) {
    return sendError(res, 403, 'Chat is disabled for this board', null, 'Chat');
    }
    
    // Get chat messages
    const messages = await boardChatModel.getBoardChatMessages(boardId, {
      limit,
      offset,
      beforeId,
      afterId
    });
    
  logger.chat.debug('Chat messages retrieved', {
    boardId,
    messageCount: messages.length,
    userId: req.user?.id
  });
  
  return sendSuccess(res, {
      messages,
      meta: {
        limit,
        offset
      }
  }, 200, 'Chat');
}, 'Chat'));

/**
 * Add a chat message to a board
 */
router.post('/:boardId', validateBoardId, createValidator('chat'), asyncHandler(async (req, res) => {
    const { boardId } = req.params;
  const { message } = req.validated;
  const userId = req.user.user_id;
    
  if (typeof message !== 'string' || message.trim().length === 0) {
    return sendError(res, 400, 'Message cannot be empty', null, 'Chat');
    }
    
    // Check if this is a command message
    let command = null;
    let commandResult = null;
    let args = [];
    
    if (message.startsWith('/')) {
      const parts = message.substring(1).split(' ');
      command = parts[0].toLowerCase();
      args = parts.slice(1);
      
      // Process command
      commandResult = await boardChatModel.processCommand({
        boardId,
        userId,
        command,
        args
      });
      
      // If command failed, return the error message
      if (!commandResult.success) {
      return sendError(res, 400, commandResult.message, null, 'Chat');
      }
      
      // For some commands, we might not want to store a message
      if (command === 'clear') {
      logger.chat.info('Chat cleared via command', { boardId, userId });
      return sendSuccess(res, { success: true, message: commandResult.message }, 200, 'Chat');
      }
    }
    
    // Add chat message to board
    const chatMessage = await boardChatModel.addChatMessage({
      boardId,
      userId,
      message: commandResult ? commandResult.message : message,
      command
    });
    
  logger.chat.debug('Chat message added', {
    boardId,
    userId,
    messageId: chatMessage.id,
    isCommand: !!command
  });
  
  return sendSuccess(res, { message: chatMessage }, 201, 'Chat');
}, 'Chat'));

/**
 * Delete a chat message
 */
router.delete('/:boardId/messages/:messageId', validateBoardId, asyncHandler(async (req, res) => {
    const { boardId, messageId } = req.params;
  const userId = req.user.user_id;
  const isAdmin = req.user.is_admin === true;
    
    const success = await boardChatModel.deleteChatMessage(messageId, userId, isAdmin);
    
    if (!success) {
    return sendError(res, 404, 'Message not found or you do not have permission to delete it', null, 'Chat');
  }
  
  logger.chat.info('Chat message deleted', {
    boardId,
    messageId,
    userId,
    isAdmin
    });
  
  return sendSuccess(res, { success: true }, 200, 'Chat');
}, 'Chat'));

module.exports = router; 