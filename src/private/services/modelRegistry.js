const logger = require('../utils/enhancedLogger').createComponentLogger('ModelRegistry');

/**
 * Centralized model registry that provides lazy-loaded access to all models.
 * Eliminates scattered require() statements and provides consistent model access patterns.
 */
class ModelRegistry {
  constructor() {
    this.models = new Map();
    this.initialize();
  }
  
  /**
   * Initialize the model registry with lazy-loaded model factories
   */
  initialize() {
    logger.info('Initializing model registry');
    
    try {
      // Register model factories (lazy-loaded)
      this.registerModel('board', () => require('../models/boardModel'));
      this.registerModel('user', () => require('../models/userModel'));
      this.registerModel('session', () => require('../models/sessionModel'));
      this.registerModel('notification', () => require('../models/notificationModel'));
      this.registerModel('image', () => require('../models/imageModel'));
      this.registerModel('cellHistory', () => require('../models/cellHistoryModel'));
      this.registerModel('boardChat', () => require('../models/boardChatModel'));
      this.registerModel('version', () => require('../models/versionModel'));
      this.registerModel('errorReport', () => require('../models/errorReportModel'));
      
      logger.info('Model registry initialized successfully', {
        modelCount: this.models.size
      });
    } catch (error) {
      logger.error('Model registry initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Register a model with lazy loading
   * @param {string} name - Model name
   * @param {function} factory - Factory function that returns the model
   */
  registerModel(name, factory) {
    if (typeof factory !== 'function') {
      throw new Error(`Model factory for '${name}' must be a function`);
    }
    
    this.models.set(name, {
      factory,
      instance: null // Will be loaded on first access
    });
  }
  
  /**
   * Get a model instance by name (lazy-loaded)
   * @param {string} name - Model name
   * @param {object} req - Express request object for logging
   * @returns {object} Model instance
   */
  get(name, req = null) {
    try {
      const modelEntry = this.models.get(name);
      if (!modelEntry) {
        logger.error('Model not found', { modelName: name }, req);
        throw new Error(`Model '${name}' not found in registry`);
      }
      
      // Lazy load the model on first access
      if (!modelEntry.instance) {
        logger.debug('Loading model instance', { modelName: name }, req);
        modelEntry.instance = modelEntry.factory();
      }
      
      return modelEntry.instance;
    } catch (error) {
      logger.error('Model access failed', {
        modelName: name,
        error: error.message,
        stack: error.stack
      }, req);
      throw error;
    }
  }

  /**
   * Check if a model is registered
   * @param {string} name - Model name
   * @returns {boolean} Whether the model is registered
   */
  has(name) {
    return this.models.has(name);
  }

  /**
   * Get list of all registered model names
   * @returns {string[]} Array of model names
   */
  getModelNames() {
    return Array.from(this.models.keys());
  }

  /**
   * Reset a model instance (useful for testing)
   * @param {string} name - Model name
   */
  reset(name) {
    const modelEntry = this.models.get(name);
    if (modelEntry) {
      modelEntry.instance = null;
    }
  }

  /**
   * Reset all model instances
   */
  resetAll() {
    for (const [name, modelEntry] of this.models) {
      modelEntry.instance = null;
    }
  }

  // Convenience getters for commonly used models
  get board() { return this.get('board'); }
  get user() { return this.get('user'); }
  get session() { return this.get('session'); }
  get notification() { return this.get('notification'); }
  get image() { return this.get('image'); }
  get cellHistory() { return this.get('cellHistory'); }
  get boardChat() { return this.get('boardChat'); }
  get version() { return this.get('version'); }
  get errorReport() { return this.get('errorReport'); }
}

// Create and export singleton instance
const modelRegistry = new ModelRegistry();
module.exports = modelRegistry; 