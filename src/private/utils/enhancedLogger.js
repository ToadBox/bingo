const { v4: uuidv4 } = require('uuid');
const originalLogger = require('./logger');

class EnhancedLogger {
  static generateRequestId() {
    return uuidv4().substring(0, 8); // Short 8-char ID
  }

  static createRequestContext(req) {
    const requestId = req.headers['x-request-id'] || this.generateRequestId();
    req.requestId = requestId;
    
    return {
      requestId,
      ip: req.ip || req.connection?.remoteAddress || '-',
      userAgent: req.get('User-Agent') || '-',
      method: req.method,
      path: req.path,
      userId: req.user?.user_id || null,
      sessionId: req.sessionId || null,
      timestamp: Date.now()
    };
  }

  static logWithContext(level, message, data = {}, component = 'Server', req = null) {
    const context = req ? this.createRequestContext(req) : {};
    const enrichedData = {
      ...data,
      ...context,
      service: 'bingo-backend',
      version: process.env.APP_VERSION || '1.0.0'
    };

    originalLogger[level](message, enrichedData, component);
    
    // Store critical errors in database for admin panel
    if (level === 'error') {
      this.storeErrorReport(message, enrichedData, component);
    }
  }

  static async storeErrorReport(message, data, component) {
    try {
      // Store in error_reports table for admin panel analysis
      const errorReport = {
        id: uuidv4(),
        request_id: data.requestId,
        component,
        level: 'error',
        message,
        stack_trace: data.stack || null,
        user_id: data.userId,
        ip_address: data.ip,
        user_agent: data.userAgent,
        endpoint: `${data.method} ${data.path}`,
        context: JSON.stringify(data),
        created_at: new Date().toISOString()
      };

      // Directly insert using the database model to avoid relying on helpers
      const database = require('../models/database');
      const dbConn = database.getDb();
      const columns = Object.keys(errorReport);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO error_reports (${columns.join(', ')}) VALUES (${placeholders})`;
      await dbConn.run(sql, Object.values(errorReport));
    } catch (err) {
      // Fallback to original logger if database fails
      originalLogger.error('Failed to store error report', { error: err.message });
    }
  }

  // Component-specific loggers with request context
  static createComponentLogger(component) {
    return {
      error: (message, data, req) => this.logWithContext('error', message, data, component, req),
      warn: (message, data, req) => this.logWithContext('warn', message, data, component, req),
      info: (message, data, req) => this.logWithContext('info', message, data, component, req),
      debug: (message, data, req) => this.logWithContext('debug', message, data, component, req)
    };
  }
}

module.exports = EnhancedLogger; 