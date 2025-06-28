const express = require('express');
const router = express.Router();

const ErrorReportModel = require('../../models/errorReportModel');
const logger = require('../../utils/logger').admin;
const { sendSuccess, sendError, asyncHandler } = require('../../utils/responseHelpers');
const { requireAdmin } = require('../../middleware/auth');
const globalCache = require('../../utils/globalCache');

/**
 * GET /api/admin/error-reports
 * Query params: page, limit, component, resolved, since
 */
router.get('/', asyncHandler(async (req, res) => {
  // Require admin permission (set by auth middleware)
  if (!req.isAdmin) {
    return sendError(res, 403, 'Admin access required');
  }

  const { page, limit, component, resolved, since } = req.query;
  const options = {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    component,
    resolved: resolved !== undefined ? resolved === 'true' : undefined,
    since: since ? new Date(since) : undefined,
  };

  const result = await ErrorReportModel.getErrorReports(options);
  logger.info('Error reports retrieved', { adminId: req.user?.id, count: result.errors.length });
  return sendSuccess(res, result);
}, 'Admin'));

/**
 * PATCH /api/admin/error-reports/:id/resolve
 */
router.patch('/:id/resolve', asyncHandler(async (req, res) => {
  if (!req.isAdmin) {
    return sendError(res, 403, 'Admin access required');
  }

  const { id } = req.params;
  await ErrorReportModel.resolveError(id, req.user?.user_id);
  logger.info('Error report resolved', { id, adminId: req.user?.user_id });
  return sendSuccess(res, { resolved: true });
}, 'Admin'));

/**
 * GET /cache/stats - Get cache statistics (admin only)
 */
router.get('/cache/stats', requireAdmin, asyncHandler(async (req, res) => {
  try {
    if (!globalCache.isEnabled()) {
      return sendSuccess(res, {
        enabled: false,
        message: 'Cache is disabled'
      });
    }

    const stats = globalCache.getStats();
    
    logger.info('Cache statistics retrieved', {
      strategies: Object.keys(stats),
      adminId: req.user?.user_id
    });
    
    sendSuccess(res, {
      enabled: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to retrieve cache statistics', {
      error: error.message,
      adminId: req.user?.user_id
    });
    sendError(res, 500, 'Failed to retrieve cache statistics');
  }
}));

/**
 * POST /cache/clear - Clear all caches (admin only)
 */
router.post('/cache/clear', requireAdmin, asyncHandler(async (req, res) => {
  try {
    if (!globalCache.isEnabled()) {
      return sendError(res, 400, 'Cache is disabled');
    }

    globalCache.clear();
    
    logger.info('All caches cleared by admin', {
      adminId: req.user.user_id
    });
    
    sendSuccess(res, {
      message: 'All caches cleared successfully'
    });
  } catch (error) {
    logger.error('Failed to clear caches', {
      error: error.message,
      adminId: req.user.user_id
    });
    sendError(res, 500, 'Failed to clear caches');
  }
}));

module.exports = router; 