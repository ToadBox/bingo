const crypto = require('crypto');
const axios = require('axios');
const userModel = require('../models/userModel');
const sessionModel = require('../models/sessionModel');
const logger = require('../utils/logger');
const database = require('../models/database');

class AuthService {
  constructor() {
    // Default session expiry (24 hours)
    this.sessionExpiry = 24 * 60 * 60 * 1000;
    
    // Initialize stored password hash
    this.initPasswordHash();
  }
  
  /**
   * Initialize password hash for site-wide password
   */
  initPasswordHash() {
    const sitePassword = process.env.SITE_PASSWORD || 'meme';
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = 10000;
    const hash = crypto.pbkdf2Sync(sitePassword, salt, iterations, 64, 'sha256').toString('hex');
    
    this.passwordData = {
      hash,
      salt,
      iterations
    };
    
    logger.auth.info('Site password hash initialized');
  }
  
  /**
   * Unified authentication method
   * @param {Object} authData - Authentication data
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Session info if authenticated, null otherwise
   */
  async authenticate(authData, requestInfo) {
    const { method, ...data } = authData;

    try {
      switch (method) {
        case 'site_password':
          return await this.authenticateWithPassword(data.password, data.username, requestInfo);
        
        case 'local':
          return await this.authenticateLocal(data.email, data.password, requestInfo);
        
        case 'google':
          return await this.authenticateGoogle(data.idToken, requestInfo);
        
        case 'discord':
          return await this.authenticateDiscord(data.code, data.redirectUri, requestInfo);
        
        default:
          logger.auth.warn('Invalid authentication method', { method });
          return null;
      }
    } catch (error) {
      logger.auth.error('Authentication error', { 
        method,
        error: error.message,
        ip: requestInfo.ip
      });
      return null;
    }
  }

  /**
   * Register a new user account
   * @param {Object} userData - User registration data
   * @param {Object} requestInfo - Request information
   * @returns {Object} - Registration result
   */
  async register(userData, requestInfo) {
    const { method, username, email, password } = userData;

    try {
      // Validate required fields based on method
      if (method === 'local') {
        if (!email || !password || !username) {
          throw new Error('Email, password, and username are required for local registration');
        }

        // Check if user already exists
        const existingUser = await userModel.getUserByEmail(email);
        if (existingUser) {
          throw new Error('User with this email already exists');
        }
      }

      // Determine approval status based on method
      const approvalStatus = this.determineApprovalStatus(method, userData);

      // Create user with random user_id
      const user = await userModel.createUser({
        username,
        email,
        auth_provider: method,
        auth_id: method === 'local' ? email : null,
        password,
        approval_status: approvalStatus,
        discord_guild_id: userData.discord_guild_id
      });

      logger.auth.info('User registered successfully', {
        userId: user.user_id,
        username,
        method,
        approvalStatus,
        ip: requestInfo.ip
      });

      // If approved, create session immediately
      if (approvalStatus === 'approved') {
        const session = await this.createSession(user.user_id, requestInfo);
        return {
          success: true,
          user,
          session,
          message: 'Registration successful'
        };
      } else {
        return {
          success: true,
          user,
          session: null,
          message: 'Registration successful. Account pending approval.'
        };
      }

    } catch (error) {
      logger.auth.error('Registration failed', {
        method,
        username,
        email,
        error: error.message,
        ip: requestInfo.ip
      });
      throw error;
    }
  }

  /**
   * Determine approval status based on auth method and data
   * @param {string} method - Authentication method
   * @param {Object} userData - User data
   * @returns {string} - Approval status
   */
  determineApprovalStatus(method, userData) {
    switch (method) {
      case 'site_password':
      case 'anonymous':
        return 'approved'; // Anonymous access is always approved
      
      case 'discord':
        // Auto-approve if user is in approved Discord guild
        if (userData.discord_guild_id && this.isApprovedGuild(userData.discord_guild_id)) {
          return 'approved';
        }
        return 'pending';
      
      case 'google':
      case 'local':
      default:
        return 'pending'; // Require manual approval for these methods
    }
  }

  /**
   * Check if Discord guild is in approved list
   * @param {string} guildId - Discord guild ID
   * @returns {boolean} - True if approved
   */
  isApprovedGuild(guildId) {
    const approvedGuilds = process.env.DISCORD_APPROVED_GUILDS?.split(',') || [];
    return approvedGuilds.includes(guildId);
  }
  
  /**
   * Authenticate with site password (anonymous access)
   * @param {string} password - Site password
   * @param {string} username - Optional username (defaults to 'Anonymous')
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Session info if authenticated, null otherwise
   */
  async authenticateWithPassword(password, username = 'Anonymous', requestInfo) {
    try {
      // Verify the password using the stored hash
      const isValid = this.verifyPassword(
        password,
        this.passwordData.hash,
        this.passwordData.salt,
        this.passwordData.iterations
      );
      
      if (!isValid) {
        logger.auth.warn('Failed site password authentication attempt', { ip: requestInfo.ip });
        return null;
      }
      
      // Create anonymous user for this session with chosen username
      const anonymousUser = await userModel.createAnonymousUser(username || 'Anonymous');
      
      // Create a new session
      const session = await this.createSession(anonymousUser.user_id, requestInfo);
      
      logger.auth.info('Successful site password authentication', { 
        userId: anonymousUser.user_id,
        username: anonymousUser.username,
        ip: requestInfo.ip 
      });
      
      return {
        user: anonymousUser,
        session
      };
    } catch (error) {
      logger.auth.error('Authentication error with site password', { 
        error: error.message,
        ip: requestInfo.ip
      });
      return null;
    }
  }
  
  /**
   * Authenticate with local credentials
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Session info if authenticated, null otherwise
   */
  async authenticateLocal(email, password, requestInfo) {
    try {
      // Validate credentials
      const user = await userModel.validateCredentials(email, password);
      
      if (!user) {
        logger.auth.warn('Failed local authentication attempt', { 
          email,
          ip: requestInfo.ip 
        });
        return null;
      }

      // Check if user is approved
      if (user.approval_status !== 'approved') {
        logger.auth.warn('Authentication attempt by unapproved user', {
          userId: user.user_id,
          email,
          status: user.approval_status,
          ip: requestInfo.ip
        });
        return {
          error: 'Account pending approval',
          status: user.approval_status
        };
      }
      
      // Create a new session
      const session = await this.createSession(user.user_id, requestInfo);
      
      logger.auth.info('Successful local authentication', { 
        userId: user.user_id,
        email,
        ip: requestInfo.ip 
      });
      
      return {
        user,
        session
      };
    } catch (error) {
      logger.auth.error('Authentication error with local credentials', { 
        error: error.message,
        email,
        ip: requestInfo.ip
      });
      return null;
    }
  }
  
  /**
   * Authenticate with Google OAuth
   * @param {string} idToken - Google OAuth ID token
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Session info if authenticated, null otherwise
   */
  async authenticateGoogle(idToken, requestInfo) {
    try {
      // Verify Google token
      const userInfo = await this.verifyGoogleToken(idToken);
      
      if (!userInfo) {
        logger.auth.warn('Failed Google authentication - invalid token', {
          ip: requestInfo.ip
        });
        return null;
      }
      
      // Check if user exists
      let user = await userModel.getUserByAuthId('google', userInfo.sub);
      
      // Create user if they don't exist
      if (!user) {
        const approvalStatus = this.determineApprovalStatus('google', {});
        
        user = await userModel.createUser({
          username: userInfo.name || userInfo.email.split('@')[0],
          email: userInfo.email,
          auth_provider: 'google',
          auth_id: userInfo.sub,
          approval_status: approvalStatus
        });
        
        logger.auth.info('New Google user created', { 
          userId: user.user_id,
          email: userInfo.email,
          approvalStatus
        });

        // If pending approval, return early
        if (approvalStatus === 'pending') {
          return {
            user,
            session: null,
            message: 'Account created. Pending approval.'
          };
        }
      } else {
        // Check if existing user is approved
        if (user.approval_status !== 'approved') {
          return {
            error: 'Account pending approval',
            status: user.approval_status
          };
        }
      }
      
      // Create a new session
      const session = await this.createSession(user.user_id, requestInfo);
      
      logger.auth.info('Successful Google authentication', { 
        userId: user.user_id,
        email: userInfo.email,
        ip: requestInfo.ip 
      });
      
      return {
        user,
        session
      };
    } catch (error) {
      logger.auth.error('Authentication error with Google', { 
        error: error.message,
        ip: requestInfo.ip
      });
      return null;
    }
  }
  
  /**
   * Authenticate with Discord OAuth
   * @param {string} code - Discord OAuth code
   * @param {string} redirectUri - Discord OAuth redirect URI
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Session info if authenticated, null otherwise
   */
  async authenticateDiscord(code, redirectUri, requestInfo) {
    try {
      // Exchange code for token
      const tokenData = await this.getDiscordToken(code, redirectUri);
      
      if (!tokenData || !tokenData.access_token) {
        logger.auth.warn('Failed Discord authentication - invalid code', {
          ip: requestInfo.ip
        });
        return null;
      }
      
      // Get Discord user info
      const userInfo = await this.getDiscordUserInfo(tokenData.access_token);
      
      if (!userInfo) {
        logger.auth.warn('Failed Discord authentication - invalid user info', {
          ip: requestInfo.ip
        });
        return null;
      }
      
      // Authenticate Discord user
      const authResult = await this.authenticateDiscordUser(userInfo);
      
      if (!authResult.success) {
        logger.auth.warn('Failed Discord authentication - user not authenticated', {
          username: userInfo.username,
          ip: requestInfo.ip,
          reason: authResult.message
        });
        return authResult;
      }
      
      // Create a new session
      const session = await this.createSession(authResult.user.user_id, requestInfo);
      
      logger.auth.info('Successful Discord authentication', { 
        userId: authResult.user.user_id,
        username: userInfo.username,
        ip: requestInfo.ip 
      });
      
      return {
        user: authResult.user,
        session
      };
    } catch (error) {
      logger.auth.error('Authentication error with Discord', { 
        error: error.message,
        ip: requestInfo.ip
      });
      return null;
    }
  }
  
  /**
   * Authenticate Discord user (create or get existing)
   * @param {Object} userInfo - Discord user information
   * @returns {Object} - Authentication result
   */
  async authenticateDiscordUser(userInfo) {
    try {
      const auth_id = userInfo.id;
    
      // Check if user exists
      let user = await userModel.getUserByAuthId('discord', auth_id);
      
      if (!user) {
        // Create new Discord user
        const approvalStatus = this.determineApprovalStatus('discord', {
          discord_guild_id: userInfo.guild_id
        });
        
        user = await userModel.createUser({
          username: userInfo.username,
          email: userInfo.email,
          auth_provider: 'discord',
          auth_id: auth_id,
          discord_guild_id: userInfo.guild_id,
          approval_status: approvalStatus
        });
        
        logger.auth.info('New Discord user created', {
          userId: user.user_id,
          username: userInfo.username,
          approvalStatus
        });

        // If pending approval, return early
        if (approvalStatus === 'pending') {
          return {
            success: false,
            user,
            message: 'Account created. Pending approval.'
          };
        }
      } else {
        // Check if existing user is approved
        if (user.approval_status !== 'approved') {
          return {
            success: false,
            error: 'Account pending approval',
            status: user.approval_status
          };
        }
      }
      
      return {
        success: true,
        user
      };
    } catch (error) {
      logger.auth.error('Discord authentication failed', {
        error: error.message,
        auth_id
      });
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }
  
  /**
   * Verify session token
   * @param {string} token - Session token
   * @returns {Object|null} - User object if valid session, null otherwise
   */
  async verifySession(token) {
    try {
      const session = await sessionModel.getSession(token);
      
      if (!session || new Date(session.expires_at) < new Date()) {
        return null;
      }
      
      const user = await userModel.getUserByUserId(session.user_id);
      return user;
    } catch (error) {
      logger.auth.error('Session verification error', { 
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return null;
    }
  }
  
  /**
   * Logout user by invalidating session
   * @param {string} token - Session token
   * @returns {boolean} - True if successful
   */
  async logout(token) {
    try {
      return await sessionModel.deleteSession(token);
    } catch (error) {
      logger.auth.error('Logout error', { 
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return false;
    }
  }
  
  /**
   * Create a new session for user
   * @param {string} userId - User ID
   * @param {Object} requestInfo - Request information
   * @returns {Object} - Session object
   */
  async createSession(userId, requestInfo) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.sessionExpiry);
    
    return await sessionModel.createSession({
      userId,
      token,
      expiresAt,
      ipAddress: requestInfo.ip,
      userAgent: requestInfo.userAgent
    });
  }
  
  /**
   * Verify password against hash
   * @param {string} password - Password to verify
   * @param {string} storedHash - Stored hash
   * @param {string} storedSalt - Salt used for hashing
   * @param {number} iterations - Iterations used for hashing
   * @returns {boolean} - True if valid, false otherwise
   */
  verifyPassword(password, storedHash, storedSalt, iterations = 10000) {
    try {
      // For the first deployment, we might not have a hash yet
      if (!storedHash || !storedSalt) {
        // Direct comparison with environment variable password (legacy)
        const sitePassword = process.env.SITE_PASSWORD || 'toadbox';
        return password === sitePassword;
      }
      
      // Generate hash with the same salt and iterations
      const hash = crypto.pbkdf2Sync(password, storedSalt, iterations, 64, 'sha256').toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
    } catch (error) {
      logger.auth.error('Password verification error', { error: error.message });
      return false;
    }
  }
  
  /**
   * Verify Google OAuth token
   * @param {string} idToken - Google ID token
   * @returns {Object} - User info if valid token
   */
  async verifyGoogleToken(idToken) {
    try {
      const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: {
          id_token: idToken
        }
      });
      
      if (response.data && response.data.sub) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      logger.auth.error('Google token verification error', { error: error.message });
      return null;
    }
  }
  
  /**
   * Get Discord token from auth code
   * @param {string} code - Discord auth code
   * @param {string} redirectUri - Discord redirect URI
   * @returns {Object} - Token data
   */
  async getDiscordToken(code, redirectUri) {
    try {
      const params = new URLSearchParams();
      params.append('client_id', process.env.DISCORD_CLIENT_ID);
      params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      
      const response = await axios.post('https://discord.com/api/oauth2/token', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      return response.data;
    } catch (error) {
      logger.auth.error('Discord token exchange error', { error: error.message });
      return null;
    }
  }
  
  /**
   * Get Discord user info
   * @param {string} accessToken - Discord access token
   * @returns {Object} - User info
   */
  async getDiscordUserInfo(accessToken) {
    try {
      const response = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      logger.auth.error('Discord user info error', { error: error.message });
      return null;
    }
  }
}

module.exports = new AuthService(); 