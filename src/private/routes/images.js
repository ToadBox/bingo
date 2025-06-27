const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const imageService = require('../services/imageService');
const { isAuthenticated } = require('../middleware/auth');
const { validatePagination, createValidator } = require('../middleware/validation');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler 
} = require('../utils/responseHelpers');

/**
 * POST /upload - Upload an image via data URI
 */
router.post('/upload', isAuthenticated, asyncHandler(async (req, res) => {
  const { dataUri } = req.body;
  const userId = req.user.user_id;
  
  if (!dataUri) {
    return sendError(res, 400, 'Data URI is required', null, 'Image');
  }
  
  // Validate the image
  const validation = imageService.validateImageUrl(dataUri);
  if (!validation.valid) {
    return sendError(res, 400, validation.error, null, 'Image');
  }
  
  if (validation.type !== 'data_uri') {
    return sendError(res, 400, 'Only data URI uploads are supported', null, 'Image');
  }
  
  // Process and save the image
  const processedImage = await imageService.processUploadedImage(dataUri, userId);
  
  logger.image.info('Image uploaded successfully', {
    imageId: processedImage.id,
    filename: processedImage.filename,
    size: processedImage.size,
    userId
  });
  
  return sendSuccess(res, {
    image: {
      id: processedImage.id,
      filename: processedImage.filename,
      url: processedImage.url,
      size: processedImage.size,
      mimeType: processedImage.mimeType
    }
  }, 201, 'Image');
}, 'Image'));

/**
 * GET /:filename - Serve an uploaded image
 */
router.get('/:filename', asyncHandler(async (req, res) => {
  const { filename } = req.params;
  
  // Get image record from database
  const image = await imageService.getImageByFilename(filename);
  
  if (!image) {
    return sendError(res, 404, 'Image not found', null, 'Image');
  }
  
  try {
    // Check if file exists
    await fs.access(image.path);
    
    // Set appropriate headers
    res.set({
      'Content-Type': image.mime_type,
      'Content-Length': image.size,
      'Cache-Control': 'public, max-age=31536000', // 1 year cache
      'ETag': `"${filename}"`,
      'Last-Modified': new Date(image.created_at).toUTCString()
    });
    
    // Send file
    res.sendFile(path.resolve(image.path));
    
    logger.image.debug('Image served successfully', {
      filename,
      imageId: image.id,
      size: image.size
    });
    
  } catch (error) {
    logger.image.error('Failed to serve image file', {
      filename,
      imageId: image.id,
      path: image.path,
      error: error.message
    });
    
    return sendError(res, 500, 'Failed to serve image', null, 'Image');
  }
}, 'Image'));

/**
 * GET / - Get user's uploaded images
 */
router.get('/', isAuthenticated, validatePagination, asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
  const { limit, offset } = req.pagination;
  
  const result = await imageService.getUserImages(userId, {
    limit,
    offset
  });
  
  // Format images for response
  const formattedImages = result.records.map(image => ({
    id: image.id,
    filename: image.filename,
    originalFilename: image.original_filename,
    url: `/api/images/${image.filename}`,
    size: image.size,
    mimeType: image.mime_type,
    createdAt: image.created_at,
    metadata: image.metadata ? JSON.parse(image.metadata) : {}
  }));
  
  logger.image.debug('User images retrieved', {
    userId,
    count: formattedImages.length,
    total: result.pagination.total
  });
  
  return sendSuccess(res, {
    images: formattedImages,
    pagination: result.pagination
  }, 200, 'Image');
}, 'Image'));

/**
 * DELETE /:imageId - Delete an uploaded image
 */
router.delete('/:imageId', isAuthenticated, asyncHandler(async (req, res) => {
  const { imageId } = req.params;
  const userId = req.user.user_id;
  
  const imageIdNum = parseInt(imageId);
  if (isNaN(imageIdNum)) {
    return sendError(res, 400, 'Invalid image ID', null, 'Image');
  }
  
  const success = await imageService.deleteImage(imageIdNum, userId);
  
  if (!success) {
    return sendError(res, 404, 'Image not found or permission denied', null, 'Image');
  }
  
  logger.image.info('Image deleted successfully', {
    imageId: imageIdNum,
    userId
  });
  
  return sendSuccess(res, { success: true }, 200, 'Image');
}, 'Image'));

/**
 * POST /validate - Validate an image URL or data URI
 */
router.post('/validate', asyncHandler(async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return sendError(res, 400, 'URL is required', null, 'Image');
  }
  
  const validation = imageService.validateImageUrl(url);
  
  return sendSuccess(res, {
    valid: validation.valid,
    error: validation.error || null,
    type: validation.type || null,
    details: {
      mimeType: validation.mimeType || null,
      estimatedSize: validation.estimatedSize || null
    }
  }, 200, 'Image');
}, 'Image'));

/**
 * GET /stats - Get image statistics (admin only)
 */
router.get('/stats', isAuthenticated, asyncHandler(async (req, res) => {
  // Check if user is admin
  if (!req.user.is_admin) {
    return sendError(res, 403, 'Admin access required', null, 'Image');
  }
  
  const stats = await imageService.getImageStats();
  
  logger.image.debug('Image statistics retrieved', {
    adminUserId: req.user.user_id,
    stats
  });
  
  return sendSuccess(res, stats, 200, 'Image');
}, 'Image'));

/**
 * POST /cleanup - Cleanup orphaned images (admin only)
 */
router.post('/cleanup', isAuthenticated, asyncHandler(async (req, res) => {
  // Check if user is admin
  if (!req.user.is_admin) {
    return sendError(res, 403, 'Admin access required', null, 'Image');
  }
  
  const cleanedCount = await imageService.cleanupOrphanedImages();
  
  logger.image.info('Orphaned images cleanup completed', {
    adminUserId: req.user.user_id,
    cleanedCount
  });
  
  return sendSuccess(res, {
    success: true,
    cleanedCount,
    message: `${cleanedCount} orphaned images cleaned up`
  }, 200, 'Image');
}, 'Image'));

module.exports = router; 