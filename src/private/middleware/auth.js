const logger = require('../utils/logger');
const constants = require('../config/constants');
const authService = require('../services/authService');
const userModel = require('../models/userModel');

// Function to check if the user is authenticated
const isAuthenticated = async (req, res, next) => {
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
      req.path === '/api/auth/local-login' ||
      req.path === '/api/auth/google' ||
      req.path === '/api/auth/discord' ||
      req.path === '/api/auth/discord/callback' ||
      req.path === '/api/auth/register' ||
      req.path === '/api/auth/admin-login' || 
      req.path === '/api/auth/status' ||
      req.path === '/api/auth/logout' ||
      req.path === '/api/auth/config' ||
      req.path === '/api/health' ||
      req.path === '/api/version') {
    logger.debug('Skipping auth for exempt API path', { path: req.path });
    return next();
  }

  // Skip authentication for all public assets and login pages
  if (req.path === constants.LOGIN_PAGE || 
      req.path === '/login' ||
      req.path === '/admin-login.html' ||
      req.path === '/pending-approval.html' ||
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
    
    // If no admin token, redirect or return error
    if (!adminToken) {
      logger.debug('No admin token found for admin route', { path: req.path });
      if (!req.path.startsWith('/api/')) {
        return res.redirect('/admin-login.html');
      }
      return res.status(403).json({ error: 'Admin authentication required' });
    }
    
    // Verify admin token (using auth service)
    const adminUser = await authService.verifySession(adminToken);
    
    if (!adminUser || !adminUser.is_admin) {
      logger.warn('Invalid admin token or non-admin user', { path: req.path });
      
      // Clear invalid admin token
      res.clearCookie('admin_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
      if (!req.path.startsWith('/api/')) {
        return res.redirect('/admin-login.html');
      }
      return res.status(403).json({ error: 'Admin authentication required' });
    }
    
    // Store admin user in request for use in routes
    req.user = adminUser;
    req.isAdmin = true;
    
    logger.debug('Admin authenticated', { 
      path: req.path,
      userId: adminUser.id,
      username: adminUser.username
    });
    
    return next();
  }
  
  // Routes that pending users can access
  const allowPendingRoutes = [
    '/api/auth/logout',
    '/api/auth/user',
    '/api/users/profile',
    '/pending-approval.html',
    '/api/notifications'
  ];
  
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
  
  // Verify user token (using auth service)
  const user = await authService.verifySession(token);
  
  if (!user) {
    logger.warn('Invalid auth token', { path: req.path });
    
    // Clear invalid token
    res.clearCookie('auth_token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    } else {
      return res.redirect(constants.LOGIN_PAGE);
    }
  }
  
  // Check user approval status
  const approvalStatus = await userModel.getUserApprovalStatus(user.id);
  
  // Store user in request for use in routes
  req.user = user;
  req.isAdmin = user.is_admin === 1;
  req.approvalStatus = approvalStatus;
  
  // If user is not approved and trying to access a restricted route
  if (approvalStatus === 'pending' && !allowPendingRoutes.some(route => req.path.startsWith(route))) {
    logger.info('Unapproved user attempting to access restricted resource', {
      userId: user.id,
      username: user.username,
      path: req.path
    });
    
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ 
        error: 'Account approval required', 
        approvalStatus,
        redirectTo: '/pending-approval.html'
      });
    } else {
      return res.redirect('/pending-approval.html');
    }
  }
  
  // If user is rejected
  if (approvalStatus === 'rejected') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ 
        error: 'Account has been rejected', 
        approvalStatus 
      });
    } else {
      return res.redirect('/account-rejected.html');
    }
  }
  
  logger.debug('User authenticated', { 
    path: req.path,
    userId: user.id,
    username: user.username,
    approvalStatus
  });
  
  next();
};

module.exports = { isAuthenticated }; 