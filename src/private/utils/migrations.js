const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const logger = require('./logger');
const database = require('../models/database');
const boardModel = require('../models/boardModel');
const constants = require('../config/constants');

// Boards directory path
const BOARDS_DIR = constants.BOARDS_DIR;

/**
 * Migrate all JSON boards to the database
 */
async function migrateBoards() {
  try {
    logger.info('Starting migration of JSON boards to database');
    
    // Initialize database
    await database.initialize();
    
    // Get all board files
    const files = await fs.readdir(BOARDS_DIR);
    const boardFiles = files.filter(file => file.endsWith('-board.json'));
    
    logger.info(`Found ${boardFiles.length} JSON board files to migrate`);
    
    // Anonymous user ID for boards without a user
    const anonymousUserId = 1;
    
    // Keep track of success and failures
    const results = {
      success: 0,
      failed: 0,
      skipped: 0
    };
    
    // Process each board file
    for (const file of boardFiles) {
      try {
        const filePath = path.join(BOARDS_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const jsonBoard = JSON.parse(content);
        
        if (!jsonBoard.id) {
          logger.warn(`Board file ${file} does not have an ID, skipping`);
          results.skipped++;
          continue;
        }
        
        // Check if board already exists in database
        const existingBoard = await boardModel.getBoardByUUID(jsonBoard.id);
        if (existingBoard) {
          logger.info(`Board ${jsonBoard.id} already exists in database, skipping`);
          results.skipped++;
          continue;
        }
        
        // Import board to database
        await boardModel.importFromJson(jsonBoard, anonymousUserId);
        
        logger.info(`Successfully migrated board ${jsonBoard.id} from ${file}`);
        results.success++;
      } catch (error) {
        logger.error(`Failed to migrate board ${file}`, {
          error: error.message,
          stack: error.stack
        });
        results.failed++;
      }
    }
    
    logger.info('Migration completed', {
      total: boardFiles.length,
      success: results.success,
      failed: results.failed,
      skipped: results.skipped
    });
    
    // Close database connection
    await database.close();
    
    return results;
  } catch (error) {
    logger.error('Error during board migration', {
      error: error.message,
      stack: error.stack
    });
    
    // Ensure database connection is closed
    try {
      await database.close();
    } catch (closeError) {
      logger.error('Error closing database connection', {
        error: closeError.message
      });
    }
    
    throw error;
  }
}

/**
 * Main function to run the migration
 */
async function main() {
  try {
    const results = await migrateBoards();
    console.log('Migration completed:');
    console.log(`- Total boards found: ${results.success + results.failed + results.skipped}`);
    console.log(`- Successfully migrated: ${results.success}`);
    console.log(`- Failed to migrate: ${results.failed}`);
    console.log(`- Skipped (already exists): ${results.skipped}`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { migrateBoards }; 