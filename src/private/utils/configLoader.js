const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('./logger');
const dotenv = require('dotenv');

class ConfigLoader {
  constructor() {
    this.config = {
      env: {},
      yaml: {}
    };
    this.loaded = false;
  }

  /**
   * Load configuration from both .env and config.yml files
   * @returns {Object} - Combined configuration
   */
  loadConfig() {
    if (this.loaded) {
      return this.config;
    }

    try {
      // Load .env file
      this.loadEnvConfig();
      
      // Load config.yml
      this.loadYamlConfig();
      
      this.loaded = true;
      logger.info('Configuration loaded successfully');
      
      return this.config;
    } catch (error) {
      logger.error('Failed to load configuration', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Load environment variables from .env file
   */
  loadEnvConfig() {
    try {
      // Load .env file
      const result = dotenv.config();
      
      if (result.error) {
        logger.warn('Failed to load .env file', {
          error: result.error.message
        });
      } else {
        logger.info('.env file loaded successfully');
      }
      
      // Store all environment variables
      this.config.env = { ...process.env };
      
      // Remove sensitive values from the loaded config (but keep them in process.env)
      this.sanitizeEnvConfig();
      
    } catch (error) {
      logger.error('Error loading .env file', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Load configuration from YAML file
   */
  loadYamlConfig() {
    try {
      const configPath = path.join(process.cwd(), 'config.yml');
      
      // Check if config.yml exists
      if (fs.existsSync(configPath)) {
        const yamlContent = fs.readFileSync(configPath, 'utf8');
        this.config.yaml = yaml.load(yamlContent) || {};
        logger.info('config.yml loaded successfully');
      } else {
        logger.warn('config.yml not found, using default configuration');
        this.config.yaml = this.getDefaultYamlConfig();
        
        // Save the default configuration
        this.saveYamlConfig();
      }
    } catch (error) {
      logger.error('Error loading config.yml', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save the YAML configuration to disk
   */
  saveYamlConfig() {
    try {
      const configPath = path.join(process.cwd(), 'config.yml');
      const yamlContent = yaml.dump(this.config.yaml, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });
      
      fs.writeFileSync(configPath, yamlContent, 'utf8');
      logger.info('config.yml saved successfully');
    } catch (error) {
      logger.error('Error saving config.yml', {
        error: error.message
      });
    }
  }

  /**
   * Get default YAML configuration
   * @returns {Object} - Default configuration
   */
  getDefaultYamlConfig() {
    return {
      site: {
        title: 'Bingo Site',
        description: 'A customizable bingo board site',
        defaultTheme: 'light',
        availableThemes: ['light', 'dark', 'high-contrast'],
        maxBoardsPerUser: 10,
        maxCellsPerBoard: 25
      },
      boards: {
        defaultSettings: {
          size: 5,
          freeSpace: true,
          freeSpacePosition: { row: 2, col: 2 },
          chatEnabled: true,
          publicChat: true,
          mentionNotifications: true,
          editNotifications: true,
          requireApproval: false
        }
      },
      notifications: {
        enabled: true,
        defaultPreferences: {
          mentions: true,
          edits: true,
          approvals: true,
          system: true
        }
      },
      anonymousUsers: {
        enabled: true,
        wordLists: {
          adjectives: ['Happy', 'Quiet', 'Sleepy', 'Brave', 'Mighty', 'Clever', 'Wise', 'Gentle', 'Swift'],
          nouns: ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Wolf', 'Fox', 'Bear', 'Hawk', 'Lion']
        }
      },
      usernames: {
        minLength: 3,
        maxLength: 20,
        allowSpecialChars: false
      },
      storage: {
        images: {
          maxSizeMB: 5,
          allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
          path: './uploads/images'
        }
      },
      logging: {
        level: 'info',
        logToFiles: true,
        logPath: './logs'
      }
    };
  }

  /**
   * Remove sensitive values from the config object
   */
  sanitizeEnvConfig() {
    const sensitiveKeys = [
      'DB_PASSWORD',
      'SESSION_SECRET',
      'GOOGLE_CLIENT_SECRET',
      'DISCORD_CLIENT_SECRET',
      'ROOT_ADMIN_PASSWORD',
      'JWT_SECRET',
      'SMTP_PASSWORD'
    ];
    
    sensitiveKeys.forEach(key => {
      if (this.config.env[key]) {
        this.config.env[key] = '[REDACTED]';
      }
    });
  }

  /**
   * Get a specific configuration value
   * @param {string} key - Configuration key (dot notation)
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} - Configuration value
   */
  get(key, defaultValue = null) {
    if (!this.loaded) {
      this.loadConfig();
    }
    
    // Check if it's an environment variable
    if (key.startsWith('env.')) {
      const envKey = key.substring(4);
      return process.env[envKey] || defaultValue;
    }
    
    // Check YAML config
    if (key.startsWith('yaml.')) {
      return this.getNestedValue(this.config.yaml, key.substring(5), defaultValue);
    }
    
    // Try to find in YAML first, then in env
    const yamlValue = this.getNestedValue(this.config.yaml, key, undefined);
    if (yamlValue !== undefined) {
      return yamlValue;
    }
    
    return process.env[key] || defaultValue;
  }

  /**
   * Get a nested value from an object using dot notation
   * @param {Object} obj - Object to get value from
   * @param {string} path - Path in dot notation (e.g. "site.title")
   * @param {*} defaultValue - Default value if path not found
   * @returns {*} - Value at path or default value
   */
  getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result === undefined || result === null || typeof result !== 'object') {
        return defaultValue;
      }
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  }

  /**
   * Set a value in the YAML configuration
   * @param {string} key - Key in dot notation
   * @param {*} value - Value to set
   * @param {boolean} save - Whether to save the config to disk
   * @returns {boolean} - Success status
   */
  setYamlConfig(key, value, save = true) {
    try {
      const keys = key.split('.');
      let current = this.config.yaml;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k] || typeof current[k] !== 'object') {
          current[k] = {};
        }
        current = current[k];
      }
      
      current[keys[keys.length - 1]] = value;
      
      if (save) {
        this.saveYamlConfig();
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to set config value', {
        error: error.message,
        key,
        value
      });
      return false;
    }
  }
}

module.exports = new ConfigLoader(); 