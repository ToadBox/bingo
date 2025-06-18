const database = require('./database');
const logger = require('../utils/logger');

class VersionModel {
  /**
   * Create a new version
   * @param {Object} versionData - Version data
   * @returns {Object} - Created version
   */
  async createVersion(versionData) {
    const {
      boardId,
      versionNumber,
      createdBy,
      snapshot,
      description
    } = versionData;
    
    try {
      const db = database.getDb();
      
      const result = await db.run(`
        INSERT INTO board_versions (
          board_id, version_number, created_by, snapshot, description
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        boardId,
        versionNumber,
        createdBy,
        snapshot,
        description || `Version ${versionNumber}`
      ]);
      
      if (!result.lastID) {
        throw new Error('Failed to create version');
      }
      
      return this.getVersionById(result.lastID);
    } catch (error) {
      logger.error('Failed to create board version', {
        error: error.message,
        boardId,
        versionNumber
      });
      throw error;
    }
  }

  /**
   * Get a version by its ID
   * @param {number} id - Version ID
   * @returns {Object|null} - Version object or null
   */
  async getVersionById(id) {
    try {
      const db = database.getDb();
      
      const version = await db.get(`
        SELECT * FROM board_versions WHERE id = ?
      `, [id]);
      
      return version;
    } catch (error) {
      logger.error('Failed to get version by ID', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get a version by board ID and version number
   * @param {number} boardId - Board ID
   * @param {number} versionNumber - Version number
   * @returns {Object|null} - Version object or null
   */
  async getVersion(boardId, versionNumber) {
    try {
      const db = database.getDb();
      
      const version = await db.get(`
        SELECT * FROM board_versions 
        WHERE board_id = ? AND version_number = ?
      `, [boardId, versionNumber]);
      
      return version;
    } catch (error) {
      logger.error('Failed to get version', {
        error: error.message,
        boardId,
        versionNumber
      });
      return null;
    }
  }

  /**
   * Get the latest version for a board
   * @param {number} boardId - Board ID
   * @returns {Object|null} - Version object or null
   */
  async getLatestVersion(boardId) {
    try {
      const db = database.getDb();
      
      const version = await db.get(`
        SELECT * FROM board_versions 
        WHERE board_id = ?
        ORDER BY version_number DESC
        LIMIT 1
      `, [boardId]);
      
      return version;
    } catch (error) {
      logger.error('Failed to get latest version', {
        error: error.message,
        boardId
      });
      return null;
    }
  }

  /**
   * Get all versions for a board
   * @param {number} boardId - Board ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of version objects
   */
  async getVersions(boardId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    try {
      const db = database.getDb();
      
      // First select all except the snapshot field to reduce data load
      const versions = await db.all(`
        SELECT 
          id, board_id, version_number, created_by, 
          created_at, description
        FROM board_versions 
        WHERE board_id = ?
        ORDER BY version_number DESC
        LIMIT ? OFFSET ?
      `, [boardId, limit, offset]);
      
      return versions;
    } catch (error) {
      logger.error('Failed to get versions', {
        error: error.message,
        boardId
      });
      return [];
    }
  }

  /**
   * Count all versions for a board
   * @param {number} boardId - Board ID
   * @returns {number} - Number of versions
   */
  async countVersions(boardId) {
    try {
      const db = database.getDb();
      
      const result = await db.get(`
        SELECT COUNT(*) as count
        FROM board_versions 
        WHERE board_id = ?
      `, [boardId]);
      
      return result.count;
    } catch (error) {
      logger.error('Failed to count versions', {
        error: error.message,
        boardId
      });
      return 0;
    }
  }

  /**
   * Delete a version by ID
   * @param {number} id - Version ID
   * @returns {boolean} - Success status
   */
  async deleteVersion(id) {
    try {
      const db = database.getDb();
      
      const result = await db.run(`
        DELETE FROM board_versions WHERE id = ?
      `, [id]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete version', {
        error: error.message,
        id
      });
      return false;
    }
  }

  /**
   * Delete the oldest N versions for a board, excluding the first version
   * @param {number} boardId - Board ID
   * @param {number} count - Number of versions to delete
   * @returns {number} - Number of versions deleted
   */
  async deleteOldestVersions(boardId, count) {
    try {
      const db = database.getDb();
      
      // Get the IDs of the versions to delete, excluding the first (version_number = 1)
      const versionsToDelete = await db.all(`
        SELECT id FROM board_versions
        WHERE board_id = ? AND version_number > 1
        ORDER BY version_number ASC
        LIMIT ?
      `, [boardId, count]);
      
      if (!versionsToDelete.length) {
        return 0;
      }
      
      const ids = versionsToDelete.map(v => v.id);
      
      // Execute deletion
      const placeholders = ids.map(() => '?').join(',');
      const result = await db.run(`
        DELETE FROM board_versions 
        WHERE id IN (${placeholders})
      `, ids);
      
      return result.changes;
    } catch (error) {
      logger.error('Failed to delete oldest versions', {
        error: error.message,
        boardId,
        count
      });
      return 0;
    }
  }

  /**
   * Get change count since last version
   * @param {number} boardId - Board ID
   * @returns {number} - Change count
   */
  async getChangeCount(boardId) {
    try {
      const db = database.getDb();
      
      // Try to get from the board_settings table
      const result = await db.get(`
        SELECT settings FROM boards
        WHERE id = ?
      `, [boardId]);
      
      if (!result || !result.settings) {
        return 0;
      }
      
      try {
        const settings = JSON.parse(result.settings);
        return settings.versionChangeCounter || 0;
      } catch (e) {
        logger.warn('Failed to parse board settings', {
          error: e.message,
          boardId
        });
        return 0;
      }
    } catch (error) {
      logger.error('Failed to get change count', {
        error: error.message,
        boardId
      });
      return 0;
    }
  }

  /**
   * Increment the change counter for a board
   * @param {number} boardId - Board ID
   * @returns {boolean} - Success status
   */
  async incrementChangeCounter(boardId) {
    try {
      const db = database.getDb();
      
      // First get current settings
      const result = await db.get(`
        SELECT settings FROM boards
        WHERE id = ?
      `, [boardId]);
      
      let settings = {};
      
      // Parse existing settings if they exist
      if (result && result.settings) {
        try {
          settings = JSON.parse(result.settings);
        } catch (e) {
          logger.warn('Failed to parse board settings', {
            error: e.message,
            boardId
          });
        }
      }
      
      // Update the counter
      settings.versionChangeCounter = (settings.versionChangeCounter || 0) + 1;
      
      // Update settings in database
      await db.run(`
        UPDATE boards
        SET settings = ?
        WHERE id = ?
      `, [JSON.stringify(settings), boardId]);
      
      return true;
    } catch (error) {
      logger.error('Failed to increment change counter', {
        error: error.message,
        boardId
      });
      return false;
    }
  }

  /**
   * Reset the change counter for a board
   * @param {number} boardId - Board ID
   * @returns {boolean} - Success status
   */
  async resetChangeCounter(boardId) {
    try {
      const db = database.getDb();
      
      // First get current settings
      const result = await db.get(`
        SELECT settings FROM boards
        WHERE id = ?
      `, [boardId]);
      
      let settings = {};
      
      // Parse existing settings if they exist
      if (result && result.settings) {
        try {
          settings = JSON.parse(result.settings);
        } catch (e) {
          logger.warn('Failed to parse board settings', {
            error: e.message,
            boardId
          });
        }
      }
      
      // Reset the counter
      settings.versionChangeCounter = 0;
      
      // Update settings in database
      await db.run(`
        UPDATE boards
        SET settings = ?
        WHERE id = ?
      `, [JSON.stringify(settings), boardId]);
      
      return true;
    } catch (error) {
      logger.error('Failed to reset change counter', {
        error: error.message,
        boardId
      });
      return false;
    }
  }
}

module.exports = new VersionModel(); 