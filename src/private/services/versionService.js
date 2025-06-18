const logger = require('../utils/logger');
const versionModel = require('../models/versionModel');
const boardModel = require('../models/boardModel');
const constants = require('../config/constants');

class VersionService {
  constructor() {
    this.maxVersions = constants.MAX_BOARD_VERSIONS || 50;
    this.autoVersionThreshold = constants.AUTO_VERSION_THRESHOLD || 10;
  }

  /**
   * Create a new version snapshot of a board
   * @param {number} boardId - Board ID
   * @param {number} userId - User ID creating the version
   * @param {string} description - Version description
   * @returns {Object} - Created version
   */
  async createVersion(boardId, userId, description = '') {
    try {
      // Export board to JSON format first
      const boardExport = await boardModel.exportToJson(boardId);
      
      if (!boardExport) {
        throw new Error('Failed to export board');
      }
      
      // Get the next version number
      const latestVersion = await versionModel.getLatestVersion(boardId);
      const versionNumber = latestVersion ? latestVersion.version_number + 1 : 1;
      
      // Create version record
      const version = await versionModel.createVersion({
        boardId,
        versionNumber,
        createdBy: userId,
        snapshot: JSON.stringify(boardExport),
        description: description || `Version ${versionNumber}`
      });
      
      if (!version) {
        throw new Error('Failed to create version');
      }
      
      // Prune old versions if we've exceeded the maximum
      await this.pruneOldVersions(boardId);
      
      logger.info('Board version created', {
        boardId,
        userId,
        versionNumber
      });
      
      return version;
    } catch (error) {
      logger.error('Failed to create board version', {
        error: error.message,
        boardId,
        userId
      });
      throw error;
    }
  }

  /**
   * Get all versions for a board
   * @param {number} boardId - Board ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of versions
   */
  async getVersions(boardId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    try {
      const versions = await versionModel.getVersions(boardId, {
        limit,
        offset
      });
      
      return versions.map(version => ({
        id: version.id,
        boardId: version.board_id,
        versionNumber: version.version_number,
        createdBy: version.created_by,
        createdAt: version.created_at,
        description: version.description
      }));
    } catch (error) {
      logger.error('Failed to get board versions', {
        error: error.message,
        boardId
      });
      return [];
    }
  }

  /**
   * Get a specific version
   * @param {number} boardId - Board ID
   * @param {number} versionNumber - Version number
   * @returns {Object} - Version details
   */
  async getVersion(boardId, versionNumber) {
    try {
      const version = await versionModel.getVersion(boardId, versionNumber);
      
      if (!version) {
        throw new Error('Version not found');
      }
      
      return {
        id: version.id,
        boardId: version.board_id,
        versionNumber: version.version_number,
        createdBy: version.created_by,
        createdAt: version.created_at,
        description: version.description,
        snapshot: JSON.parse(version.snapshot)
      };
    } catch (error) {
      logger.error('Failed to get board version', {
        error: error.message,
        boardId,
        versionNumber
      });
      throw error;
    }
  }

  /**
   * Revert a board to a specific version
   * @param {number} boardId - Board ID
   * @param {number} versionNumber - Version to revert to
   * @param {number} userId - User ID performing the revert
   * @returns {boolean} - Success status
   */
  async revertToVersion(boardId, versionNumber, userId) {
    try {
      // First create a snapshot of the current state
      await this.createVersion(
        boardId, 
        userId, 
        `Pre-revert snapshot before reverting to version ${versionNumber}`
      );
      
      // Get the version to revert to
      const version = await versionModel.getVersion(boardId, versionNumber);
      
      if (!version) {
        throw new Error('Version not found');
      }
      
      // Parse the snapshot
      const snapshot = JSON.parse(version.snapshot);
      
      // Import from the snapshot
      const success = await boardModel.importFromJson(snapshot, userId);
      
      if (!success) {
        throw new Error('Failed to import board from version snapshot');
      }
      
      // Create a new version to mark the revert
      await versionModel.createVersion({
        boardId,
        versionNumber: version.version_number + 1,
        createdBy: userId,
        snapshot: version.snapshot,
        description: `Reverted to version ${versionNumber}`
      });
      
      logger.info('Board reverted to version', {
        boardId,
        versionNumber,
        userId
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to revert board version', {
        error: error.message,
        boardId,
        versionNumber,
        userId
      });
      return false;
    }
  }

  /**
   * Track cell changes and create automatic versions as needed
   * @param {number} boardId - Board ID
   * @param {number} userId - User ID making changes
   * @param {Object} cellChange - Cell change details
   * @returns {void}
   */
  async trackChanges(boardId, userId, cellChange = {}) {
    try {
      // Get the count of changes since last version
      const changeCount = await versionModel.getChangeCount(boardId);
      
      // Increment the change counter
      await versionModel.incrementChangeCounter(boardId);
      
      // If we've reached the threshold, create a version
      if (changeCount >= this.autoVersionThreshold) {
        await this.createVersion(boardId, userId, 'Automatic version after multiple changes');
        
        // Reset the change counter
        await versionModel.resetChangeCounter(boardId);
      }
    } catch (error) {
      logger.error('Failed to track changes for versioning', {
        error: error.message,
        boardId,
        userId
      });
      // Don't throw, this is a background process
    }
  }

  /**
   * Prune old versions to stay within the maximum
   * @param {number} boardId - Board ID
   * @returns {number} - Number of versions pruned
   */
  async pruneOldVersions(boardId) {
    try {
      const count = await versionModel.countVersions(boardId);
      
      if (count <= this.maxVersions) {
        return 0; // No pruning needed
      }
      
      // Calculate how many to delete
      const toDelete = count - this.maxVersions;
      
      // Delete oldest versions, but keep the very first one for historical record
      const pruned = await versionModel.deleteOldestVersions(boardId, toDelete);
      
      logger.info('Pruned old board versions', {
        boardId,
        pruned,
        maxVersions: this.maxVersions
      });
      
      return pruned;
    } catch (error) {
      logger.error('Failed to prune old versions', {
        error: error.message,
        boardId
      });
      return 0;
    }
  }
}

module.exports = new VersionService(); 