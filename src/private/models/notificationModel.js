const database = require('./database');
const logger = require('../utils/logger');

class NotificationModel {
  constructor() {}

  /**
   * Create a new notification
   * @param {Object} notificationData - Notification data
   * @returns {Object} - Created notification
   */
  async createNotification(notificationData) {
    const { userId, message, type, data } = notificationData;
    
    try {
      const db = database.getDb();
      const result = await db.run(`
        INSERT INTO notifications (user_id, message, type, data)
        VALUES (?, ?, ?, ?)
      `, [userId, message, type, JSON.stringify(data || {})]);

      if (result.lastID) {
        logger.info('Notification created', {
          notificationId: result.lastID,
          userId,
          type
        });
        return this.getNotificationById(result.lastID);
      }
      
      throw new Error('Failed to create notification');
    } catch (error) {
      logger.error('Notification creation failed', {
        error: error.message,
        userId,
        type
      });
      throw error;
    }
  }

  /**
   * Create a notification for all admin users
   * @param {Object} notificationData - Notification data without userId
   * @returns {boolean} - Success status
   */
  async createAdminNotification(notificationData) {
    const { message, type, data } = notificationData;
    
    try {
      const db = database.getDb();
      
      // Get all admin users
      const admins = await db.all(`
        SELECT id FROM users WHERE is_admin = 1
      `);
      
      if (!admins || admins.length === 0) {
        logger.warn('No admin users found for notification');
        return false;
      }
      
      // Create notification for each admin
      for (const admin of admins) {
        await this.createNotification({
          userId: admin.id,
          message,
          type,
          data
        });
      }
      
      return true;
    } catch (error) {
      logger.error('Admin notification creation failed', {
        error: error.message,
        type
      });
      return false;
    }
  }

  /**
   * Get notification by ID
   * @param {number} id - Notification ID
   * @returns {Object|null} - Notification object or null if not found
   */
  async getNotificationById(id) {
    try {
      const db = database.getDb();
      const notification = await db.get(`
        SELECT id, user_id, message, type, is_read, created_at, data
        FROM notifications WHERE id = ?
      `, [id]);
      
      if (!notification) {
        return null;
      }
      
      // Parse JSON data field
      if (notification.data) {
        try {
          notification.data = JSON.parse(notification.data);
        } catch (e) {
          notification.data = {};
        }
      }
      
      return notification;
    } catch (error) {
      logger.error('Failed to get notification by ID', {
        error: error.message,
        id
      });
      return null;
    }
  }

  /**
   * Get notifications for a user
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of notification objects
   */
  async getUserNotifications(userId, options = {}) {
    const { limit = 20, offset = 0, unreadOnly = false } = options;
    
    try {
      const db = database.getDb();
      let query = `
        SELECT id, user_id, message, type, is_read, created_at, data
        FROM notifications 
        WHERE user_id = ?
      `;
      
      if (unreadOnly) {
        query += ' AND is_read = 0';
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      
      const notifications = await db.all(query, [userId, limit, offset]);
      
      // Parse JSON data field for each notification
      for (const notification of notifications) {
        if (notification.data) {
          try {
            notification.data = JSON.parse(notification.data);
          } catch (e) {
            notification.data = {};
          }
        }
      }
      
      return notifications;
    } catch (error) {
      logger.error('Failed to get user notifications', {
        error: error.message,
        userId
      });
      return [];
    }
  }

  /**
   * Mark a notification as read
   * @param {number} notificationId - Notification ID
   * @param {number} userId - User ID for verification
   * @returns {boolean} - Success status
   */
  async markAsRead(notificationId, userId) {
    try {
      const db = database.getDb();
      const result = await db.run(`
        UPDATE notifications
        SET is_read = 1
        WHERE id = ? AND user_id = ?
      `, [notificationId, userId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error: error.message,
        notificationId,
        userId
      });
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {number} userId - User ID
   * @returns {boolean} - Success status
   */
  async markAllAsRead(userId) {
    try {
      const db = database.getDb();
      const result = await db.run(`
        UPDATE notifications
        SET is_read = 1
        WHERE user_id = ?
      `, [userId]);
      
      return true;
    } catch (error) {
      logger.error('Failed to mark all notifications as read', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Get unread notification count for a user
   * @param {number} userId - User ID
   * @returns {number} - Number of unread notifications
   */
  async getUnreadCount(userId) {
    try {
      const db = database.getDb();
      const result = await db.get(`
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_id = ? AND is_read = 0
      `, [userId]);
      
      return result ? result.count : 0;
    } catch (error) {
      logger.error('Failed to get unread notification count', {
        error: error.message,
        userId
      });
      return 0;
    }
  }
}

module.exports = new NotificationModel(); 