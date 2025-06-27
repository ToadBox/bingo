// CommonJS wrapper for shared constants
// This loads the JSON and provides additional Node.js-specific functionality

const path = require('path');
const constants = require('./constants.json');

// Export all constants
module.exports = {
  ...constants,
  
  // Helper functions for Node.js backend
  getErrorResponse: (code, requestId = null) => {
    const errorCode = constants.ERROR_CODES[code];
    const message = constants.ERROR_MESSAGES[errorCode];
    return {
      error: errorCode,
      message: message || 'Unknown error occurred.',
      ...(requestId && { requestId })
    };
  },
  
  generateSessionToken: () => {
    const crypto = require('crypto');
    return crypto.randomBytes(constants.AUTH.TOKEN_LENGTH / 2).toString('hex');
  },
  
  generateBoardCode: () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < constants.BOARD.CODE_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  
  validateBoardSize: (size) => {
    return size >= constants.BOARD.MIN_SIZE && size <= constants.BOARD.MAX_SIZE;
  },
  
  validateImageFile: (fileInfo) => {
    if (fileInfo.size > constants.IMAGE.MAX_FILE_SIZE) {
      return { 
        valid: false, 
        error: `File size exceeds ${constants.IMAGE.MAX_FILE_SIZE / (1024 * 1024)}MB limit` 
      };
    }
    
    if (!constants.IMAGE.ALLOWED_MIME_TYPES.includes(fileInfo.mimetype)) {
      return { 
        valid: false, 
        error: 'Invalid file type. Allowed types: ' + constants.IMAGE.ALLOWED_MIME_TYPES.join(', ') 
      };
    }
    
    return { valid: true };
  },
  
  validateUsername: (username) => {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }
    
    if (username.length < constants.VALIDATION.USERNAME_MIN_LENGTH) {
      return { 
        valid: false, 
        error: `Username must be at least ${constants.VALIDATION.USERNAME_MIN_LENGTH} characters` 
      };
    }
    
    if (username.length > constants.VALIDATION.USERNAME_MAX_LENGTH) {
      return { 
        valid: false, 
        error: `Username must not exceed ${constants.VALIDATION.USERNAME_MAX_LENGTH} characters` 
      };
    }
    
    const regex = new RegExp(constants.VALIDATION.USERNAME_PATTERN);
    if (!regex.test(username)) {
      return { 
        valid: false, 
        error: 'Username can only contain letters, numbers, underscores, and hyphens' 
      };
    }
    
    return { valid: true };
  },
  
  validateEmail: (email) => {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email is required' };
    }
    
    const regex = new RegExp(constants.VALIDATION.EMAIL_PATTERN);
    if (!regex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    return { valid: true };
  },
  
  // Path helpers for Node.js
  getImagePath: (filename) => {
    return path.join(__dirname, '../uploads/images', filename);
  },
  
  getThumbnailPath: (filename) => {
    return path.join(__dirname, '../uploads/images/thumbnails', filename);
  },
  
  // Pagination helpers
  getPaginationInfo: (page, limit, total) => {
    const normalizedLimit = Math.min(limit || constants.PAGINATION.DEFAULT_LIMIT, constants.PAGINATION.MAX_LIMIT);
    const normalizedPage = Math.max(1, page || 1);
    const offset = (normalizedPage - 1) * normalizedLimit;
    const totalPages = Math.ceil(total / normalizedLimit);
    
    return {
      page: normalizedPage,
      limit: normalizedLimit,
      offset,
      total,
      totalPages,
      hasNext: normalizedPage < totalPages,
      hasPrev: normalizedPage > 1
    };
  }
};