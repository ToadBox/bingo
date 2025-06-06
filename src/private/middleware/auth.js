const logger = require('../utils/logger');
const constants = require('../config/constants');

// Function to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
  const token = req.cookies?.auth_token;
  
  // Log all requests with cookie info
  logger.debug('Authentication check', { 
    path: req.path, 
    hasToken: !!token,
    method: req.method,
    cookies: Object.keys(req.cookies || {})
  });
  
  // Skip authentication for login route and API health check
  if (req.path === '/api/auth/login' || req.path === '/api/health') {
    logger.debug('Skipping auth for exempt path', { path: req.path });
    return next();
  }

  // Skip authentication for login-related static assets
  if (req.path === constants.LOGIN_PAGE || 
      req.path === '/login' ||
      req.path === '/css/login.css' || 
      req.path === '/css/common.css' ||
      req.path.startsWith('/js/theme') ||
      req.path.includes('login')) {
    logger.debug('Skipping auth for login assets', { path: req.path });
    return next();
  }
  
  // If no token is provided, redirect to login page if it's a page request
  // or return 401 if it's an API request
  if (!token) {
    logger.debug('No auth token found, redirecting', { path: req.path });
    if (req.path === '/' || !req.path.startsWith('/api/')) {
      return res.redirect(constants.LOGIN_PAGE);
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Here you would normally validate the token 
  // For this implementation, we just check if it exists
  // In a real app, you'd verify the token signature, expiration, etc.
  
  logger.debug('User authenticated', { path: req.path });
  next();
};

module.exports = { isAuthenticated }; 