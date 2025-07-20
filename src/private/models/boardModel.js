const { v4: uuidv4 } = require('uuid');
const database = require('./database');
const logger = require('../utils/logger').board;
const constants = require('../config/constants');
const SlugGenerator = require('../utils/slugGenerator');
const configLoader = require('../utils/configLoader');
const DatabaseHelpers = require('../utils/databaseHelpers');
const { createValidator } = require('../middleware/validation');
const globalCache = require('../utils/globalCache');
const BoardFormatterService = require('../services/boardFormatterService');

class BoardModel {
  constructor() {
    this.dbHelpers = new DatabaseHelpers();
    this.defaultBoardSize = constants.DEFAULT_BOARD_SIZE || 5;
    this.minBoardSize = constants.MIN_BOARD_SIZE || 3;
    this.maxBoardSize = constants.MAX_BOARD_SIZE || 9;
  }

  /**
   * Get cache key for board operations
   */
  getCacheKey(operation, ...params) {
    return `board:${operation}:${params.join(':')}`;
  }

  /**
   * Validate board size
   * @param {number} size - Board size (rows/columns)
   * @returns {number} - Valid board size
   */
  validateBoardSize(size) {
    const sizeNum = parseInt(size, 10);
    
    if (isNaN(sizeNum)) {
      return this.defaultBoardSize;
    }
    
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
      freeSpace = true,
      createdByName = null,
      settings = null
    } = boardData;
    
    const uuid = boardData.uuid || `user-${uuidv4()}`;
    const boardSize = this.validateBoardSize(size);
    
    try {
      return await this.dbHelpers.transaction(async (helpers) => {
        // Generate slug
        let slug;
        let creatorUsername;
        
        if (!createdBy) {
          // Server board
          const serverUsername = configLoader.get('site.serverUsername', 'server');
          slug = SlugGenerator.generateServerSlug(title, serverUsername);
          creatorUsername = 'server';
        } else {
          // User board - get the actual username
          const user = await helpers.getRecord(
            'SELECT username FROM users WHERE user_id = ?',
            [createdBy],
            'get user for board creation',
            'Board'
          );
          
          if (!user) {
            throw new Error('User not found for board creation');
          }
          
          creatorUsername = user.username;
          
          // Generate unique slug for this user
          const checkSlugExists = async (testSlug) => {
            return await helpers.recordExists('boards', {
              slug: testSlug,
              created_by: createdBy
            }, 'Board');
          };

          slug = await SlugGenerator.generateUniqueSlug(title, checkSlugExists);
        }

        // Create board record with creator_username
        const finalSettings = settings ? 
          (typeof settings === 'string' ? JSON.parse(settings) : settings) :
          {
            size: boardSize,
            freeSpace
          };

        const boardRecord = {
          uuid, 
          title, 
          slug,
          created_by: createdBy,
          creator_username: creatorUsername,  // Store username directly
          is_public: isPublic ? 1 : 0,
          description,
          settings: JSON.stringify(finalSettings)
        };

        const board = await helpers.insertRecord('boards', boardRecord, 'Board');
        
        // Create empty cells for the board
        await this._createEmptyCells(helpers, board.id, finalSettings.size || boardSize);
        
        logger.info('Board created successfully', {
          id: board.id,
          uuid,
          title,
          slug,
          creatorUsername,
          size: finalSettings.size || boardSize,
          createdBy
        });
        
        // Return the board with username included
        const createdBoard = await this.getBoardById(board.id);
        createdBoard.creator_username = creatorUsername;  // Ensure it's included
        
        // Invalidate relevant caches
        this.invalidateBoardCache(board.id, creatorUsername, slug);
        
        return createdBoard;
      }, 'Board');
    } catch (error) {
      logger.error('Failed to create board', {
        error: error.message,
        title,
        uuid,
        size,
        createdBy
      });
      throw error;
    }
  }

  /**
   * Get board by ID with caching
   * @param {number} id - Board ID
   * @returns {Object|null} - Board object or null if not found
   */
  async getBoardById(id) {
    const cacheKey = this.getCacheKey('byId', id);
    
    // Try cache first
    if (globalCache.isEnabled()) {
      const cached = globalCache.get('database', cacheKey);
      if (cached) {
        logger.debug('Board cache hit', { id, cacheKey });
        return cached;
      }
    }

    try {
      const board = await this.dbHelpers.getRecord(
        `SELECT id, uuid, title, slug, created_by, creator_username, created_at, last_updated, 
                is_public, description, settings
         FROM boards WHERE id = ?`,
        [id],
        'get board by ID',
        'Board'
      );
      
      if (!board) {
        return null;
      }
      
      // Parse settings JSON
      board.settings = this._parseSettings(board.settings);
      
      // Get cells for the board
      const cells = await this._getBoardCells(id);
      board.cells = this._formatCellsAsGrid(cells, board.settings.size);
      
      // Cache the result
      if (globalCache.isEnabled()) {
        globalCache.set('database', cacheKey, board, { ttl: 900 }); // 15 minutes
        logger.debug('Board cached', { id, cacheKey });
      }
      
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
      const board = await this.dbHelpers.getRecord(
        `SELECT id, uuid, title, slug, created_by, created_at, last_updated, 
                is_public, description, settings
         FROM boards WHERE uuid = ?`,
        [uuid],
        'get board by UUID',
        'Board'
      );
      
      if (!board) {
        return null;
      }
      
      // Parse settings JSON
      board.settings = this._parseSettings(board.settings);
      
      // Get cells for the board
      const cells = await this._getBoardCells(board.id);
      board.cells = this._formatCellsAsGrid(cells, board.settings.size);
      
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
   * Get board by username and slug with caching
   * @param {string} username - Username (or 'server' for server boards)
   * @param {string} slug - Board slug
   * @returns {Object|null} - Board object or null if not found
   */
  async getBoardByUsernameAndSlug(username, slug) {
    const cacheKey = this.getCacheKey('byUsernameSlug', username, slug);
    
    // Try cache first
    if (globalCache.isEnabled()) {
      const cached = globalCache.get('database', cacheKey);
      if (cached) {
        logger.debug('Board cache hit', { username, slug, cacheKey });
        return cached;
    }
  }

    try {
      // Use creator_username field directly - no need for JOIN
      const board = await this.dbHelpers.getRecord(
        `SELECT id, uuid, title, slug, created_by, creator_username, created_at, 
                last_updated, is_public, description, settings
        FROM boards 
         WHERE slug = ? AND creator_username = ?`,
          [slug, username],
        'get board by username and slug',
          'Board'
        );
      
      if (!board) {
        return null;
      }
      
      // Parse settings JSON
      board.settings = this._parseSettings(board.settings);
      
      // Get cells for the board
      const cells = await this._getBoardCells(board.id);
      board.cells = this._formatCellsAsGrid(cells, board.settings.size);
      
      // Cache the result
      if (globalCache.isEnabled()) {
        globalCache.set('database', cacheKey, board, { ttl: 900 }); // 15 minutes
        logger.debug('Board cached', { username, slug, cacheKey });
      }
      
      return board;
    } catch (error) {
      logger.error('Failed to get board by username and slug', {
        error: error.message,
        username,
        slug
      });
      return null;
    }
  }

  /**
   * Get all boards with optional filtering and pagination
   * @param {Object} options - Query options
   * @returns {Object} - Paginated boards result
   */
  async getAllBoards(options = {}) {
    const {
      userId = null,
      isPublic = null,
      search = null,
      limit = 20,
      offset = 0,
      orderBy = 'last_updated DESC'
    } = options;

    try {
      let conditions = {};
      let joins = '';
      let select = `b.id, b.uuid, b.title, b.slug, b.created_by, b.created_at, 
                    b.last_updated, b.is_public, b.description, b.settings`;
      
      // Add user join if we need username
      if (!userId) {
        joins = 'LEFT JOIN users u ON b.created_by = u.user_id';
        select += ', u.username';
      }
      
      // Build conditions
      if (userId) {
        conditions.created_by = userId;
        }
      
      if (isPublic !== null) {
        conditions.is_public = isPublic ? 1 : 0;
      }
      
      // Handle search
      let searchClause = '';
      let searchParams = [];
      if (search) {
        searchClause = 'AND (b.title LIKE ? OR b.description LIKE ?)';
        searchParams = [`%${search}%`, `%${search}%`];
      }
      
      // Build the query
      const { clause: whereClause, values: whereValues } = this.dbHelpers.buildWhereClause(conditions);
      const allValues = [...whereValues, ...searchParams];
      
      const sql = `
        SELECT ${select}
        FROM boards b ${joins}
        ${whereClause} ${searchClause}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}
      `;
      
      const countSql = `
        SELECT COUNT(*) as total
        FROM boards b ${joins}
        ${whereClause} ${searchClause}
      `;
      
      const [boards, totalResult] = await Promise.all([
        this.dbHelpers.getRecords(sql, allValues, 'get all boards', 'Board'),
        this.dbHelpers.getRecord(countSql, allValues, 'count boards', 'Board')
      ]);
      
      // Parse settings for each board
      boards.forEach(board => {
        board.settings = this._parseSettings(board.settings);
      });
      
      const total = totalResult ? totalResult.total : 0;
      const totalPages = Math.ceil(total / limit);
      const currentPage = Math.floor(offset / limit) + 1;
      
      return {
        boards,
        pagination: {
          total,
          totalPages,
          currentPage,
          limit,
          offset,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1
        }
      };
    } catch (error) {
      logger.error('Failed to get all boards', {
        error: error.message,
        options
      });
      throw error;
    }
  }

  /**
   * Update a board
   * @param {number} boardId - Board ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} - Updated board or null
   */
  async updateBoard(boardId, updates) {
    try {
      const allowedUpdates = ['title', 'description', 'is_public', 'settings'];
      const updateData = {};
      
      // Filter and prepare updates
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          if (key === 'settings' && typeof value === 'object') {
            updateData[key] = JSON.stringify(value);
          } else {
            updateData[key] = value;
          }
        }
      }
      
      if (Object.keys(updateData).length === 0) {
        throw new Error('No valid updates provided');
      }
      
      // Add last_updated timestamp
      updateData.last_updated = new Date().toISOString();
      
      const updatedRows = await this.dbHelpers.updateRecord(
        'boards',
        updateData,
        { id: boardId },
        'Board'
      );
      
      if (updatedRows === 0) {
        return null;
      }
      
      logger.info('Board updated successfully', {
        boardId,
        updates: Object.keys(updateData)
      });
      
      return await this.getBoardById(boardId);
    } catch (error) {
      logger.error('Failed to update board', {
        error: error.message,
        boardId,
        updates
      });
      throw error;
    }
  }

  /**
   * Delete a board
   * @param {number} boardId - Board ID
   * @returns {boolean} - Success status
   */
  async deleteBoard(boardId) {
    try {
      return await this.dbHelpers.transaction(async (helpers) => {
        // Delete related data first
        await helpers.deleteRecord('cell_history', { 
          cell_id: `(SELECT id FROM cells WHERE board_id = ${boardId})` 
        }, 'Board');
        
        await helpers.deleteRecord('cells', { board_id: boardId }, 'Board');
        await helpers.deleteRecord('board_chat', { board_id: boardId }, 'Board');
        await helpers.deleteRecord('board_members', { board_id: boardId }, 'Board');
        await helpers.deleteRecord('board_settings', { board_id: boardId }, 'Board');
        
        // Delete the board itself
        const deletedRows = await helpers.deleteRecord('boards', { id: boardId }, 'Board');
        
        if (deletedRows > 0) {
          logger.info('Board deleted successfully', { boardId });
          return true;
        }
        
        return false;
      }, 'Board');
    } catch (error) {
      logger.error('Failed to delete board', {
        error: error.message,
        boardId
      });
      throw error;
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
   * Create an empty grid of cells for a new board
   * @param {Object} db - Database connection
   * @param {number} boardId - Board ID
   * @param {number} size - Board size
   */
  async _createEmptyCells(helpers, boardId, size) {
    try {
      const boardSize = this.validateBoardSize(size);
      
      // Create empty cells for the board
      for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
          await helpers.insertRecord('cells', {
            board_id: boardId,
            row,
            col,
            value: '',
            type: 'text',
            marked: 0
          }, 'Board');
        }
      }
      
      logger.debug('Created empty cells for board', {
        boardId,
        size: boardSize,
        totalCells: boardSize * boardSize
      });
      
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
    return await this.dbHelpers.getRecords(
      `SELECT id, board_id, row, col, value, type, marked, last_updated, updated_by
      FROM cells WHERE board_id = ?
       ORDER BY row ASC, col ASC`,
      [boardId],
      'get board cells',
      'Board'
    );
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
  _formatCellsAsGrid(cells, size) {
    if (!cells || cells.length === 0) {
      return [];
    }
    
    // Create an empty grid
    const grid = Array(size)
      .fill(null)
      .map(() => Array(size).fill(null));
    
    // Fill the grid with cells
    for (const cell of cells) {
      if (cell.row < size && cell.col < size) {
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

  /**
   * Parse settings JSON
   * @param {string} settings - Settings JSON string
   * @returns {Object} - Parsed settings
   */
  _parseSettings(settings) {
    // Delegate parsing to BoardFormatterService for consistency
    const parsed = BoardFormatterService.parseSettings(settings);

    // Ensure size respects model limits
    parsed.size = this.validateBoardSize(parsed.size);

    return parsed;
  }

  /**
   * Invalidate cache for a board
   * @param {string} boardId - Board ID
   * @param {string} username - Board creator username
   * @param {string} slug - Board slug
   */
  invalidateBoardCache(boardId, username = null, slug = null) {
    if (!globalCache.isEnabled()) return;

    const keysToInvalidate = [
      this.getCacheKey('byId', boardId),
      this.getCacheKey('boards', 'all'), // Invalidate board lists
    ];

    if (username && slug) {
      keysToInvalidate.push(this.getCacheKey('byUsernameSlug', username, slug));
    }

    keysToInvalidate.forEach(key => {
      globalCache.delete('database', key);
      logger.debug('Cache invalidated', { key });
    });
  }
}

module.exports = new BoardModel(); 