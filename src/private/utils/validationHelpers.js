const logger = require('./enhancedLogger').createComponentLogger('Validation');
const { BOARD_CONFIG, VALIDATION_RULES } = require('../../../shared/constants');

/**
 * Centralized validation helpers to eliminate duplicate validation logic across routes.
 * All common validation patterns should be defined here.
 */
class ValidationHelpers {
  
  /**
   * Validate pagination parameters
   * @param {object} params - Query parameters
   * @param {object} req - Express request object for logging
   * @returns {object} Validated pagination object
   */
  static validatePagination(params = {}, req = null) {
    const page = Math.max(VALIDATION_RULES.PAGINATION.MIN_PAGE, parseInt(params.page) || VALIDATION_RULES.PAGINATION.MIN_PAGE);
    const limit = Math.min(
      VALIDATION_RULES.PAGINATION.MAX_LIMIT, 
      Math.max(VALIDATION_RULES.PAGINATION.MIN_LIMIT, parseInt(params.limit) || VALIDATION_RULES.PAGINATION.DEFAULT_LIMIT)
    );
    
    logger.debug('Pagination validated', { page, limit }, req);
    
    return { page, limit };
  }

  /**
   * Validate board coordinates
   * @param {number} row - Row coordinate
   * @param {number} col - Column coordinate
   * @param {number} boardSize - Board size (default 5x5)
   * @param {object} req - Express request object for logging
   * @returns {object} Validated coordinates
   */
  static validateCoordinates(row, col, boardSize = BOARD_CONFIG.DEFAULT_SIZE, req = null) {
    const rowNum = parseInt(row);
    const colNum = parseInt(col);
    
    if (isNaN(rowNum) || isNaN(colNum)) {
      logger.warn('Invalid coordinate types', { row, col }, req);
      throw new Error('Row and column must be numbers');
    }
    
    if (rowNum < 0 || rowNum >= boardSize || colNum < 0 || colNum >= boardSize) {
      logger.warn('Coordinates out of bounds', { row: rowNum, col: colNum, boardSize }, req);
      throw new Error(`Coordinates must be between 0 and ${boardSize - 1}`);
    }
    
    return { row: rowNum, col: colNum };
  }

  /**
   * Validate board size
   * @param {number} size - Board size
   * @param {object} req - Express request object for logging
   * @returns {number} Validated size
   */
  static validateBoardSize(size, req = null) {
    const sizeNum = parseInt(size) || BOARD_CONFIG.DEFAULT_SIZE;
    
    if (sizeNum < BOARD_CONFIG.MIN_SIZE || sizeNum > BOARD_CONFIG.MAX_SIZE) {
      logger.warn('Invalid board size', { size: sizeNum }, req);
      throw new Error(`Board size must be between ${BOARD_CONFIG.MIN_SIZE} and ${BOARD_CONFIG.MAX_SIZE}`);
    }
    
    return sizeNum;
  }

  /**
   * Validate board title
   * @param {string} title - Board title
   * @param {object} req - Express request object for logging
   * @returns {string} Validated title
   */
  static validateBoardTitle(title, req = null) {
    if (!title || typeof title !== 'string') {
      logger.warn('Invalid board title', { title }, req);
      throw new Error('Board title is required');
    }
    
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      logger.warn('Empty board title', {}, req);
      throw new Error('Board title cannot be empty');
    }
    
    if (trimmed.length < BOARD_CONFIG.MIN_TITLE_LENGTH || trimmed.length > BOARD_CONFIG.MAX_TITLE_LENGTH) {
      logger.warn('Board title too long', { length: trimmed.length }, req);
      throw new Error(`Board title must be between ${BOARD_CONFIG.MIN_TITLE_LENGTH} and ${BOARD_CONFIG.MAX_TITLE_LENGTH} characters`);
    }
    
    return trimmed;
  }

  /**
   * Validate username format
   * @param {string} username - Username to validate
   * @param {object} req - Express request object for logging
   * @returns {string} Validated username
   */
  static validateUsername(username, req = null) {
    if (!username || typeof username !== 'string') {
      logger.warn('Invalid username type', { username }, req);
      throw new Error('Username is required');
    }
    
    const trimmed = username.trim();
    if (trimmed.length < VALIDATION_RULES.USERNAME.MIN_LENGTH) {
      logger.warn('Username too short', { length: trimmed.length }, req);
      throw new Error(`Username must be at least ${VALIDATION_RULES.USERNAME.MIN_LENGTH} characters`);
    }
    
    if (trimmed.length > VALIDATION_RULES.USERNAME.MAX_LENGTH) {
      logger.warn('Username too long', { length: trimmed.length }, req);
      throw new Error(`Username cannot exceed ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`);
    }
    
    // Only allow alphanumeric, underscore, and hyphen
    if (!VALIDATION_RULES.USERNAME.PATTERN.test(trimmed)) {
      logger.warn('Invalid username format', { username: trimmed }, req);
      throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
    }
    
    // Check reserved names
    if (VALIDATION_RULES.USERNAME.RESERVED_NAMES.includes(trimmed.toLowerCase())) {
      logger.warn('Reserved username attempted', { username: trimmed }, req);
      throw new Error('This username is reserved and cannot be used');
    }
    
    return trimmed;
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @param {object} req - Express request object for logging
   * @returns {string} Validated email
   */
  static validateEmail(email, req = null) {
    if (!email || typeof email !== 'string') {
      logger.warn('Invalid email type', { email }, req);
      throw new Error('Email is required');
    }
    
    const trimmed = email.trim().toLowerCase();
    if (!VALIDATION_RULES.EMAIL.PATTERN.test(trimmed)) {
      logger.warn('Invalid email format', { email: trimmed }, req);
      throw new Error('Invalid email format');
    }
    
    if (trimmed.length > VALIDATION_RULES.EMAIL.MAX_LENGTH) {
      logger.warn('Email too long', { length: trimmed.length }, req);
      throw new Error(`Email cannot exceed ${VALIDATION_RULES.EMAIL.MAX_LENGTH} characters`);
    }
    
    return trimmed;
  }

  /**
   * Validate cell value
   * @param {string} value - Cell value
   * @param {object} req - Express request object for logging
   * @returns {string} Validated value
   */
  static validateCellValue(value, req = null) {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value !== 'string') {
      logger.warn('Invalid cell value type', { value, type: typeof value }, req);
      throw new Error('Cell value must be a string');
    }
    
    const trimmed = value.trim();
    if (trimmed.length > BOARD_CONFIG.MAX_CELL_VALUE_LENGTH) {
      logger.warn('Cell value too long', { length: trimmed.length }, req);
      throw new Error(`Cell value cannot exceed ${BOARD_CONFIG.MAX_CELL_VALUE_LENGTH} characters`);
    }
    
    return trimmed;
  }

  /**
   * Validate sort parameters
   * @param {string} sortBy - Sort field
   * @param {string} sortOrder - Sort order (asc/desc)
   * @param {string[]} allowedFields - Allowed sort fields
   * @param {object} req - Express request object for logging
   * @returns {object} Validated sort parameters
   */
  static validateSort(sortBy, sortOrder, allowedFields = ['created', 'updated', 'title'], req = null) {
    const validSortBy = allowedFields.includes(sortBy) ? sortBy : 'created';
    const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';
    
    logger.debug('Sort parameters validated', { 
      sortBy: validSortBy, 
      sortOrder: validSortOrder 
    }, req);
    
    return { sortBy: validSortBy, sortOrder: validSortOrder };
  }

  /**
   * Validate search query
   * @param {string} query - Search query
   * @param {object} req - Express request object for logging
   * @returns {string} Validated search query
   */
  static validateSearchQuery(query, req = null) {
    if (!query || typeof query !== 'string') {
      return '';
    }
    
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return '';
    }
    
    if (trimmed.length < VALIDATION_RULES.SEARCH_QUERY.MIN_LENGTH || trimmed.length > VALIDATION_RULES.SEARCH_QUERY.MAX_LENGTH) {
      logger.warn('Search query too long', { length: trimmed.length }, req);
      throw new Error(`Search query must be between ${VALIDATION_RULES.SEARCH_QUERY.MIN_LENGTH} and ${VALIDATION_RULES.SEARCH_QUERY.MAX_LENGTH} characters`);
    }
    
    // Basic sanitization - remove potentially dangerous characters
    const sanitized = trimmed.replace(/[<>'"&]/g, '');
    
    logger.debug('Search query validated', { 
      original: trimmed.substring(0, 50),
      sanitized: sanitized.substring(0, 50)
    }, req);
    
    return sanitized;
  }

  /**
   * Validate required fields in request body
   * @param {object} body - Request body
   * @param {string[]} requiredFields - Array of required field names
   * @param {object} req - Express request object for logging
   * @throws {Error} If any required field is missing
   */
  static validateRequired(body, requiredFields, req = null) {
    const missingFields = requiredFields.filter(field => {
      const value = body[field];
      return value === undefined || value === null || 
             (typeof value === 'string' && value.trim() === '');
    });
    
    if (missingFields.length > 0) {
      logger.warn('Missing required fields', { 
        missing: missingFields,
        provided: Object.keys(body || {})
      }, req);
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }
}

module.exports = ValidationHelpers; 