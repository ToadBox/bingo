const database = require('./database');
const logger = require('../utils/logger');

class ImageModel {
  /**
   * Create a new image record
   * @param {Object} imageData - Image data
   * @returns {Object} - Created image record
   */
  async createImage(imageData) {
    const {
      userId,
      filename,
      originalFilename,
      mimeType,
      size,
      width,
      height,
      path,
      thumbnailPath,
      metadata
    } = imageData;
    
    try {
      const db = database.getDb();
      
      const result = await db.run(`
        INSERT INTO images (
          user_id, filename, original_filename, mime_type, 
          size, width, height, path, thumbnail_path, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        filename,
        originalFilename,
        mimeType,
        size,
        width || null,
        height || null,
        path,
        thumbnailPath || null,
        metadata || null
      ]);
      
      if (result.lastID) {
        return this.getImageById(result.lastID);
      }
      
      throw new Error('Failed to create image record');
    } catch (error) {
      logger.error('Failed to create image record', {
        error: error.message,
        userId,
        filename
      });
      throw error;
    }
  }

  /**
   * Get image by ID
   * @param {number} id - Image ID
   * @returns {Object|null} - Image record or null if not found
   */
  async getImageById(id) {
    try {
      const db = database.getDb();
      
      return db.get(`
        SELECT * FROM images WHERE id = ?
      `, [id]);
    } catch (error) {
      logger.error('Failed to get image by ID', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get images by user ID
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of image records
   */
  async getUserImages(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      purpose = null
    } = options;
    
    try {
      const db = database.getDb();
      
      let query = `
        SELECT * FROM images WHERE user_id = ?
      `;
      
      const params = [userId];
      
      // Filter by purpose if specified
      if (purpose) {
        query += ` AND metadata LIKE '%"purpose":"${purpose}"%'`;
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      return db.all(query, params);
    } catch (error) {
      logger.error('Failed to get user images', {
        error: error.message,
        userId
      });
      return [];
    }
  }

  /**
   * Delete an image
   * @param {number} id - Image ID
   * @returns {boolean} - Success status
   */
  async deleteImage(id) {
    try {
      const db = database.getDb();
      
      const result = await db.run(`
        DELETE FROM images WHERE id = ?
      `, [id]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete image', {
        error: error.message,
        id
      });
      return false;
    }
  }

  /**
   * Update image metadata
   * @param {number} id - Image ID
   * @param {Object} metadataUpdate - Metadata updates
   * @returns {boolean} - Success status
   */
  async updateImageMetadata(id, metadataUpdate) {
    try {
      // First get current metadata
      const image = await this.getImageById(id);
      if (!image) {
        return false;
      }
      
      let metadata = {};
      try {
        metadata = image.metadata ? JSON.parse(image.metadata) : {};
      } catch (e) {
        logger.warn('Failed to parse existing image metadata', {
          error: e.message,
          imageId: id
        });
      }
      
      // Merge with updates
      const updatedMetadata = {
        ...metadata,
        ...metadataUpdate,
        lastUpdated: new Date().toISOString()
      };
      
      // Update record
      const db = database.getDb();
      const result = await db.run(`
        UPDATE images SET metadata = ? WHERE id = ?
      `, [JSON.stringify(updatedMetadata), id]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to update image metadata', {
        error: error.message,
        id
      });
      return false;
    }
  }

  /**
   * Count user images
   * @param {number} userId - User ID
   * @returns {number} - Count of user images
   */
  async countUserImages(userId) {
    try {
      const db = database.getDb();
      
      const result = await db.get(`
        SELECT COUNT(*) as count FROM images WHERE user_id = ?
      `, [userId]);
      
      return result ? result.count : 0;
    } catch (error) {
      logger.error('Failed to count user images', {
        error: error.message,
        userId
      });
      return 0;
    }
  }

  /**
   * Search images
   * @param {Object} filters - Search filters
   * @returns {Array} - Array of matching images
   */
  async searchImages(filters = {}) {
    const {
      userId,
      purpose,
      filename,
      minWidth,
      minHeight,
      maxSize,
      limit = 50,
      offset = 0
    } = filters;
    
    try {
      const db = database.getDb();
      
      let query = `
        SELECT * FROM images WHERE 1=1
      `;
      
      const params = [];
      
      // Apply filters
      if (userId !== undefined) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      if (purpose) {
        query += ` AND metadata LIKE '%"purpose":"${purpose}"%'`;
      }
      
      if (filename) {
        query += ' AND (filename LIKE ? OR original_filename LIKE ?)';
        params.push(`%${filename}%`, `%${filename}%`);
      }
      
      if (minWidth) {
        query += ' AND width >= ?';
        params.push(minWidth);
      }
      
      if (minHeight) {
        query += ' AND height >= ?';
        params.push(minHeight);
      }
      
      if (maxSize) {
        query += ' AND size <= ?';
        params.push(maxSize);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      return db.all(query, params);
    } catch (error) {
      logger.error('Failed to search images', {
        error: error.message,
        filters
      });
      return [];
    }
  }
}

module.exports = new ImageModel(); 