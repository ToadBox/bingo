const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const models = require('../services/modelRegistry');
const BoardFormatterService = require('../services/boardFormatterService');
const { isAuthenticated } = require('../middleware/auth');
const { 
  createValidator, 
  validatePagination, 
  validateBoardId 
} = require('../middleware/validation');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler, 
  validateRequired 
} = require('../utils/responseHelpers');

// Helper functions for board creation
const generateBoardCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generatePassword = (length = 6) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Helper function to measure elapsed time
const getElapsedMs = (start) => {
  const elapsed = process.hrtime(start);
  return elapsed[0] * 1000 + elapsed[1] / 1000000;
};

/**
 * GET /boards - List all boards with pagination and filters
 */
router.get('/', validatePagination, asyncHandler(async (req, res) => {
  const { page, limit, offset } = req.pagination;
  const { search, isPublic, username } = req.query;
  
  // Build filter options
  const options = {
    limit,
    offset,
    search,
    orderBy: 'last_updated DESC'
  };
  
  // Filter by public status if specified
  if (isPublic !== undefined) {
    options.isPublic = isPublic === 'true';
  }
  
  // Filter by username if specified
  if (username) {
    const user = await models.user.getUserByUsername(username);
    if (user) {
      options.userId = user.user_id;
    } else {
      // User doesn't exist, return empty results
      return sendSuccess(res, {
        boards: [],
        pagination: {
          total: 0,
          totalPages: 0,
          currentPage: page,
          limit,
          offset,
          hasNext: false,
          hasPrev: false
        }
      }, 200, 'Board');
    }
  }
  
  const result = await models.board.getAllBoards(options);
  
  // Format boards for frontend compatibility
  const formattedBoards = BoardFormatterService.formatBoards(result.boards, req.user, {}, req);
  
  logger.board.debug('Boards retrieved', {
    count: formattedBoards.length,
    page,
    search,
    username
  });
  
  return sendSuccess(res, {
    boards: formattedBoards,
    pagination: result.pagination
  }, 200, 'Board');
}, 'Board'));

/**
 * POST /boards - Create a new board
 */
router.post('/', isAuthenticated, createValidator('board'), asyncHandler(async (req, res) => {
  const { 
    title, 
    description = '', 
    isPublic = false, 
    size = 5, 
    freeSpace = true, 
    useServerName = false 
  } = req.validated;
  const userId = req.user.user_id;
  
  // Get user info for board creation
  const user = await models.user.getUserByUserId(userId);
  if (!user) {
    return sendError(res, 404, 'User not found', null, 'Board');
  }

  // Determine the creator username (simplified logic)
  let creatorUsername;
  if (useServerName && req.user.is_admin) {
    creatorUsername = 'server';
  } else {
    creatorUsername = user.username;
  }

  // Create board settings object
  const settings = {
    size,
    freeSpace,
    boardCode: generateBoardCode(),
    // Only add password for anonymous private boards
    ...(user.auth_provider === 'anonymous' && !isPublic ? { boardPassword: generatePassword() } : {})
  };

  const boardData = {
    title,
    description,
    isPublic,
    createdBy: userId,
    createdByName: creatorUsername, // This will be the unified username
    settings: JSON.stringify(settings)
  };

  const board = await models.board.createBoard(boardData);

  if (!board) {
    return sendError(res, 500, 'Failed to create board', null, 'Board');
  }

  // Format for frontend compatibility
  const formattedBoard = BoardFormatterService.formatBoard(board, req.user, { includeCells: true }, req);

  logger.board.info('Board created successfully', {
    boardId: board.uuid,
    title: board.title,
    userId,
    username: user.username,
    creatorUsername,
    size,
    freeSpace
  });

  return sendSuccess(res, formattedBoard, 201, 'Board');
}, 'Board'));

/**
 * GET /anonymous/:slug - Get anonymous board by slug
 */
router.get('/anonymous/:slug', isAuthenticated, asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const startTime = process.hrtime();
  
    const board = await models.board.getBoardByAnonymousSlug(slug);

    if (!board) {
    logger.board.warn('Anonymous board not found', { slug });
    return sendError(res, 404, 'Board not found', null, 'Board');
    }

    // Check if user has access to private board
    if (!board.is_public && board.created_by !== req.user?.id && !req.user?.is_admin) {
    logger.board.warn('Access denied to private anonymous board', {
        slug,
        userId: req.user?.id
      });
    return sendError(res, 403, 'Access denied', null, 'Board');
    }

    // Format for frontend compatibility
  const formattedBoard = BoardFormatterService.formatBoard(board, req.user, {}, req);

  logger.board.info('Anonymous board retrieved successfully', {
      slug,
      boardId: board.uuid,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });

  return sendSuccess(res, formattedBoard, 200, 'Board');
}, 'Board'));

/**
 * GET /:username/:slug - Get specific board by username and slug
 */
router.get('/:username/:slug', asyncHandler(async (req, res) => {
  const { username, slug } = req.params;
  
    const board = await models.board.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
    return sendError(res, 404, 'Board not found', null, 'Board');
    }

    // Format for frontend compatibility
    const formattedBoard = BoardFormatterService.formatBoard(board, req.user, {}, req);

  logger.board.debug('Board retrieved by username and slug', {
      username,
      slug,
    boardId: board.uuid
    });

  return sendSuccess(res, formattedBoard, 200, 'Board');
}, 'Board'));

/**
 * PUT /:username/:slug - Update board (owner only)
 */
router.put('/:username/:slug', isAuthenticated, createValidator('board', { allowExtra: true }), asyncHandler(async (req, res) => {
  const { username, slug } = req.params;
  const { title, description, isPublic } = req.validated;
  const userId = req.user.user_id;
  
    const board = await models.board.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
    return sendError(res, 404, 'Board not found', null, 'Board');
    }

    // Check ownership
  if (board.created_by !== userId && !req.user.is_admin) {
    return sendError(res, 403, 'You do not have permission to update this board', null, 'Board');
    }

    const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (isPublic !== undefined) updates.is_public = isPublic;

    const updatedBoard = await models.board.updateBoard(board.id, updates);

    if (!updatedBoard) {
    return sendError(res, 500, 'Failed to update board', null, 'Board');
    }

    // Format for frontend compatibility
    const formattedBoard = BoardFormatterService.formatBoard(updatedBoard, req.user, {}, req);

  logger.board.info('Board updated successfully', {
      username,
      slug,
      boardId: board.uuid,
    updates: Object.keys(updates),
    userId
    });

  return sendSuccess(res, formattedBoard, 200, 'Board');
}, 'Board'));

/**
 * DELETE /:username/:slug - Delete board (owner only)
 */
router.delete('/:username/:slug', isAuthenticated, asyncHandler(async (req, res) => {
  const { username, slug } = req.params;
  const userId = req.user.user_id;
  
    const board = await models.board.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
    return sendError(res, 404, 'Board not found', null, 'Board');
    }

    // Check ownership
  if (board.created_by !== userId && !req.user.is_admin) {
    return sendError(res, 403, 'You do not have permission to delete this board', null, 'Board');
    }

    const success = await models.board.deleteBoard(board.id);

    if (!success) {
    return sendError(res, 500, 'Failed to delete board', null, 'Board');
    }

  logger.board.info('Board deleted successfully', {
      username,
      slug,
      boardId: board.uuid,
    userId
    });

  return sendSuccess(res, { success: true }, 200, 'Board');
}, 'Board'));

/**
 * PUT /:username/:slug/cells/:row/:col - Update cell in board
 */
router.put('/:username/:slug/cells/:row/:col', createValidator('cell'), asyncHandler(async (req, res) => {
  const { username, slug, row, col } = req.params;
  const { value, marked, type } = req.validated;
  const userId = req.user?.user_id;
  
    const rowNum = parseInt(row);
    const colNum = parseInt(col);
    
  if (isNaN(rowNum) || isNaN(colNum) || rowNum < 0 || colNum < 0) {
    return sendError(res, 400, 'Invalid row or column coordinates', null, 'Board');
    }

    const board = await models.board.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
    return sendError(res, 404, 'Board not found', null, 'Board');
    }

  // Validate cell coordinates against board size
  const boardSize = board.settings?.size || 5;
  if (rowNum >= boardSize || colNum >= boardSize) {
    return sendError(res, 400, `Cell coordinates out of bounds. Board size is ${boardSize}x${boardSize}`, null, 'Board');
  }
  
  // Validate image URL if type is image
  if (type === 'image' && value) {
    const isValidImageUrl = /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg))$/i.test(value) ||
                           /^data:image\/[a-zA-Z]*;base64,/.test(value);

    if (!isValidImageUrl) {
      return sendError(res, 400, 'Invalid image URL or data URI format', null, 'Board');
    }
  }
  
  // Prepare cell update data
  const cellData = {};
  if (value !== undefined) cellData.value = value;
  if (marked !== undefined) cellData.marked = marked;
  if (type !== undefined) cellData.type = type;

  const updatedCell = await models.board.updateCell(board.id, rowNum, colNum, cellData, userId);
  
  if (!updatedCell) {
    return sendError(res, 500, 'Failed to update cell', null, 'Board');
  }

    const result = { 
      success: true, 
      cell: { 
        id: `${rowNum}-${colNum}`, 
      row: rowNum,
      col: colNum,
      value: updatedCell.value || '',
      marked: updatedCell.marked === 1,
      type: updatedCell.type || 'text',
      lastUpdated: updatedCell.last_updated,
      updatedBy: updatedCell.updated_by
      } 
    };

  logger.board.info('Cell updated successfully', {
      username,
      slug,
      boardId: board.uuid,
      row: rowNum,
      col: colNum,
    type: cellData.type,
    hasImage: type === 'image',
    userId
  });
  
  return sendSuccess(res, result, 200, 'Board');
}, 'Board'));

/**
 * GET /:username/:slug/cells/:row/:col - Get specific cell
 */
router.get('/:username/:slug/cells/:row/:col', asyncHandler(async (req, res) => {
  const { username, slug, row, col } = req.params;
  
  const rowNum = parseInt(row);
  const colNum = parseInt(col);
  
  if (isNaN(rowNum) || isNaN(colNum) || rowNum < 0 || colNum < 0) {
    return sendError(res, 400, 'Invalid row or column coordinates', null, 'Board');
  }
  
  const board = await models.board.getBoardByUsernameAndSlug(username, slug);
  
  if (!board) {
    return sendError(res, 404, 'Board not found', null, 'Board');
  }
  
  const cell = await models.board.getCell(board.id, rowNum, colNum);
  
  if (!cell) {
    return sendError(res, 404, 'Cell not found', null, 'Board');
  }
  
  const formattedCell = {
    id: `${rowNum}-${colNum}`,
    row: rowNum,
    col: colNum,
    value: cell.value || '',
    marked: cell.marked === 1,
    type: cell.type || 'text',
    lastUpdated: cell.last_updated,
    updatedBy: cell.updated_by
  };
  
  logger.board.debug('Cell retrieved', {
      username,
      slug,
    boardId: board.uuid,
    row: rowNum,
    col: colNum
  });
  
  return sendSuccess(res, formattedCell, 200, 'Board');
}, 'Board'));

module.exports = router; 