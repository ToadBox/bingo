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
   * Generate a random 8-character user ID
   * @returns {string} - Random user ID
   */
  generateUserId() {
    const buffer = crypto.randomBytes(6);
    return buffer.toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 8)
      .toLowerCase();
  }

  /**
   * Generate a unique user ID
   * @returns {string} - Unique user ID
   */
  async generateUniqueUserId() {
    let userId;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      userId = this.generateUserId();
      attempts++;
      
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique user ID after maximum attempts');
      }
    } while (await this.userIdExists(userId));

    return userId;
  }

  /**
   * Check if user ID already exists
   * @param {string} userId - User ID to check
   * @returns {boolean} - True if exists
   */
  async userIdExists(userId) {
    try {
      const db = database.getDb();
      const result = await db.get('SELECT user_id FROM users WHERE user_id = ?', [userId]);
      return !!result;
    } catch (error) {
      logger.user.error('Error checking user ID existence', { error: error.message });
      return false;
    }
  }

  /**
   * Create a new user
   * @param {Object} userData - User data object
   * @returns {Object} - Created user
   */
  async createUser(userData) {
    const { username, email, auth_provider, auth_id, password, discord_guild_id, approval_status } = userData;
    let passwordHash = null;
    let passwordSalt = null;

    // Generate unique user ID
    const userId = await this.generateUniqueUserId();

    // If local auth, hash the password
    if (auth_provider === 'local' && password) {
      const saltResult = this.generateSalt();
      passwordSalt = saltResult.salt;
      passwordHash = this.hashPassword(password, passwordSalt);
    }
    
    // Use provided approval status or determine it
    let finalApprovalStatus = approval_status || 'pending';
    
    // Auto-approve admin users
    if (userData.is_admin) {
      finalApprovalStatus = 'approved';
    }
    
    // Auto-approve anonymous users (site password login)
    if (auth_provider === 'anonymous') {
      finalApprovalStatus = 'approved';
    }

    try {
      const db = database.getDb();
      const result = await db.run(`
        INSERT INTO users (
          user_id,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        username, 
        email, 
        auth_provider, 
        auth_id, 
        passwordHash, 
        passwordSalt, 
        userData.is_admin ? 1 : 0, 
        finalApprovalStatus,
        discord_guild_id
      ]);

      if (result.lastID) {
        logger.user.info('User created successfully', {
          userId,
          username,
          auth_provider,
          approvalStatus: finalApprovalStatus
        });
        
        // If user is pending, create notification for admins
        if (finalApprovalStatus === 'pending') {
          await notificationModel.createAdminNotification({
            message: `New user registration: ${username} (${auth_provider})`,
            type: 'user_approval',
            data: {
              userId,
              username,
              email,
              auth_provider
            }
          });
        }
        
        return this.getUserByUserId(userId);
      }
      
      throw new Error('Failed to create user');
    } catch (error) {
      logger.user.error('User creation failed', {
        error: error.message,
        username,
        auth_provider
      });
      throw error;
    }
  }

  /**
   * Get user by user_id (random ID)
   * @param {string} userId - User ID
   * @returns {Object|null} - User object or null if not found
   */
  async getUserByUserId(userId) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT user_id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE user_id = ?
      `, [userId]);
      
      return user || null;
    } catch (error) {
      logger.user.error('Failed to get user by user ID', {
        error: error.message,
        userId
      });
      return null;
    }
  }

  /**
   * Get user by legacy ID (for backward compatibility during migration)
   * @param {number} id - Legacy user ID
   * @returns {Object|null} - User object or null if not found
   */
  async getUserById(id) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT user_id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE id = ?
      `, [id]);
      
      return user || null;
    } catch (error) {
      logger.user.error('Failed to get user by legacy ID', {
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
        SELECT user_id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE auth_provider = ? AND auth_id = ?
      `, [provider, authId]);
      
      return user || null;
    } catch (error) {
      logger.user.error('Failed to get user by auth ID', {
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
        SELECT user_id, username, email, auth_provider, created_at, last_login, is_admin, approval_status
        FROM users WHERE email = ?
      `, [email]);
      
      return user || null;
    } catch (error) {
      logger.user.error('Failed to get user by email', {
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
        SELECT user_id, username, email, password_hash, password_salt, is_admin, approval_status
        FROM users WHERE email = ? AND auth_provider = 'local'
      `, [email]);
      
      if (!user) {
        return null;
      }
      
      const hashedPassword = this.hashPassword(password, user.password_salt);
      
      if (hashedPassword === user.password_hash) {
        // Update last login time
        await this.updateLastLogin(user.user_id);
        
        // Return user without sensitive data
        const { password_hash, password_salt, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
      
      return null;
    } catch (error) {
      logger.user.error('Failed to validate credentials', {
        error: error.message,
        email
      });
      return null;
    }
  }

  /**
   * Update user's last login time
   * @param {string} userId - User ID
   * @returns {boolean} - Success status
   */
  async updateLastLogin(userId) {
    try {
      const db = database.getDb();
      await db.run(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?
      `, [userId]);
      
      return true;
    } catch (error) {
      logger.user.error('Failed to update last login time', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Generate salt for password hashing
   * @returns {Object} - Salt object
   */
  generateSalt() {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt };
  }

  /**
   * Hash password with salt
   * @param {string} password - Password to hash
   * @param {string} salt - Salt for hashing
   * @returns {string} - Hashed password
   */
  hashPassword(password, salt) {
    const iterations = 10000;
    return crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
  }

  /**
   * Create anonymous user for site password access
   * @param {string} username - Username for anonymous user
   * @returns {Object} - Created anonymous user
   */
  async createAnonymousUser(username) {
    try {
      return await this.createUser({
        username: username || 'Anonymous',
        auth_provider: 'anonymous',
        approval_status: 'approved'
      });
    } catch (error) {
      logger.user.error('Failed to create anonymous user', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize root admin user from environment variables
   */
  async initRootAdmin() {
    try {
      const rootUsername = process.env.ROOT_ADMIN_USERNAME;
      const rootPassword = process.env.ROOT_ADMIN_PASSWORD;
      
      if (!rootUsername || !rootPassword) {
        logger.user.warn('Root admin credentials not defined in environment variables');
        return;
      }
      
      // Check if root admin already exists
      const existingAdmin = await this.getUserByEmail(rootUsername);
      
      if (!existingAdmin) {
        // Create root admin user
        await this.createUser({
          username: 'Root Admin',
          email: rootUsername,
          auth_provider: 'local',
          auth_id: rootUsername,
          password: rootPassword,
          is_admin: true,
          approval_status: 'approved'
        });
        
        logger.user.info('Root admin user created');
      } else {
        logger.user.debug('Root admin user already exists');
      }
    } catch (error) {
      logger.user.error('Failed to initialize root admin', {
        error: error.message
      });
    }
  }

  /**
   * Check if Discord guild is approved
   * @param {string} guildId - Discord guild ID
   * @returns {boolean} - True if approved
   */
  isApprovedGuild(guildId) {
    const approvedGuilds = process.env.DISCORD_APPROVED_GUILDS?.split(',') || [];
    return approvedGuilds.includes(guildId);
  }

  /**
   * Get pending users awaiting approval
   * @param {Object} options - Query options
   * @returns {Array} - List of pending users
   */
  async getPendingUsers(options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    try {
      const db = database.getDb();
      const users = await db.all(`
        SELECT user_id, username, email, auth_provider, created_at, discord_guild_id
        FROM users 
        WHERE approval_status = 'pending'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
      
      return users;
    } catch (error) {
      logger.user.error('Failed to get pending users', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Approve a user
   * @param {string} userId - User ID to approve
   * @returns {boolean} - Success status
   */
  async approveUser(userId) {
    try {
      const db = database.getDb();
      
      // Get user first to check if exists
      const user = await this.getUserByUserId(userId);
      if (!user) {
        return false;
      }
      
      // Update approval status
      await db.run(`
        UPDATE users SET approval_status = 'approved' WHERE user_id = ?
      `, [userId]);
      
      // Create notification for the user
        await notificationModel.createNotification({
        userId: userId,
        message: 'Your account has been approved! You can now log in.',
          type: 'account_approved',
          data: {
          approvedAt: new Date().toISOString()
          }
        });
        
      logger.user.info('User approved', { userId, username: user.username });
        return true;
    } catch (error) {
      logger.user.error('Failed to approve user', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Reject a user
   * @param {string} userId - User ID to reject
   * @returns {boolean} - Success status
   */
  async rejectUser(userId) {
    try {
      const db = database.getDb();
      
      // Get user first to check if exists
      const user = await this.getUserByUserId(userId);
      if (!user) {
        return false;
      }
      
      // Update approval status
      await db.run(`
        UPDATE users SET approval_status = 'rejected' WHERE user_id = ?
      `, [userId]);
      
      // Create notification for the user
        await notificationModel.createNotification({
        userId: userId,
          message: 'Your account registration has been rejected.',
          type: 'account_rejected',
          data: {
          rejectedAt: new Date().toISOString()
          }
        });
        
      logger.user.info('User rejected', { userId, username: user.username });
        return true;
    } catch (error) {
      logger.user.error('Failed to reject user', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Check if user is approved
   * @param {string} userId - User ID
   * @returns {boolean} - True if approved
   */
  async isApproved(userId) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT approval_status FROM users WHERE user_id = ?
      `, [userId]);
      
      return user && user.approval_status === 'approved';
    } catch (error) {
      logger.user.error('Failed to check user approval status', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Get user approval status
   * @param {string} userId - User ID
   * @returns {string|null} - Approval status or null if not found
   */
  async getUserApprovalStatus(userId) {
    try {
      const db = database.getDb();
      const user = await db.get(`
        SELECT approval_status FROM users WHERE user_id = ?
      `, [userId]);
      
      return user ? user.approval_status : null;
    } catch (error) {
      logger.user.error('Failed to get user approval status', {
        error: error.message,
        userId
      });
      return null;
    }
  }
}

module.exports = new UserModel(); 