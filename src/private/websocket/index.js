// WebSocket Server Setup with Socket.IO
// Provides real-time updates for board changes, chat messages, and notifications

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const sharedConstants = require('../../../shared/constants.js');
const logger = require('../utils/logger.js');

// Import WebSocket handlers
const boardHandler = require('./handlers/boardHandler.js');
const chatHandler = require('./handlers/chatHandler.js');
const notificationHandler = require('./handlers/notificationHandler.js');

class WebSocketServer {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socket info
    this.boardRooms = new Map(); // boardId -> Set of socketIds
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3001",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: sharedConstants.WEBSOCKET.PING_TIMEOUT,
      pingInterval: sharedConstants.WEBSOCKET.PING_INTERVAL,
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('WebSocket server initialized');
    return this.io;
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          // Allow anonymous connections for public boards
          socket.user = { isAnonymous: true };
          return next();
        }

        // Verify session token (you'll need to implement session verification)
        const sessionModel = require('../models/sessionModel.js');
        const session = await sessionModel.getByToken(token);
        
        if (!session || new Date(session.expiresAt) < new Date()) {
          socket.user = { isAnonymous: true };
          return next();
        }

        const userModel = require('../models/userModel.js');
        const user = await userModel.getById(session.userId);
        
        if (!user) {
          socket.user = { isAnonymous: true };
          return next();
        }

        socket.user = {
          userId: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          isAnonymous: false
        };

        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        socket.user = { isAnonymous: true };
        next();
      }
    });

    // Request ID middleware for tracking
    this.io.use((socket, next) => {
      socket.requestId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      next();
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`WebSocket connection established: ${socket.id}`, {
        userId: socket.user?.userId || 'anonymous',
        requestId: socket.requestId
      });

      // Store connected user info
      if (socket.user && !socket.user.isAnonymous) {
        this.connectedUsers.set(socket.user.userId, {
          socketId: socket.id,
          username: socket.user.username,
          connectedAt: Date.now()
        });
      }

      // Board-related events
      socket.on('board:join', async (data) => {
        await boardHandler.handleJoinBoard(socket, data, this);
      });

      socket.on('board:leave', async (data) => {
        await boardHandler.handleLeaveBoard(socket, data, this);
      });

      socket.on('cell:update', async (data) => {
        await boardHandler.handleCellUpdate(socket, data, this);
      });

      socket.on('cell:mark', async (data) => {
        await boardHandler.handleCellMark(socket, data, this);
      });

      // Chat-related events
      socket.on('chat:message', async (data) => {
        await chatHandler.handleChatMessage(socket, data, this);
      });

      socket.on('chat:typing', async (data) => {
        await chatHandler.handleTyping(socket, data, this);
      });

      // Notification events
      socket.on('notification:mark_read', async (data) => {
        await notificationHandler.handleMarkRead(socket, data, this);
      });

      // Generic error handling
      socket.on('error', (error) => {
        logger.error('Socket error:', error, {
          socketId: socket.id,
          userId: socket.user?.userId,
          requestId: socket.requestId
        });
        
        socket.emit(sharedConstants.WEBSOCKET.EVENTS.ERROR, {
          error: 'Socket error occurred',
          code: sharedConstants.ERROR_CODES.WEBSOCKET_ERROR
        });
      });

      // Disconnect handling
      socket.on('disconnect', (reason) => {
        logger.info(`WebSocket disconnected: ${socket.id}`, {
          reason,
          userId: socket.user?.userId || 'anonymous',
          requestId: socket.requestId
        });

        // Clean up user connection tracking
        if (socket.user && !socket.user.isAnonymous) {
          this.connectedUsers.delete(socket.user.userId);
        }

        // Clean up board room memberships
        this.boardRooms.forEach((sockets, boardId) => {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
              this.boardRooms.delete(boardId);
            } else {
              // Notify other users in the board that this user left
              this.io.to(boardId).emit(sharedConstants.WEBSOCKET.EVENTS.USER_LEFT, {
                boardId,
                user: {
                  userId: socket.user?.userId,
                  username: socket.user?.username || 'Anonymous'
                }
              });
            }
          }
        });
      });
    });
  }

  // Utility methods for handlers
  joinBoardRoom(socket, boardId) {
    socket.join(boardId);
    
    if (!this.boardRooms.has(boardId)) {
      this.boardRooms.set(boardId, new Set());
    }
    this.boardRooms.get(boardId).add(socket.id);

    // Notify other users in the board
    socket.to(boardId).emit(sharedConstants.WEBSOCKET.EVENTS.USER_JOINED, {
      boardId,
      user: {
        userId: socket.user?.userId,
        username: socket.user?.username || 'Anonymous'
      }
    });
  }

  leaveBoardRoom(socket, boardId) {
    socket.leave(boardId);
    
    if (this.boardRooms.has(boardId)) {
      this.boardRooms.get(boardId).delete(socket.id);
      if (this.boardRooms.get(boardId).size === 0) {
        this.boardRooms.delete(boardId);
      }
    }

    // Notify other users in the board
    socket.to(boardId).emit(sharedConstants.WEBSOCKET.EVENTS.USER_LEFT, {
      boardId,
      user: {
        userId: socket.user?.userId,
        username: socket.user?.username || 'Anonymous'
      }
    });
  }

  // Broadcast to specific board
  toBoardRoom(boardId, event, data) {
    this.io.to(boardId).emit(event, data);
  }

  // Broadcast to specific user
  toUser(userId, event, data) {
    const userConnection = this.connectedUsers.get(userId);
    if (userConnection) {
      this.io.to(userConnection.socketId).emit(event, data);
    }
  }

  // Get connected users for a board
  getBoardUsers(boardId) {
    const socketIds = this.boardRooms.get(boardId) || new Set();
    const users = [];
    
    socketIds.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.user) {
        users.push({
          userId: socket.user.userId,
          username: socket.user.username || 'Anonymous',
          isAnonymous: socket.user.isAnonymous
        });
      }
    });
    
    return users;
  }

  // Broadcast server status/maintenance messages
  broadcastSystem(message, level = 'info') {
    this.io.emit(sharedConstants.WEBSOCKET.EVENTS.NOTIFICATION, {
      type: 'system',
      message,
      level,
      timestamp: Date.now()
    });
  }
}

module.exports = new WebSocketServer(); 