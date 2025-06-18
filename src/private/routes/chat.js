const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const boardChatModel = require('../models/boardChatModel');
const boardModel = require('../models/boardModel');

/**
 * Get chat messages for a board
 */
router.get('/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const beforeId = req.query.beforeId;
    const afterId = req.query.afterId;
    
    // Verify that the board exists
    const board = await boardModel.getBoardById(boardId);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Check if chat is enabled for this board
    const db = require('../models/database').getDb();
    const settings = await db.get('SELECT chat_enabled FROM board_settings WHERE board_id = ?', [boardId]);
    
    if (settings && settings.chat_enabled === 0) {
      return res.status(403).json({ error: 'Chat is disabled for this board' });
    }
    
    // Get chat messages
    const messages = await boardChatModel.getBoardChatMessages(boardId, {
      limit,
      offset,
      beforeId,
      afterId
    });
    
    return res.json({
      messages,
      meta: {
        limit,
        offset
      }
    });
  } catch (error) {
    logger.error('Failed to get chat messages', {
      error: error.message,
      boardId: req.params.boardId,
      userId: req.user?.id
    });
    return res.status(500).json({ error: 'Failed to get chat messages' });
  }
});

/**
 * Add a chat message to a board
 */
router.post('/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
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
        return res.status(400).json({ error: commandResult.message });
      }
      
      // For some commands, we might not want to store a message
      if (command === 'clear') {
        return res.json({ success: true, message: commandResult.message });
      }
    }
    
    // Add chat message to board
    const chatMessage = await boardChatModel.addChatMessage({
      boardId,
      userId,
      message: commandResult ? commandResult.message : message,
      command
    });
    
    return res.status(201).json({ message: chatMessage });
  } catch (error) {
    logger.error('Failed to add chat message', {
      error: error.message,
      boardId: req.params.boardId,
      userId: req.user?.id
    });
    return res.status(500).json({ error: 'Failed to add chat message' });
  }
});

/**
 * Delete a chat message
 */
router.delete('/:boardId/messages/:messageId', async (req, res) => {
  try {
    const { boardId, messageId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.isAdmin === true;
    
    const success = await boardChatModel.deleteChatMessage(messageId, userId, isAdmin);
    
    if (!success) {
      return res.status(404).json({ error: 'Message not found or you do not have permission to delete it' });
    }
    
    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete chat message', {
      error: error.message,
      boardId: req.params.boardId,
      messageId: req.params.messageId,
      userId: req.user?.id
    });
    return res.status(500).json({ error: 'Failed to delete chat message' });
  }
});

module.exports = router; 