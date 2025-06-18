const database = require('./database');
const logger = require('../utils/logger');
const notificationModel = require('./notificationModel');

class BoardChatModel {
  constructor() {}

  /**
   * Add a chat message to a board
   * @param {Object} messageData - Chat message data
   * @returns {Object} - Created message
   */
  async addChatMessage(messageData) {
    const { boardId, userId, message, command = null } = messageData;
    
    try {
      // Process message for mentions
      const mentions = this.extractMentions(message);
      
      const db = database.getDb();
      const result = await db.run(`
        INSERT INTO board_chat (
          board_id,
          user_id,
          message,
          command,
          mentions
        )
        VALUES (?, ?, ?, ?, ?)
      `, [
        boardId,
        userId,
        message,
        command,
        mentions.length > 0 ? JSON.stringify(mentions) : null
      ]);

      if (result.lastID) {
        logger.debug('Chat message added', {
          messageId: result.lastID,
          boardId,
          userId
        });
        
        // Get the created message with user data
        const chatMessage = await this.getChatMessageById(result.lastID);
        
        // Handle mentions and create notifications
        if (mentions.length > 0) {
          await this.handleMentions(chatMessage, mentions);
        }
        
        return chatMessage;
      }
      
      throw new Error('Failed to add chat message');
    } catch (error) {
      logger.error('Failed to add chat message', {
        error: error.message,
        boardId,
        userId
      });
      throw error;
    }
  }

  /**
   * Get a chat message by ID
   * @param {number} id - Message ID
   * @returns {Object|null} - Message or null if not found
   */
  async getChatMessageById(id) {
    try {
      const db = database.getDb();
      const message = await db.get(`
        SELECT
          c.id,
          c.board_id,
          c.user_id,
          c.message,
          c.command,
          c.mentions,
          c.created_at,
          u.username as username
        FROM board_chat c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `, [id]);
      
      if (message) {
        // Parse mentions JSON if present
        if (message.mentions) {
          try {
            message.mentions = JSON.parse(message.mentions);
          } catch (e) {
            message.mentions = [];
          }
        } else {
          message.mentions = [];
        }
      }
      
      return message || null;
    } catch (error) {
      logger.error('Failed to get chat message', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get chat messages for a board
   * @param {number} boardId - Board ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of chat messages
   */
  async getBoardChatMessages(boardId, options = {}) {
    const { limit = 50, offset = 0, beforeId = null, afterId = null } = options;
    
    try {
      const db = database.getDb();
      let query = `
        SELECT
          c.id,
          c.board_id,
          c.user_id,
          c.message,
          c.command,
          c.mentions,
          c.created_at,
          u.username as username
        FROM board_chat c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.board_id = ?
      `;
      
      const params = [boardId];
      
      if (beforeId) {
        query += ' AND c.id < ?';
        params.push(beforeId);
      }
      
      if (afterId) {
        query += ' AND c.id > ?';
        params.push(afterId);
      }
      
      query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const messages = await db.all(query, params);
      
      // Parse mentions JSON for each message
      messages.forEach(message => {
        if (message.mentions) {
          try {
            message.mentions = JSON.parse(message.mentions);
          } catch (e) {
            message.mentions = [];
          }
        } else {
          message.mentions = [];
        }
      });
      
      return messages;
    } catch (error) {
      logger.error('Failed to get board chat messages', {
        error: error.message,
        boardId
      });
      return [];
    }
  }

  /**
   * Extract user mentions from a message
   * @param {string} message - Message text
   * @returns {Array} - Array of mentioned usernames
   */
  extractMentions(message) {
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = message.match(mentionRegex);
    
    if (!matches) {
      return [];
    }
    
    return matches.map(match => match.substring(1)); // Remove @ symbol
  }

  /**
   * Handle user mentions in a message
   * @param {Object} message - Chat message
   * @param {Array} mentions - Mentioned usernames
   */
  async handleMentions(message, mentions) {
    const db = database.getDb();
    
    try {
      // Get board info
      const board = await db.get('SELECT title FROM boards WHERE id = ?', [message.board_id]);
      if (!board) return;
      
      // Check if mentions are enabled for this board
      const settings = await db.get('SELECT mention_notifications FROM board_settings WHERE board_id = ?', [message.board_id]);
      if (settings && settings.mention_notifications !== 1) return;
      
      // Get the mentioned users
      for (const username of mentions) {
        const user = await db.get('SELECT id FROM users WHERE username = ?', [username]);
        
        if (user) {
          // Check if user has notifications enabled for this board
          const member = await db.get(
            'SELECT notifications_enabled FROM board_members WHERE board_id = ? AND user_id = ?',
            [message.board_id, user.id]
          );
          
          // Skip if user has disabled notifications for this board
          if (member && member.notifications_enabled === 0) continue;
          
          // Create notification for the mentioned user
          await notificationModel.createNotification({
            userId: user.id,
            message: `@${message.username} mentioned you in "${board.title}"`,
            type: 'mention',
            data: {
              boardId: message.board_id,
              chatId: message.id,
              mentionedBy: message.username,
              boardTitle: board.title
            }
          });
          
          logger.debug('Created mention notification', {
            mentionedUser: username,
            boardId: message.board_id,
            chatId: message.id
          });
        }
      }
    } catch (error) {
      logger.error('Failed to handle mentions', {
        error: error.message,
        chatId: message.id,
        mentions
      });
    }
  }

  /**
   * Delete a chat message
   * @param {number} messageId - Message ID
   * @param {number} userId - User ID (for permission check)
   * @param {boolean} isAdmin - Whether the user is an admin
   * @returns {boolean} - Success status
   */
  async deleteChatMessage(messageId, userId, isAdmin = false) {
    try {
      const db = database.getDb();
      
      // Check if the user owns the message or is an admin
      if (!isAdmin) {
        const message = await db.get('SELECT user_id FROM board_chat WHERE id = ?', [messageId]);
        
        if (!message || message.user_id !== userId) {
          return false;
        }
      }
      
      const result = await db.run('DELETE FROM board_chat WHERE id = ?', [messageId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete chat message', {
        error: error.message,
        messageId,
        userId
      });
      return false;
    }
  }

  /**
   * Process a command in a chat message
   * @param {Object} messageData - Message data with command
   * @returns {Object} - Command result
   */
  async processCommand(messageData) {
    const { boardId, userId, command, args } = messageData;
    
    try {
      // Handle different commands
      switch (command) {
        case 'clear':
          // Clear the chat if user has permission
          return await this.handleClearCommand(boardId, userId, args);
          
        case 'history':
          // Show cell history
          return await this.handleHistoryCommand(boardId, userId, args);
          
        case 'roll':
          // Random dice roll
          return await this.handleRollCommand(args);
          
        default:
          return {
            success: false,
            message: 'Unknown command'
          };
      }
    } catch (error) {
      logger.error('Command processing failed', {
        error: error.message,
        command,
        boardId,
        userId
      });
      
      return {
        success: false,
        message: 'Command failed: ' + error.message
      };
    }
  }

  /**
   * Handle clear command
   * @param {number} boardId - Board ID
   * @param {number} userId - User ID
   * @param {Array} args - Command arguments
   * @returns {Object} - Command result
   */
  async handleClearCommand(boardId, userId, args = []) {
    try {
      const db = database.getDb();
      
      // Check if the user is a board admin or site admin
      const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [userId]);
      const boardMember = await db.get(
        'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
        [boardId, userId]
      );
      
      const isAdmin = user && user.is_admin === 1;
      const isBoardAdmin = boardMember && boardMember.role === 'admin';
      
      if (!isAdmin && !isBoardAdmin) {
        return {
          success: false,
          message: 'You do not have permission to clear chat'
        };
      }
      
      // Delete all messages from the board chat
      const result = await db.run('DELETE FROM board_chat WHERE board_id = ?', [boardId]);
      
      return {
        success: true,
        message: `Chat cleared (${result.changes} messages removed)`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle history command
   * @param {number} boardId - Board ID
   * @param {number} userId - User ID
   * @param {Array} args - Command arguments [row, col]
   * @returns {Object} - Command result
   */
  async handleHistoryCommand(boardId, userId, args = []) {
    try {
      // Require row and column arguments
      if (args.length < 2) {
        return {
          success: false,
          message: 'Usage: /history [row] [col]'
        };
      }
      
      const row = parseInt(args[0]);
      const col = parseInt(args[1]);
      
      if (isNaN(row) || isNaN(col)) {
        return {
          success: false,
          message: 'Invalid row or column'
        };
      }
      
      const db = database.getDb();
      
      // Get the cell ID
      const cell = await db.get(
        'SELECT id FROM cells WHERE board_id = ? AND row = ? AND col = ?',
        [boardId, row, col]
      );
      
      if (!cell) {
        return {
          success: false,
          message: `No cell found at (${row},${col})`
        };
      }
      
      // Get history for the cell
      const cellHistoryModel = require('./cellHistoryModel');
      const history = await cellHistoryModel.getCellHistory(cell.id, { limit: 5 });
      
      if (history.length === 0) {
        return {
          success: true,
          message: `No history for cell (${row},${col})`
        };
      }
      
      // Format the history
      const historyText = history
        .map(h => {
          const date = new Date(h.created_at).toLocaleString();
          const user = h.user_name || 'Unknown';
          const value = h.value || '[Empty]';
          const marked = h.marked ? 'Marked' : 'Unmarked';
          return `${date} by ${user}: ${value} (${marked})`;
        })
        .join('\n');
      
      return {
        success: true,
        message: `History for cell (${row},${col}):\n${historyText}`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle roll command
   * @param {Array} args - Command arguments [number of dice, sides per die]
   * @returns {Object} - Command result
   */
  async handleRollCommand(args = []) {
    try {
      // Default: 1d6
      let dice = 1;
      let sides = 6;
      
      // Parse arguments if provided
      if (args.length > 0) {
        const diceNotation = args[0];
        const match = diceNotation.match(/(\d+)?d(\d+)/i);
        
        if (match) {
          dice = match[1] ? parseInt(match[1]) : 1;
          sides = parseInt(match[2]);
        }
      }
      
      // Validate inputs
      if (isNaN(dice) || isNaN(sides) || dice < 1 || sides < 1) {
        return {
          success: false,
          message: 'Invalid dice notation. Use [number]d[sides], e.g. 2d6'
        };
      }
      
      // Cap at reasonable numbers
      dice = Math.min(dice, 100);
      sides = Math.min(sides, 1000);
      
      // Roll the dice
      const rolls = [];
      let total = 0;
      
      for (let i = 0; i < dice; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        rolls.push(roll);
        total += roll;
      }
      
      // Format the result
      let message = `Rolled ${dice}d${sides}`;
      
      if (dice > 1) {
        message += ` = ${total} (${rolls.join(', ')})`;
      } else {
        message += ` = ${total}`;
      }
      
      return {
        success: true,
        message: message
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new BoardChatModel(); 