const logger = require('../utils/logger').api;

const performanceMonitoring = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const memoryDiff = endMemory.heapUsed - startMemory.heapUsed;
    
    // Only persist metrics for non-status endpoints to reduce database load
    const isStatusEndpoint = req.path === '/status' || req.path === '/health' || req.path === '/api/auth/status';
    
    if (!isStatusEndpoint) {
      try {
        const database = require('../models/database');
        const db = database.getDb();
        db.run(
          `INSERT INTO performance_metrics (request_id, endpoint, method, duration_ms, memory_delta_mb, status_code) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            req.requestId,
            `${req.method} ${req.path}`,
            req.method,
            Math.round(duration),
            +(memoryDiff / 1024 / 1024).toFixed(2),
            res.statusCode,
          ]
        ).catch((e) => logger.error('Metric insert failed', { error: e.message }));
      } catch (err) {
        logger.error('Failed to store performance metric', { error: err.message });
      }
    }
    
    // Only log slow requests (>500ms) or errors
    if (duration > 500 || res.statusCode >= 400) {
      logger.warn('Performance alert', {
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: `${(memoryDiff / 1024 / 1024).toFixed(2)}MB`,
        endpoint: `${req.method} ${req.path}`,
        status: res.statusCode,
        requestId: req.requestId
      });
    }
  });
  
  next();
};

module.exports = performanceMonitoring; 