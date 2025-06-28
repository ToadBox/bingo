const logger = require('../utils/enhancedLogger').createComponentLogger('BoardFormatter');

/**
 * Centralized service for formatting board data consistently across all endpoints.
 * Eliminates duplication of formatBoard logic across multiple route files.
 */
class BoardFormatterService {
  /**
   * Parse board settings from JSON string or object
   * @param {string|object} settings - Board settings
   * @param {object} req - Express request object for logging
   * @returns {object} Parsed settings object
   */
  static parseSettings(settings, req = null) {
    try {
      if (!settings) return { size: 5, freeSpace: true };
      return typeof settings === 'string' ? JSON.parse(settings) : settings;
    } catch (error) {
      logger.warn('Settings parsing failed, using defaults', {
        settings: settings?.substring ? settings.substring(0, 100) : 'non-string',
        error: error.message
      }, req);
      return { size: 5, freeSpace: true };
    }
  }

  /**
   * Generate board URL based on creator username
   * @param {object} board - Board object
   * @param {object} user - Current user context
   * @returns {string} Board URL
   */
  static generateBoardUrl(board, user = null) {
    // Use the creator username directly
    const creatorName = this.getCreatorName(board);
    return `/${creatorName}/${board.slug}`;
  }

  /**
   * Get creator name with unified logic
   * @param {object} board - Board object
   * @returns {string} Creator name
   */
  static getCreatorName(board) {
    // Check for joined username field (from users table)
    if (board.username) {
      return board.username;
    }
    
    // Check for creator_username field
    if (board.creator_username) {
      return board.creator_username;
    }
    
    // Check if it's a server board (no created_by)
    if (!board.created_by) {
      return 'server';
    }
    
    // Default fallback - this shouldn't happen with proper joins
    return 'unknown';
  }

  /**
   * Format a single board for API response
   * @param {object} board - Raw board data from database
   * @param {object} user - Current user context
   * @param {object} options - Formatting options
   * @param {object} req - Express request object for logging
   * @returns {object} Formatted board object
   */
  static formatBoard(board, user = null, options = {}, req = null) {
    try {
      const settings = this.parseSettings(board.settings, req);
      const creatorName = this.getCreatorName(board);
      const boardUrl = this.generateBoardUrl(board, user);

      const formatted = {
        id: board.uuid,
        title: board.title,
        slug: board.slug,
        createdBy: creatorName,
        createdAt: new Date(board.created_at).getTime(),
        lastUpdated: new Date(board.last_updated).getTime(),
        isPublic: !!board.is_public,
        description: board.description || '',
        url: boardUrl,
        settings: settings
      };

      // Add optional fields if present
      if (board.cellCount !== undefined) {
        formatted.cellCount = board.cellCount;
      }
      if (board.markedCount !== undefined) {
        formatted.markedCount = board.markedCount;
      }
      if (board.cells) {
        formatted.cells = board.cells;
      }
      if (settings.boardCode) {
        formatted.boardCode = settings.boardCode;
      }

      // Include sensitive fields only for authorized users
      if (options.includePassword && this.canViewPassword(board, user)) {
        formatted.boardPassword = settings.boardPassword;
      }

      return formatted;
    } catch (error) {
      logger.error('Board formatting failed', {
        boardId: board.id || board.uuid,
        error: error.message,
        stack: error.stack
      }, req);
      
      // Return minimal fallback format
      return {
        id: board.uuid || board.id,
        title: board.title || 'Untitled Board',
        slug: board.slug || 'unknown',
        createdBy: 'server',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        isPublic: false,
        description: '',
        url: '/server/unknown',
        settings: { size: 5, freeSpace: true }
      };
    }
  }

  /**
   * Format multiple boards for API response
   * @param {array} boards - Array of raw board data
   * @param {object} user - Current user context
   * @param {object} options - Formatting options
   * @param {object} req - Express request object for logging
   * @returns {array} Array of formatted board objects
   */
  static formatBoards(boards, user = null, options = {}, req = null) {
    if (!Array.isArray(boards)) {
      logger.warn('Invalid boards array provided to formatBoards', { boards }, req);
      return [];
    }

    return boards.map(board => this.formatBoard(board, user, options, req));
  }

  /**
   * Check if user can view board password
   * @param {object} board - Board object
   * @param {object} user - Current user
   * @returns {boolean} Whether user can view password
   */
  static canViewPassword(board, user) {
    if (!user) return false;
    if (user.is_admin) return true;
    if (board.created_by === user.user_id) return true;
    return false;
  }

  /**
   * Format cell data for API response
   * @param {object} cell - Raw cell data
   * @param {object} req - Express request object for logging
   * @returns {object} Formatted cell object
   */
  static formatCell(cell, req = null) {
    try {
      return {
        id: cell.id || `${cell.row}-${cell.col}`,
        row: cell.row,
        col: cell.col,
        value: cell.value || '',
        type: cell.type || 'text',
        marked: cell.marked === 1 || cell.marked === true,
        lastUpdated: cell.last_updated,
        updatedBy: cell.updated_by
      };
    } catch (error) {
      logger.error('Cell formatting failed', {
        cellId: cell.id,
        error: error.message
      }, req);
      
      return {
        id: cell.id || 'unknown',
        row: cell.row || 0,
        col: cell.col || 0,
        value: '',
        type: 'text',
        marked: false,
        lastUpdated: new Date().toISOString(),
        updatedBy: null
      };
    }
  }
}

module.exports = BoardFormatterService; 