// Image Routes
// Handles image upload, serving, and management with proper authentication

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { isAuthenticated } = require('../middleware/auth');
const imageService = require('../services/imageService');
const sharedConstants = require('../../../shared/constants.js');
const logger = require('../utils/logger.js');

const router = express.Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: sharedConstants.IMAGE.MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (sharedConstants.IMAGE.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'), false);
    }
  }
});

// Upload rate limiting - more restrictive than general API
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads per window
  message: {
    error: 'Too many uploads, please try again later.',
    code: sharedConstants.ERROR_CODES.RATE_LIMIT_EXCEEDED
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => `upload_${req.ip}_${req.user?.userId || 'anonymous'}`,
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.userId,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      error: 'Too many uploads, please try again later.',
      code: sharedConstants.ERROR_CODES.RATE_LIMIT_EXCEEDED,
      requestId: req.id
    });
  }
});

// Middleware to add request ID for tracking
router.use((req, res, next) => {
  req.requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  next();
});

// Upload image endpoint
router.post('/upload', uploadLimiter, isAuthenticated, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file provided',
        code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD,
        requestId: req.requestId
      });
    }

    // Ensure user is authenticated (not anonymous)
    if (!req.user || req.user.isAnonymous) {
      return res.status(401).json({
        error: 'Authentication required for image upload',
        code: sharedConstants.ERROR_CODES.AUTH_REQUIRED,
        requestId: req.requestId
      });
    }

    const result = await imageService.uploadImage(req.file, req.user.userId, {
      maxWidth: parseInt(req.body.maxWidth) || undefined,
      maxHeight: parseInt(req.body.maxHeight) || undefined,
      quality: parseInt(req.body.quality) || undefined
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.VALIDATION_FAILED,
        requestId: req.requestId
      });
    }

    logger.info('Image uploaded successfully', {
      userId: req.user.userId,
      imageId: result.image.id,
      filename: result.image.filename,
      size: result.image.size,
      requestId: req.requestId
    });

    res.json({
      success: true,
      image: result.image,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Image upload error:', error, {
      userId: req.user?.userId,
      filename: req.file?.originalname,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Image upload failed',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Serve image file
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({
        error: 'Filename is required',
        code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD,
        requestId: req.requestId
      });
    }

    const result = await imageService.serveImage(filename, false);

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND,
        requestId: req.requestId
      });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': result.mimeType,
      'Content-Length': result.buffer.length,
      'Cache-Control': 'public, max-age=31536000', // 1 year cache
      'ETag': `"${filename}"`
    });

    res.send(result.buffer);

  } catch (error) {
    logger.error('Image serve error:', error, {
      filename: req.params.filename,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to serve image',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Serve thumbnail
router.get('/thumbnails/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({
        error: 'Filename is required',
        code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD,
        requestId: req.requestId
      });
    }

    const result = await imageService.serveImage(filename, true);

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND,
        requestId: req.requestId
      });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': result.mimeType,
      'Content-Length': result.buffer.length,
      'Cache-Control': 'public, max-age=31536000', // 1 year cache
      'ETag': `"thumb_${filename}"`
    });

    res.send(result.buffer);

  } catch (error) {
    logger.error('Thumbnail serve error:', error, {
      filename: req.params.filename,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to serve thumbnail',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Get image details
router.get('/details/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    
    if (!imageId) {
      return res.status(400).json({
        error: 'Image ID is required',
        code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD,
        requestId: req.requestId
      });
    }

    const result = await imageService.getImage(imageId);

    if (!result.success) {
      return res.status(404).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND,
        requestId: req.requestId
      });
    }

    res.json({
      success: true,
      image: result.image,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Get image details error:', error, {
      imageId: req.params.imageId,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to get image details',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Get user's images
router.get('/user/my', isAuthenticated, async (req, res) => {
  try {
    if (!req.user || req.user.isAnonymous) {
      return res.status(401).json({
        error: 'Authentication required',
        code: sharedConstants.ERROR_CODES.AUTH_REQUIRED,
        requestId: req.requestId
      });
    }

    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await imageService.getUserImages(req.user.userId, {
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      sortBy,
      sortOrder
    });

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.SERVER_ERROR,
        requestId: req.requestId
      });
    }

    res.json({
      success: true,
      images: result.images,
      hasMore: result.hasMore,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Get user images error:', error, {
      userId: req.user?.userId,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to get user images',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Delete image
router.delete('/:imageId', isAuthenticated, async (req, res) => {
  try {
    const { imageId } = req.params;
    
    if (!imageId) {
      return res.status(400).json({
        error: 'Image ID is required',
        code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD,
        requestId: req.requestId
      });
    }

    if (!req.user || req.user.isAnonymous) {
      return res.status(401).json({
        error: 'Authentication required',
        code: sharedConstants.ERROR_CODES.AUTH_REQUIRED,
        requestId: req.requestId
      });
    }

    const result = await imageService.deleteImage(imageId, req.user.userId);

    if (!result.success) {
      const statusCode = result.error === 'Image not found' ? 404 : 
                        result.error === 'Access denied' ? 403 : 500;
      const errorCode = result.error === 'Image not found' ? 
                       sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND :
                       result.error === 'Access denied' ?
                       sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS :
                       sharedConstants.ERROR_CODES.SERVER_ERROR;

      return res.status(statusCode).json({
        error: result.error,
        code: errorCode,
        requestId: req.requestId
      });
    }

    logger.info('Image deleted successfully', {
      userId: req.user.userId,
      imageId,
      requestId: req.requestId
    });

    res.json({
      success: true,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Delete image error:', error, {
      userId: req.user?.userId,
      imageId: req.params.imageId,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to delete image',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Get image statistics (admin only)
router.get('/admin/stats', isAuthenticated, async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        error: 'Admin access required',
        code: sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS,
        requestId: req.requestId
      });
    }

    const result = await imageService.getImageStats();

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.SERVER_ERROR,
        requestId: req.requestId
      });
    }

    res.json({
      success: true,
      stats: result.stats,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Get image stats error:', error, {
      userId: req.user?.userId,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to get image statistics',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Cleanup orphaned images (admin only)
router.post('/admin/cleanup', isAuthenticated, async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        error: 'Admin access required',
        code: sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS,
        requestId: req.requestId
      });
    }

    const result = await imageService.cleanupOrphanedImages();

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        code: sharedConstants.ERROR_CODES.SERVER_ERROR,
        requestId: req.requestId
      });
    }

    logger.info('Image cleanup completed', {
      userId: req.user.userId,
      deletedCount: result.deletedCount,
      orphanedFound: result.orphanedFound,
      requestId: req.requestId
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      orphanedFound: result.orphanedFound,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Image cleanup error:', error, {
      userId: req.user?.userId,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Failed to cleanup images',
      code: sharedConstants.ERROR_CODES.SERVER_ERROR,
      requestId: req.requestId
    });
  }
});

// Health check for image service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'image-service',
    timestamp: Date.now(),
    requestId: req.requestId
  });
});

module.exports = router;