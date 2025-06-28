const logger = require('../utils/logger');
const { sendError } = require('../utils/responseHelpers');

// Use API logger for validation since validation is part of API processing
const validationLogger = logger.api;

/**
 * Validation schemas for different data types
 */
const schemas = {
  user: {
    username: {
      type: 'string',
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_-]+$/,
      required: true
    },
    email: {
      type: 'string',
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      required: false
    },
    password: {
      type: 'string',
      minLength: 6,
      maxLength: 128,
      required: false
    }
  },
  board: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      required: true
    },
    description: {
      type: 'string',
      maxLength: 500,
      required: false
    },
    isPublic: {
      type: 'boolean',
      required: false
    },
    size: {
      type: 'number',
      min: 3,
      max: 9,
      required: false
    },
    freeSpace: {
      type: 'boolean',
      required: false
    },
    useServerName: {
      type: 'boolean',
      required: false
    }
  },
  cell: {
    value: {
      type: 'string',
      maxLength: 2000, // Increased for image URLs/data URIs
      required: false
    },
    type: {
      type: 'string',
      enum: ['text', 'image'],
      required: false
    },
    marked: {
      type: 'boolean',
      required: false
    }
  },
  chat: {
    message: {
      type: 'string',
      minLength: 1,
      maxLength: 1000,
      required: true
    }
  }
};

/**
 * Sanitize input data
 * @param {any} value - Value to sanitize
 * @param {string} type - Data type
 * @returns {any} - Sanitized value
 */
const sanitizeValue = (value, type) => {
  if (value === null || value === undefined) {
    return value;
  }

  switch (type) {
    case 'string':
      return String(value).trim();
    case 'number':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    case 'array':
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
};

/**
 * Validate a single field against its schema
 * @param {any} value - Value to validate
 * @param {Object} fieldSchema - Schema for the field
 * @param {string} fieldName - Name of the field
 * @returns {Object} - Validation result
 */
const validateField = (value, fieldSchema, fieldName) => {
  const errors = [];

  // Check if required field is missing
  if (fieldSchema.required && (value === null || value === undefined || value === '')) {
    errors.push(`${fieldName} is required`);
    return { valid: false, errors };
  }

  // Skip validation if value is empty and not required
  if (!fieldSchema.required && (value === null || value === undefined || value === '')) {
    return { valid: true, errors: [] };
  }

  // Type validation
  if (fieldSchema.type) {
    const actualType = typeof value;
    if (fieldSchema.type === 'array' && !Array.isArray(value)) {
      errors.push(`${fieldName} must be an array`);
    } else if (fieldSchema.type !== 'array' && actualType !== fieldSchema.type) {
      errors.push(`${fieldName} must be of type ${fieldSchema.type}`);
    }
  }

  // String-specific validations
  if (fieldSchema.type === 'string' && typeof value === 'string') {
    if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
      errors.push(`${fieldName} must be at least ${fieldSchema.minLength} characters long`);
    }
    if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
      errors.push(`${fieldName} must be no more than ${fieldSchema.maxLength} characters long`);
    }
    if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
      errors.push(`${fieldName} format is invalid`);
    }
  }

  // Number-specific validations
  if (fieldSchema.type === 'number' && typeof value === 'number') {
    if (fieldSchema.min && value < fieldSchema.min) {
      errors.push(`${fieldName} must be at least ${fieldSchema.min}`);
    }
    if (fieldSchema.max && value > fieldSchema.max) {
      errors.push(`${fieldName} must be no more than ${fieldSchema.max}`);
    }
  }

  // Enum validation
  if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
    errors.push(`${fieldName} must be one of: ${fieldSchema.enum.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate data against a schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Schema to validate against
 * @returns {Object} - Validation result
 */
const validateData = (data, schema) => {
  const errors = [];
  const sanitized = {};

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = data[fieldName];
    
    // Sanitize the value
    const sanitizedValue = sanitizeValue(value, fieldSchema.type);
    
    // Validate the sanitized value
    const validation = validateField(sanitizedValue, fieldSchema, fieldName);
    
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      sanitized[fieldName] = sanitizedValue;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: sanitized
  };
};

/**
 * Create validation middleware for a specific schema
 * @param {string} schemaName - Name of the schema to use
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware function
 */
const createValidator = (schemaName, options = {}) => {
  const { 
    source = 'body', 
    allowExtra = false, 
    component = 'Validation' 
  } = options;

  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      validationLogger.error('Unknown validation schema', { schemaName });
      return sendError(res, 500, 'Internal validation error', null, component);
    }

    const data = req[source];
    
    if (!data || typeof data !== 'object') {
      return sendError(res, 400, 'Invalid request data', null, component);
    }

    // Check for extra fields if not allowed
    if (!allowExtra) {
      const allowedFields = Object.keys(schema);
      const extraFields = Object.keys(data).filter(field => !allowedFields.includes(field));
      
      if (extraFields.length > 0) {
        return sendError(res, 400, `Unexpected fields: ${extraFields.join(', ')}`, null, component);
      }
    }

    // Validate the data
    const validation = validateData(data, schema);
    
    if (!validation.valid) {
      validationLogger.warn('Validation failed', {
        schemaName,
        errors: validation.errors,
        path: req.path
      });
      
      return sendError(res, 400, 'Validation failed', {
        errors: validation.errors
      }, component);
    }

    // Attach sanitized data to request
    req.validated = validation.data;
    
    validationLogger.debug('Validation successful', {
      schemaName,
      fields: Object.keys(validation.data)
    });
    
    next();
  };
};

/**
 * Validate user ID format
 * @param {string} userId - User ID to validate
 * @returns {boolean} - True if valid
 */
const isValidUserId = (userId) => {
  return typeof userId === 'string' && 
         userId.length === 8 && 
         /^[a-z0-9]+$/.test(userId);
};

/**
 * Validate board ID format (UUID)
 * @param {string} boardId - Board ID to validate
 * @returns {boolean} - True if valid
 */
const isValidBoardId = (boardId) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof boardId === 'string' && uuidRegex.test(boardId);
};

/**
 * Middleware to validate user ID parameter
 */
const validateUserId = (req, res, next) => {
  const { userId } = req.params;
  
  if (!isValidUserId(userId)) {
    return sendError(res, 400, 'Invalid user ID format', null, 'Validation');
  }
  
  next();
};

/**
 * Middleware to validate board ID parameter
 */
const validateBoardId = (req, res, next) => {
  const { boardId } = req.params;
  
  if (!isValidBoardId(boardId)) {
    return sendError(res, 400, 'Invalid board ID format', null, 'Validation');
  }
  
  next();
};

/**
 * Middleware to validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  
  if (isNaN(pageNum) || pageNum < 1) {
    return sendError(res, 400, 'Invalid page number', null, 'Validation');
  }
  
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return sendError(res, 400, 'Invalid limit (must be between 1 and 100)', null, 'Validation');
  }
  
  req.pagination = {
    page: pageNum,
    limit: limitNum,
    offset: (pageNum - 1) * limitNum
  };
  
  next();
};

/**
 * Rate limiting validation
 * @param {string} key - Rate limit key
 * @param {number} maxRequests - Maximum requests
 * @param {number} windowMs - Time window in milliseconds
 */
const createRateLimit = (key, maxRequests, windowMs) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [id, timestamps] of requests.entries()) {
      const filtered = timestamps.filter(time => time > windowStart);
      if (filtered.length === 0) {
        requests.delete(id);
      } else {
        requests.set(id, filtered);
      }
    }
    
    // Get current requests for this identifier
    const userRequests = requests.get(identifier) || [];
    const recentRequests = userRequests.filter(time => time > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      return sendError(res, 429, 'Too many requests', {
        retryAfter: Math.ceil(windowMs / 1000)
      }, 'RateLimit');
    }
    
    // Add current request
    recentRequests.push(now);
    requests.set(identifier, recentRequests);
    
    next();
  };
};

module.exports = {
  schemas,
  validateData,
  createValidator,
  isValidUserId,
  isValidBoardId,
  validateUserId,
  validateBoardId,
  validatePagination,
  createRateLimit,
  sanitizeValue,
  validateField
}; 