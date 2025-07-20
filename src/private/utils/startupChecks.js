const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const database = require('../models/database');

class StartupChecks {
  constructor() {
    this.rootDir = process.cwd();
  }

  /**
   * Run all startup checks
   */
  async runChecks() {
    logger.info('Running startup configuration checks...');
    
    try {
      await this.checkConfigYml();
      await this.checkEnvFile();
      await this.checkDirectories();
      // Database migrations are handled by database.initialize()
      
      logger.info('Startup configuration checks completed successfully');
    } catch (error) {
      logger.error('Startup configuration checks failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Check and create config.yml if missing
   */
  async checkConfigYml() {
    const configPath = path.join(this.rootDir, 'config.yml');
    
    try {
      await fs.promises.access(configPath);
      logger.info('config.yml exists');
    } catch (error) {
      logger.info('config.yml not found, creating with default settings...');
      
      const defaultConfig = `site:
  title: ToadBox Bingo
  description: A customizable bingo board site
  defaultTheme: light
  availableThemes:
    - light
    - dark
    - high-contrast
  maxBoardsPerUser: 10
  maxCellsPerBoard: 25
  serverUsername: server
boards:
  defaultSettings:
    size: 5
    freeSpace: true
    freeSpacePosition:
      row: 2
      col: 2
    chatEnabled: true
    publicChat: true
    mentionNotifications: true
    editNotifications: true
    requireApproval: false
notifications:
  enabled: true
  defaultPreferences:
    mentions: true
    edits: true
    approvals: true
    system: true
anonymousUsers:
  enabled: true
  wordLists:
    adjectives:
      - Happy
      - Quiet
      - Sleepy
      - Brave
      - Mighty
      - Clever
      - Wise
      - Gentle
      - Swift
    nouns:
      - Panda
      - Tiger
      - Eagle
      - Dolphin
      - Wolf
      - Fox
      - Bear
      - Hawk
      - Lion
usernames:
  minLength: 3
  maxLength: 20
  allowSpecialChars: false
storage:
  images:
    maxSizeMB: 5
    allowedTypes:
      - image/jpeg
      - image/png
      - image/gif
    path: ./uploads/images
logging:
  level: info
  logToFiles: true
  logPath: ./logs
`;
      
      await fs.promises.writeFile(configPath, defaultConfig, 'utf8');
      logger.info('Created config.yml with default settings');
    }
  }

  /**
   * Check and create .env if missing
   */
  async checkEnvFile() {
    const envPath = path.join(this.rootDir, '.env');
    
    try {
      await fs.promises.access(envPath);
      logger.info('.env file exists');
    } catch (error) {
      logger.info('.env file not found, creating with example settings...');
      
      const defaultEnv = `# ToadBox Bingo Environment Configuration
# Copy this file and customize the values for your setup

# Server Configuration
PORT=3000
NODE_ENV=development

# Site Password (for anonymous access)
SITE_PASSWORD=your-site-password-here

# Database Configuration (SQLite)
DATABASE_PATH=./src/data/bingo.sqlite

# Authentication - Authentik OAuth (optional)
# AUTHENTIK_CLIENT_ID=your-authentik-client-id
# AUTHENTIK_CLIENT_SECRET=your-authentik-client-secret
# AUTHENTIK_BASE_URL=https://auth.example.com/application/o

# Session Configuration
SESSION_SECRET=your-session-secret-change-this-in-production

# Logging
LOG_LEVEL=info

# Development Options
# OFFLINE_MODE=true
# DEBUG=true
`;
      
      await fs.promises.writeFile(envPath, defaultEnv, 'utf8');
      logger.info('Created .env file with example settings');
    }
  }

  /**
   * Check and create required directories
   */
  async checkDirectories() {
    const requiredDirectories = [
      'src/data',
      'src/private/boards',
      'uploads/images',
      'src/private/utils/logs'
    ];

    for (const dir of requiredDirectories) {
      const dirPath = path.join(this.rootDir, dir);
      
      try {
        await fs.promises.access(dirPath);
        logger.debug(`Directory exists: ${dir}`);
      } catch (error) {
        logger.info(`Creating directory: ${dir}`);
        await fs.promises.mkdir(dirPath, { recursive: true });
      }
    }
  }

  /**
   * Get startup check status
   */
  async getStatus() {
    const status = {
      configYml: false,
      envFile: false,
      directories: {},
      migrations: null
    };

    try {
      // Check config.yml
      await fs.promises.access(path.join(this.rootDir, 'config.yml'));
      status.configYml = true;
    } catch (error) {
      // File doesn't exist
    }

    try {
      // Check .env
      await fs.promises.access(path.join(this.rootDir, '.env'));
      status.envFile = true;
    } catch (error) {
      // File doesn't exist
    }

    // Check directories
    const requiredDirectories = [
      'src/data',
      'src/private/boards',
      'uploads/images',
      'src/private/utils/logs'
    ];

    for (const dir of requiredDirectories) {
      try {
        await fs.promises.access(path.join(this.rootDir, dir));
        status.directories[dir] = true;
      } catch (error) {
        status.directories[dir] = false;
      }
    }

    // Get migration status
    try {
      if (database.migrationManager) {
        status.migrations = { status: 'completed', message: 'Migrations handled by database initialization' };
      } else {
        status.migrations = { status: 'unknown', message: 'Migration manager not available' };
      }
    } catch (error) {
      status.migrations = { error: error.message };
    }

    return status;
  }
}

module.exports = new StartupChecks(); 