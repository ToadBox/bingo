const database = require('./database');
const logger = require('../utils/logger');

class CellHistoryModel {
  constructor() {}

  /**
   * Add a cell history entry when a cell is updated
   * @param {Object} historyData - Cell history data
   * @returns {Object} - Created history entry
   */
  async addHistoryEntry(historyData) {
    const { cellId, value, type, marked, createdBy } = historyData;
    
    try {
      const db = database.getDb();
      const result = await db.run(`
        INSERT INTO cell_history (
          cell_id,
          value,
          type,
          marked,
          created_by
        )
        VALUES (?, ?, ?, ?, ?)
      `, [
        cellId,
        value,
        type,
        marked ? 1 : 0,
        createdBy
      ]);

      if (result.lastID) {
        logger.debug('Cell history entry created', {
          historyId: result.lastID,
          cellId
        });
        return this.getHistoryEntryById(result.lastID);
      }
      
      throw new Error('Failed to create cell history entry');
    } catch (error) {
      logger.error('Cell history entry creation failed', {
        error: error.message,
        cellId
      });
      throw error;
    }
  }

  /**
   * Get a history entry by ID
   * @param {number} id - History entry ID
   * @returns {Object|null} - History entry or null if not found
   */
  async getHistoryEntryById(id) {
    try {
      const db = database.getDb();
      const entry = await db.get(`
        SELECT
          id,
          cell_id,
          value,
          type,
          marked,
          created_at,
          created_by
        FROM cell_history
        WHERE id = ?
      `, [id]);
      
      return entry || null;
    } catch (error) {
      logger.error('Failed to get history entry', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get history for a specific cell
   * @param {number} cellId - Cell ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of history entries
   */
  async getCellHistory(cellId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    try {
      const db = database.getDb();
      const history = await db.all(`
        SELECT
          ch.id,
          ch.cell_id,
          ch.value,
          ch.type,
          ch.marked,
          ch.created_at,
          ch.created_by,
          u.username as user_name
        FROM cell_history ch
        LEFT JOIN users u ON ch.created_by = u.id
        WHERE ch.cell_id = ?
        ORDER BY ch.created_at DESC
        LIMIT ? OFFSET ?
      `, [cellId, limit, offset]);
      
      return history;
    } catch (error) {
      logger.error('Failed to get cell history', {
        error: error.message,
        cellId
      });
      return [];
    }
  }

  /**
   * Get history entries for a board
   * @param {number} boardId - Board ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of history entries
   */
  async getBoardHistory(boardId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    try {
      const db = database.getDb();
      const history = await db.all(`
        SELECT
          ch.id,
          ch.cell_id,
          ch.value,
          ch.type,
          ch.marked,
          ch.created_at,
          ch.created_by,
          u.username as user_name,
          c.row,
          c.col
        FROM cell_history ch
        JOIN cells c ON ch.cell_id = c.id
        LEFT JOIN users u ON ch.created_by = u.id
        WHERE c.board_id = ?
        ORDER BY ch.created_at DESC
        LIMIT ? OFFSET ?
      `, [boardId, limit, offset]);
      
      return history;
    } catch (error) {
      logger.error('Failed to get board history', {
        error: error.message,
        boardId
      });
      return [];
    }
  }
}

module.exports = new CellHistoryModel(); 