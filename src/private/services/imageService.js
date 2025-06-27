const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../utils/logger');
const DatabaseHelpers = require('../utils/databaseHelpers');
const database = require('../models/database');

class ImageService {
  constructor() {
    this.dbHelpers = new DatabaseHelpers(database);
    this.uploadDir = path.join(process.cwd(), 'uploads', 'images');
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];
    this.allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    
    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  /**
   * Ensure upload directory exists
   */
  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      logger.image.debug('Upload directory ensured', { uploadDir: this.uploadDir });
    } catch (error) {
      logger.image.error('Failed to create upload directory', {
        error: error.message,
        uploadDir: this.uploadDir
      });
    }
  }

  /**
   * Validate image URL
   * @param {string} url - Image URL to validate
   * @returns {Object} - Validation result
   */
  validateImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL is required' };
      }
      
    // Check for data URI (base64 encoded image)
    const dataUriRegex = /^data:image\/([a-zA-Z]*);base64,([^"]*)/;
    const dataUriMatch = url.match(dataUriRegex);
    
    if (dataUriMatch) {
      const mimeType = `image/${dataUriMatch[1]}`;
      const base64Data = dataUriMatch[2];
      
      // Validate MIME type
      if (!this.allowedMimeTypes.includes(mimeType)) {
        return { 
          valid: false, 
          error: `Unsupported image type: ${mimeType}. Allowed types: ${this.allowedMimeTypes.join(', ')}` 
        };
      }
      
      // Estimate file size (base64 is ~4/3 larger than binary)
      const estimatedSize = (base64Data.length * 3) / 4;
      if (estimatedSize > this.maxFileSize) {
        return { 
          valid: false, 
          error: `Image too large. Maximum size: ${this.maxFileSize / 1024 / 1024}MB` 
        };
      }
      
      return { 
        valid: true, 
        type: 'data_uri', 
        mimeType, 
        estimatedSize 
      };
    }

    // Check for HTTP(S) URL
    const httpUrlRegex = /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
    if (httpUrlRegex.test(url)) {
      return { 
        valid: true, 
        type: 'url',
        url 
      };
    }

    return { 
      valid: false, 
      error: 'Invalid image URL format. Must be a valid HTTP(S) URL or data URI' 
    };
      }
      
  /**
   * Process and save uploaded image
   * @param {string} dataUri - Base64 data URI
   * @param {string} userId - User ID uploading the image
   * @returns {Object} - Processed image info
   */
  async processUploadedImage(dataUri, userId) {
    try {
      const validation = this.validateImageUrl(dataUri);
      
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      if (validation.type !== 'data_uri') {
        throw new Error('Only data URI uploads are supported for processing');
      }

      // Extract data from data URI
      const dataUriMatch = dataUri.match(/^data:image\/([a-zA-Z]*);base64,([^"]*)/);
      const mimeType = `image/${dataUriMatch[1]}`;
      const base64Data = dataUriMatch[2];
      const buffer = Buffer.from(base64Data, 'base64');
        
      // Generate unique filename
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const extension = this.getExtensionFromMimeType(mimeType);
      const filename = `${hash}${extension}`;
      const filePath = path.join(this.uploadDir, filename);

      // Check if file already exists
      const existingImage = await this.getImageByFilename(filename);
      if (existingImage) {
        logger.image.debug('Image already exists, returning existing record', {
          filename,
          existingId: existingImage.id
        });
        return {
          id: existingImage.id,
          filename: existingImage.filename,
          path: existingImage.path,
          url: `/api/images/${existingImage.filename}`,
          size: existingImage.size,
          mimeType: existingImage.mime_type
        };
      }

      // Save file to disk
      await fs.writeFile(filePath, buffer);

      // Save image record to database
      const imageRecord = await this.dbHelpers.insertRecord('images', {
        user_id: userId,
        filename,
        original_filename: `upload_${Date.now()}${extension}`,
        mime_type: mimeType,
        size: buffer.length,
        path: filePath,
        metadata: JSON.stringify({
          uploaded_at: new Date().toISOString(),
          hash
        })
      }, 'Image');

      logger.image.info('Image uploaded and processed', {
        imageId: imageRecord.id,
        filename,
        size: buffer.length,
        mimeType,
        userId
      });
      
      return {
        id: imageRecord.id,
        filename,
        path: filePath,
        url: `/api/images/${filename}`,
        size: buffer.length,
        mimeType
      };

    } catch (error) {
      logger.image.error('Failed to process uploaded image', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get image by filename
   * @param {string} filename - Image filename
   * @returns {Object|null} - Image record or null
   */
  async getImageByFilename(filename) {
    return await this.dbHelpers.getRecord(
      'SELECT * FROM images WHERE filename = ?',
      [filename],
      'get image by filename',
      'Image'
    );
  }

  /**
   * Get image by ID
   * @param {number} imageId - Image ID
   * @returns {Object|null} - Image record or null
   */
  async getImageById(imageId) {
    return await this.dbHelpers.getRecord(
      'SELECT * FROM images WHERE id = ?',
      [imageId],
      'get image by ID',
      'Image'
    );
  }

  /**
   * Get images for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} - Paginated images
   */
  async getUserImages(userId, options = {}) {
    return await this.dbHelpers.getPaginatedRecords('images', {
      conditions: { user_id: userId },
      orderBy: 'created_at DESC',
      ...options
    }, 'Image');
  }

  /**
   * Delete an image
   * @param {number} imageId - Image ID
   * @param {string} userId - User ID (for ownership check)
   * @returns {boolean} - Success status
   */
  async deleteImage(imageId, userId) {
    try {
      const image = await this.getImageById(imageId);
      
      if (!image) {
        return false;
      }
      
      // Check ownership
      if (image.user_id !== userId) {
          throw new Error('Permission denied');
        }

      // Delete file from disk
      try {
        await fs.unlink(image.path);
        logger.image.debug('Image file deleted from disk', { 
          imageId, 
          path: image.path 
        });
      } catch (fileError) {
        logger.image.warn('Failed to delete image file from disk', {
          imageId,
          path: image.path,
          error: fileError.message
        });
        // Continue with database deletion even if file deletion fails
      }
      
      // Delete record from database
      const deletedRows = await this.dbHelpers.deleteRecord('images', { id: imageId }, 'Image');
      
      if (deletedRows > 0) {
        logger.image.info('Image deleted successfully', { imageId, userId });
        return true;
      }

      return false;
    } catch (error) {
      logger.image.error('Failed to delete image', {
        error: error.message,
        imageId,
        userId
      });
      throw error;
    }
  }

  /**
   * Get file extension from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} - File extension
   */
  getExtensionFromMimeType(mimeType) {
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg'
    };
    
    return mimeToExt[mimeType] || '.jpg';
  }

  /**
   * Clean up orphaned images (images not referenced by any cells)
   * @returns {number} - Number of images cleaned up
   */
  async cleanupOrphanedImages() {
    try {
      // Find images not referenced by any cells
      const orphanedImages = await this.dbHelpers.getRecords(`
        SELECT i.* FROM images i
        LEFT JOIN cells c ON c.value = '/api/images/' || i.filename AND c.type = 'image'
        WHERE c.id IS NULL
        AND i.created_at < datetime('now', '-7 days')
      `, [], 'find orphaned images', 'Image');

      let cleanedCount = 0;
      
      for (const image of orphanedImages) {
        try {
          // Delete file from disk
          await fs.unlink(image.path);
          
          // Delete from database
          await this.dbHelpers.deleteRecord('images', { id: image.id }, 'Image');
          
          cleanedCount++;
          
          logger.image.debug('Orphaned image cleaned up', {
            imageId: image.id,
            filename: image.filename
          });
        } catch (error) {
          logger.image.warn('Failed to clean up orphaned image', {
            imageId: image.id,
            filename: image.filename,
            error: error.message
          });
        }
      }

      if (cleanedCount > 0) {
        logger.image.info('Orphaned images cleanup completed', {
          cleanedCount,
          totalFound: orphanedImages.length
        });
      }

      return cleanedCount;
    } catch (error) {
      logger.image.error('Failed to cleanup orphaned images', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get image statistics
   * @returns {Object} - Image statistics
   */
  async getImageStats() {
    try {
      const stats = await this.dbHelpers.getRecord(`
        SELECT 
          COUNT(*) as total_images,
          SUM(size) as total_size,
          AVG(size) as average_size,
          COUNT(DISTINCT user_id) as unique_users
        FROM images
      `, [], 'get image statistics', 'Image');

      return {
        totalImages: stats.total_images || 0,
        totalSize: stats.total_size || 0,
        averageSize: Math.round(stats.average_size || 0),
        uniqueUsers: stats.unique_users || 0,
        maxFileSize: this.maxFileSize,
        allowedTypes: this.allowedMimeTypes
      };
    } catch (error) {
      logger.image.error('Failed to get image statistics', {
        error: error.message
      });
      return {
        totalImages: 0,
        totalSize: 0,
        averageSize: 0,
        uniqueUsers: 0,
        maxFileSize: this.maxFileSize,
        allowedTypes: this.allowedMimeTypes
      };
    }
  }
}

module.exports = new ImageService(); 