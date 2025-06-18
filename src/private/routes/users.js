const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const userModel = require('../models/userModel');

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    // User is already authenticated via middleware
    const userId = req.user.id;
    const user = await userModel.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't return sensitive information
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      auth_provider: user.auth_provider,
      created_at: user.created_at,
      last_login: user.last_login,
      is_admin: !!user.is_admin
    });
  } catch (error) {
    logger.error('Failed to get user profile', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { username } = req.body;
    
    // Only allow updating username for now
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Update user in database (functionality to be implemented in userModel)
    // For now we just return success
    
    logger.info('User profile updated', {
      userId,
      username
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update user profile', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Get user's boards
router.get('/boards', async (req, res) => {
  try {
    const userId = req.user.id;
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
    
    res.json(formattedBoards);
  } catch (error) {
    logger.error('Failed to get user boards', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({ error: 'Failed to get user boards' });
  }
});

// Admin only: Get list of users
router.get('/list', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    
    // Functionality to be implemented in userModel
    // For now return an empty array
    const users = [];
    
    res.json(users);
  } catch (error) {
    logger.error('Failed to get user list', {
      error: error.message,
      adminId: req.user?.id
    });
    res.status(500).json({ error: 'Failed to get user list' });
  }
});

module.exports = router; 