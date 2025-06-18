const crypto = require('crypto');
const database = require('./database');
const logger = require('../utils/logger');

class SessionModel {
  constructor() {
    this.defaultExpiryTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Create a new session
   * @param {Object} sessionData - Session data
   * @returns {Object} - Created session with token
   */
  async createSession(sessionData) {
    const { userId, ipAddress, userAgent, expiresIn } = sessionData;
    const token = crypto.randomBytes(32).toString('hex');
    const expiryMs = expiresIn || this.defaultExpiryTime;
    
    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + expiryMs);
    
    try {
      const db = database.getDb();
      const result = await db.run(`
        INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, token, expiresAt.toISOString(), ipAddress, userAgent]);
      
      if (!result.lastID) {
        throw new Error('Failed to create session');
      }
      
      logger.debug('Session created', {
        userId,
        sessionId: result.lastID,
        expiresAt: expiresAt.toISOString()
      });
      
      return {
        id: result.lastID,
        userId,
        token,
        expiresAt
      };
    } catch (error) {
      logger.error('Failed to create session', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get session by token
   * @param {string} token - Session token
   * @returns {Object|null} - Session object or null if not found or expired
   */
  async getSessionByToken(token) {
    try {
      const db = database.getDb();
      const session = await db.get(`
        SELECT id, user_id, token, expires_at, created_at, ip_address, user_agent
        FROM sessions
        WHERE token = ?
      `, [token]);
      
      if (!session) {
        return null;
      }
      
      // Check if session is expired
      const expiresAt = new Date(session.expires_at);
      if (expiresAt < new Date()) {
        // Delete expired session
        await this.deleteSession(token);
        return null;
      }
      
      return session;
    } catch (error) {
      logger.error('Failed to get session by token', {
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return null;
    }
  }

  /**
   * Get all sessions for a user
   * @param {number} userId - User ID
   * @returns {Array} - Array of session objects
   */
  async getUserSessions(userId) {
    try {
      const db = database.getDb();
      const sessions = await db.all(`
        SELECT id, user_id, expires_at, created_at, ip_address, user_agent
        FROM sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [userId]);
      
      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', {
        error: error.message,
        userId
      });
      return [];
    }
  }

  /**
   * Extend session expiry time
   * @param {string} token - Session token
   * @param {number} expiryMs - Milliseconds to extend session by
   * @returns {boolean} - Success status
   */
  async extendSession(token, expiryMs = null) {
    const extensionTime = expiryMs || this.defaultExpiryTime;
    const expiresAt = new Date(Date.now() + extensionTime);
    
    try {
      const db = database.getDb();
      const result = await db.run(`
        UPDATE sessions
        SET expires_at = ?
        WHERE token = ?
      `, [expiresAt.toISOString(), token]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to extend session', {
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return false;
    }
  }

  /**
   * Delete session by token
   * @param {string} token - Session token
   * @returns {boolean} - Success status
   */
  async deleteSession(token) {
    try {
      const db = database.getDb();
      const result = await db.run(`
        DELETE FROM sessions
        WHERE token = ?
      `, [token]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete session', {
        error: error.message,
        tokenLength: token ? token.length : 0
      });
      return false;
    }
  }

  /**
   * Delete all sessions for a user
   * @param {number} userId - User ID
   * @returns {boolean} - Success status
   */
  async deleteUserSessions(userId) {
    try {
      const db = database.getDb();
      const result = await db.run(`
        DELETE FROM sessions
        WHERE user_id = ?
      `, [userId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete user sessions', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Clean up expired sessions
   * @returns {number} - Number of deleted sessions
   */
  async cleanupExpiredSessions() {
    try {
      const db = database.getDb();
      const result = await db.run(`
        DELETE FROM sessions
        WHERE expires_at < CURRENT_TIMESTAMP
      `);
      
      logger.debug('Cleaned up expired sessions', {
        count: result.changes
      });
      
      return result.changes;
    } catch (error) {
      logger.error('Failed to clean up expired sessions', {
        error: error.message
      });
      return 0;
    }
  }
}

module.exports = new SessionModel(); 