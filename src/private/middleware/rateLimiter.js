const rateLimit = require('express-rate-limit');
const database = require('../models/database');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class RateLimiter {
  constructor() {
    this.windowMs = constants.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000; // Default 15 minutes
    this.maxRequests = constants.RATE_LIMIT_MAX_REQUESTS || 500; // Default 500 requests per window
    
    // Different limits for different endpoints
    this.limitsByEndpoint = {
      'login': {
        windowMs: 10 * 60 * 1000, // 10 minutes
        maxRequests: 10 // 10 attempts per window
      },
      'register': {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 5 // 5 attempts per window
      },
      'upload': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 20 // 20 uploads per window
      }
    };
  }

  /**
   * Store rate limit data in the database
   * @param {Object} options - Options object
   * @returns {Object} - Custom store for express-rate-limit
   */
  createDatabaseStore(options = {}) {
    const {
      windowMs = this.windowMs,
      tableName = 'rate_limits'
    } = options;
    
    const cleanupInterval = Math.max(windowMs, 60 * 1000); // At least once per minute
    let interval;
    
    // Start cleanup interval
    const startCleanup = () => {
      if (interval) {
        clearInterval(interval);
      }
      
      interval = setInterval(() => {
        this.cleanupExpiredLimits();
      }, cleanupInterval);
      
      // Don't let the process hang on this interval
      interval.unref();
    };
    
    startCleanup();
    
    return {
      /**
       * Increment request count
       * @param {string} key - Key to identify the requester (IP or user ID)
       * @returns {Object} - Rate limit info
       */
      async increment(key) {
        try {
          const db = database.getDb();
          
          // Parse the key to get endpoint and identifier
          const [endpoint, identifier] = this.parseKey(key);
          
          // Check if record exists for this key and window
          const now = Date.now();
          const windowStart = new Date(now - windowMs).toISOString();
          
          // First try to get existing record
          const record = await db.get(`
            SELECT id, requests_count, window_start
            FROM ${tableName}
            WHERE ip_address = ? AND endpoint = ? AND window_start > ?
            ORDER BY window_start DESC
            LIMIT 1
          `, [identifier, endpoint, windowStart]);
          
          if (record) {
            // Update existing record
            await db.run(`
              UPDATE ${tableName}
              SET requests_count = requests_count + 1
              WHERE id = ?
            `, [record.id]);
            
            return {
              totalHits: record.requests_count + 1,
              resetTime: new Date(new Date(record.window_start).getTime() + windowMs)
            };
          } else {
            // Create new record
            const result = await db.run(`
              INSERT INTO ${tableName} (
                ip_address, endpoint, requests_count, window_start
              ) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            `, [identifier, endpoint]);
            
            if (!result.lastID) {
              throw new Error('Failed to create rate limit record');
            }
            
            return {
              totalHits: 1,
              resetTime: new Date(now + windowMs)
            };
          }
        } catch (error) {
          logger.error('Rate limiter error on increment', {
            error: error.message,
            key
          });
          
          // Don't block requests on error
          return {
            totalHits: 0,
            resetTime: new Date(Date.now() + windowMs)
          };
        }
      },
      
      /**
       * Decrement request count
       * @param {string} key - Key to identify the requester
       * @returns {void}
       */
      async decrement(key) {
        try {
          const db = database.getDb();
          
          // Parse the key to get endpoint and identifier
          const [endpoint, identifier] = this.parseKey(key);
          
          // Get the latest record for this key
          const record = await db.get(`
            SELECT id, requests_count
            FROM ${tableName}
            WHERE ip_address = ? AND endpoint = ?
            ORDER BY window_start DESC
            LIMIT 1
          `, [identifier, endpoint]);
          
          if (record && record.requests_count > 0) {
            await db.run(`
              UPDATE ${tableName}
              SET requests_count = requests_count - 1
              WHERE id = ?
            `, [record.id]);
          }
        } catch (error) {
          logger.error('Rate limiter error on decrement', {
            error: error.message,
            key
          });
        }
      },
      
      /**
       * Reset rate limit for a key
       * @param {string} key - Key to identify the requester
       * @returns {void}
       */
      async resetKey(key) {
        try {
          const db = database.getDb();
          
          // Parse the key to get endpoint and identifier
          const [endpoint, identifier] = this.parseKey(key);
          
          await db.run(`
            DELETE FROM ${tableName}
            WHERE ip_address = ? AND endpoint = ?
          `, [identifier, endpoint]);
        } catch (error) {
          logger.error('Rate limiter error on resetKey', {
            error: error.message,
            key
          });
        }
      },
      
      /**
       * Reset all rate limits
       * @returns {void}
       */
      async resetAll() {
        try {
          const db = database.getDb();
          await db.run(`DELETE FROM ${tableName}`);
        } catch (error) {
          logger.error('Rate limiter error on resetAll', {
            error: error.message
          });
        }
      },
      
      /**
       * Parse a key into endpoint and identifier
       * @param {string} key - Combined key (endpoint:identifier)
       * @returns {Array} - [endpoint, identifier]
       */
      parseKey(key) {
        // Default values
        let endpoint = 'api';
        let identifier = key;
        
        // Try to parse the key
        if (key && key.includes(':')) {
          const parts = key.split(':');
          endpoint = parts[0] || 'api';
          identifier = parts[1] || key;
        }
        
        return [endpoint, identifier];
      }
    };
  }

  /**
   * Clean up expired rate limits
   * @returns {void}
   */
  async cleanupExpiredLimits() {
    try {
      const db = database.getDb();
      
      const now = new Date().toISOString();
      const windowStart = new Date(Date.now() - this.windowMs).toISOString();
      
      await db.run(`
        DELETE FROM rate_limits
        WHERE window_start < ?
      `, [windowStart]);
      
      logger.debug('Cleaned up expired rate limits', {
        timestamp: now
      });
    } catch (error) {
      logger.error('Rate limiter error on cleanup', {
        error: error.message
      });
    }
  }

  /**
   * Create a key generator function
   * @param {string} endpoint - API endpoint identifier
   * @returns {Function} - Key generator function
   */
  keyGenerator(endpoint) {
    return (req) => {
      // Get IP address
      const ip = req.ip || 
                req.connection.remoteAddress || 
                req.headers['x-forwarded-for'] || 
                '0.0.0.0';
      
      // Use user ID if authenticated
      const userId = req.user?.id;
      
      // If user is authenticated, include user ID in the key
      const identifier = userId ? `${userId}:${ip}` : ip;
      
      // Return the combined key
      return `${endpoint}:${identifier}`;
    };
  }

  /**
   * Create API rate limiter middleware
   * @param {Object} options - Rate limiter options
   * @returns {Function} - Express middleware
   */
  apiLimiter(options = {}) {
    const {
      endpoint = 'api',
      windowMs = this.windowMs,
      maxRequests = this.maxRequests,
      message = 'Too many requests, please try again later.',
      skipSuccessfulRequests = false
    } = options;
    
    // Check if there's a specific limit for this endpoint
    if (this.limitsByEndpoint[endpoint]) {
      const specificLimit = this.limitsByEndpoint[endpoint];
      options.windowMs = specificLimit.windowMs;
      options.maxRequests = specificLimit.maxRequests;
    }
    
    // Create store instance
    const store = this.createDatabaseStore({
      windowMs: options.windowMs || windowMs,
      tableName: 'rate_limits'
    });
    
    // Create and return the limiter
    return rateLimit({
      windowMs: options.windowMs || windowMs,
      max: options.maxRequests || maxRequests,
      message: options.message || message,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: options.skipSuccessfulRequests || skipSuccessfulRequests,
      keyGenerator: this.keyGenerator(endpoint),
      store
    });
  }
}

module.exports = new RateLimiter(); 