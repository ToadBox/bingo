const socketio = require('socket.io');
const logger = require('../utils/logger');
const boardHandler = require('./handlers/boardHandler');
const chatHandler = require('./handlers/chatHandler');
const notificationHandler = require('./handlers/notificationHandler');
const sessionModel = require('../models/sessionModel');

/**
 * WebSocket server class
 */
class WebSocketServer {
  constructor() {
    this.io = null;
    this.activeRooms = new Map(); // boardId -> count of users
    this.userSockets = new Map(); // userId -> list of socket IDs
  }

  /**
   * Initialize WebSocket server
   * @param {Object} httpServer - HTTP server to attach to
   */
  initialize(httpServer) {
    this.io = socketio(httpServer, {
      cors: {
        origin: process.env.SITE_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    logger.info('WebSocket server initialized');
    
    // Set up middleware for authentication
    this.setupAuthentication();
    
    // Set up connection handler
    this.setupConnectionHandler();
    
    return this.io;
  }

  /**
   * Set up authentication middleware
   */
  setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || 
                     socket.handshake.query.token;
        
        if (!token) {
          return next(new Error('Authentication failed: No token provided'));
        }
        
        // Verify token with session model
        const user = await sessionModel.verifySession(token);
        
        if (!user) {
          return next(new Error('Authentication failed: Invalid token'));
        }
        
        // Store user data in socket
        socket.user = user;
        
        next();
      } catch (error) {
        logger.error('WebSocket authentication error', {
          error: error.message,
          ip: socket.handshake.address
        });
        next(new Error('Authentication error'));
      }
    });
  }

  /**
   * Set up connection handler
   */
  setupConnectionHandler() {
    this.io.on('connection', (socket) => {
      const userId = socket.user.id;
      const username = socket.user.username;
      
      logger.info('WebSocket client connected', {
        userId,
        username,
        socketId: socket.id
      });
      
      // Track user's sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);
      
      // Set up event handlers
      this.registerEventHandlers(socket);
      
      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Register event handlers
   * @param {Object} socket - Socket instance
   */
  registerEventHandlers(socket) {
    // Board event handlers
    boardHandler.registerHandlers(socket, this);
    
    // Chat event handlers
    chatHandler.registerHandlers(socket, this);
    
    // Notification event handlers
    notificationHandler.registerHandlers(socket, this);
  }

  /**
   * Handle client disconnect
   * @param {Object} socket - Socket instance
   */
  handleDisconnect(socket) {
    const userId = socket.user?.id;
    const username = socket.user?.username;
    
    logger.info('WebSocket client disconnected', {
      userId,
      username,
      socketId: socket.id
    });
    
    // Clean up user's active rooms
    for (const room of socket.rooms) {
      if (room !== socket.id) { // ignore default room (socket.id)
        const roomId = room;
        if (this.activeRooms.has(roomId)) {
          const count = this.activeRooms.get(roomId) - 1;
          if (count <= 0) {
            this.activeRooms.delete(roomId);
          } else {
            this.activeRooms.set(roomId, count);
          }
          
          // Notify others that user left
          socket.to(roomId).emit('user:leave', {
            userId,
            username,
            activeUsers: this.getActiveUsersInRoom(roomId)
          });
        }
      }
    }
    
    // Remove user's socket from tracking
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socket.id);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  /**
   * Join a board room
   * @param {Object} socket - Socket instance
   * @param {string} boardId - Board ID
   */
  joinBoardRoom(socket, boardId) {
    const roomId = `board:${boardId}`;
    const userId = socket.user.id;
    const username = socket.user.username;
    
    // Join the room
    socket.join(roomId);
    
    // Increment room count
    this.activeRooms.set(roomId, (this.activeRooms.get(roomId) || 0) + 1);
    
    logger.debug('User joined board room', {
      userId,
      username,
      boardId,
      socketId: socket.id
    });
    
    // Notify others in the room
    socket.to(roomId).emit('user:join', {
      userId,
      username,
      activeUsers: this.getActiveUsersInRoom(roomId)
    });
    
    return this.getActiveUsersInRoom(roomId);
  }

  /**
   * Leave a board room
   * @param {Object} socket - Socket instance
   * @param {string} boardId - Board ID
   */
  leaveBoardRoom(socket, boardId) {
    const roomId = `board:${boardId}`;
    const userId = socket.user.id;
    const username = socket.user.username;
    
    // Leave the room
    socket.leave(roomId);
    
    // Decrement room count
    if (this.activeRooms.has(roomId)) {
      const count = this.activeRooms.get(roomId) - 1;
      if (count <= 0) {
        this.activeRooms.delete(roomId);
      } else {
        this.activeRooms.set(roomId, count);
      }
    }
    
    logger.debug('User left board room', {
      userId,
      username,
      boardId,
      socketId: socket.id
    });
    
    // Notify others in the room
    socket.to(roomId).emit('user:leave', {
      userId,
      username,
      activeUsers: this.getActiveUsersInRoom(roomId)
    });
  }

  /**
   * Get active users in a room
   * @param {string} roomId - Room ID
   * @returns {Array} - Array of active users
   */
  getActiveUsersInRoom(roomId) {
    const room = this.io.sockets.adapter.rooms.get(roomId);
    if (!room) return [];
    
    const activeUsers = [];
    for (const socketId of room) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.user) {
        activeUsers.push({
          id: socket.user.id,
          username: socket.user.username
        });
      }
    }
    
    return activeUsers;
  }

  /**
   * Broadcast to all user's sockets
   * @param {number} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcastToUser(userId, event, data) {
    if (!this.userSockets.has(userId)) return;
    
    for (const socketId of this.userSockets.get(userId)) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  }

  /**
   * Broadcast to a board room
   * @param {string} boardId - Board ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcastToBoard(boardId, event, data) {
    const roomId = `board:${boardId}`;
    this.io.to(roomId).emit(event, data);
  }
}

module.exports = new WebSocketServer(); 