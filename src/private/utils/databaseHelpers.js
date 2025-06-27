const logger = require('./logger');

/**
 * Database helper utilities to reduce code duplication
 */
class DatabaseHelpers {
  constructor(database) {
    this.db = database;
  }

  /**
   * Execute a query with error handling and logging
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Description of the operation
   * @param {string} component - Component name for logging
   * @returns {Promise<any>} - Query result
   */
  async executeQuery(sql, params = [], operation = 'query', component = 'Database') {
    try {
      const startTime = Date.now();
      const result = await this.db.getDb().run(sql, params);
      const duration = Date.now() - startTime;
      
      logger[component.toLowerCase()]?.debug('Query executed successfully', {
        operation,
        duration,
        changes: result.changes,
        lastID: result.lastID
      });
      
      return result;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Query execution failed', {
        operation,
        error: error.message,
        sql: sql.substring(0, 100) + '...'
      });
      throw error;
    }
  }

  /**
   * Get a single record with error handling and logging
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Description of the operation
   * @param {string} component - Component name for logging
   * @returns {Promise<Object|null>} - Record or null
   */
  async getRecord(sql, params = [], operation = 'get record', component = 'Database') {
    try {
      const result = await this.db.getDb().get(sql, params);
      return result || null;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Failed to get record', {
        operation,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get multiple records with error handling and logging
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Description of the operation
   * @param {string} component - Component name for logging
   * @returns {Promise<Array>} - Array of records
   */
  async getRecords(sql, params = [], operation = 'get records', component = 'Database') {
    try {
      const result = await this.db.getDb().all(sql, params);
      return result;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Failed to get records', {
        operation,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Insert a record and return the created record
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @param {string} component - Component name for logging
   * @returns {Promise<Object>} - Created record
   */
  async insertRecord(table, data, component = 'Database') {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map(() => '?').join(', ');
    
    const sql = `
      INSERT INTO ${table} (${fields.join(', ')})
      VALUES (${placeholders})
    `;
    
    try {
      const result = await this.executeQuery(sql, values, `insert into ${table}`, component);
      
      if (!result.lastID) {
        throw new Error(`Failed to insert record into ${table}`);
      }
      
      // Return the created record
      const createdRecord = await this.getRecord(
        `SELECT * FROM ${table} WHERE rowid = ?`,
        [result.lastID],
        `get created ${table} record`,
        component
      );
      
      return createdRecord;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Insert operation failed', {
        table,
        error: error.message,
        data: Object.keys(data)
      });
      throw error;
    }
  }

  /**
   * Update records with conditions
   * @param {string} table - Table name
   * @param {Object} data - Data to update
   * @param {Object} conditions - Where conditions
   * @param {string} component - Component name for logging
   * @returns {Promise<number>} - Number of affected rows
   */
  async updateRecord(table, data, conditions, component = 'Database') {
    const setFields = Object.keys(data);
    const setValues = Object.values(data);
    const whereFields = Object.keys(conditions);
    const whereValues = Object.values(conditions);
    
    const setClause = setFields.map(field => `${field} = ?`).join(', ');
    const whereClause = whereFields.map(field => `${field} = ?`).join(' AND ');
    
    const sql = `
      UPDATE ${table}
      SET ${setClause}
      WHERE ${whereClause}
    `;
    
    try {
      const result = await this.executeQuery(
        sql, 
        [...setValues, ...whereValues], 
        `update ${table}`, 
        component
      );
      
      return result.changes || 0;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Update operation failed', {
        table,
        error: error.message,
        conditions
      });
      throw error;
    }
  }

  /**
   * Delete records with conditions
   * @param {string} table - Table name
   * @param {Object} conditions - Where conditions
   * @param {string} component - Component name for logging
   * @returns {Promise<number>} - Number of deleted rows
   */
  async deleteRecord(table, conditions, component = 'Database') {
    const whereFields = Object.keys(conditions);
    const whereValues = Object.values(conditions);
    const whereClause = whereFields.map(field => `${field} = ?`).join(' AND ');
    
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    
    try {
      const result = await this.executeQuery(
        sql, 
        whereValues, 
        `delete from ${table}`, 
        component
      );
      
      return result.changes || 0;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Delete operation failed', {
        table,
        error: error.message,
        conditions
      });
      throw error;
    }
  }

  /**
   * Check if a record exists
   * @param {string} table - Table name
   * @param {Object} conditions - Where conditions
   * @param {string} component - Component name for logging
   * @returns {Promise<boolean>} - True if record exists
   */
  async recordExists(table, conditions, component = 'Database') {
    const whereFields = Object.keys(conditions);
    const whereValues = Object.values(conditions);
    const whereClause = whereFields.map(field => `${field} = ?`).join(' AND ');
    
    const sql = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
    
    try {
      const result = await this.getRecord(sql, whereValues, `check ${table} existence`, component);
      return !!result;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Existence check failed', {
        table,
        error: error.message,
        conditions
      });
      throw error;
    }
  }

  /**
   * Count records with optional conditions
   * @param {string} table - Table name
   * @param {Object} conditions - Where conditions (optional)
   * @param {string} component - Component name for logging
   * @returns {Promise<number>} - Record count
   */
  async countRecords(table, conditions = {}, component = 'Database') {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    let values = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereFields = Object.keys(conditions);
      const whereValues = Object.values(conditions);
      const whereClause = whereFields.map(field => `${field} = ?`).join(' AND ');
      
      sql += ` WHERE ${whereClause}`;
      values = whereValues;
    }
    
    try {
      const result = await this.getRecord(sql, values, `count ${table} records`, component);
      return result ? result.count : 0;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Count operation failed', {
        table,
        error: error.message,
        conditions
      });
      throw error;
    }
  }

  /**
   * Get paginated records
   * @param {string} table - Table name
   * @param {Object} options - Query options
   * @param {string} component - Component name for logging
   * @returns {Promise<Object>} - Paginated results
   */
  async getPaginatedRecords(table, options = {}, component = 'Database') {
    const {
      conditions = {},
      orderBy = 'created_at DESC',
      limit = 20,
      offset = 0,
      select = '*'
    } = options;
    
    let sql = `SELECT ${select} FROM ${table}`;
    let countSql = `SELECT COUNT(*) as total FROM ${table}`;
    let values = [];
    
    // Add WHERE clause if conditions provided
    if (Object.keys(conditions).length > 0) {
      const whereFields = Object.keys(conditions);
      const whereValues = Object.values(conditions);
      const whereClause = whereFields.map(field => `${field} = ?`).join(' AND ');
      
      sql += ` WHERE ${whereClause}`;
      countSql += ` WHERE ${whereClause}`;
      values = whereValues;
    }
    
    // Add ORDER BY and LIMIT
    sql += ` ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    
    try {
      const [records, totalResult] = await Promise.all([
        this.getRecords(sql, values, `get paginated ${table}`, component),
        this.getRecord(countSql, values, `count total ${table}`, component)
      ]);
      
      const total = totalResult ? totalResult.total : 0;
      const totalPages = Math.ceil(total / limit);
      const currentPage = Math.floor(offset / limit) + 1;
      
      return {
        records,
        pagination: {
          total,
          totalPages,
          currentPage,
          limit,
          offset,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1
        }
      };
    } catch (error) {
      logger[component.toLowerCase()]?.error('Paginated query failed', {
        table,
        error: error.message,
        options
      });
      throw error;
    }
  }

  /**
   * Execute a transaction
   * @param {Function} callback - Transaction callback function
   * @param {string} component - Component name for logging
   * @returns {Promise<any>} - Transaction result
   */
  async transaction(callback, component = 'Database') {
    try {
      logger[component.toLowerCase()]?.debug('Starting transaction');
      
      const result = await this.db.transaction(async (db) => {
        // Create a temporary helpers instance for the transaction
        const transactionHelpers = new DatabaseHelpers({ getDb: () => db });
        return await callback(transactionHelpers);
      });
      
      logger[component.toLowerCase()]?.debug('Transaction completed successfully');
      return result;
    } catch (error) {
      logger[component.toLowerCase()]?.error('Transaction failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Build WHERE clause from conditions object
   * @param {Object} conditions - Conditions object
   * @returns {Object} - WHERE clause and values
   */
  buildWhereClause(conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { clause: '', values: [] };
    }
    
    const clauses = [];
    const values = [];
    
    for (const [field, value] of Object.entries(conditions)) {
      if (Array.isArray(value)) {
        // Handle IN clause for arrays
        const placeholders = value.map(() => '?').join(', ');
        clauses.push(`${field} IN (${placeholders})`);
        values.push(...value);
      } else if (value === null) {
        // Handle NULL values
        clauses.push(`${field} IS NULL`);
      } else {
        // Handle regular equality
        clauses.push(`${field} = ?`);
        values.push(value);
      }
    }
    
    return {
      clause: `WHERE ${clauses.join(' AND ')}`,
      values
    };
  }

  /**
   * Escape SQL identifiers (table names, column names)
   * @param {string} identifier - Identifier to escape
   * @returns {string} - Escaped identifier
   */
  escapeIdentifier(identifier) {
    // SQLite uses double quotes for identifiers
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Generate UUID v4
   * @returns {string} - UUID string
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

module.exports = DatabaseHelpers; 