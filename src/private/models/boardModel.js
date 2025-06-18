const { v4: uuidv4 } = require('uuid');
const database = require('./database');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class BoardModel {
  constructor() {
    this.defaultBoardSize = constants.DEFAULT_BOARD_SIZE || 5;
    this.minBoardSize = constants.MIN_BOARD_SIZE || 3;
    this.maxBoardSize = constants.MAX_BOARD_SIZE || 9;
  }

  /**
   * Validate board size
   * @param {number} size - Board size (rows/columns)
   * @returns {number} - Valid board size
   */
  validateBoardSize(size) {
    // Convert to number if it's a string
    const sizeNum = parseInt(size, 10);
    
    // Check if it's a valid number
    if (isNaN(sizeNum)) {
      return this.defaultBoardSize;
    }
    
    // Clamp size between min and max
    return Math.max(this.minBoardSize, Math.min(sizeNum, this.maxBoardSize));
  }

  /**
   * Create a new board
   * @param {Object} boardData - Board data
   * @returns {Object} - Created board
   */
  async createBoard(boardData) {
    const { 
      title, 
      createdBy, 
      isPublic = false, 
      description = '',
      size = this.defaultBoardSize,
      freeSpace = true
    } = boardData;
    
    const uuid = boardData.uuid || `user-${uuidv4()}`;
    const boardSize = this.validateBoardSize(size);
    
    try {
      const db = database.getDb();
      
      return await database.transaction(async (db) => {
        // Create board record with size information
        const boardResult = await db.run(`
          INSERT INTO boards (uuid, title, created_by, is_public, description, settings)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          uuid, 
          title, 
          createdBy, 
          isPublic ? 1 : 0, 
          description,
          JSON.stringify({
            size: boardSize,
            freeSpace
          })
        ]);
        
        if (!boardResult.lastID) {
          throw new Error('Failed to create board');
        }
        
        const boardId = boardResult.lastID;
        
        // Create empty cells for the board with the specified size
        await this._createEmptyCells(db, boardId, boardSize);
        
        logger.info('Board created successfully', {
          id: boardId,
          uuid,
          title,
          size: boardSize
        });
        
        // Return the full board
        return this.getBoardById(boardId);
      });
    } catch (error) {
      logger.error('Failed to create board', {
        error: error.message,
        title,
        uuid,
        size
      });
      throw error;
    }
  }

  /**
   * Get board by ID
   * @param {number} id - Board ID
   * @returns {Object|null} - Board object or null if not found
   */
  async getBoardById(id) {
    try {
      const board = await this._getBoardRecord(id);
      
      if (!board) {
        return null;
      }
      
      // Get cells for the board
      const cells = await this._getBoardCells(id);
      board.cells = this._formatCellsAsGrid(cells);
      
      return board;
    } catch (error) {
      logger.error('Failed to get board by ID', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get board by UUID
   * @param {string} uuid - Board UUID
   * @returns {Object|null} - Board object or null if not found
   */
  async getBoardByUUID(uuid) {
    try {
      const db = database.getDb();
      const board = await db.get(`
        SELECT id, uuid, title, created_by, created_at, last_updated, is_public
        FROM boards WHERE uuid = ?
      `, [uuid]);
      
      if (!board) {
        return null;
      }
      
      // Get cells for the board
      const cells = await this._getBoardCells(board.id);
      board.cells = this._formatCellsAsGrid(cells);
      
      return board;
    } catch (error) {
      logger.error('Failed to get board by UUID', {
        error: error.message,
        uuid
      });
      return null;
    }
  }

  /**
   * Get all boards
   * @param {Object} options - Filter options
   * @returns {Array} - Array of board objects
   */
  async getAllBoards(options = {}) {
    const { userId, includePublic = true, limit, offset = 0 } = options;
    let query = `
      SELECT id, uuid, title, created_by, created_at, last_updated, is_public
      FROM boards
      WHERE 1=1
    `;
    const params = [];
    
    // Filter by user if specified
    if (userId) {
      query += ' AND (created_by = ? OR is_public = 1)';
      params.push(userId);
    } else if (includePublic) {
      query += ' AND is_public = 1';
    }
    
    query += ' ORDER BY last_updated DESC';
    
    // Add limit and offset if specified
    if (limit) {
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }
    
    try {
      const db = database.getDb();
      const boards = await db.all(query, params);
      
      // Get cell count and marked count for each board
      const boardsWithStats = await Promise.all(boards.map(async (board) => {
        const stats = await this._getBoardStats(board.id);
        return {
          ...board,
          cellCount: stats.cellCount,
          markedCount: stats.markedCount
        };
      }));
      
      return boardsWithStats;
    } catch (error) {
      logger.error('Failed to get all boards', {
        error: error.message,
        userId,
        includePublic
      });
      return [];
    }
  }

  /**
   * Update board
   * @param {number} boardId - Board ID
   * @param {Object} boardData - Board data to update
   * @returns {Object|null} - Updated board object or null if failed
   */
  async updateBoard(boardId, boardData) {
    const { title, isPublic } = boardData;
    const updateFields = [];
    const params = [];
    
    // Build update query dynamically
    if (title !== undefined) {
      updateFields.push('title = ?');
      params.push(title);
    }
    
    if (isPublic !== undefined) {
      updateFields.push('is_public = ?');
      params.push(isPublic ? 1 : 0);
    }
    
    if (updateFields.length === 0) {
      return await this.getBoardById(boardId);
    }
    
    // Always update last_updated timestamp
    updateFields.push('last_updated = CURRENT_TIMESTAMP');
    
    // Add boardId to params
    params.push(boardId);
    
    try {
      const db = database.getDb();
      const result = await db.run(`
        UPDATE boards
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, params);
      
      if (result.changes > 0) {
        return await this.getBoardById(boardId);
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to update board', {
        error: error.message,
        boardId
      });
      return null;
    }
  }

  /**
   * Get a specific cell from a board
   * @param {number} boardId - Board ID
   * @param {number} row - Cell row
   * @param {number} col - Cell column
   * @returns {Object|null} - Cell object or null if not found
   */
  async getCell(boardId, row, col) {
    try {
      return await this._getCellByPosition(boardId, row, col);
    } catch (error) {
      logger.error('Failed to get cell', {
        error: error.message,
        boardId, row, col
      });
      return null;
    }
  }

  /**
   * Update a cell in a board
   * @param {number} boardId - Board ID
   * @param {number} row - Cell row
   * @param {number} col - Cell column
   * @param {Object} cellData - Cell data to update
   * @param {string} cellData.value - Cell value
   * @param {string} cellData.type - Cell type
   * @param {boolean} cellData.marked - Whether the cell is marked
   * @param {number} userId - User who is updating the cell (optional)
   * @returns {boolean} - Success status
   */
  async updateCell(boardId, row, col, cellData, userId) {
    const { value, type, marked } = cellData;
    
    try {
      const db = database.getDb();
      
      // First get the cell ID
      const cell = await db.get(`
        SELECT id, value, type, marked
        FROM cells
        WHERE board_id = ? AND row = ? AND col = ?
      `, [boardId, row, col]);
      
      if (!cell) {
        return false;
      }
      
      // Build update query dynamically
      const updateFields = [];
      const params = [];
      
      // Only update fields that are provided
      if (value !== undefined) {
        updateFields.push('value = ?');
        params.push(value);
      }
      
      if (type !== undefined) {
        updateFields.push('type = ?');
        params.push(type);
      }
      
      if (marked !== undefined) {
        updateFields.push('marked = ?');
        params.push(marked ? 1 : 0);
      }
      
      // If no fields to update, return true
      if (updateFields.length === 0) {
        return true;
      }
      
      // Always update timestamp
      updateFields.push('last_updated = CURRENT_TIMESTAMP');
      
      // Add updated_by if userId is provided
      if (userId !== undefined) {
        updateFields.push('updated_by = ?');
        params.push(userId);
      }
      
      // Add cell ID to params
      params.push(cell.id);
      
      // Add to history before updating
      const cellHistoryModel = require('./cellHistoryModel');
      await cellHistoryModel.addHistoryEntry({
        cellId: cell.id,
        value: cell.value,
        type: cell.type,
        marked: cell.marked,
        createdBy: userId
      });
      
      // Update the cell
      await db.run(`
        UPDATE cells
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, params);
      
      // Update board's last_updated timestamp
      await db.run(`
        UPDATE boards
        SET last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [boardId]);
      
      // No need to check for notifications here as this will be handled in the high-level updateCell method
      
      return true;
    } catch (error) {
      logger.error('Cell update failed', {
        error: error.message,
        boardId, row, col
      });
      return false;
    }
  }

  /**
   * Notify board members about a cell update
   * @param {string} boardId - Board ID
   * @param {number} updatedBy - User ID who updated the cell
   * @param {string} boardTitle - Board title
   * @param {number} row - Cell row
   * @param {number} col - Cell column
   * @param {string} value - New cell value
   */
  async notifyCellUpdate(boardId, updatedBy, boardTitle, row, col, value) {
    try {
      const db = database.getDb();
      const notificationModel = require('./notificationModel');
      
      // Get the username of the updater
      const user = await db.get(`
        SELECT username FROM users WHERE id = ?
      `, [updatedBy]);
      
      if (!user) return;
      
      // Get all board members with notifications enabled
      const members = await db.all(`
        SELECT user_id 
        FROM board_members 
        WHERE board_id = ? AND user_id != ? AND notifications_enabled = 1
      `, [boardId, updatedBy]);
      
      if (!members || members.length === 0) return;
      
      // Create short version of value for notification
      const shortValue = value && value.length > 30 
        ? value.substring(0, 30) + '...' 
        : value || '[empty]';
      
      // Create a notification for each member
      for (const member of members) {
        await notificationModel.createNotification({
          userId: member.user_id,
          message: `${user.username} updated cell (${row},${col}) in "${boardTitle}"`,
          type: 'cell_update',
          data: {
            boardId,
            row,
            col,
            updatedBy,
            username: user.username,
            value: shortValue,
            boardTitle
          }
        });
      }
    } catch (error) {
      logger.error('Failed to create cell update notifications', {
        error: error.message,
        boardId
      });
    }
  }

  /**
   * Get cell update history
   * @param {string} boardId - Board ID
   * @param {number} row - Cell row
   * @param {number} col - Cell column
   * @param {Object} options - Query options
   * @returns {Array} - Array of history entries
   */
  async getCellHistory(boardId, row, col, options = {}) {
    try {
      const db = database.getDb();
      
      // First get the cell ID
      const cell = await db.get(`
        SELECT id
        FROM cells
        WHERE board_id = ? AND row = ? AND col = ?
      `, [boardId, row, col]);
      
      if (!cell) {
        return [];
      }
      
      const cellHistoryModel = require('./cellHistoryModel');
      return await cellHistoryModel.getCellHistory(cell.id, options);
    } catch (error) {
      logger.error('Failed to get cell history', {
        error: error.message,
        boardId, row, col
      });
      return [];
    }
  }

  /**
   * Create or update board settings
   * @param {string} boardId - Board ID
   * @param {Object} settings - Board settings
   * @returns {boolean} - Success status
   */
  async updateBoardSettings(boardId, settings) {
    try {
      const db = database.getDb();
      
      // Check if settings exist for this board
      const existing = await db.get(`
        SELECT board_id FROM board_settings WHERE board_id = ?
      `, [boardId]);
      
      const {
        chatEnabled = true,
        mentionNotifications = true,
        editNotifications = true,
        publicChat = true,
        requireApproval = false,
        additionalSettings = {}
      } = settings;
      
      // Either update or insert settings
      if (existing) {
        await db.run(`
          UPDATE board_settings
          SET 
            chat_enabled = ?,
            mention_notifications = ?,
            edit_notifications = ?,
            public_chat = ?,
            require_approval = ?,
            settings = ?
          WHERE board_id = ?
        `, [
          chatEnabled ? 1 : 0,
          mentionNotifications ? 1 : 0,
          editNotifications ? 1 : 0,
          publicChat ? 1 : 0,
          requireApproval ? 1 : 0,
          JSON.stringify(additionalSettings),
          boardId
        ]);
      } else {
        await db.run(`
          INSERT INTO board_settings (
            board_id,
            chat_enabled,
            mention_notifications,
            edit_notifications,
            public_chat,
            require_approval,
            settings
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          boardId,
          chatEnabled ? 1 : 0,
          mentionNotifications ? 1 : 0,
          editNotifications ? 1 : 0,
          publicChat ? 1 : 0,
          requireApproval ? 1 : 0,
          JSON.stringify(additionalSettings)
        ]);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to update board settings', {
        error: error.message,
        boardId
      });
      return false;
    }
  }

  /**
   * Get board settings
   * @param {string} boardId - Board ID
   * @returns {Object} - Board settings
   */
  async getBoardSettings(boardId) {
    try {
      const db = database.getDb();
      const board = await db.get(`
        SELECT settings FROM boards WHERE id = ?
      `, [boardId]);
      
      if (!board || !board.settings) {
        // Return default settings
        return {
          size: this.defaultBoardSize,
          freeSpace: true
        };
      }
      
      // Parse settings JSON
      try {
        const settings = JSON.parse(board.settings);
        return {
          size: this.validateBoardSize(settings.size || this.defaultBoardSize),
          freeSpace: settings.freeSpace !== false
        };
      } catch (e) {
        logger.error('Failed to parse board settings', {
          error: e.message,
          boardId
        });
        return {
          size: this.defaultBoardSize,
          freeSpace: true
        };
      }
    } catch (error) {
      logger.error('Failed to get board settings', {
        error: error.message,
        boardId
      });
      return {
        size: this.defaultBoardSize,
        freeSpace: true
      };
    }
  }

  /**
   * Delete a board and all related data
   * @param {number} boardId - Board ID
   * @returns {boolean} - Success status
   */
  async deleteBoard(boardId) {
    try {
      const db = database.getDb();
      return await database.transaction(async (db) => {
        // 1. Get all cell IDs for this board (needed for cell_history deletion)
        const cells = await db.all(`
          SELECT id FROM cells
          WHERE board_id = ?
        `, [boardId]);
        
        const cellIds = cells.map(cell => cell.id);
        
        // 2. Delete cell history records first
        if (cellIds.length > 0) {
          const placeholders = cellIds.map(() => '?').join(',');
          await db.run(`
            DELETE FROM cell_history
            WHERE cell_id IN (${placeholders})
          `, cellIds);
          
          logger.debug(`Deleted cell history records for board ${boardId}`);
        }
        
        // 3. Delete all cells
        await db.run(`
          DELETE FROM cells
          WHERE board_id = ?
        `, [boardId]);
        
        logger.debug(`Deleted cells for board ${boardId}`);
        
        // 4. Delete board chat messages
        await db.run(`
          DELETE FROM board_chat
          WHERE board_id = ?
        `, [boardId]);
        
        logger.debug(`Deleted chat messages for board ${boardId}`);
        
        // 5. Delete board members
        await db.run(`
          DELETE FROM board_members
          WHERE board_id = ?
        `, [boardId]);
        
        logger.debug(`Deleted member records for board ${boardId}`);
        
        // 6. Delete board settings
        await db.run(`
          DELETE FROM board_settings
          WHERE board_id = ?
        `, [boardId]);
        
        logger.debug(`Deleted settings for board ${boardId}`);
        
        // 7. Finally, delete the board itself
        const result = await db.run(`
          DELETE FROM boards
          WHERE id = ?
        `, [boardId]);
        
        logger.info(`Board ${boardId} deleted with all related data`);
        
        return result.changes > 0;
      });
    } catch (error) {
      logger.error('Failed to delete board', {
        error: error.message,
        boardId
      });
      return false;
    }
  }

  /**
   * Create an empty grid of cells for a new board
   * @param {Object} db - Database connection
   * @param {number} boardId - Board ID
   * @param {number} size - Board size
   */
  async _createEmptyCells(db, boardId, size = null) {
    try {
      let boardSize = size;
      
      // If no size provided, get it from settings
      if (!boardSize) {
        const settings = await this.getBoardSettings(boardId);
        boardSize = settings.size;
      }
      
      // Validate size
      boardSize = this.validateBoardSize(boardSize);
      
      // Create empty cells for the board
      const stmt = await db.prepare(`
        INSERT INTO cells (board_id, row, col, value, type, marked)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
          await stmt.run(boardId, row, col, '', 'text', 0);
        }
      }
      
      await stmt.finalize();
      
      return true;
    } catch (error) {
      logger.error('Failed to create empty cells', {
        error: error.message,
        boardId,
        size
      });
      throw error;
    }
  }

  /**
   * Get board record by ID
   * @param {number} boardId - Board ID
   * @returns {Object|null} - Board record or null
   */
  async _getBoardRecord(boardId) {
    const db = database.getDb();
    return await db.get(`
      SELECT id, uuid, title, created_by, created_at, last_updated, is_public
      FROM boards WHERE id = ?
    `, [boardId]);
  }

  /**
   * Get all cells for a board
   * @param {number} boardId - Board ID
   * @returns {Array} - Array of cell objects
   */
  async _getBoardCells(boardId) {
    const db = database.getDb();
    return await db.all(`
      SELECT id, board_id, row, col, value, type, marked
      FROM cells WHERE board_id = ?
      ORDER BY row ASC, col ASC
    `, [boardId]);
  }

  /**
   * Get a cell by position
   * @param {number} boardId - Board ID
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {Object|null} - Cell object or null
   */
  async _getCellByPosition(boardId, row, col) {
    const db = database.getDb();
    return await db.get(`
      SELECT id, board_id, row, col, value, type, marked
      FROM cells WHERE board_id = ? AND row = ? AND col = ?
    `, [boardId, row, col]);
  }

  /**
   * Format cells as a 2D grid
   * @param {Array} cells - Array of cell objects
   * @returns {Array} - 2D grid of cells
   */
  _formatCellsAsGrid(cells) {
    if (!cells || cells.length === 0) {
      return [];
    }
    
    // Determine the board size from the cells
    const maxRow = Math.max(...cells.map(cell => cell.row)) + 1;
    const maxCol = Math.max(...cells.map(cell => cell.col)) + 1;
    const boardSize = Math.max(maxRow, maxCol);
    
    // Create an empty grid
    const grid = Array(boardSize)
      .fill(null)
      .map(() => Array(boardSize).fill(null));
    
    // Fill the grid with cells
    for (const cell of cells) {
      if (cell.row < boardSize && cell.col < boardSize) {
        grid[cell.row][cell.col] = {
          id: cell.id,
          value: cell.value,
          type: cell.type,
          marked: cell.marked === 1
        };
      }
    }
    
    return grid;
  }

  /**
   * Get statistics for a board
   * @param {number} boardId - Board ID
   * @returns {Object} - Board statistics
   */
  async _getBoardStats(boardId) {
    const db = database.getDb();
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END) as cellCount,
        SUM(CASE WHEN marked = 1 THEN 1 ELSE 0 END) as markedCount
      FROM cells WHERE board_id = ?
    `, [boardId]);
    
    return {
      cellCount: stats.cellCount || 0,
      markedCount: stats.markedCount || 0
    };
  }

  /**
   * Import a board from JSON format
   * @param {Object} jsonBoard - Board in JSON format
   * @param {number} userId - User ID of importer
   * @returns {Object} - Imported board
   */
  async importFromJson(jsonBoard, userId) {
    if (!jsonBoard || !jsonBoard.id || !jsonBoard.title || !Array.isArray(jsonBoard.cells)) {
      throw new Error('Invalid board data format');
    }
    
    try {
      const db = database.getDb();
      return await database.transaction(async (db) => {
        // Create board record
        const boardResult = await db.run(`
          INSERT INTO boards (uuid, title, created_by, is_public)
          VALUES (?, ?, ?, ?)
        `, [jsonBoard.id, jsonBoard.title, userId, 0]);
        
        if (!boardResult.lastID) {
          throw new Error('Failed to create board from JSON');
        }
        
        const boardId = boardResult.lastID;
        
        // Import cells
        const cells = [];
        for (let row = 0; row < jsonBoard.cells.length; row++) {
          const rowData = jsonBoard.cells[row];
          for (let col = 0; col < rowData.length; col++) {
            const cell = rowData[col];
            cells.push({
              boardId,
              row,
              col,
              value: cell.value || null,
              type: cell.type || 'text',
              marked: cell.marked ? 1 : 0
            });
          }
        }
        
        // Insert all cells
        if (cells.length > 0) {
          const placeholders = cells.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const params = [];
          
          cells.forEach(cell => {
            params.push(
              cell.boardId,
              cell.row,
              cell.col,
              cell.value,
              cell.type,
              cell.marked
            );
          });
          
          await db.run(`
            INSERT INTO cells (board_id, row, col, value, type, marked)
            VALUES ${placeholders}
          `, params);
        }
        
        logger.info('Board imported successfully from JSON', {
          boardId,
          jsonId: jsonBoard.id,
          title: jsonBoard.title
        });
        
        return this.getBoardById(boardId);
      });
    } catch (error) {
      logger.error('Failed to import board from JSON', {
        error: error.message,
        jsonId: jsonBoard.id
      });
      throw error;
    }
  }

  /**
   * Export board to JSON format
   * @param {number} boardId - Board ID
   * @returns {Object} - Board in JSON format
   */
  async exportToJson(boardId) {
    try {
      const board = await this.getBoardById(boardId);
      
      if (!board) {
        throw new Error('Board not found');
      }
      
      // Format for JSON export
      return {
        id: board.uuid,
        title: board.title,
        createdBy: null, // For compatibility with old format
        createdAt: new Date(board.created_at).getTime(),
        lastUpdated: new Date(board.last_updated).getTime(),
        cells: board.cells,
        editHistory: [] // For compatibility with old format
      };
    } catch (error) {
      logger.error('Failed to export board to JSON', {
        error: error.message,
        boardId
      });
      throw error;
    }
  }

  /**
   * Resize a board
   * @param {Object} db - Database connection
   * @param {number} boardId - Board ID
   * @param {number} oldSize - Old board size
   * @param {number} newSize - New board size
   * @returns {boolean} - Success status
   */
  async _resizeBoard(db, boardId, oldSize, newSize) {
    try {
      if (oldSize === newSize) {
        return true;
      }
      
      // If expanding the board, add new cells
      if (newSize > oldSize) {
        const stmt = await db.prepare(`
          INSERT INTO cells (board_id, row, col, value, type, marked)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        // Add new rows in existing columns
        for (let row = oldSize; row < newSize; row++) {
          for (let col = 0; col < oldSize; col++) {
            await stmt.run(boardId, row, col, '', 'text', 0);
          }
        }
        
        // Add new columns in all rows
        for (let row = 0; row < newSize; row++) {
          for (let col = oldSize; col < newSize; col++) {
            // Skip cells already added in the previous loop
            if (row >= oldSize && col >= oldSize) continue;
            await stmt.run(boardId, row, col, '', 'text', 0);
          }
        }
        
        await stmt.finalize();
      }
      // If shrinking the board, remove excess cells
      else if (newSize < oldSize) {
        // Delete cells outside the new boundaries
        await db.run(`
          DELETE FROM cells
          WHERE board_id = ? AND (row >= ? OR col >= ?)
        `, [boardId, newSize, newSize]);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to resize board', {
        error: error.message,
        boardId,
        oldSize,
        newSize
      });
      throw error;
    }
  }
}

module.exports = new BoardModel(); 