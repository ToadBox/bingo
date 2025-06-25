const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const logger = require('./logger');
const database = require('../models/database');
const boardModel = require('../models/boardModel');
const constants = require('../config/constants');
const SlugGenerator = require('./slugGenerator');
const configLoader = require('./configLoader');

// Boards directory path
const BOARDS_DIR = constants.BOARDS_DIR;

class Migrations {
  constructor() {
    this.migrations = [
      {
        version: 1,
        name: 'add_slug_to_boards',
        description: 'Add slug field to boards table and populate for existing boards',
        up: this.addSlugToBoards.bind(this)
      }
    ];
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    try {
      const db = database.getDb();
      
      // Create migrations table if it doesn't exist
      await db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get applied migrations
      const appliedMigrations = await db.all('SELECT version FROM migrations ORDER BY version');
      const appliedVersions = appliedMigrations.map(m => m.version);

      // Run pending migrations
      for (const migration of this.migrations) {
        if (!appliedVersions.includes(migration.version)) {
          logger.info('Running migration', {
            version: migration.version,
            name: migration.name,
            description: migration.description
          });

          await migration.up();

          // Record migration as applied
          await db.run(`
            INSERT INTO migrations (version, name, description)
            VALUES (?, ?, ?)
          `, [migration.version, migration.name, migration.description]);

          logger.info('Migration completed successfully', {
            version: migration.version,
            name: migration.name
          });
        }
      }

      logger.info('All migrations completed');
    } catch (error) {
      logger.error('Migration failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Migration 1: Add slug field to boards table
   */
  async addSlugToBoards() {
    const db = database.getDb();
    
    return await database.transaction(async (db) => {
      // Check if slug column already exists
      const tableInfo = await db.all("PRAGMA table_info(boards)");
      const hasSlugColumn = tableInfo.some(column => column.name === 'slug');
      
      if (!hasSlugColumn) {
        // Add slug column
        await db.exec('ALTER TABLE boards ADD COLUMN slug TEXT');
        logger.info('Added slug column to boards table');
      }

      // Get all boards without slugs
      const boardsWithoutSlugs = await db.all(`
        SELECT id, uuid, title, created_by FROM boards 
        WHERE slug IS NULL OR slug = ''
      `);

      if (boardsWithoutSlugs.length > 0) {
        logger.info('Generating slugs for existing boards', {
          count: boardsWithoutSlugs.length
        });

        // Get server username from config
        const config = configLoader.loadConfig();
        const serverUsername = config.site?.serverUsername || 'server';

        for (const board of boardsWithoutSlugs) {
          try {
            // Check if this is a server board (no created_by or created_by is null)
            const isServerBoard = !board.created_by;
            
            let slug;
            if (isServerBoard) {
              // Generate server slug
              slug = SlugGenerator.generateServerSlug(board.title, serverUsername);
            } else {
              // Generate regular slug
              slug = SlugGenerator.generateSlug(board.title);
            }

            // Ensure slug is unique for this user
            const checkSlugExists = async (testSlug) => {
              const existing = await db.get(`
                SELECT id FROM boards 
                WHERE slug = ? AND created_by = ? AND id != ?
              `, [testSlug, board.created_by, board.id]);
              return !!existing;
            };

            // Generate unique slug
            const uniqueSlug = await SlugGenerator.generateUniqueSlug(
              board.title, 
              checkSlugExists
            );

            // Update board with slug
            await db.run(`
              UPDATE boards SET slug = ? WHERE id = ?
            `, [uniqueSlug, board.id]);

            logger.debug('Generated slug for board', {
              boardId: board.id,
              title: board.title,
              slug: uniqueSlug,
              isServerBoard
            });
          } catch (error) {
            logger.error('Failed to generate slug for board', {
              boardId: board.id,
              title: board.title,
              error: error.message
            });
            
            // Use fallback slug
            const fallbackSlug = `board-${board.id}`;
            await db.run(`
              UPDATE boards SET slug = ? WHERE id = ?
            `, [fallbackSlug, board.id]);
          }
        }
      }

      // Add unique constraint for user-slug combination
      try {
        // First check if the index already exists
        const indexes = await db.all(`
          SELECT name FROM sqlite_master 
          WHERE type='index' AND tbl_name='boards' AND name='idx_boards_user_slug'
        `);

        if (indexes.length === 0) {
          await db.exec(`
            CREATE UNIQUE INDEX idx_boards_user_slug 
            ON boards(created_by, slug)
          `);
          logger.info('Created unique index for user-slug combination');
        }
      } catch (error) {
        // Index might already exist or there might be duplicate slugs
        logger.warn('Could not create unique index for user-slug combination', {
          error: error.message
        });
      }
    });
  }

  /**
   * Get migration status
   */
  async getMigrationStatus() {
    try {
      const db = database.getDb();
      
      // Check if migrations table exists
      const tableExists = await db.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `);

      if (!tableExists) {
        return {
          migrationsTableExists: false,
          appliedMigrations: [],
          pendingMigrations: this.migrations
        };
      }

      const appliedMigrations = await db.all(`
        SELECT version, name, description, applied_at 
        FROM migrations 
        ORDER BY version
      `);

      const appliedVersions = appliedMigrations.map(m => m.version);
      const pendingMigrations = this.migrations.filter(m => 
        !appliedVersions.includes(m.version)
      );

      return {
        migrationsTableExists: true,
        appliedMigrations,
        pendingMigrations
      };
    } catch (error) {
      logger.error('Failed to get migration status', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new Migrations(); 