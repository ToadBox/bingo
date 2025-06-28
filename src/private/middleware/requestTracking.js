const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger').api;

const requestTrackingMiddleware = (req, res, next) => {
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] || uuidv4().substring(0, 8);
  req.requestId = requestId;
  
  // Add to response headers for frontend correlation
  res.setHeader('x-request-id', requestId);
  
  // Only log non-status endpoint requests to reduce noise
  const isStatusEndpoint = req.path === '/status' || req.path === '/health' || req.path === '/api/auth/status';
  
  if (!isStatusEndpoint) {
    logger.info('Request started', {
      requestId,
      method: req.method,
      path: req.path,
      ip: req.ip || 'unknown'
    });
  }

  // Track response time
  const startTime = Date.now();
  
  // Override res.json to log responses for important endpoints
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    // Only log completion for non-status endpoints or errors
    if (!isStatusEndpoint || res.statusCode >= 400) {
      logger.info('Request completed', {
        requestId,
        status: res.statusCode,
        duration: `${duration}ms`,
        path: req.path
      });
    }
    
    return originalJson.call(this, data);
  };

  next();
};

module.exports = requestTrackingMiddleware; 