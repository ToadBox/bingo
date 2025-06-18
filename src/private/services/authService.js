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
    
    logger.info('Site password hash initialized');
  }
  
  /**
   * Authenticate with site password
   * @param {string} password - Site password
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Session info if authenticated, null otherwise
   */
  async authenticateWithPassword(password, requestInfo) {
    try {
      // Verify the password using the stored hash
      const isValid = this.verifyPassword(
        password,
        this.passwordData.hash,
        this.passwordData.salt,
        this.passwordData.iterations
      );
      
      if (!isValid) {
        logger.warn('Failed site password authentication attempt', { ip: requestInfo.ip });
        return null;
      }
      
      // Create anonymous user for this session
      const anonymousUser = await userModel.createAnonymousUser('Anonymous User');
      
      // Create a new session
      const session = await this.createSession(anonymousUser.id, requestInfo);
      
      logger.info('Successful site password authentication', { 
        userId: anonymousUser.id,
        ip: requestInfo.ip 
      });
      
      return {
        user: anonymousUser,
        session
      };
    } catch (error) {
      logger.error('Authentication error with site password', { 
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
        logger.warn('Failed local authentication attempt', { 
          email,
          ip: requestInfo.ip 
        });
        return null;
      }
      
      // Create a new session
      const session = await this.createSession(user.id, requestInfo);
      
      logger.info('Successful local authentication', { 
        userId: user.id,
        email,
        ip: requestInfo.ip 
      });
      
      return {
        user,
        session
      };
    } catch (error) {
      logger.error('Authentication error with local credentials', { 
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
        logger.warn('Failed Google authentication - invalid token', {
          ip: requestInfo.ip
        });
        return null;
      }
      
      // Check if user exists
      let user = await userModel.getUserByAuthId('google', userInfo.sub);
      
      // Create user if they don't exist
      if (!user) {
        user = await userModel.createUser({
          username: userInfo.name || userInfo.email.split('@')[0],
          email: userInfo.email,
          auth_provider: 'google',
          auth_id: userInfo.sub
        });
        
        logger.info('New Google user created', { 
          userId: user.id,
          email: userInfo.email 
        });
      }
      
      // Create a new session
      const session = await this.createSession(user.id, requestInfo);
      
      logger.info('Successful Google authentication', { 
        userId: user.id,
        email: userInfo.email,
        ip: requestInfo.ip 
      });
      
      return {
        user,
        session
      };
    } catch (error) {
      logger.error('Authentication error with Google', { 
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
        logger.warn('Failed Discord authentication - invalid code', {
          ip: requestInfo.ip
        });
        return null;
      }
      
      // Get Discord user info
      const userInfo = await this.getDiscordUserInfo(tokenData.access_token);
      
      if (!userInfo || !userInfo.id) {
        logger.warn('Failed Discord authentication - invalid user info', {
          ip: requestInfo.ip
        });
        return null;
      }
      
      // Check if user exists
      let user = await userModel.getUserByAuthId('discord', userInfo.id);
      
      // Create user if they don't exist
      if (!user) {
        user = await userModel.createUser({
          username: userInfo.username,
          email: userInfo.email,
          auth_provider: 'discord',
          auth_id: userInfo.id
        });
        
        logger.info('New Discord user created', { 
          userId: user.id,
          discordId: userInfo.id,
          username: userInfo.username
        });
      }
      
      // Create a new session
      const session = await this.createSession(user.id, requestInfo);
      
      logger.info('Successful Discord authentication', { 
        userId: user.id,
        discordId: userInfo.id,
        ip: requestInfo.ip 
      });
      
      return {
        user,
        session
      };
    } catch (error) {
      logger.error('Authentication error with Discord', { 
        error: error.message,
        ip: requestInfo.ip
      });
      return null;
    }
  }
  
  /**
   * Authenticate a Discord user
   * @param {Object} userData - User data from Discord
   * @returns {Object} - Session token and user object
   */
  async authenticateDiscordUser(userData) {
    const { username, email, auth_id, discord_guild_id } = userData;
    
    try {
      // Check if user exists by auth provider + auth ID
      let user = await userModel.getUserByAuthId('discord', auth_id);
      
      if (user) {
        // Update existing user with new guild info
        const db = database.getDb();
        await db.run(`
          UPDATE users
          SET discord_guild_id = ?, last_login = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [discord_guild_id, user.id]);
        
        // Get updated user info
        user = await userModel.getUserById(user.id);
        
        // Check if user is in approved guild and needs approval update
        if (user.approval_status === 'pending' && this.isInApprovedGuild(discord_guild_id)) {
          await userModel.approveUser(user.id);
          // Get user with updated approval status
          user = await userModel.getUserById(user.id);
        }
      } else {
        // Create new user
        user = await userModel.createUser({
          username,
          email,
          auth_provider: 'discord',
          auth_id,
          discord_guild_id
        });
      }
      
      // Create session for the user
      const sessionToken = await sessionModel.createSession(user.id);
      
      return {
        sessionToken,
        user
      };
    } catch (error) {
      logger.error('Discord authentication failed', {
        error: error.message,
        auth_id
      });
      throw error;
    }
  }
  
  /**
   * Check if user is in an approved Discord guild
   * @param {string} guildIds - Comma-separated Discord guild IDs
   * @returns {boolean} - True if in approved guild
   */
  isInApprovedGuild(guildIds) {
    if (!guildIds) return false;
    
    const userGuilds = guildIds.split(',');
    const approvedGuilds = process.env.APPROVED_DISCORD_GUILDS 
      ? process.env.APPROVED_DISCORD_GUILDS.split(',') 
      : [];
      
    // Check if user is in any approved guild
    return userGuilds.some(guildId => approvedGuilds.includes(guildId));
  }
  
  /**
   * Verify a session token
   * @param {string} token - Session token
   * @returns {Object} - User info if valid session, null otherwise
   */
  async verifySession(token) {
    try {
      // Get session
      const session = await sessionModel.getSessionByToken(token);
      
      if (!session) {
        return null;
      }
      
      // Get user
      const user = await userModel.getUserById(session.user_id);
      
      if (!user) {
        await sessionModel.deleteSession(token);
        return null;
      }
      
      // Extend session expiry
      await sessionModel.extendSession(token);
      
      return user;
    } catch (error) {
      logger.error('Session verification error', { 
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return null;
    }
  }
  
  /**
   * End a session
   * @param {string} token - Session token
   * @returns {boolean} - Success status
   */
  async logout(token) {
    try {
      return await sessionModel.deleteSession(token);
    } catch (error) {
      logger.error('Logout error', { 
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return false;
    }
  }
  
  /**
   * Create a new session
   * @param {number} userId - User ID
   * @param {Object} requestInfo - Request information including IP and user agent
   * @returns {Object} - Created session
   */
  async createSession(userId, requestInfo) {
    return await sessionModel.createSession({
      userId,
      ipAddress: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      expiresIn: this.sessionExpiry
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
      logger.error('Password verification error', { error: error.message });
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
      logger.error('Google token verification error', { error: error.message });
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
      logger.error('Discord token exchange error', { error: error.message });
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
      logger.error('Discord user info error', { error: error.message });
      return null;
    }
  }
}

module.exports = new AuthService(); 