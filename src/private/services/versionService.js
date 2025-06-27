const database = require('../models/database');
const logger = require('../utils/logger');
const DatabaseHelpers = require('../utils/databaseHelpers');

class VersionService {
  constructor() {
    this.dbHelpers = new DatabaseHelpers(database);
    this.maxVersionsPerBoard = 50; // Limit to prevent storage bloat
  }

  /**
   * Create a version snapshot of a board
   * @param {number} boardId - Board ID
   * @param {string} userId - User ID creating the version
   * @param {string} description - Version description
   * @returns {Object} - Created version
   */
  async createVersion(boardId, userId, description = 'Auto-save') {
    try {
      return await this.dbHelpers.transaction(async (helpers) => {
        // Get current board state
        const board = await this._getBoardSnapshot(boardId);
      
        if (!board) {
          throw new Error('Board not found');
      }
      
        // Get next version number
        const versionNumber = await this._getNextVersionNumber(boardId);
      
      // Create version record
        const version = await helpers.insertRecord('board_versions', {
          board_id: boardId,
          version_number: versionNumber,
          created_by: userId,
          snapshot: JSON.stringify(board),
          description
        }, 'Version');
        
        // Clean up old versions if we exceed the limit
        await this._cleanupOldVersions(helpers, boardId);
      
        logger.version.info('Board version created', {
        boardId,
          versionId: version.id,
          versionNumber,
        userId,
          description
        });
        
        return {
          id: version.id,
          boardId,
          versionNumber,
          createdBy: userId,
          createdAt: version.created_at,
          description
        };
      }, 'Version');
    } catch (error) {
      logger.version.error('Failed to create board version', {
        error: error.message,
        boardId,
        userId,
        description
      });
      throw error;
    }
  }

  /**
   * Get all versions for a board
   * @param {number} boardId - Board ID
   * @param {Object} options - Query options
   * @returns {Object} - Paginated versions
   */
  async getBoardVersions(boardId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    try {
      const result = await this.dbHelpers.getPaginatedRecords('board_versions', {
        conditions: { board_id: boardId },
        orderBy: 'version_number DESC',
        limit,
        offset,
        select: 'id, board_id, version_number, created_by, created_at, description'
      }, 'Version');
      
      // Get usernames for created_by
      for (const version of result.records) {
        const user = await this.dbHelpers.getRecord(
          'SELECT username FROM users WHERE user_id = ?',
          [version.created_by],
          'get version creator',
          'Version'
        );
        version.createdByUsername = user ? user.username : 'Unknown';
      }
      
      return result;
    } catch (error) {
      logger.version.error('Failed to get board versions', {
        error: error.message,
        boardId,
        options
      });
      throw error;
    }
  }

  /**
   * Get a specific version
   * @param {number} versionId - Version ID
   * @returns {Object|null} - Version with snapshot data
   */
  async getVersion(versionId) {
    try {
      const version = await this.dbHelpers.getRecord(
        `SELECT id, board_id, version_number, created_by, created_at, 
                snapshot, description
         FROM board_versions WHERE id = ?`,
        [versionId],
        'get version',
        'Version'
      );
      
      if (!version) {
        return null;
      }
      
      // Parse snapshot JSON
      try {
        version.snapshot = JSON.parse(version.snapshot);
      } catch (e) {
        logger.version.error('Failed to parse version snapshot', {
          versionId,
          error: e.message
        });
        version.snapshot = null;
      }
      
      return version;
    } catch (error) {
      logger.version.error('Failed to get version', {
        error: error.message,
        versionId
      });
      throw error;
    }
  }

  /**
   * Revert board to a specific version
   * @param {number} boardId - Board ID
   * @param {number} versionId - Version ID to revert to
   * @param {string} userId - User ID performing the revert
   * @returns {boolean} - Success status
   */
  async revertToVersion(boardId, versionId, userId) {
    try {
      return await this.dbHelpers.transaction(async (helpers) => {
        // Get the version to revert to
        const version = await this.getVersion(versionId);
        
        if (!version || version.board_id !== boardId) {
          throw new Error('Version not found or does not belong to this board');
        }
        
        if (!version.snapshot) {
          throw new Error('Version snapshot is corrupted');
        }
        
        // Create a backup version before reverting
        await this.createVersion(boardId, userId, `Backup before revert to v${version.version_number}`);
      
        // Update board with version data
        const boardData = {
          title: version.snapshot.title,
          description: version.snapshot.description || '',
          is_public: version.snapshot.is_public ? 1 : 0,
          settings: JSON.stringify(version.snapshot.settings || {}),
          last_updated: new Date().toISOString()
        };
        
        await helpers.updateRecord('boards', boardData, { id: boardId }, 'Version');
        
        // Clear existing cells
        await helpers.deleteRecord('cells', { board_id: boardId }, 'Version');
        
        // Restore cells from snapshot
        if (version.snapshot.cells && Array.isArray(version.snapshot.cells)) {
          for (let row = 0; row < version.snapshot.cells.length; row++) {
            const rowData = version.snapshot.cells[row];
            if (Array.isArray(rowData)) {
              for (let col = 0; col < rowData.length; col++) {
                const cell = rowData[col];
                if (cell) {
                  await helpers.insertRecord('cells', {
                    board_id: boardId,
                    row,
                    col,
                    value: cell.value || '',
                    type: cell.type || 'text',
                    marked: cell.marked ? 1 : 0,
                    updated_by: userId
                  }, 'Version');
                }
              }
            }
          }
        }
        
        logger.version.info('Board reverted to version', {
        boardId,
          versionId,
          versionNumber: version.version_number,
        userId
      });
      
      return true;
      }, 'Version');
    } catch (error) {
      logger.version.error('Failed to revert board to version', {
        error: error.message,
        boardId,
        versionId,
        userId
      });
      throw error;
    }
  }

  /**
   * Delete a version
   * @param {number} versionId - Version ID
   * @returns {boolean} - Success status
   */
  async deleteVersion(versionId) {
    try {
      const deletedRows = await this.dbHelpers.deleteRecord(
        'board_versions',
        { id: versionId },
        'Version'
      );
      
      if (deletedRows > 0) {
        logger.version.info('Version deleted', { versionId });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.version.error('Failed to delete version', {
        error: error.message,
        versionId
      });
      throw error;
    }
  }

  /**
   * Get board snapshot for versioning
   * @param {number} boardId - Board ID
   * @returns {Object|null} - Board snapshot
   */
  async _getBoardSnapshot(boardId) {
    try {
      // Get board data
      const board = await this.dbHelpers.getRecord(
        `SELECT id, uuid, title, slug, created_by, is_public, 
                description, settings, created_at, last_updated
         FROM boards WHERE id = ?`,
        [boardId],
        'get board for snapshot',
        'Version'
      );
      
      if (!board) {
        return null;
      }
      
      // Get all cells
      const cells = await this.dbHelpers.getRecords(
        `SELECT row, col, value, type, marked
         FROM cells WHERE board_id = ?
         ORDER BY row, col`,
        [boardId],
        'get cells for snapshot',
        'Version'
      );
      
      // Parse settings
      let settings = {};
      try {
        settings = JSON.parse(board.settings || '{}');
      } catch (e) {
        settings = {};
      }
      
      // Format cells as grid
      const boardSize = settings.size || 5;
      const cellGrid = Array(boardSize)
        .fill(null)
        .map(() => Array(boardSize).fill(null));
      
      cells.forEach(cell => {
        if (cell.row < boardSize && cell.col < boardSize) {
          cellGrid[cell.row][cell.col] = {
            value: cell.value,
            type: cell.type,
            marked: cell.marked === 1
          };
        }
      });
      
      return {
        id: board.id,
        uuid: board.uuid,
        title: board.title,
        slug: board.slug,
        created_by: board.created_by,
        is_public: board.is_public === 1,
        description: board.description,
        settings,
        cells: cellGrid,
        created_at: board.created_at,
        last_updated: board.last_updated
      };
    } catch (error) {
      logger.version.error('Failed to get board snapshot', {
        error: error.message,
        boardId
      });
      throw error;
    }
  }

  /**
   * Get next version number for a board
   * @param {number} boardId - Board ID
   * @returns {number} - Next version number
   */
  async _getNextVersionNumber(boardId) {
    const result = await this.dbHelpers.getRecord(
      'SELECT MAX(version_number) as max_version FROM board_versions WHERE board_id = ?',
      [boardId],
      'get max version number',
      'Version'
    );
    
    return (result && result.max_version) ? result.max_version + 1 : 1;
  }

  /**
   * Clean up old versions to stay within limit
   * @param {Object} helpers - Database helpers
   * @param {number} boardId - Board ID
   */
  async _cleanupOldVersions(helpers, boardId) {
    try {
      const count = await helpers.countRecords('board_versions', { board_id: boardId }, 'Version');
      
      if (count > this.maxVersionsPerBoard) {
        const excess = count - this.maxVersionsPerBoard;
        
        // Get oldest versions to delete
        const oldVersions = await helpers.getRecords(
          `SELECT id FROM board_versions 
           WHERE board_id = ? 
           ORDER BY version_number ASC 
           LIMIT ?`,
          [boardId, excess],
          'get old versions to cleanup',
          'Version'
        );
        
        // Delete old versions
        for (const version of oldVersions) {
          await helpers.deleteRecord('board_versions', { id: version.id }, 'Version');
        }
        
        logger.version.info('Cleaned up old versions', {
          boardId,
          deletedCount: oldVersions.length
        });
      }
    } catch (error) {
      logger.version.error('Failed to cleanup old versions', {
        error: error.message,
        boardId
      });
      // Don't throw here, as this is cleanup and shouldn't fail the main operation
    }
  }
}

module.exports = new VersionService(); 