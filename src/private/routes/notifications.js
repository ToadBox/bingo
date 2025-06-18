const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const notificationModel = require('../models/notificationModel');

/**
 * Get notifications for authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';
    
    const notifications = await notificationModel.getUserNotifications(userId, {
      limit,
      offset,
      unreadOnly
    });
    
    // Get unread count
    const unreadCount = await notificationModel.getUnreadCount(userId);
    
    return res.json({
      notifications,
      meta: {
        total: notifications.length,
        unreadCount,
        limit,
        offset
      }
    });
  } catch (error) {
    logger.error('Failed to get notifications', {
      error: error.message,
      userId: req.user?.id
    });
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * Mark a notification as read
 */
router.post('/:notificationId/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;
    
    const success = await notificationModel.markAsRead(notificationId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Notification not found or not owned by user' });
    }
    
    // Get updated unread count
    const unreadCount = await notificationModel.getUnreadCount(userId);
    
    return res.json({ 
      success: true,
      unreadCount
    });
  } catch (error) {
    logger.error('Failed to mark notification as read', {
      error: error.message,
      userId: req.user?.id,
      notificationId: req.params.notificationId
    });
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * Mark all notifications as read
 */
router.post('/read-all', async (req, res) => {
  try {
    const userId = req.user.id;
    
    await notificationModel.markAllAsRead(userId);
    
    return res.json({ success: true, unreadCount: 0 });
  } catch (error) {
    logger.error('Failed to mark all notifications as read', {
      error: error.message,
      userId: req.user?.id
    });
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * Create a test notification (for development)
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', async (req, res) => {
    try {
      const userId = req.user.id;
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
      
      return res.json({ success: true, notification });
    } catch (error) {
      logger.error('Failed to create test notification', {
        error: error.message,
        userId: req.user?.id
      });
      return res.status(500).json({ error: 'Failed to create test notification' });
    }
  });
}

module.exports = router; 