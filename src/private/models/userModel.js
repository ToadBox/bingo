const crypto = require('crypto');
const database = require('./database');
const logger = require('../utils/logger');
const config = require('../config/constants');
const notificationModel = require('./notificationModel');

class UserModel {
  constructor() {
    // Initialize root admin from environment variables
    this.initRootAdmin();
  }

  /**
   * Create a new user
   * @param {Object} userData - User data object
   * @returns {Object} - Created user
   */
  async createUser(userData) {
    const { username, email, auth_provider, auth_id, password, discord_guild_id } = userData;
    let passwordHash = null;
    let passwordSalt = null;

    // If local auth, hash the password
    if (auth_provider === 'local' && password) {
      const saltResult = this.generateSalt();
      passwordSalt = saltResult.salt;
      passwordHash = this.hashPassword(password, passwordSalt);
    }
    
    // Determine approval status
    let approvalStatus = 'pending';
    if (auth_provider === 'discord' && discord_guild_id && this.isApprovedGuild(discord_guild_id)) {
      approvalStatus = 'approved';
    }
    // Auto-approve admin users
    if (userData.is_admin) {
      approvalStatus = 'approved';
    }
    // Auto-approve anonymous users (site password login)
    if (auth_provider === 'anonymous') {
      approvalStatus = 'approved';
    }

    try {
      const db = database.getDb();
      const result = await db.run(`
        INSERT INTO users (
          username, 
          email, 
          auth_provider, 
          auth_id, 
          password_hash, 
          password_salt, 
          is_admin, 
          approval_status,
          discord_guild_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        username, 
        email, 
        auth_provider, 
        auth_id, 
        passwordHash, 
        passwordSalt, 
        userData.is_admin ? 1 : 0, 
        approvalStatus,
        discord_guild_id
      ]);

      if (result.lastID) {
        logger.info('User created successfully', {
          id: result.lastID,
          username,
          auth_provider,
          approvalStatus
        });
        
        // If user is pending, create notification for admins
        if (approvalStatus === 'pending') {
          await notificationModel.createAdminNotification({
            message: `New user registration: ${username} (${auth_provider})`,
            type: 'user_approval',
            data: {
              userId: result.lastID,
              username,
              email,
              auth_provider
            }
          });
        }
        
        return this.getUserById(result.lastID);
      }
      
      throw new Error('Failed to create user');
    } catch (error) {
      logger.error('User creation failed', {
        error: error.message,
        username,
        auth_provider
      });
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Object|null} - User object or null if not found
   */
  async getUserById(id) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE id = ?
      `, [id]);
      
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by ID', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get user by authentication provider and ID
   * @param {string} provider - Auth provider (e.g., 'google', 'discord', 'local')
   * @param {string} authId - Auth provider ID
   * @returns {Object|null} - User object or null if not found
   */
  async getUserByAuthId(provider, authId) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE auth_provider = ? AND auth_id = ?
      `, [provider, authId]);
      
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by auth ID', {
        error: error.message,
        provider,
        authId
      });
      return null;
    }
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Object|null} - User object or null if not found
   */
  async getUserByEmail(email) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE email = ?
      `, [email]);
      
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by email', {
        error: error.message,
        email
      });
      return null;
    }
  }

  /**
   * Validate user credentials for local authentication
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Object|null} - User object if valid, null otherwise
   */
  async validateCredentials(email, password) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT id, username, email, password_hash, password_salt, is_admin
        FROM users WHERE email = ? AND auth_provider = 'local'
      `, [email]);
      
      if (!user) {
        return null;
      }
      
      const hashedPassword = this.hashPassword(password, user.password_salt);
      
      if (hashedPassword === user.password_hash) {
        // Update last login time
        await this.updateLastLogin(user.id);
        
        // Return user without sensitive fields
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to validate credentials', {
        error: error.message,
        email
      });
      return null;
    }
  }

  /**
   * Update user's last login time
   * @param {number} userId - User ID
   * @returns {boolean} - Success status
   */
  async updateLastLogin(userId) {
    try {
      const db = database.getDb();
      await db.run(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
      `, [userId]);
      
      return true;
    } catch (error) {
      logger.error('Failed to update last login time', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Generate a random salt for password hashing
   * @returns {Object} - Object containing the salt
   */
  generateSalt() {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt };
  }

  /**
   * Hash a password with the provided salt
   * @param {string} password - Plain text password
   * @param {string} salt - Password salt
   * @returns {string} - Hashed password
   */
  hashPassword(password, salt) {
    const iterations = 10000;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
    return hash;
  }

  /**
   * Create anonymous user
   * @param {string} username - Username
   * @returns {Object} - Created user
   */
  async createAnonymousUser(username) {
    const anonymousId = crypto.randomBytes(16).toString('hex');
    
    try {
      return await this.createUser({
        username: username || `Anonymous-${anonymousId.substring(0, 8)}`,
        auth_provider: 'anonymous',
        auth_id: anonymousId
      });
    } catch (error) {
      logger.error('Failed to create anonymous user', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize root admin account from environment variables
   */
  async initRootAdmin() {
    try {
      const rootUsername = process.env.ROOT_ADMIN_USERNAME;
      const rootPassword = process.env.ROOT_ADMIN_PASSWORD;
      
      if (!rootUsername || !rootPassword) {
        logger.warn('Root admin credentials not defined in environment variables');
        return;
      }
      
      // Check if admin user exists
      const existingAdmin = await this.getUserByAuthId('local', rootUsername);
      
      if (!existingAdmin) {
        // Create root admin user
        await this.createUser({
          username: rootUsername,
          email: process.env.ROOT_ADMIN_EMAIL || `${rootUsername}@localhost`,
          auth_provider: 'local',
          auth_id: rootUsername,
          password: rootPassword,
          is_admin: 1
        });
        
        logger.info('Root admin user created');
      } else {
        logger.debug('Root admin user already exists');
      }
    } catch (error) {
      logger.error('Failed to initialize root admin', {
        error: error.message
      });
    }
  }

  /**
   * Check if a Discord guild is in the approved list
   * @param {string} guildId - Discord guild ID
   * @returns {boolean} - True if approved
   */
  isApprovedGuild(guildId) {
    const approvedGuilds = process.env.APPROVED_DISCORD_GUILDS 
      ? process.env.APPROVED_DISCORD_GUILDS.split(',') 
      : [];
      
    return approvedGuilds.includes(guildId);
  }

  /**
   * Get pending users awaiting approval
   * @param {Object} options - Query options
   * @returns {Array} - Array of user objects
   */
  async getPendingUsers(options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    try {
      const db = database.getDb();
      const users = await db.all(`
        SELECT id, username, email, auth_provider, created_at
        FROM users 
        WHERE approval_status = 'pending'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
      
      return users;
    } catch (error) {
      logger.error('Failed to get pending users', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Approve a user
   * @param {number} userId - User ID
   * @returns {boolean} - Success status
   */
  async approveUser(userId) {
    try {
      const db = database.getDb();
      const user = await this.getUserById(userId);
      
      if (!user) {
        return false;
      }
      
      const result = await db.run(`
        UPDATE users
        SET approval_status = 'approved'
        WHERE id = ?
      `, [userId]);
      
      if (result.changes > 0) {
        // Create notification for the approved user
        await notificationModel.createNotification({
          userId,
          message: 'Your account has been approved! You now have full access to the site.',
          type: 'account_approved',
          data: {
            approvalDate: new Date().toISOString()
          }
        });
        
        logger.info('User approved', { userId, username: user.username });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to approve user', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Reject a user
   * @param {number} userId - User ID
   * @returns {boolean} - Success status
   */
  async rejectUser(userId) {
    try {
      const db = database.getDb();
      const user = await this.getUserById(userId);
      
      if (!user) {
        return false;
      }
      
      const result = await db.run(`
        UPDATE users
        SET approval_status = 'rejected'
        WHERE id = ?
      `, [userId]);
      
      if (result.changes > 0) {
        // Create notification for the rejected user
        await notificationModel.createNotification({
          userId,
          message: 'Your account registration has been rejected.',
          type: 'account_rejected',
          data: {
            rejectionDate: new Date().toISOString()
          }
        });
        
        logger.info('User rejected', { userId, username: user.username });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to reject user', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Check if user is approved
   * @param {number} userId - User ID
   * @returns {boolean} - True if approved
   */
  async isApproved(userId) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT approval_status
        FROM users
        WHERE id = ?
      `, [userId]);
      
      return user && user.approval_status === 'approved';
    } catch (error) {
      logger.error('Failed to check user approval status', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Get user approval status
   * @param {number} userId - User ID
   * @returns {string|null} - Approval status or null if user not found
   */
  async getUserApprovalStatus(userId) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT approval_status
        FROM users
        WHERE id = ?
      `, [userId]);
      
      return user ? user.approval_status : null;
    } catch (error) {
      logger.error('Failed to get user approval status', {
        error: error.message,
        userId
      });
      return null;
    }
  }
}

module.exports = new UserModel(); 