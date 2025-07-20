const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const userModel = require('../../models/userModel');
const notificationModel = require('../../models/notificationModel');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler 
} = require('../../utils/responseHelpers');

/**
 * Get all pending users awaiting approval
 */
router.get('/pending', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    // Only admins can access this endpoint (checked in middleware)
    if (!req.isAdmin) {
    return sendError(res, 403, 'Admin access required', null, 'Admin');
    }
    
    const pendingUsers = await userModel.getPendingUsers({ limit, offset });
    
  logger.admin.debug('Pending users retrieved', {
    adminId: req.user?.id,
    userCount: pendingUsers.length,
    limit,
    offset
  });
  
  return sendSuccess(res, {
      pendingUsers,
      meta: {
        limit,
        offset
      }
  }, 200, 'Admin');
}, 'Admin'));

/**
 * Approve a user
 */
router.post('/approve/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    // Only admins can approve users
    if (!req.isAdmin) {
    return sendError(res, 403, 'Admin access required', null, 'Admin');
    }
    
    const success = await userModel.approveUser(userId);
    
    if (!success) {
    return sendError(res, 404, 'User not found or approval failed', null, 'Admin');
    }
    
    // Log the approval action
  logger.admin.info('User approved by admin', {
      userId,
      adminId: req.user.user_id || req.user.id,
      adminUsername: req.user.username
    });
    
    // Add notification about the approval to the admin's list
    await notificationModel.createNotification({
      userId: req.user.user_id || req.user.id,
      message: `You approved user ID ${userId}`,
      type: 'admin_action',
      data: {
        action: 'approve_user',
        userId
      }
    });
    
  return sendSuccess(res, { success: true }, 200, 'Admin');
}, 'Admin'));

/**
 * Reject a user
 */
router.post('/reject/:userId', asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    // Only admins can reject users
    if (!req.isAdmin) {
    return sendError(res, 403, 'Admin access required', null, 'Admin');
    }
    
    const success = await userModel.rejectUser(userId);
    
    if (!success) {
    return sendError(res, 404, 'User not found or rejection failed', null, 'Admin');
    }
    
    // Log the rejection action
  logger.admin.info('User rejected by admin', {
      userId,
      adminId: req.user.user_id || req.user.id,
      adminUsername: req.user.username
    });
    
    // Add notification about the rejection to the admin's list
    await notificationModel.createNotification({
      userId: req.user.user_id || req.user.id,
      message: `You rejected user ID ${userId}`,
      type: 'admin_action',
      data: {
        action: 'reject_user',
        userId
      }
    });
    
  return sendSuccess(res, { success: true }, 200, 'Admin');
}, 'Admin'));

/**
 * Get all users with pagination
 */
router.get('/', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const status = req.query.status || '';
    
    // Only admins can access this endpoint
    if (!req.isAdmin) {
    return sendError(res, 403, 'Admin access required', null, 'Admin');
    }
    
    const db = require('../../models/database').getDb();
    let query = `
      SELECT 
        id, 
        username, 
        email, 
        auth_provider, 
        is_admin, 
        approval_status,
        created_at,
        last_login
      FROM users
      WHERE 1=1
    `;
    
    const params = [];
    
    // Add search filter
    if (search) {
      query += ` AND (username LIKE ? OR email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    // Add status filter
    if (status) {
      query += ` AND approval_status = ?`;
      params.push(status);
    }
    
    // Add pagination
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const users = await db.all(query, params);
    
    // Count total users for pagination
    let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
    const countParams = [];
    
    if (search) {
      countQuery += ` AND (username LIKE ? OR email LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
      countQuery += ` AND approval_status = ?`;
      countParams.push(status);
    }
    
    const countResult = await db.get(countQuery, countParams);
    const total = countResult ? countResult.total : 0;
    
  logger.admin.debug('Users list retrieved', {
    adminId: req.user?.id,
    userCount: users.length,
    total,
    search,
    status
  });
  
  return sendSuccess(res, {
      users,
      meta: {
        total,
        limit,
      offset,
      hasMore: (offset + limit) < total
    }
  }, 200, 'Admin');
}, 'Admin'));

/**
 * Make a user an admin
 */
router.post('/:userId/make-admin', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only admins can make other users admins
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const db = require('../../models/database').getDb();
    const result = await db.run(`
      UPDATE users
      SET is_admin = 1, approval_status = 'approved'
      WHERE id = ?
    `, [userId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create notification for the user
    await notificationModel.createNotification({
      userId,
      message: 'You have been given admin privileges',
      type: 'admin_status',
      data: {
        grantedBy: req.user.username,
        grantedById: req.user.user_id || req.user.id
      }
    });
    
    // Log the action
    logger.info('User promoted to admin', {
      userId,
      adminId: req.user.user_id || req.user.id,
      adminUsername: req.user.username
    });
    
    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to make user admin', {
      error: error.message,
      adminId: req.user?.id,
      userId: req.params.userId
    });
    return res.status(500).json({ error: 'Failed to make user admin' });
  }
});

/**
 * Remove admin privileges from a user
 */
router.post('/:userId/remove-admin', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only admins can remove admin privileges
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Check if trying to remove own admin privileges
    if (userId === (req.user.user_id || req.user.id).toString()) {
      return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
    }
    
    const db = require('../../models/database').getDb();
    const result = await db.run(`
      UPDATE users
      SET is_admin = 0
      WHERE id = ?
    `, [userId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create notification for the user
    await notificationModel.createNotification({
      userId,
      message: 'Your admin privileges have been removed',
      type: 'admin_status',
      data: {
        removedBy: req.user.username,
        removedById: req.user.user_id || req.user.id
      }
    });
    
    // Log the action
    logger.info('Admin privileges removed from user', {
      userId,
      adminId: req.user.user_id || req.user.id,
      adminUsername: req.user.username
    });
    
    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove admin privileges', {
      error: error.message,
      adminId: req.user?.id,
      userId: req.params.userId
    });
    return res.status(500).json({ error: 'Failed to remove admin privileges' });
  }
});

module.exports = router; 