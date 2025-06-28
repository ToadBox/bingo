const db = require('./database');
const logger = require('../utils/enhancedLogger').createComponentLogger('ErrorReportModel');

class ErrorReportModel {
  static async getErrorReports(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        component,
        resolved,
        since
      } = options;

      let query = `
        SELECT * FROM error_reports 
        WHERE 1=1
      `;
      const params = [];

      if (component) {
        query += ` AND component = ?`;
        params.push(component);
      }

      if (resolved !== undefined) {
        query += ` AND resolved = ?`;
        params.push(resolved ? 1 : 0);
      }

      if (since) {
        query += ` AND created_at >= ?`;
        params.push(since.toISOString());
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, (page - 1) * limit);

      const errors = await db.all(query, params);
      
      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total FROM error_reports 
        WHERE 1=1
      `;
      const countParams = params.slice(0, -2); // Remove limit and offset

      if (component) {
        countQuery += ` AND component = ?`;
      }
      if (resolved !== undefined) {
        countQuery += ` AND resolved = ?`;
      }
      if (since) {
        countQuery += ` AND created_at >= ?`;
      }

      const countResult = await db.get(countQuery, countParams);
      
      return {
        errors,
        pagination: {
          page,
          limit,
          total: countResult.total,
          totalPages: Math.ceil(countResult.total / limit)
        }
      };
    } catch (error) {
      logger.error('Error retrieving error reports', {
        error: error.message,
        options
      });
      throw error;
    }
  }

  static async resolveError(errorId, resolvedBy) {
    try {
      const query = `
        UPDATE error_reports 
        SET resolved = 1, resolved_by = ?, resolved_at = ?
        WHERE id = ?
      `;
      
      await db.run(query, [resolvedBy, new Date().toISOString(), errorId]);
      
      logger.info('Error report resolved', {
        errorId,
        resolvedBy
      });
    } catch (error) {
      logger.error('Error resolving error report', {
        error: error.message,
        errorId,
        resolvedBy
      });
      throw error;
    }
  }

  static async getErrorStats() {
    try {
      const stats = await db.all(`
        SELECT 
          component,
          COUNT(*) as total,
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved,
          MAX(created_at) as latest_error
        FROM error_reports 
        GROUP BY component
        ORDER BY total DESC
      `);

      const totalStats = await db.get(`
        SELECT 
          COUNT(*) as total_errors,
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved_errors,
          COUNT(DISTINCT component) as affected_components
        FROM error_reports
      `);

      return {
        byComponent: stats,
        overall: totalStats
      };
    } catch (error) {
      logger.error('Error retrieving error statistics', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = ErrorReportModel; 