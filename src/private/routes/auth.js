const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const authService = require('../services/authService');
const userModel = require('../models/userModel');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler, 
  validateRequired, 
  setAuthCookie,
  clearAuthCookie 
} = require('../utils/responseHelpers');
const { getRequestInfo } = require('../utils/authHelpers');

// Rate limiting for login attempts to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per IP per 15 minutes
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Rate limiting for registration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registration attempts per IP per hour
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Unified authentication endpoint
 * Handles all authentication methods: site_password, local, google, discord
 */
router.post('/authenticate', loginLimiter, asyncHandler(async (req, res) => {
  const { method } = req.body;
  
  if (!method) {
    return sendError(res, 400, 'Authentication method is required', null, 'Auth');
  }

  const requestInfo = getRequestInfo(req);
  const authResult = await authService.authenticate(req.body, requestInfo);
      
      if (!authResult) {
    return sendError(res, 401, 'Authentication failed', null, 'Auth');
  }

  // Handle pending approval
  if (authResult.error) {
    return sendError(res, 403, authResult.error, { 
      status: authResult.status 
    }, 'Auth');
  }

  // Handle successful authentication
  if (authResult.session) {
    setAuthCookie(res, authResult.session.token);
    
    logger.auth.info('User authenticated successfully', {
      userId: authResult.user.user_id,
      method,
      ip: requestInfo.ip
    });

    return sendSuccess(res, {
      user: {
        userId: authResult.user.user_id,
        username: authResult.user.username,
        email: authResult.user.email,
        isAdmin: !!authResult.user.is_admin,
        authProvider: authResult.user.auth_provider
      },
      message: 'Authentication successful'
    }, 200, 'Auth');
  }

  // Handle registration with pending approval
  if (authResult.message) {
    return sendSuccess(res, {
      message: authResult.message,
      requiresApproval: !authResult.session
    }, 200, 'Auth');
  }

  return sendError(res, 500, 'Authentication processing failed', null, 'Auth');
}, 'Auth'));

/**
 * User registration endpoint
 * Handles registration for local accounts
 */
router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  validateRequired(req, ['method', 'username']);
  
  const { method, username, email, password } = req.body;
  
  // Validate method
  if (!['local'].includes(method)) {
    return sendError(res, 400, 'Invalid registration method', null, 'Auth');
  }

  // Additional validation for local registration
  if (method === 'local') {
    validateRequired(req, ['email', 'password']);
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 400, 'Invalid email format', null, 'Auth');
    }
    
    // Password strength validation
    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long', null, 'Auth');
    }
  }

  const requestInfo = getRequestInfo(req);
  
  try {
    const registrationResult = await authService.register(req.body, requestInfo);
    
    // If user was approved and logged in immediately
    if (registrationResult.session) {
      setAuthCookie(res, registrationResult.session.token);
      
      return sendSuccess(res, {
        user: {
          userId: registrationResult.user.user_id,
          username: registrationResult.user.username,
          email: registrationResult.user.email,
          isAdmin: !!registrationResult.user.is_admin,
          authProvider: registrationResult.user.auth_provider
        },
        message: registrationResult.message
      }, 201, 'Auth');
    }
    
    // User registered but needs approval
    return sendSuccess(res, {
      message: registrationResult.message,
      requiresApproval: true
    }, 201, 'Auth');
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      return sendError(res, 409, error.message, null, 'Auth');
    }
    throw error;
  }
}, 'Auth'));

/**
 * Site password authentication (anonymous access)
 * Legacy endpoint for backward compatibility
 */
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  validateRequired(req, ['password']);
  
  const requestInfo = getRequestInfo(req);
  const authResult = await authService.authenticate({
    method: 'site_password',
    password: req.body.password
  }, requestInfo);
  
  if (!authResult) {
    return sendError(res, 401, 'Invalid site password', null, 'Auth');
  }

  setAuthCookie(res, authResult.session.token);
  
  return sendSuccess(res, {
    user: {
      userId: authResult.user.user_id,
      username: authResult.user.username,
      isAdmin: false,
      authProvider: 'anonymous'
    },
    message: 'Anonymous access granted'
  }, 200, 'Auth');
}, 'Auth'));

/**
 * Local account login
 * Legacy endpoint for backward compatibility
 */
router.post('/local-login', loginLimiter, asyncHandler(async (req, res) => {
  validateRequired(req, ['email', 'password']);
  
  const requestInfo = getRequestInfo(req);
  const authResult = await authService.authenticate({
    method: 'local',
    email: req.body.email,
    password: req.body.password
  }, requestInfo);
  
  if (!authResult) {
    return sendError(res, 401, 'Invalid credentials', null, 'Auth');
  }

  if (authResult.error) {
    return sendError(res, 403, authResult.error, { 
      status: authResult.status 
    }, 'Auth');
  }

  setAuthCookie(res, authResult.session.token);
  
  return sendSuccess(res, {
    user: {
      userId: authResult.user.user_id,
      username: authResult.user.username,
      email: authResult.user.email,
      isAdmin: !!authResult.user.is_admin,
      authProvider: 'local'
    },
    message: 'Login successful'
  }, 200, 'Auth');
}, 'Auth'));

/**
 * Google OAuth authentication
 */
router.post('/google', asyncHandler(async (req, res) => {
  validateRequired(req, ['idToken']);
  
  const requestInfo = getRequestInfo(req);
  const authResult = await authService.authenticate({
    method: 'google',
    idToken: req.body.idToken
  }, requestInfo);
  
  if (!authResult) {
    return sendError(res, 401, 'Google authentication failed', null, 'Auth');
  }

  if (authResult.error) {
    return sendError(res, 403, authResult.error, { 
      status: authResult.status 
    }, 'Auth');
  }

  // Handle pending approval
  if (authResult.message && !authResult.session) {
    return sendSuccess(res, {
      message: authResult.message,
      requiresApproval: true
    }, 200, 'Auth');
  }

  setAuthCookie(res, authResult.session.token);
  
  return sendSuccess(res, {
    user: {
      userId: authResult.user.user_id,
      username: authResult.user.username,
      email: authResult.user.email,
      isAdmin: !!authResult.user.is_admin,
      authProvider: 'google'
    },
    message: 'Google authentication successful'
  }, 200, 'Auth');
}, 'Auth'));

// Discord OAuth routes (conditionally loaded)
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  /**
   * Discord OAuth authentication
   */
  router.post('/discord', asyncHandler(async (req, res) => {
    validateRequired(req, ['code', 'redirectUri']);
    
    const requestInfo = getRequestInfo(req);
    const authResult = await authService.authenticate({
      method: 'discord',
      code: req.body.code,
      redirectUri: req.body.redirectUri
    }, requestInfo);
    
    if (!authResult) {
      return sendError(res, 401, 'Discord authentication failed', null, 'Auth');
    }

    if (authResult.error) {
      return sendError(res, 403, authResult.error, { 
        status: authResult.status 
      }, 'Auth');
    }

    // Handle pending approval
    if (authResult.message && !authResult.session) {
      return sendSuccess(res, {
        message: authResult.message,
        requiresApproval: true
      }, 200, 'Auth');
    }

    setAuthCookie(res, authResult.session.token);
    
    return sendSuccess(res, {
      user: {
        userId: authResult.user.user_id,
        username: authResult.user.username,
        email: authResult.user.email,
        isAdmin: !!authResult.user.is_admin,
        authProvider: 'discord'
      },
      message: 'Discord authentication successful'
    }, 200, 'Auth');
  }, 'Auth'));

  /**
   * Discord OAuth callback (for web flow)
   */
  router.get('/discord/callback', asyncHandler(async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
      return sendError(res, 400, 'Authorization code required', null, 'Auth');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/discord/callback`;
    const requestInfo = getRequestInfo(req);
    
    const authResult = await authService.authenticate({
      method: 'discord',
      code,
      redirectUri
    }, requestInfo);
    
    if (!authResult) {
      return res.redirect('/login?error=discord_auth_failed');
    }

    if (authResult.error) {
      return res.redirect(`/login?error=account_pending&status=${authResult.status}`);
    }

    // Handle pending approval
    if (authResult.message && !authResult.session) {
      return res.redirect('/login?message=account_pending_approval');
    }

    setAuthCookie(res, authResult.session.token);
    
    // Redirect to intended page or home
    const redirectTo = state ? decodeURIComponent(state) : '/';
    res.redirect(redirectTo);
  }, 'Auth'));
}

/**
 * Admin authentication
 */
router.post('/admin-login', loginLimiter, asyncHandler(async (req, res) => {
  validateRequired(req, ['password']);
  
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  
  if (password !== adminPassword) {
    logger.auth.warn('Failed admin login attempt', { 
      ip: getRequestInfo(req).ip 
    });
    return sendError(res, 401, 'Invalid admin password', null, 'Auth');
  }

  // Create admin session token
  const sessionToken = require('crypto').randomBytes(32).toString('hex');
  
  // Set admin cookie
  res.cookie('admin_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  logger.auth.info('Admin login successful', { 
    ip: getRequestInfo(req).ip 
  });

  return sendSuccess(res, {
    message: 'Admin authentication successful',
    isAdmin: true
  }, 200, 'Auth');
}, 'Auth'));

/**
 * Get authentication status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const token = req.cookies?.auth_token;
  
  if (!token) {
    return sendSuccess(res, {
      authenticated: false,
      user: null
    }, 200, 'Auth');
  }

  const user = await authService.verifySession(token);
  
  if (!user) {
    clearAuthCookie(res);
    return sendSuccess(res, {
      authenticated: false,
      user: null
    }, 200, 'Auth');
  }

  return sendSuccess(res, {
    authenticated: true,
    user: {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      isAdmin: !!user.is_admin,
      authProvider: user.auth_provider,
      approvalStatus: user.approval_status
    }
  }, 200, 'Auth');
}, 'Auth'));

/**
 * Logout
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.auth_token;
  
    if (token) {
      await authService.logout(token);
  }
  
  clearAuthCookie(res);
  
  // Also clear admin token if present
  res.clearCookie('admin_token');
  
  logger.auth.info('User logged out', { 
    ip: getRequestInfo(req).ip 
  });

  return sendSuccess(res, {
    message: 'Logged out successfully'
  }, 200, 'Auth');
}, 'Auth'));

/**
 * Get authentication configuration
 */
router.get('/config', asyncHandler(async (req, res) => {
  const config = {
    methods: ['site_password', 'local'],
    registration: {
      enabled: true,
      requiresApproval: true
    }
  };

  // Add Google OAuth if configured
  if (process.env.GOOGLE_CLIENT_ID) {
    config.methods.push('google');
    config.google = {
      clientId: process.env.GOOGLE_CLIENT_ID
    };
  }

  // Add Discord OAuth if configured
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    config.methods.push('discord');
    config.discord = {
      clientId: process.env.DISCORD_CLIENT_ID,
      redirectUri: `${req.protocol}://${req.get('host')}/api/auth/discord/callback`
    };
  }

  return sendSuccess(res, config, 200, 'Auth');
}, 'Auth'));

module.exports = router; 