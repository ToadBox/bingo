const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.db = null;
    this.dataDir = path.join(__dirname, '../../data');
    this.dbPath = path.join(this.dataDir, 'bingo.sqlite');
  }

  async initialize() {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Open database connection
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
      
      logger.info('Database connection established', { path: this.dbPath });
      
      // Enable foreign keys
      await this.db.exec('PRAGMA foreign_keys = ON');
      
      // Create tables if they don't exist
      await this.createTables();
      
      return true;
    } catch (error) {
      logger.error('Database initialization failed', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async createTables() {
    try {
      // Users table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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

      // Boards table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_public BOOLEAN DEFAULT 0,
          description TEXT,
          settings TEXT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);

      // Cells table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS cells (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER NOT NULL,
          row INTEGER NOT NULL,
          col INTEGER NOT NULL,
          value TEXT,
          type TEXT DEFAULT 'text',
          marked BOOLEAN DEFAULT 0,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_by INTEGER,
          FOREIGN KEY (board_id) REFERENCES boards(id),
          FOREIGN KEY (updated_by) REFERENCES users(id),
          UNIQUE(board_id, row, col)
        )
      `);

      // Cell history table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS cell_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cell_id INTEGER NOT NULL,
          value TEXT,
          type TEXT,
          marked BOOLEAN,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER,
          FOREIGN KEY (cell_id) REFERENCES cells(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);

      // Board chat table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS board_chat (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER NOT NULL,
          user_id INTEGER,
          message TEXT NOT NULL,
          command TEXT,
          mentions TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (board_id) REFERENCES boards(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Board members table (for access control and notifications)
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS board_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          role TEXT DEFAULT 'viewer',
          notifications_enabled BOOLEAN DEFAULT 1,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_viewed TIMESTAMP,
          FOREIGN KEY (board_id) REFERENCES boards(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(board_id, user_id)
        )
      `);

      // Board settings table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS board_settings (
          board_id INTEGER PRIMARY KEY,
          chat_enabled BOOLEAN DEFAULT 1,
          mention_notifications BOOLEAN DEFAULT 1,
          edit_notifications BOOLEAN DEFAULT 1,
          public_chat BOOLEAN DEFAULT 1,
          require_approval BOOLEAN DEFAULT 0,
          settings TEXT,
          FOREIGN KEY (board_id) REFERENCES boards(id)
        )
      `);

      // Sessions table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          token TEXT UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ip_address TEXT,
          user_agent TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Notifications table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          message TEXT NOT NULL,
          type TEXT NOT NULL,
          is_read BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          data TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      logger.info('Database tables created successfully');
    } catch (error) {
      logger.error('Failed to create database tables', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      logger.info('Database connection closed');
    }
  }

  // Helper method to get the database instance
  getDb() {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // Transaction helper
  async transaction(callback) {
    try {
      await this.db.exec('BEGIN TRANSACTION');
      const result = await callback(this.db);
      await this.db.exec('COMMIT');
      return result;
    } catch (error) {
      await this.db.exec('ROLLBACK');
      logger.error('Transaction failed', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }
}

// Create and export a singleton instance
const database = new Database();
module.exports = database; 