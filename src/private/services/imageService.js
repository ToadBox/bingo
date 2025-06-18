const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const logger = require('../utils/logger');
const constants = require('../config/constants');
const imageModel = require('../models/imageModel');

class ImageService {
  constructor() {
    this.imageDir = constants.IMAGES_DIR || path.join(__dirname, '../../public/images/cells');
    this.thumbnailsDir = path.join(this.imageDir, 'thumbnails');
    this.avatarsDir = path.join(path.dirname(this.imageDir), 'avatars');
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure the necessary directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.imageDir, { recursive: true });
      await fs.mkdir(this.thumbnailsDir, { recursive: true });
      await fs.mkdir(this.avatarsDir, { recursive: true });
      
      logger.debug('Image directories created/verified');
    } catch (error) {
      logger.error('Failed to create image directories', { error: error.message });
      throw error;
    }
  }

  /**
   * Upload and process an image
   * @param {Object} fileData - File data object
   * @param {number} userId - User ID
   * @param {Object} options - Processing options
   * @returns {Object} - Processed image info
   */
  async uploadImage(fileData, userId, options = {}) {
    const { 
      purpose = 'cell', // 'cell', 'avatar'
      thumbnail = true,
      resize = true,
      maxWidth = 1200,
      maxHeight = 1200,
      quality = 80
    } = options;
    
    try {
      // Validate file
      if (!fileData || !fileData.buffer) {
        throw new Error('No file provided');
      }
      
      // Get file info
      const buffer = fileData.buffer;
      const originalName = fileData.originalname || 'image.jpg';
      const mimetype = fileData.mimetype;
      const size = buffer.length;
      
      // Validate mimetype
      if (!constants.ALLOWED_MIME_TYPES.includes(mimetype)) {
        throw new Error(`Invalid file type: ${mimetype}`);
      }
      
      // Validate file size
      if (size > constants.MAX_FILE_SIZE) {
        throw new Error('File too large, max size is 50MB');
      }
      
      // Generate a unique filename
      const ext = path.extname(originalName).toLowerCase();
      const timestamp = Date.now();
      const hash = crypto.randomBytes(8).toString('hex');
      const filename = `${timestamp}-${hash}${ext}`;
      
      // Determine the target directory
      let targetDir = this.imageDir;
      if (purpose === 'avatar') {
        targetDir = this.avatarsDir;
      }
      
      // Process the image with Sharp
      const imageInfo = await sharp(buffer).metadata();
      
      let processedBuffer = buffer;
      let width = imageInfo.width;
      let height = imageInfo.height;
      
      // Resize if needed
      if (resize && (width > maxWidth || height > maxHeight)) {
        const resized = await sharp(buffer)
          .resize({
            width: Math.min(width, maxWidth),
            height: Math.min(height, maxHeight),
            fit: 'inside',
            withoutEnlargement: true
          })
          .toBuffer();
        
        processedBuffer = resized;
        
        // Update dimensions
        const resizedInfo = await sharp(resized).metadata();
        width = resizedInfo.width;
        height = resizedInfo.height;
      }
      
      // Save the processed image
      const imagePath = path.join(targetDir, filename);
      await fs.writeFile(imagePath, processedBuffer);
      
      // Generate thumbnail if requested
      let thumbnailPath = null;
      if (thumbnail) {
        const thumbnailBuffer = await sharp(processedBuffer)
          .resize({
            width: 300,
            height: 300,
            fit: 'inside',
            withoutEnlargement: true
          })
          .toBuffer();
        
        thumbnailPath = path.join(this.thumbnailsDir, filename);
        await fs.writeFile(thumbnailPath, thumbnailBuffer);
      }
      
      // Save to database
      const imageRecord = await imageModel.createImage({
        userId,
        filename,
        originalFilename: originalName,
        mimeType: mimetype,
        size,
        width,
        height,
        path: path.relative(path.join(__dirname, '../../public'), imagePath),
        thumbnailPath: thumbnailPath ? path.relative(path.join(__dirname, '../../public'), thumbnailPath) : null,
        metadata: JSON.stringify({
          purpose,
          timestamp,
          processed: resize,
          quality
        })
      });
      
      return {
        id: imageRecord.id,
        filename,
        path: imageRecord.path,
        thumbnailPath: imageRecord.thumbnail_path,
        width,
        height,
        size,
        url: `/${imageRecord.path}`,
        thumbnailUrl: imageRecord.thumbnail_path ? `/${imageRecord.thumbnail_path}` : null
      };
    } catch (error) {
      logger.error('Failed to upload image', { 
        error: error.message,
        userId,
        filename: fileData?.originalname
      });
      throw error;
    }
  }

  /**
   * Get image by ID
   * @param {number} imageId - Image ID
   * @returns {Object} - Image info
   */
  async getImage(imageId) {
    try {
      const image = await imageModel.getImageById(imageId);
      
      if (!image) {
        throw new Error('Image not found');
      }
      
      return {
        id: image.id,
        filename: image.filename,
        path: image.path,
        thumbnailPath: image.thumbnail_path,
        width: image.width,
        height: image.height,
        size: image.size,
        url: `/${image.path}`,
        thumbnailUrl: image.thumbnail_path ? `/${image.thumbnail_path}` : null,
        metadata: image.metadata ? JSON.parse(image.metadata) : {},
        createdAt: image.created_at,
        userId: image.user_id
      };
    } catch (error) {
      logger.error('Failed to get image', { 
        error: error.message,
        imageId
      });
      throw error;
    }
  }

  /**
   * Get all images for a user
   * @param {number} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Array} - Array of images
   */
  async getUserImages(userId, options = {}) {
    try {
      const { 
        limit = 50, 
        offset = 0,
        purpose
      } = options;
      
      const images = await imageModel.getUserImages(userId, { limit, offset, purpose });
      
      return images.map(image => ({
        id: image.id,
        filename: image.filename,
        path: image.path,
        thumbnailPath: image.thumbnail_path,
        width: image.width,
        height: image.height,
        size: image.size,
        url: `/${image.path}`,
        thumbnailUrl: image.thumbnail_path ? `/${image.thumbnail_path}` : null,
        metadata: image.metadata ? JSON.parse(image.metadata) : {},
        createdAt: image.created_at
      }));
    } catch (error) {
      logger.error('Failed to get user images', { 
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Delete an image
   * @param {number} imageId - Image ID
   * @param {number} userId - User ID (for permission check)
   * @returns {boolean} - Success status
   */
  async deleteImage(imageId, userId) {
    try {
      // Get image info
      const image = await imageModel.getImageById(imageId);
      
      if (!image) {
        throw new Error('Image not found');
      }
      
      // Check ownership or admin permission
      if (image.user_id !== userId) {
        const userModel = require('../models/userModel');
        const isAdmin = await userModel.isAdmin(userId);
        
        if (!isAdmin) {
          throw new Error('Permission denied');
        }
      }
      
      // Delete physical files
      const basePath = path.join(__dirname, '../../public');
      
      try {
        if (image.path) {
          await fs.unlink(path.join(basePath, image.path));
        }
        
        if (image.thumbnail_path) {
          await fs.unlink(path.join(basePath, image.thumbnail_path));
        }
      } catch (fileError) {
        logger.warn('Could not delete image files', {
          error: fileError.message,
          imageId,
          path: image.path
        });
      }
      
      // Delete from database
      return await imageModel.deleteImage(imageId);
    } catch (error) {
      logger.error('Failed to delete image', { 
        error: error.message,
        imageId,
        userId
      });
      throw error;
    }
  }
}

module.exports = new ImageService(); 