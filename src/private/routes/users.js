const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const userModel = require('../models/userModel');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler, 
  validateRequired 
} = require('../utils/responseHelpers');

// Get user profile
router.get('/profile', asyncHandler(async (req, res) => {
    // User is already authenticated via middleware
  const userId = req.user.user_id;
  const user = await userModel.getUserByUserId(userId);
    
    if (!user) {
    return sendError(res, 404, 'User not found', null, 'User');
    }
    
    // Don't return sensitive information
  const userProfile = {
    id: user.user_id,
      username: user.username,
      email: user.email,
      auth_provider: user.auth_provider,
      created_at: user.created_at,
      last_login: user.last_login,
      is_admin: !!user.is_admin
  };

  logger.user.debug('User profile retrieved', { userId });
  return sendSuccess(res, userProfile, 200, 'User');
}, 'User'));

// Update user profile
router.put('/profile', asyncHandler(async (req, res) => {
  const userId = req.user.user_id;
  validateRequired(req, ['username']);
    const { username } = req.body;
    
    // Update user in database (functionality to be implemented in userModel)
    // For now we just return success
    
  logger.user.info('User profile updated', {
      userId,
      username
    });
    
  return sendSuccess(res, {
      success: true,
      message: 'Profile updated successfully'
  }, 200, 'User');
}, 'User'));

// Get user's boards
router.get('/boards', asyncHandler(async (req, res) => {
    const userId = req.user.user_id || req.user.id;
    const options = {
      userId,
      includePublic: false
    };
    
    // Add pagination
    if (req.query.limit) {
      options.limit = parseInt(req.query.limit);
    }
    
    if (req.query.offset) {
      options.offset = parseInt(req.query.offset);
    }
    
    // Get user's boards from database
    const boardModel = require('../models/boardModel');
    const boards = await boardModel.getAllBoards(options);
    
    // Format for frontend compatibility
    const formattedBoards = boards.map(board => ({
      id: board.uuid,
      title: board.title,
      createdBy: req.user.username,
      createdAt: new Date(board.created_at).getTime(),
      lastUpdated: new Date(board.last_updated).getTime(),
      cellCount: board.cellCount,
      markedCount: board.markedCount
    }));
    
  logger.user.debug('User boards retrieved', { 
    userId, 
    boardCount: formattedBoards.length 
  });
  
  return sendSuccess(res, formattedBoards, 200, 'User');
}, 'User'));

// Admin only: Get list of users
router.get('/list', asyncHandler(async (req, res) => {
    // Check if user is admin
    if (!req.isAdmin) {
    return sendError(res, 403, 'Administrator access required', null, 'User');
    }
    
    // Functionality to be implemented in userModel
    // For now return an empty array
    const users = [];
    
  logger.user.debug('User list retrieved by admin', { 
    adminId: req.user?.id,
    userCount: users.length 
    });
  
  return sendSuccess(res, users, 200, 'User');
}, 'User'));

module.exports = router; 