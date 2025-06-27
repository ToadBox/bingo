const logger = require('./logger');

/**
 * Standard error response helper
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} data - Additional data (optional)
 * @param {string} component - Component name for logging
 */
const sendError = (res, statusCode, message, data = null, component = 'API') => {
  const errorResponse = { error: message };
  if (data) {
    errorResponse.data = data;
  }
  
  // Log the error
  const logData = {
    statusCode,
    message,
    ...data
  };
  
  if (statusCode >= 500) {
    logger[component.toLowerCase()]?.error(message, logData) || logger.error(message, logData);
  } else {
    logger[component.toLowerCase()]?.warn(message, logData) || logger.warn(message, logData);
  }
  
  return res.status(statusCode).json(errorResponse);
};

/**
 * Standard success response helper
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {string} component - Component name for logging
 */
const sendSuccess = (res, data, statusCode = 200, component = 'API') => {
  logger[component.toLowerCase()]?.debug('Successful response', { statusCode, dataKeys: Object.keys(data) }) || 
    logger.debug('Successful response', { statusCode, dataKeys: Object.keys(data) });
  
  return res.status(statusCode).json(data);
};

/**
 * Async route handler wrapper to catch errors automatically
 * @param {Function} handler - Route handler function
 * @param {string} component - Component name for logging
 */
const asyncHandler = (handler, component = 'API') => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      logger[component.toLowerCase()]?.error('Unhandled route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      }) || logger.error('Unhandled route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
      
      sendError(res, 500, 'Internal server error', null, component);
    }
  };
};

/**
 * Request validation helper
 * @param {Object} req - Express request object
 * @param {Array} requiredFields - Array of required field names
 * @param {string} source - Source of data ('body', 'params', 'query')
 */
const validateRequired = (req, requiredFields, source = 'body') => {
  const data = req[source];
  const missing = requiredFields.filter(field => !data || !data[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
};

/**
 * Cookie configuration constants
 */
const COOKIE_CONFIG = {
  auth: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict',
    path: '/'
  },
  admin: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict',
    path: '/'
  }
};

/**
 * Set authentication cookie
 * @param {Object} res - Express response object
 * @param {string} token - Authentication token
 * @param {string} type - Cookie type ('auth' or 'admin')
 */
const setAuthCookie = (res, token, type = 'auth') => {
  const cookieName = type === 'admin' ? 'admin_token' : 'auth_token';
  res.cookie(cookieName, token, COOKIE_CONFIG[type]);
};

/**
 * Clear authentication cookie
 * @param {Object} res - Express response object
 * @param {string} type - Cookie type ('auth' or 'admin')
 */
const clearAuthCookie = (res, type = 'auth') => {
  const cookieName = type === 'admin' ? 'admin_token' : 'auth_token';
  
  // Create config without maxAge to avoid deprecation warning
  const clearConfig = {
    httpOnly: COOKIE_CONFIG[type].httpOnly,
    secure: COOKIE_CONFIG[type].secure,
    sameSite: COOKIE_CONFIG[type].sameSite,
    path: COOKIE_CONFIG[type].path
  };
  
  res.clearCookie(cookieName, clearConfig);
};

module.exports = {
  sendError,
  sendSuccess,
  asyncHandler,
  validateRequired,
  setAuthCookie,
  clearAuthCookie,
  COOKIE_CONFIG
}; 