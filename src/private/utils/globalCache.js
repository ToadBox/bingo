const { CacheManager } = require('./memoryCache');
const configLoader = require('./configLoader');
const logger = require('./logger');

/**
 * Global cache singleton
 * Provides centralized cache access across the application
 */
class GlobalCache {
  constructor() {
    this.cacheManager = null;
    this.initialized = false;
  }

  /**
   * Initialize the global cache
   */
  initialize() {
    if (this.initialized) {
      logger.cache.warn('Cache already initialized, skipping');
      return;
    }

    const cacheConfig = configLoader.get('cache', {
      enabled: false,
      maxSizeMB: 400,
      defaultTTL: 3600,
      cleanupInterval: 300,
      strategies: {
        database: { enabled: true, ttl: 1800 },
        sessions: { enabled: true, ttl: 7200 },
        boards: { enabled: true, ttl: 900 },
        static: { enabled: true, ttl: 3600 }
      }
    });

    if (cacheConfig.enabled) {
      this.cacheManager = new CacheManager(cacheConfig);
      this.initialized = true;
      
      logger.cache.info('Global cache initialized', {
        maxSizeMB: cacheConfig.maxSizeMB,
        strategies: Object.keys(cacheConfig.strategies).filter(k => cacheConfig.strategies[k].enabled)
      });
    } else {
      logger.cache.info('Cache disabled in configuration');
    }
  }

  /**
   * Get cache manager instance
   */
  getManager() {
    return this.cacheManager;
  }

  /**
   * Get specific cache strategy
   */
  getCache(strategy = 'database') {
    return this.cacheManager ? this.cacheManager.getCache(strategy) : null;
  }

  /**
   * Convenience methods for common operations
   */
  get(strategy, key) {
    return this.cacheManager ? this.cacheManager.get(strategy, key) : null;
  }

  set(strategy, key, value, options = {}) {
    if (this.cacheManager) {
      this.cacheManager.set(strategy, key, value, options);
    }
  }

  delete(strategy, key) {
    if (this.cacheManager) {
      this.cacheManager.delete(strategy, key);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cacheManager ? this.cacheManager.getStats() : { enabled: false };
  }

  /**
   * Clear all caches
   */
  clear() {
    if (this.cacheManager) {
      this.cacheManager.clear();
    }
  }

  /**
   * Destroy cache manager
   */
  destroy() {
    if (this.cacheManager) {
      this.cacheManager.destroy();
      this.cacheManager = null;
      this.initialized = false;
      logger.cache.info('Global cache destroyed');
    }
  }

  /**
   * Check if cache is enabled and initialized
   */
  isEnabled() {
    return this.initialized && this.cacheManager !== null;
  }
}

// Create singleton instance
const globalCache = new GlobalCache();

module.exports = globalCache; 