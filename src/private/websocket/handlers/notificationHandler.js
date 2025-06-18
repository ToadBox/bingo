const logger = require('../../utils/logger');
const notificationModel = require('../../models/notificationModel');

class NotificationHandler {
  /**
   * Register notification-related WebSocket event handlers
   * @param {Object} socket - Socket instance
   * @param {Object} wsServer - WebSocketServer instance
   */
  registerHandlers(socket, wsServer) {
    // Get latest notifications
    socket.on('notifications:get', async (data, callback) => {
      try {
        const { limit, offset } = data || {};
        const userId = socket.user.id;
        
        // Get notifications from the database
        const notifications = await notificationModel.getNotifications(userId, {
          limit: limit || 20,
          offset: offset || 0,
          unreadOnly: false
        });
        
        // Get unread count
        const unreadCount = await notificationModel.getUnreadCount(userId);
        
        callback({
          success: true,
          notifications,
          unreadCount
        });
      } catch (error) {
        logger.error('Error in notifications:get handler', {
          error: error.message,
          userId: socket.user?.id
        });
        callback({ error: 'Failed to get notifications' });
      }
    });

    // Mark notifications as read
    socket.on('notifications:markRead', async (data, callback) => {
      try {
        const { notificationIds, all } = data || {};
        const userId = socket.user.id;
        
        let success = false;
        
        if (all) {
          // Mark all notifications as read
          success = await notificationModel.markAllAsRead(userId);
        } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
          // Mark specific notifications as read
          success = await notificationModel.markAsRead(notificationIds, userId);
        } else {
          return callback({ error: 'notificationIds array or all flag is required' });
        }
        
        if (!success) {
          return callback({ error: 'Failed to mark notifications as read' });
        }
        
        // Get updated unread count
        const unreadCount = await notificationModel.getUnreadCount(userId);
        
        callback({
          success: true,
          unreadCount
        });
      } catch (error) {
        logger.error('Error in notifications:markRead handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
        callback({ error: 'Failed to mark notifications as read' });
      }
    });

    // Delete notifications
    socket.on('notifications:delete', async (data, callback) => {
      try {
        const { notificationIds, all } = data || {};
        const userId = socket.user.id;
        
        let success = false;
        
        if (all) {
          // Delete all user's notifications
          success = await notificationModel.deleteAllNotifications(userId);
        } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
          // Delete specific notifications
          success = await notificationModel.deleteNotifications(notificationIds, userId);
        } else {
          return callback({ error: 'notificationIds array or all flag is required' });
        }
        
        if (!success) {
          return callback({ error: 'Failed to delete notifications' });
        }
        
        callback({ success: true });
      } catch (error) {
        logger.error('Error in notifications:delete handler', {
          error: error.message,
          userId: socket.user?.id,
          data
        });
        callback({ error: 'Failed to delete notifications' });
      }
    });

    // Subscribe to real-time notifications
    socket.on('notifications:subscribe', async (callback) => {
      try {
        const userId = socket.user.id;
        
        // Add user to notification subscriptions
        socket.join(`user:${userId}:notifications`);
        
        callback({ success: true });
      } catch (error) {
        logger.error('Error in notifications:subscribe handler', {
          error: error.message,
          userId: socket.user?.id
        });
        callback({ error: 'Failed to subscribe to notifications' });
      }
    });

    // Unsubscribe from real-time notifications
    socket.on('notifications:unsubscribe', async (callback) => {
      try {
        const userId = socket.user.id;
        
        // Remove user from notification subscriptions
        socket.leave(`user:${userId}:notifications`);
        
        callback({ success: true });
      } catch (error) {
        logger.error('Error in notifications:unsubscribe handler', {
          error: error.message,
          userId: socket.user?.id
        });
        callback({ error: 'Failed to unsubscribe from notifications' });
      }
    });
  }

  /**
   * Send a notification to a user
   * @param {Object} io - Socket.IO instance
   * @param {number} userId - User ID
   * @param {Object} notification - Notification object
   */
  static sendNotification(io, userId, notification) {
    try {
      // Broadcast notification to all user's sockets subscribed to notifications
      io.to(`user:${userId}:notifications`).emit('notification:new', notification);
    } catch (error) {
      logger.error('Error sending notification via WebSocket', {
        error: error.message,
        userId,
        notification
      });
    }
  }
}

module.exports = new NotificationHandler(); 