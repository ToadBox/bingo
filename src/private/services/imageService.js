// Enhanced Image Service
// Handles image upload, processing, validation, and management with Sharp.js

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const sharedConstants = require('../../../shared/constants.js');
const logger = require('../utils/logger.js');
const constants = require('../config/constants');
const imageModel = require('../models/imageModel');

class ImageService {
  constructor() {
    this.imageDir = constants.IMAGES_DIR || path.join(__dirname, '../../public/images/cells');
    this.thumbnailsDir = path.join(this.imageDir, 'thumbnails');
    this.avatarsDir = path.join(path.dirname(this.imageDir), 'avatars');
    this.uploadDir = path.join(__dirname, '../../../uploads/images');
    this.thumbnailDir = path.join(__dirname, '../../../uploads/images/thumbnails');
    
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
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
      
      logger.debug('Image directories created/verified');
    } catch (error) {
      logger.error('Failed to create image directories', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate uploaded file
   * @param {Object} file - File object
   * @returns {Object} - Validation result
   */
  validateFile(file) {
    const validation = sharedConstants.validateImageFile(file);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }

    // Additional server-side validations
    if (!file.buffer) {
      return { valid: false, error: 'File buffer is required' };
    }

    return { valid: true };
  }

  /**
   * Generate unique filename
   * @param {string} originalName - Original file name
   * @param {string} extension - File extension
   * @returns {string} - Generated filename
   */
  generateFilename(originalName, extension) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const sanitizedName = originalName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .slice(0, 50);
    
    return `${timestamp}_${random}_${sanitizedName}${extension}`;
  }

  /**
   * Extract image metadata
   * @param {Buffer} buffer - Image buffer
   * @returns {Object} - Extracted metadata
   */
  async extractMetadata(buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        hasAlpha: metadata.hasAlpha,
        channels: metadata.channels
      };
    } catch (error) {
      logger.error('Failed to extract image metadata:', error);
      return null;
    }
  }

  /**
   * Process and optimize image
   * @param {Buffer} buffer - Image buffer
   * @param {Object} options - Processing options
   * @returns {Buffer} - Processed image buffer
   */
  async processImage(buffer, options = {}) {
    try {
      const {
        maxWidth = sharedConstants.IMAGE.MAX_WIDTH,
        maxHeight = sharedConstants.IMAGE.MAX_HEIGHT,
        quality = 85,
        format = 'webp'
      } = options;

      let processor = sharp(buffer);

      // Get original dimensions
      const metadata = await processor.metadata();
      
      // Resize if necessary
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        processor = processor.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Convert format and optimize
      if (format === 'webp') {
        processor = processor.webp({ quality });
      } else if (format === 'jpeg') {
        processor = processor.jpeg({ quality });
      } else if (format === 'png') {
        processor = processor.png({ compressionLevel: 8 });
      }

      return await processor.toBuffer();
    } catch (error) {
      logger.error('Failed to process image:', error);
      throw new Error('Image processing failed');
    }
  }

  /**
   * Generate thumbnail
   * @param {Buffer} buffer - Image buffer
   * @param {Object} options - Thumbnail options
   * @returns {Buffer} - Generated thumbnail buffer
   */
  async generateThumbnail(buffer, options = {}) {
    try {
      const {
        width = sharedConstants.IMAGE.THUMBNAIL_WIDTH,
        height = sharedConstants.IMAGE.THUMBNAIL_HEIGHT,
        quality = 80
      } = options;

      return await sharp(buffer)
        .resize(width, height, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality })
        .toBuffer();
    } catch (error) {
      logger.error('Failed to generate thumbnail:', error);
      throw new Error('Thumbnail generation failed');
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
      const validation = this.validateFile(fileData);
      if (!validation.valid) {
        return { success: false, error: validation.error };
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
      const filename = this.generateFilename(
        path.basename(originalName, ext),
        ext
      );
      
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
        const thumbnailBuffer = await this.generateThumbnail(processedBuffer);
        
        thumbnailPath = path.join(this.thumbnailDir, filename);
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
        success: true,
        image: {
          id: imageRecord.id,
          filename,
          path: imageRecord.path,
          thumbnailPath: imageRecord.thumbnail_path,
          width,
          height,
          size,
          url: `/${imageRecord.path}`,
          thumbnailUrl: imageRecord.thumbnail_path ? `/${imageRecord.thumbnail_path}` : null
        }
      };
    } catch (error) {
      logger.error('Failed to upload image', { 
        error: error.message,
        userId,
        filename: fileData?.originalname
      });
      return { success: false, error: 'Image upload failed' };
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
        success: true,
        image: {
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
        }
      };
    } catch (error) {
      logger.error('Failed to get image', { 
        error: error.message,
        imageId
      });
      return { success: false, error: 'Failed to retrieve image' };
    }
  }

  /**
   * Get all images for a user
   * @param {number} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Object} - Array of images and hasMore flag
   */
  async getUserImages(userId, options = {}) {
    try {
      const { 
        limit = 50, 
        offset = 0,
        purpose
      } = options;
      
      const images = await imageModel.getUserImages(userId, { limit, offset, purpose });
      
      const formattedImages = images.map(image => ({
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

      return {
        success: true,
        images: formattedImages,
        hasMore: images.length === limit
      };
    } catch (error) {
      logger.error('Failed to get user images', { 
        error: error.message,
        userId
      });
      return { success: false, error: 'Failed to retrieve images' };
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

  // Serve image file
  async serveImage(filename, thumbnail = false) {
    try {
      const imagePath = thumbnail 
        ? path.join(this.thumbnailDir, filename)
        : path.join(this.uploadDir, filename);

      // Check if file exists
      try {
        await fs.access(imagePath);
      } catch {
        return { success: false, error: 'Image not found' };
      }

      // Read file
      const imageBuffer = await fs.readFile(imagePath);
      
      // Determine MIME type
      const extension = path.extname(filename).toLowerCase();
      let mimeType = 'image/webp';
      
      if (extension === '.jpg' || extension === '.jpeg') {
        mimeType = 'image/jpeg';
      } else if (extension === '.png') {
        mimeType = 'image/png';
      } else if (extension === '.gif') {
        mimeType = 'image/gif';
      }

      return {
        success: true,
        buffer: imageBuffer,
        mimeType,
        filename
      };

    } catch (error) {
      logger.error('Failed to serve image:', error, { filename, thumbnail });
      return { success: false, error: 'Failed to serve image' };
    }
  }

  // Clean up orphaned images (images not referenced in any cells)
  async cleanupOrphanedImages() {
    try {
      const imageModel = require('../models/imageModel.js');
      const cellModel = require('../models/cellModel.js');
      
      // Get all images
      const allImages = await imageModel.getAll();
      
      // Get all image references in cells
      const referencedImages = await cellModel.getImageReferences();
      const referencedImageIds = new Set(referencedImages.map(ref => ref.imageId));
      
      // Find orphaned images (older than 1 hour and not referenced)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const orphanedImages = allImages.filter(image => 
        image.createdAt < oneHourAgo && !referencedImageIds.has(image.id)
      );

      let deletedCount = 0;
      for (const image of orphanedImages) {
        const result = await this.deleteImage(image.id);
        if (result.success) {
          deletedCount++;
        }
      }

      logger.info('Cleanup completed', {
        totalImages: allImages.length,
        orphanedFound: orphanedImages.length,
        deletedCount
      });

      return {
        success: true,
        deletedCount,
        orphanedFound: orphanedImages.length
      };

    } catch (error) {
      logger.error('Failed to cleanup orphaned images:', error);
      return { success: false, error: 'Cleanup failed' };
    }
  }

  // Get image statistics
  async getImageStats(userId = null) {
    try {
      const imageModel = require('../models/imageModel.js');
      const stats = await imageModel.getStats(userId);

      return {
        success: true,
        stats
      };

    } catch (error) {
      logger.error('Failed to get image stats:', error, { userId });
      return { success: false, error: 'Failed to get statistics' };
    }
  }
}

module.exports = new ImageService(); 