const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const logger = require('./logger');
const database = require('../models/database');
const boardModel = require('../models/boardModel');
const constants = require('../config/constants');
const SlugGenerator = require('./slugGenerator');
const configLoader = require('./configLoader');
const crypto = require('crypto');

// Boards directory path
const BOARDS_DIR = constants.BOARDS_DIR;

class MigrationManager {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generate a random 8-character user ID
   * @returns {string} - Random user ID
   */
  generateUserId() {
    // Use crypto.randomBytes for cryptographically secure random generation
    // Convert to base36 (0-9, a-z) for readability
    const buffer = crypto.randomBytes(6); // 6 bytes = 48 bits
    return buffer.toString('base64')
      .replace(/[+/=]/g, '') // Remove special chars
      .substring(0, 8)
      .toLowerCase();
  }

  /**
   * Check if user ID already exists
   * @param {string} userId - User ID to check
   * @returns {boolean} - True if exists
   */
  async userIdExists(userId) {
    try {
      const db = this.db.getDb();
      const result = await db.get('SELECT user_id FROM users WHERE user_id = ?', [userId]);
      return !!result;
    } catch (error) {
      logger.database.error('Error checking user ID existence', { error: error.message });
      return false;
    }
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
   * Migration: Add user_id column and populate with random IDs
   */
  async migrateToRandomUserIds() {
    try {
      const db = this.db.getDb();
      
      logger.database.info('Starting user ID migration...');
      
      // Check if migration already completed
      const columns = await db.all("PRAGMA table_info(users)");
      const hasUserId = columns.some(col => col.name === 'user_id');
      
      if (hasUserId) {
        logger.database.info('User ID migration already completed');
        return;
      }

      // Add user_id column
      await db.exec('ALTER TABLE users ADD COLUMN user_id TEXT UNIQUE');
      
      // Get all existing users
      const users = await db.all('SELECT id FROM users');
      
      logger.database.info(`Migrating ${users.length} users to random IDs`);

      // Generate random IDs for existing users
      for (const user of users) {
        const randomUserId = await this.generateUniqueUserId();
        await db.run('UPDATE users SET user_id = ? WHERE id = ?', [randomUserId, user.id]);
        
        logger.database.debug('Migrated user', { 
          oldId: user.id, 
          newUserId: randomUserId 
        });
      }

      // Make user_id NOT NULL after populating
      await db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          email TEXT UNIQUE,
          auth_provider TEXT, 
          auth_id TEXT,
          password_hash TEXT,
          password_salt TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP,
          is_admin BOOLEAN DEFAULT 0,
          approval_status TEXT DEFAULT 'pending',
          discord_guild_id TEXT,
          UNIQUE(auth_provider, auth_id)
        )
      `);

      // Copy data to new table
      await db.exec(`
        INSERT INTO users_new 
        SELECT id, user_id, username, email, auth_provider, auth_id, 
               password_hash, password_salt, created_at, last_login, 
               is_admin, approval_status, discord_guild_id
        FROM users
      `);

      // Replace old table
      await db.exec('DROP TABLE users');
      await db.exec('ALTER TABLE users_new RENAME TO users');

      logger.database.info('User ID migration completed successfully');
      
    } catch (error) {
      logger.database.error('User ID migration failed', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
          try {
      logger.database.info('Running database migrations...');
      
      await this.migrateToRandomUserIds();
      
      logger.database.info('All migrations completed successfully');
    } catch (error) {
      logger.database.error('Migration failed', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }
}

module.exports = MigrationManager; 