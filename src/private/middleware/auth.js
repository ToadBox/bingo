const logger = require('../utils/logger');
const constants = require('../config/constants');
const authService = require('../services/authService');
const userModel = require('../models/userModel');
const {
  shouldSkipAuth,
  requiresAdminAuth,
  getAllowedPendingRoutes,
  handleAuthFailure,
  handleAccessDenied,
  logSuccessfulAuth,
  getRequestInfo
} = require('../utils/authHelpers');

// Function to check if the user is authenticated
const isAuthenticated = async (req, res, next) => {
  const token = req.cookies?.auth_token;
  const adminToken = req.cookies?.admin_token;
  const path = req.path;
  
  // Log all requests with cookie info
  logger.auth.debug('Authentication check', { 
    path,
    hasToken: !!token,
    hasAdminToken: !!adminToken,
    method: req.method,
    cookies: Object.keys(req.cookies || {})
  });
  
  // Skip authentication for exempt paths
  if (shouldSkipAuth(path)) {
    logger.auth.debug('Skipping auth for exempt path', { path });
    return next();
  }
  
  // Admin-specific routes require admin authentication
  if (requiresAdminAuth(path)) {
    if (!adminToken) {
      logger.auth.debug('No admin token found for admin route', { path });
      return handleAuthFailure(res, path, 'Admin authentication required', 'admin');
    }
    
    // Verify admin token
    const adminUser = await authService.verifySession(adminToken);
    
    if (!adminUser || !adminUser.is_admin) {
      return handleAuthFailure(res, path, 'Invalid admin token or non-admin user', 'admin');
    }
    
    // Store admin user in request
    req.user = adminUser;
    req.isAdmin = true;
    
    logSuccessfulAuth(adminUser, path, 'admin');
    return next();
  }
  
  // Regular site authentication
  if (!token) {
    logger.auth.debug('No auth token found, redirecting', { path });
    return handleAuthFailure(res, path);
  }
  
  // Verify user token
  const user = await authService.verifySession(token);
  
  if (!user) {
    return handleAuthFailure(res, path, 'Invalid auth token');
  }
  
  // Check user approval status
  const approvalStatus = await userModel.getUserApprovalStatus(user.id);
  
  // Store user in request
  req.user = user;
  req.isAdmin = user.is_admin === 1;
  req.approvalStatus = approvalStatus;
  
  // Check if user can access the route based on approval status
  const allowPendingRoutes = getAllowedPendingRoutes();
  
  if (approvalStatus === 'pending' && !allowPendingRoutes.some(route => path.startsWith(route))) {
    logger.auth.info('Unapproved user attempting to access restricted resource', {
      userId: user.id,
      username: user.username,
      path
    });
    
    return handleAccessDenied(res, path, 'Account approval required', {
        approvalStatus,
        redirectTo: '/pending-approval.html'
      });
  }
  
  if (approvalStatus === 'rejected') {
    return handleAccessDenied(res, path, 'Account has been rejected', { approvalStatus });
  }
  
  logSuccessfulAuth(user, path, 'user');
  next();
};

module.exports = { isAuthenticated }; 