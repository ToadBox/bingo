const logger = require('../utils/logger');
const constants = require('../config/constants');

// Function to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
  const token = req.cookies?.auth_token;
  const adminToken = req.cookies?.admin_token;
  
  // Log all requests with cookie info
  logger.debug('Authentication check', { 
    path: req.path, 
    hasToken: !!token,
    hasAdminToken: !!adminToken,
    method: req.method,
    cookies: Object.keys(req.cookies || {})
  });
  
  // Skip authentication for API endpoints that should always be accessible
  if (req.path === '/api/auth/login' || 
      req.path === '/api/auth/admin-login' || 
      req.path === '/api/health' ||
      req.path === '/api/version') {
    logger.debug('Skipping auth for exempt API path', { path: req.path });
    return next();
  }

  // Skip authentication for all public assets and login pages
  if (req.path === constants.LOGIN_PAGE || 
      req.path === '/login' ||
      req.path === '/admin-login.html' ||
      req.path === '/css/login.css' || 
      req.path === '/css/common.css' ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/fonts/') ||
      req.path.includes('login')) {
    logger.debug('Skipping auth for public assets', { path: req.path });
    return next();
  }
  
  // Admin-specific routes and API endpoints require admin authentication
  if (req.path === '/admin' || 
      req.path === '/admin.html' ||
      req.path.startsWith('/api/admin/') || 
      req.path.startsWith('/api/site/')) {
    
    if (!adminToken) {
      logger.debug('No admin token found for admin route', { path: req.path });
      if (!req.path.startsWith('/api/')) {
        return res.redirect('/admin-login.html');
      }
      return res.status(403).json({ error: 'Admin authentication required' });
    }
    
    // Admin is authenticated
    logger.debug('Admin authenticated', { path: req.path });
    return next();
  }
  
  // Regular site authentication for non-admin routes
  if (!token) {
    logger.debug('No auth token found, redirecting', { path: req.path });
    
    // Only redirect HTML requests, return 401 for API requests
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    } else {
      // Set a flag in session to prevent redirect loops
      if (req.session) {
        req.session.redirected = true;
      }
      return res.redirect(constants.LOGIN_PAGE);
    }
  }
  
  // Here you would normally validate the token 
  // For this implementation, we just check if it exists
  // In a real app, you'd verify the token signature, expiration, etc.
  
  logger.debug('User authenticated', { path: req.path });
  next();
};

module.exports = { isAuthenticated }; 