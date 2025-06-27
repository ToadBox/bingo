const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const notificationModel = require('../models/notificationModel');
const { validatePagination } = require('../middleware/validation');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler 
} = require('../utils/responseHelpers');

/**
 * Get notifications for authenticated user
 */
router.get('/', validatePagination, asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
  const { limit, offset } = req.pagination;
    const unreadOnly = req.query.unreadOnly === 'true';
    
    const notifications = await notificationModel.getUserNotifications(userId, {
      limit,
      offset,
      unreadOnly
    });
    
    // Get unread count
    const unreadCount = await notificationModel.getUnreadCount(userId);
    
  logger.notification.debug('Notifications retrieved', {
    userId,
    notificationCount: notifications.length,
    unreadCount
  });
  
  return sendSuccess(res, {
      notifications,
      meta: {
        total: notifications.length,
        unreadCount,
        limit,
        offset
      }
  }, 200, 'Notification');
}, 'API'));

/**
 * Mark a notification as read
 */
router.post('/:notificationId/read', asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
    const { notificationId } = req.params;
    
    const success = await notificationModel.markAsRead(notificationId, userId);
    
    if (!success) {
    return sendError(res, 404, 'Notification not found or not owned by user', null, 'API');
    }
    
    // Get updated unread count
    const unreadCount = await notificationModel.getUnreadCount(userId);
    
  logger.notification.debug('Notification marked as read', {
    userId,
    notificationId,
      unreadCount
    });
  
  return sendSuccess(res, { 
    success: true,
    unreadCount
  }, 200, 'Notification');
}, 'API'));

/**
 * Mark all notifications as read
 */
router.post('/read-all', asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
    
    await notificationModel.markAllAsRead(userId);
    
  logger.notification.info('All notifications marked as read', { userId });
  
  return sendSuccess(res, { success: true, unreadCount: 0 }, 200, 'Notification');
}, 'API'));

/**
 * Create a test notification (for development)
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', asyncHandler(async (req, res) => {
    const userId = req.user.user_id;
      const { type = 'test', message = 'Test notification' } = req.body;
      
      const notification = await notificationModel.createNotification({
        userId,
        message,
        type,
        data: {
          test: true,
          timestamp: new Date().toISOString()
        }
      });
      
    logger.notification.debug('Test notification created', { 
      userId, 
      notificationId: notification.id 
    });
    
    return sendSuccess(res, { success: true, notification }, 200, 'Notification');
  }, 'API'));
}

module.exports = router; 