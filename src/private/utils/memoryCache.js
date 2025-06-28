const logger = require('./logger').cache;

/**
 * Node for doubly linked list used in LRU cache
 */
class CacheNode {
  constructor(key, value, size = 0) {
    this.key = key;
    this.value = value;
    this.size = size; // Size in bytes
    this.timestamp = Date.now();
    this.ttl = null;
    this.prev = null;
    this.next = null;
  }

  isExpired() {
    if (!this.ttl) return false;
    return Date.now() > this.timestamp + (this.ttl * 1000);
  }
}

/**
 * High-performance LRU Cache with TTL and memory size management
 * Uses Map for O(1) access + Doubly Linked List for O(1) insertion/deletion
 */
class MemoryCache {
  constructor(options = {}) {
    this.maxSizeBytes = (options.maxSizeMB || 400) * 1024 * 1024; // Convert MB to bytes
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour default
    this.cleanupInterval = options.cleanupInterval || 300; // 5 minutes
    this.enabled = options.enabled !== false;

    // Core data structures
    this.cache = new Map(); // key -> CacheNode (O(1) access)
    this.head = new CacheNode('HEAD', null); // Dummy head
    this.tail = new CacheNode('TAIL', null); // Dummy tail
    this.head.next = this.tail;
    this.tail.prev = this.head;

    // Statistics
    this.currentSizeBytes = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0,
      sets: 0
    };

    // Start cleanup timer
    if (this.enabled) {
      this.startCleanupTimer();
      logger.info('Memory cache initialized', {
        maxSizeMB: options.maxSizeMB || 400,
        defaultTTL: this.defaultTTL,
        cleanupIntervalMin: (this.cleanupInterval / 60).toFixed(1)
      });
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    if (!this.enabled) return null;

    const node = this.cache.get(key);
    if (!node) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (node.isExpired()) {
      this.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      return null;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    this.stats.hits++;
    
    // Only log cache hits in debug mode for important items
    if (node.size > 1024 * 100) { // Only log hits for items > 100KB
      logger.debug('Cache hit (large item)', { key, sizeMB: (node.size / 1024 / 1024).toFixed(2) });
    }
    
    return node.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {object} options - Options (ttl, category)
   */
  set(key, value, options = {}) {
    if (!this.enabled) return;

    const ttl = options.ttl || this.defaultTTL;
    const size = this.calculateSize(value);
    
    // Remove existing if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Check if single item is too large
    if (size > this.maxSizeBytes) {
      logger.warn('Item too large for cache', { 
        key, 
        sizeMB: (size / 1024 / 1024).toFixed(2),
        maxSizeMB: (this.maxSizeBytes / 1024 / 1024).toFixed(2)
      });
      return;
    }

    // Make space if needed
    while (this.currentSizeBytes + size > this.maxSizeBytes) {
      this.evictLRU();
    }

    // Create and add new node
    const node = new CacheNode(key, value, size);
    node.ttl = ttl;
    
    this.cache.set(key, node);
    this.addToFront(node);
    this.currentSizeBytes += size;
    this.stats.sets++;

    // Only log large items or when cache is getting full
    if (size > 1024 * 100 || this.currentSizeBytes > this.maxSizeBytes * 0.8) {
      logger.debug('Cache set', { 
        key, 
        sizeMB: (size / 1024 / 1024).toFixed(2),
        ttl,
        totalSizeMB: (this.currentSizeBytes / 1024 / 1024).toFixed(2),
        fullness: `${((this.currentSizeBytes / this.maxSizeBytes) * 100).toFixed(1)}%`
      });
    }
  }

  /**
   * Delete item from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    if (!this.enabled) return;

    const node = this.cache.get(key);
    if (!node) return;

    this.cache.delete(key);
    this.removeNode(node);
    this.currentSizeBytes -= node.size;
    
    // Only log deletions in debug mode
    logger.debug('Cache delete', { key, sizeMB: (node.size / 1024 / 1024).toFixed(2) });
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.currentSizeBytes = 0;
    this.stats.evictions = 0;
    
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      currentSizeMB: (this.currentSizeBytes / 1024 / 1024).toFixed(2),
      maxSizeMB: (this.maxSizeBytes / 1024 / 1024).toFixed(2),
      itemCount: this.cache.size,
      enabled: this.enabled
    };
  }

  /**
   * Evict least recently used item
   */
  evictLRU() {
    const lru = this.tail.prev;
    if (lru === this.head) return; // Empty cache

    this.cache.delete(lru.key);
    this.removeNode(lru);
    this.currentSizeBytes -= lru.size;
    this.stats.evictions++;

    logger.debug('Cache eviction', { 
      key: lru.key, 
      size: lru.size,
      reason: 'LRU'
    });
  }

  /**
   * Move node to front of list (most recently used)
   */
  moveToFront(node) {
    this.removeNode(node);
    this.addToFront(node);
  }

  /**
   * Add node to front of list
   */
  addToFront(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Remove node from list
   */
  removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /**
   * Calculate approximate size of value in bytes
   */
  calculateSize(value) {
    if (value === null || value === undefined) return 0;
    
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16 encoding
    }
    
    if (typeof value === 'number') {
      return 8; // 64-bit number
    }
    
    if (typeof value === 'boolean') {
      return 1;
    }
    
    if (Buffer.isBuffer(value)) {
      return value.length;
    }
    
    // For objects and arrays, use JSON string length as approximation
    try {
      return JSON.stringify(value).length * 2;
    } catch (error) {
      return 1024; // Default 1KB for non-serializable objects
    }
  }

  /**
   * Start periodic cleanup timer
   */
  startCleanupTimer() {
    // Convert cleanup interval from seconds to milliseconds
    const intervalMs = this.cleanupInterval * 1000;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
    
    // Only log timer start once per cache strategy
    logger.debug('Cache cleanup timer started', {
      intervalMinutes: (this.cleanupInterval / 60).toFixed(1)
    });
  }

  /**
   * Clean up expired items
   */
  cleanup() {
    const before = this.cache.size;
    let expiredCount = 0;
    const startTime = Date.now();
    
    // Iterate through cache and remove expired items
    for (const [key, node] of this.cache.entries()) {
      if (node.isExpired()) {
        this.delete(key);
        expiredCount++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Only log cleanup if items were expired or if it took a long time
    if (expiredCount > 0 || duration > 100) {
      logger.debug('Cache cleanup completed', {
        expired: expiredCount,
        remaining: this.cache.size,
        sizeMB: (this.currentSizeBytes / 1024 / 1024).toFixed(2),
        durationMs: duration
      });
    }
  }

  /**
   * Stop cleanup timer
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
    logger.info('Memory cache destroyed');
  }
}

/**
 * Cache Manager - manages multiple cache strategies with a single shared cache
 */
class CacheManager {
  constructor(config) {
    this.config = config;
    this.cache = null;
    this.strategies = {};
    
    if (config.enabled) {
      this.initializeCache();
    }
  }

  /**
   * Initialize single cache instance with strategy-based TTL
   */
  initializeCache() {
    const strategies = this.config.strategies || {};
    const enabledStrategies = Object.entries(strategies).filter(([_, config]) => config.enabled);
    
    if (enabledStrategies.length === 0) {
      logger.warn('No cache strategies enabled');
      return;
    }

    // Create single cache instance with total memory allocation
    this.cache = new MemoryCache({
      maxSizeMB: this.config.maxSizeMB,
      defaultTTL: this.config.defaultTTL,
      cleanupInterval: this.config.cleanupInterval,
      enabled: true
    });

    // Store strategy configurations for TTL management
    enabledStrategies.forEach(([name, strategyConfig]) => {
      this.strategies[name] = {
        ttl: strategyConfig.ttl || this.config.defaultTTL,
        enabled: true
      };
    });

    logger.info('Cache manager initialized', {
      maxSizeMB: this.config.maxSizeMB,
      strategies: Object.keys(this.strategies),
      strategiesCount: enabledStrategies.length
    });
  }

  /**
   * Get cache instance (for backward compatibility)
   */
  getCache(strategy = 'database') {
    return this.cache;
  }

  /**
   * Get value with strategy-specific behavior
   */
  get(strategy, key) {
    if (!this.cache || !this.strategies[strategy]) {
      return null;
    }
    
    const prefixedKey = `${strategy}:${key}`;
    return this.cache.get(prefixedKey);
  }

  /**
   * Set value with strategy-specific TTL
   */
  set(strategy, key, value, options = {}) {
    if (!this.cache || !this.strategies[strategy]) {
      return;
    }
    
    const prefixedKey = `${strategy}:${key}`;
    const strategyTTL = this.strategies[strategy].ttl;
    const ttl = options.ttl || strategyTTL;
    
    this.cache.set(prefixedKey, value, ttl);
  }

  /**
   * Delete value
   */
  delete(strategy, key) {
    if (!this.cache) return;
    
    const prefixedKey = `${strategy}:${key}`;
    this.cache.delete(prefixedKey);
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    if (!this.cache) {
      return { enabled: false };
    }

    const baseStats = this.cache.getStats();
    
    // Add strategy-specific stats
    const strategyStats = {};
    Object.keys(this.strategies).forEach(strategy => {
      const strategyKeys = Array.from(this.cache.cache.keys()).filter(key => key.startsWith(`${strategy}:`));
      strategyStats[strategy] = {
        keyCount: strategyKeys.length,
        ttl: this.strategies[strategy].ttl,
        enabled: this.strategies[strategy].enabled
      };
    });

    return {
      ...baseStats,
      strategies: strategyStats,
      totalStrategies: Object.keys(this.strategies).length
    };
  }

  /**
   * Clear all caches
   */
  clear() {
    if (this.cache) {
      this.cache.clear();
      logger.info('All cache strategies cleared');
    }
  }

  /**
   * Destroy cache manager
   */
  destroy() {
    if (this.cache) {
      this.cache.destroy();
      this.cache = null;
      this.strategies = {};
      logger.info('Cache manager destroyed');
    }
  }
}

module.exports = { MemoryCache, CacheManager }; 