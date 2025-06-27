const logger = require('./logger');
const { clearAuthCookie } = require('./responseHelpers');

/**
 * Check if request path should skip authentication
 * @param {string} path - Request path
 * @returns {boolean} - True if should skip auth
 */
const shouldSkipAuth = (path) => {
  const skipPaths = [
    '/api/auth/login',
    '/api/auth/local-login',
    '/api/auth/google',
    '/api/auth/discord',
    '/api/auth/discord/callback',
    '/api/auth/register',
    '/api/auth/admin-login',
    '/api/auth/status',
    '/api/auth/logout',
    '/api/auth/config',
    '/api/health',
    '/api/version'
  ];
  
  const skipPatterns = [
    '/css/',
    '/js/',
    '/images/',
    '/fonts/',
    '/assets/'
  ];
  
  const skipExact = [
    '/login',
    '/admin-login.html',
    '/pending-approval.html'
  ];
  
  return skipPaths.includes(path) ||
         skipPatterns.some(pattern => path.startsWith(pattern)) ||
         skipExact.includes(path) ||
         path.includes('login');
};

/**
 * Check if request path requires admin authentication
 * @param {string} path - Request path
 * @returns {boolean} - True if requires admin auth
 */
const requiresAdminAuth = (path) => {
  return path === '/admin' ||
         path === '/admin.html' ||
         path.startsWith('/api/admin/') ||
         path.startsWith('/api/site/');
};

/**
 * Get routes that pending users can access
 * @returns {Array} - Array of allowed routes for pending users
 */
const getAllowedPendingRoutes = () => [
  '/api/auth/logout',
  '/api/auth/user',
  '/api/users/profile',
  '/pending-approval.html',
  '/api/notifications'
];

/**
 * Handle authentication failure response
 * @param {Object} res - Express response object
 * @param {string} path - Request path
 * @param {string} message - Error message
 * @param {string} cookieType - Type of cookie to clear ('auth' or 'admin')
 */
const handleAuthFailure = (res, path, message = 'Authentication required', cookieType = 'auth') => {
  logger.auth.warn('Authentication failure', { path, message });
  
  // Clear invalid cookie
  clearAuthCookie(res, cookieType);
  
  if (path.startsWith('/api/')) {
    return res.status(401).json({ error: message });
  }
  
  // Redirect to appropriate login page
  const redirectUrl = cookieType === 'admin' ? '/admin-login.html' : '/login';
  return res.redirect(redirectUrl);
};

/**
 * Handle access denied response
 * @param {Object} res - Express response object
 * @param {string} path - Request path
 * @param {string} message - Error message
 * @param {Object} additionalData - Additional data to include in response
 */
const handleAccessDenied = (res, path, message = 'Access denied', additionalData = {}) => {
  logger.auth.warn('Access denied', { path, message, ...additionalData });
  
  if (path.startsWith('/api/')) {
    return res.status(403).json({ error: message, ...additionalData });
  }
  
  // Redirect based on the type of access denial
  if (additionalData.approvalStatus === 'pending') {
    return res.redirect('/pending-approval.html');
  } else if (additionalData.approvalStatus === 'rejected') {
    return res.redirect('/account-rejected.html');
  }
  
  return res.status(403).send('Access denied');
};

/**
 * Log successful authentication
 * @param {Object} user - User object
 * @param {string} path - Request path
 * @param {string} authType - Type of authentication ('user', 'admin', etc.)
 */
const logSuccessfulAuth = (user, path, authType = 'user') => {
  logger.auth.debug(`${authType} authenticated`, {
    path,
    userId: user.id,
    username: user.username,
    isAdmin: !!user.is_admin
  });
};

/**
 * Get request info for authentication logging
 * @param {Object} req - Express request object
 * @returns {Object} - Request info object
 */
const getRequestInfo = (req) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  path: req.path,
  method: req.method
});

module.exports = {
  shouldSkipAuth,
  requiresAdminAuth,
  getAllowedPendingRoutes,
  handleAuthFailure,
  handleAccessDenied,
  logSuccessfulAuth,
  getRequestInfo
}; 