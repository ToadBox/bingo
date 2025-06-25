const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const authService = require('../services/authService');
const userModel = require('../models/userModel');

// Rate limiting for login attempts to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per IP per 15 minutes
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful logins against the rate limit
  keyGenerator: (req) => {
    // Use both IP and a forwarded IP if available (for proxied requests)
    return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  }
});

// Check if Discord should be enabled
const isDiscordEnabled = () => {
  try {
    // Check if we're in offline mode
    if (process.env.OFFLINE_MODE === 'true') {
      logger.info('Discord is disabled in offline mode');
      return false;
    }

    // Check if Discord bot token is provided
    if (!process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN.trim() === '') {
      logger.info('Discord is disabled because DISCORD_BOT_TOKEN is not provided');
      return false;
    }

    // Check if Discord client credentials are provided
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
      logger.info('Discord is disabled because DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not provided');
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error checking Discord availability', { error: error.message });
    return false;
  }
};

// Configure Discord OAuth routes if Discord is enabled
if (isDiscordEnabled()) {
  logger.info('Configuring Discord OAuth routes');

  // Discord OAuth login endpoints
  router.get('/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = `${process.env.APP_URL}/api/auth/discord/callback`;
    const scope = 'identify email';
    
    if (!clientId) {
      logger.error('Discord OAuth attempted but DISCORD_CLIENT_ID not configured');
      return res.redirect('/login.html?error=discord_not_configured');
    }
    
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    
    res.redirect(discordAuthUrl);
  });

  router.get('/discord/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect('/login.html?error=discord_auth_failed');
    }
    
    try {
      // Get request info for auth
      const requestInfo = {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      };
      
      const redirectUri = `${process.env.APP_URL}/api/auth/discord/callback`;
      
      // Authenticate with Discord
      const authResult = await authService.authenticateDiscord(code, redirectUri, requestInfo);
      
      if (!authResult) {
        return res.redirect('/login.html?error=discord_auth_failed');
      }
      
      // Set the token as a cookie
      res.cookie('auth_token', authResult.session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict',
        path: '/'
      });
      
      logger.info('Successful Discord login', { 
        userId: authResult.user.id,
        username: authResult.user.username,
        ip: req.ip 
      });
      
      // Redirect to home
      res.redirect('/');
    } catch (error) {
      logger.error('Discord authentication error', { error: error.message });
      res.redirect('/login.html?error=discord_auth_failed');
    }
  });

  logger.info('Discord OAuth routes configured');
} else {
  logger.info('Discord OAuth routes disabled');
}

// Site password login route
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    // Get request info for auth
    const requestInfo = {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // Authenticate with site password
    const authResult = await authService.authenticateWithPassword(password, requestInfo);
    
    if (!authResult) {
      logger.warn('Failed login attempt', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Set the token as a cookie
    res.cookie('auth_token', authResult.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
      path: '/'
    });

    logger.info('Successful login with site password', { ip: req.ip });
    res.json({
      success: true,
      user: {
        id: authResult.user.id,
        username: authResult.user.username,
        isAnonymous: true
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Local user login route
router.post('/local-login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Get request info for auth
    const requestInfo = {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // Authenticate with local credentials
    const authResult = await authService.authenticateLocal(email, password, requestInfo);
    
    if (!authResult) {
      logger.warn('Failed local login attempt', { email, ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set the token as a cookie
    res.cookie('auth_token', authResult.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
      path: '/'
    });

    logger.info('Successful local login', { 
      userId: authResult.user.id,
      email,
      ip: req.ip 
    });
    
    res.json({
      success: true,
      user: {
        id: authResult.user.id,
        username: authResult.user.username,
        email: authResult.user.email
      }
    });
  } catch (error) {
    logger.error('Local login error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

// User registration route
router.post('/register', loginLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await userModel.getUserByEmail(email);
    
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Create new user
    const user = await userModel.createUser({
      username,
      email,
      auth_provider: 'local',
      auth_id: email,
      password
    });

    // Get request info for auth
    const requestInfo = {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // Create session for new user
    const session = await authService.createSession(user.id, requestInfo);

    // Set auth token cookie
    res.cookie('auth_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
      path: '/'
    });

    logger.info('New user registered', { 
      userId: user.id,
      username,
      email,
      ip: req.ip 
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during registration' });
  }
});

// Admin login route
router.post('/admin-login', loginLimiter, async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    // Verify admin password
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    
    if (password !== adminPassword) {
      logger.warn('Failed admin login attempt', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Create admin user if not exists
    let adminUser = await userModel.getUserByAuthId('admin', 'admin');
    
    if (!adminUser) {
      adminUser = await userModel.createUser({
        username: 'Admin',
        auth_provider: 'admin',
        auth_id: 'admin',
        is_admin: true
      });
    }
    
    // Get request info for auth
    const requestInfo = {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // Create session for admin
    const session = await authService.createSession(adminUser.id, requestInfo);

    // Set admin token cookie
    res.cookie('admin_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
      path: '/'
    });

    logger.info('Successful admin login', { ip: req.ip });
    res.json({ success: true });
  } catch (error) {
    logger.error('Admin login error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during admin login' });
  }
});

// Google OAuth login
router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  
  if (!idToken) {
    return res.status(400).json({ error: 'ID Token is required' });
  }
  
  try {
    // Get request info for auth
    const requestInfo = {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // Authenticate with Google
    const authResult = await authService.authenticateGoogle(idToken, requestInfo);
    
    if (!authResult) {
      return res.status(401).json({ error: 'Invalid Google authentication' });
    }
    
    // Set the token as a cookie
    res.cookie('auth_token', authResult.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
      path: '/'
    });
    
    logger.info('Successful Google login', { 
      userId: authResult.user.id,
      email: authResult.user.email,
      ip: req.ip 
    });
    
    res.json({
      success: true,
      user: {
        id: authResult.user.id,
        username: authResult.user.username,
        email: authResult.user.email
      }
    });
  } catch (error) {
    logger.error('Google authentication error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during Google authentication' });
  }
});

// User info endpoint
router.get('/user', async (req, res) => {
  try {
    // User is already authenticated via middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    res.json({
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      isAdmin: req.isAdmin
    });
  } catch (error) {
    logger.error('User info error', { error: error.message });
    res.status(500).json({ error: 'An error occurred getting user info' });
  }
});

// Auth status endpoint - check if user is authenticated
router.get('/status', async (req, res) => {
  try {
    const token = req.cookies?.auth_token;
    const adminToken = req.cookies?.admin_token;
    
    // Check if we have any valid token
    if (!token && !adminToken) {
      return res.status(401).json({ 
        authenticated: false, 
        error: 'No authentication token found' 
      });
    }
    
    // Verify the token using auth service
    const authService = require('../services/authService');
    let user = null;
    let isAdmin = false;
    
    // Try user token first
    if (token) {
      user = await authService.verifySession(token);
    }
    
    // Try admin token if user token failed
    if (!user && adminToken) {
      user = await authService.verifySession(adminToken);
      if (user && user.is_admin) {
        isAdmin = true;
      }
    }
    
    if (!user) {
      // Clear invalid cookies
      if (token) {
        res.clearCookie('auth_token', {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        });
      }
      if (adminToken) {
        res.clearCookie('admin_token', {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        });
      }
      
      return res.status(401).json({ 
        authenticated: false, 
        error: 'Invalid authentication token' 
      });
    }
    
    // Check user approval status
    const userModel = require('../models/userModel');
    const approvalStatus = await userModel.getUserApprovalStatus(user.id);
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: isAdmin || user.is_admin === 1,
        approvalStatus: approvalStatus
      }
    });
  } catch (error) {
    logger.error('Auth status error', { error: error.message });
    res.status(500).json({ 
      authenticated: false, 
      error: 'An error occurred checking authentication status' 
    });
  }
});

// Logout routes
router.post('/logout', async (req, res) => {
  const token = req.cookies?.auth_token;
  const adminToken = req.cookies?.admin_token;
  
  try {
    // Logout both user and admin sessions
    if (token) {
      await authService.logout(token);
      res.clearCookie('auth_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
    }
    
    if (adminToken) {
      await authService.logout(adminToken);
      res.clearCookie('admin_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
    }
    
    // Clear session
    if (req.session) {
      req.session.destroy();
    }
    
    logger.info('User logged out', { ip: req.ip });
    res.json({ success: true });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ error: 'An error occurred during logout' });
  }
});

// Also support GET logout for direct browser access
router.get('/logout', async (req, res) => {
  const token = req.cookies?.auth_token;
  const adminToken = req.cookies?.admin_token;
  
  try {
    // Logout both user and admin sessions
    if (token) {
      await authService.logout(token);
      res.clearCookie('auth_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
    }
    
    if (adminToken) {
      await authService.logout(adminToken);
      res.clearCookie('admin_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
    }
    
    // Clear session
    if (req.session) {
      req.session.destroy();
    }
    
    logger.info('User logged out via GET', { ip: req.ip });
    
    // Redirect to login page
    res.redirect('/login.html');
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.redirect('/login.html');
  }
});

// Export the router
module.exports = router;

// Configuration endpoint for frontend
router.get('/config', (req, res) => {
  try {
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      discordEnabled: isDiscordEnabled(),
      offlineMode: process.env.OFFLINE_MODE === 'true'
    });
  } catch (error) {
    logger.error('Auth config error', { error: error.message });
    res.status(500).json({ error: 'Failed to get auth configuration' });
  }
}); 