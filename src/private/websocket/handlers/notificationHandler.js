// WebSocket Notification Handler
// Handles real-time notification delivery and management

const sharedConstants = require('../../../../shared/constants.js');
const logger = require('../../utils/logger.js');

class NotificationHandler {

  async handleMarkRead(socket, data, wsServer) {
    try {
      const { notificationId, notificationIds } = data;
      
      if (!socket.user || socket.user.isAnonymous) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Authentication required',
          code: sharedConstants.ERROR_CODES.AUTH_REQUIRED
        });
        return;
      }

      const notificationModel = require('../../models/notificationModel.js');
      
      if (notificationId) {
        // Mark single notification as read
        const notification = await notificationModel.getById(notificationId);
        
        if (!notification) {
          socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
            error: 'Notification not found',
            code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND
          });
          return;
        }

        // Verify user owns this notification
        if (notification.userId !== socket.user.userId) {
          socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
            error: 'Access denied to notification',
            code: sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
          });
          return;
        }

        await notificationModel.markAsRead(notificationId);
        
        logger.info('Notification marked as read', {
          userId: socket.user.userId,
          notificationId,
          requestId: socket.requestId
        });

      } else if (notificationIds && Array.isArray(notificationIds)) {
        // Mark multiple notifications as read
        const validIds = [];
        
        for (const id of notificationIds) {
          const notification = await notificationModel.getById(id);
          if (notification && notification.userId === socket.user.userId) {
            validIds.push(id);
          }
        }

        if (validIds.length > 0) {
          await notificationModel.markMultipleAsRead(validIds);
          
          logger.info('Multiple notifications marked as read', {
            userId: socket.user.userId,
            count: validIds.length,
            requestId: socket.requestId
          });
        }

      } else {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Notification ID(s) required',
          code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD
        });
        return;
      }

      // Send updated notification count to user
      const unreadCount = await notificationModel.getUnreadCount(socket.user.userId);
      
      socket.emit('notification:count_updated', {
        unreadCount
      });

    } catch (error) {
      logger.error('Error marking notification as read:', error, {
        socketId: socket.id,
        userId: socket.user?.userId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to mark notification as read',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async handleMarkAllRead(socket, data, wsServer) {
    try {
      if (!socket.user || socket.user.isAnonymous) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Authentication required',
          code: sharedConstants.ERROR_CODES.AUTH_REQUIRED
        });
        return;
      }

      const notificationModel = require('../../models/notificationModel.js');
      const markedCount = await notificationModel.markAllAsRead(socket.user.userId);
      
      socket.emit('notification:all_marked_read', {
        markedCount
      });

      socket.emit('notification:count_updated', {
        unreadCount: 0
      });

      logger.info('All notifications marked as read', {
        userId: socket.user.userId,
        markedCount,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error marking all notifications as read:', error, {
        socketId: socket.id,
        userId: socket.user?.userId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to mark all notifications as read',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async handleGetNotifications(socket, data, wsServer) {
    try {
      if (!socket.user || socket.user.isAnonymous) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Authentication required',
          code: sharedConstants.ERROR_CODES.AUTH_REQUIRED
        });
        return;
      }

      const { limit = 20, offset = 0, unreadOnly = false } = data;
      
      const notificationModel = require('../../models/notificationModel.js');
      const notifications = await notificationModel.getByUserId(socket.user.userId, {
        limit: Math.min(limit, 100), // Cap at 100
        offset,
        unreadOnly
      });

      const unreadCount = await notificationModel.getUnreadCount(socket.user.userId);

      socket.emit('notification:list', {
        notifications,
        unreadCount,
        hasMore: notifications.length === limit
      });

      logger.debug('Notifications retrieved', {
        userId: socket.user.userId,
        count: notifications.length,
        unreadCount,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error retrieving notifications:', error, {
        socketId: socket.id,
        userId: socket.user?.userId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to retrieve notifications',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  async handleDeleteNotification(socket, data, wsServer) {
    try {
      const { notificationId } = data;
      
      if (!socket.user || socket.user.isAnonymous) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Authentication required',
          code: sharedConstants.ERROR_CODES.AUTH_REQUIRED
        });
        return;
      }

      if (!notificationId) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Notification ID is required',
          code: sharedConstants.ERROR_CODES.VALIDATION_MISSING_FIELD
        });
        return;
      }

      const notificationModel = require('../../models/notificationModel.js');
      const notification = await notificationModel.getById(notificationId);
      
      if (!notification) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Notification not found',
          code: sharedConstants.ERROR_CODES.RESOURCE_NOT_FOUND
        });
        return;
      }

      // Verify user owns this notification
      if (notification.userId !== socket.user.userId) {
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Access denied to notification',
          code: sharedConstants.ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
        });
        return;
      }

      await notificationModel.delete(notificationId);
      
      // Send updated notification count
      const unreadCount = await notificationModel.getUnreadCount(socket.user.userId);
      
      socket.emit('notification:deleted', {
        notificationId
      });

      socket.emit('notification:count_updated', {
        unreadCount
      });

      logger.info('Notification deleted', {
        userId: socket.user.userId,
        notificationId,
        requestId: socket.requestId
      });

    } catch (error) {
      logger.error('Error deleting notification:', error, {
        socketId: socket.id,
        notificationId: data?.notificationId,
        requestId: socket.requestId
      });
      
      socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
        error: 'Failed to delete notification',
        code: sharedConstants.ERROR_CODES.SERVER_ERROR
      });
    }
  }

  // Static method to send notification to a user via WebSocket
  static async sendNotificationToUser(wsServer, userId, notification) {
    try {
      const userConnection = wsServer.connectedUsers.get(userId);
      if (userConnection) {
        wsServer.io.to(userConnection.socketId).emit(
          sharedConstants.WEBSOCKET.EVENTS.NOTIFICATION,
          {
            notification
          }
        );

        logger.debug('Notification sent to user via WebSocket', {
          userId,
          notificationId: notification.id,
          type: notification.type
        });
      }
    } catch (error) {
      logger.error('Error sending notification via WebSocket:', error, {
        userId,
        notificationId: notification?.id
      });
    }
  }

  // Static method to send notification to multiple users
  static async sendNotificationToUsers(wsServer, userIds, notification) {
    for (const userId of userIds) {
      await this.sendNotificationToUser(wsServer, userId, notification);
    }
  }

  // Static method to broadcast system notification to all connected users
  static async broadcastSystemNotification(wsServer, message, level = 'info') {
    try {
      wsServer.io.emit(sharedConstants.WEBSOCKET.EVENTS.NOTIFICATION, {
        notification: {
          id: `system_${Date.now()}`,
          type: 'system',
          message,
          level,
          createdAt: Date.now(),
          isRead: false
        }
      });

      logger.info('System notification broadcasted', {
        message,
        level,
        connectedUsers: wsServer.connectedUsers.size
      });
    } catch (error) {
      logger.error('Error broadcasting system notification:', error);
    }
  }

  // Static method to send board-specific notification
  static async sendBoardNotification(wsServer, boardId, notification, excludeUserId = null) {
    try {
      const boardUsers = wsServer.getBoardUsers(boardId);
      
      for (const user of boardUsers) {
        if (user.userId && user.userId !== excludeUserId) {
          await this.sendNotificationToUser(wsServer, user.userId, notification);
        }
      }

      logger.debug('Board notification sent', {
        boardId,
        notificationId: notification.id,
        recipientCount: boardUsers.filter(u => u.userId && u.userId !== excludeUserId).length
      });
    } catch (error) {
      logger.error('Error sending board notification:', error, {
        boardId,
        notificationId: notification?.id
      });
    }
  }
}

module.exports = new NotificationHandler(); 