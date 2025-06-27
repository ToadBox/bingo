const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const boardModel = require('../models/boardModel');
const userModel = require('../models/userModel');
const { isAuthenticated } = require('../middleware/auth');
const { 
  createValidator, 
  validatePagination, 
  validateBoardId 
} = require('../middleware/validation');
const { 
  sendError, 
  sendSuccess, 
  asyncHandler 
} = require('../utils/responseHelpers');

// Helper function to measure elapsed time
const getElapsedMs = (start) => {
  const elapsed = process.hrtime(start);
  return elapsed[0] * 1000 + elapsed[1] / 1000000;
};

// Get all boards (legacy endpoint)
router.get('/boards', validatePagination, asyncHandler(async (req, res) => {
  const { limit, offset } = req.pagination;
  const userId = req.user?.user_id;
  
  const options = {
    userId,
    includePublic: true,
    limit,
    offset,
    orderBy: 'last_updated DESC'
  };

  const result = await boardModel.getAllBoards(options);

  // Generate ETags for caching
  const eTag = `"${Date.now()}-${result.boards.length}"`;
  res.set('ETag', eTag);
  
  if (req.headers['if-none-match'] === eTag) {
    return res.status(304).end();
  }

  // Format for legacy compatibility
  const formattedBoards = result.boards.map(board => ({
    id: board.uuid,
    title: board.title,
    createdBy: board.username || 'server',
    createdAt: new Date(board.created_at).getTime(),
    lastUpdated: new Date(board.last_updated).getTime(),
    isPublic: !!board.is_public,
    description: board.description,
    cells: board.cells || []
  }));

  logger.api.info('Boards fetched successfully (legacy)', { 
    count: formattedBoards.length,
    userId
  });
  
  return sendSuccess(res, formattedBoards, 200, 'API');
}, 'API'));

// Get a board by ID (legacy endpoint)
router.get('/boards/:boardId', validateBoardId, asyncHandler(async (req, res) => {
  const { boardId } = req.params;
  
  const board = await boardModel.getBoardByUUID(boardId);
  
  if (!board) {
    return sendError(res, 404, 'Board not found', null, 'API');
  }

  // Format for legacy compatibility
  const formattedBoard = {
    id: board.uuid,
    title: board.title,
    createdBy: board.username || 'server',
    createdAt: new Date(board.created_at).getTime(),
    lastUpdated: new Date(board.last_updated).getTime(),
    cells: board.cells || [],
    editHistory: [], // For compatibility with old format
    isPublic: !!board.is_public,
    description: board.description,
    settings: board.settings
  };
  
  logger.api.info('Board fetched successfully (legacy)', {
    boardId,
    title: board.title
  });
  
  return sendSuccess(res, formattedBoard, 200, 'API');
}, 'API'));

// Create a new board
router.post('/boards', async (req, res) => {
  const startTime = process.hrtime();
  
  try {
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Create in database by default
    const board = await boardModel.createBoard({
      title,
      createdBy: req.user?.id
    });
    
    if (!board) {
      return res.status(500).json({ error: 'Failed to create board' });
    }
    
    // Format for frontend compatibility
    const formattedBoard = {
      id: board.uuid,
      title: board.title,
      createdBy: req.user?.username || null,
      createdAt: new Date(board.created_at).getTime(),
      lastUpdated: new Date(board.last_updated).getTime(),
      cells: board.cells,
      editHistory: []
    };
    
    logger.info('Board created successfully', {
      boardId: board.uuid,
      title,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });
    
    res.status(201).json(formattedBoard);
  } catch (error) {
    logger.error('Failed to create board', {
      error: error.message,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Update a board cell (legacy endpoint)
router.put('/boards/:boardId/cells/:row/:col', validateBoardId, createValidator('cell'), asyncHandler(async (req, res) => {
  const { boardId, row, col } = req.params;
  const { value, marked, type } = req.validated;
  const userId = req.user?.user_id;
  
  const rowNum = parseInt(row);
  const colNum = parseInt(col);
  
  if (isNaN(rowNum) || isNaN(colNum) || rowNum < 0 || colNum < 0) {
    return sendError(res, 400, 'Invalid row or column coordinates', null, 'API');
  }
  
  // Get board from database
  const board = await boardModel.getBoardByUUID(boardId);
  
  if (!board) {
    return sendError(res, 404, 'Board not found', null, 'API');
  }
  
  // Validate image URL if type is image
  if (type === 'image' && value) {
    const imageService = require('../services/imageService');
    const validation = imageService.validateImageUrl(value);
    
    if (!validation.valid) {
      return sendError(res, 400, validation.error, null, 'API');
    }
  }
  
  // Prepare cell update data
  const cellData = {};
  if (value !== undefined) cellData.value = value;
  if (marked !== undefined) cellData.marked = marked;
  if (type !== undefined) cellData.type = type;
  
  // Update cell in database
  const updatedCell = await boardModel.updateCell(board.id, rowNum, colNum, cellData, userId);
  
  if (!updatedCell) {
    return sendError(res, 500, 'Failed to update cell', null, 'API');
  }
  
  const result = { 
    success: true, 
    cell: { 
      id: `${rowNum}-${colNum}`, 
      value: updatedCell.value || '',
      marked: updatedCell.marked === 1, 
      type: updatedCell.type || 'text',
      lastUpdated: updatedCell.last_updated,
      updatedBy: updatedCell.updated_by
    } 
  };
  
  logger.api.info('Cell updated successfully (legacy)', {
    boardId,
    row: rowNum,
    col: colNum,
    type: cellData.type,
    hasImage: type === 'image',
    userId
  });
  
  return sendSuccess(res, result, 200, 'API');
}, 'API'));

// Mark/unmark a cell (dedicated endpoint)
router.put('/boards/:boardId/cells/:row/:col/mark', async (req, res) => {
  const { boardId, row, col } = req.params;
  const { marked = true } = req.body;
  const startTime = process.hrtime();
  
  try {
    const rowNum = parseInt(row);
    const colNum = parseInt(col);
    
    if (isNaN(rowNum) || isNaN(colNum) || rowNum < 0 || colNum < 0) {
      logger.error('Invalid cell coordinates', { row, col });
      return res.status(400).json({ error: 'Invalid cell coordinates' });
    }
    
    let result;
    
    // Get board from database
    const board = await boardModel.getBoardByUUID(boardId);
    
    if (!board) {
      logger.error('Board not found for cell marking', { boardId });
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Update cell in database (mark/unmark only)
    const updated = await boardModel.updateCell(board.id, rowNum, colNum, { marked: !!marked }, req.user?.id);
    
    if (!updated) {
      logger.error('Cell marking failed in database', { boardId, row, col });
      return res.status(500).json({ error: 'Failed to mark/unmark cell' });
    }
    
    // Get the updated cell to return
    const updatedCell = await boardModel.getCell(board.id, rowNum, colNum);
    
    result = { 
      success: true, 
      marked: !!marked,
      cell: { 
        id: `${rowNum}-${colNum}`, 
        value: updatedCell?.value || '', 
        marked: updatedCell?.marked === 1, 
        type: updatedCell?.type || 'text'
      } 
    };
    
    logger.info('Cell marked/unmarked successfully', {
      boardId,
      row,
      col,
      marked,
      duration: getElapsedMs(startTime)
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to mark/unmark cell', {
      error: error.message,
      boardId,
      row,
      col,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to mark/unmark cell' });
  }
});

// Update board title
router.put('/boards/:boardId/title', async (req, res) => {
  const { boardId } = req.params;
  const { title } = req.body;
  const startTime = process.hrtime();
  
  try {
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    let result;
    
    // Find board in database
    let board = await boardModel.getBoardByUUID(boardId);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Update title in database
    board = await boardModel.updateBoard(board.id, { title });
    
    if (!board) {
      return res.status(500).json({ error: 'Failed to update board title' });
    }
    
    result = { success: true, title };
    
    logger.info('Board title updated successfully', {
      boardId,
      title,
      duration: getElapsedMs(startTime)
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to update board title', {
      error: error.message,
      boardId,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to update board title' });
  }
});

// Delete a board
router.delete('/boards/:boardId', async (req, res) => {
  const { boardId } = req.params;
  const startTime = process.hrtime();
  
  try {
    let success = false;
    let dbSuccess = false;
    
    // Find board in database
    let board = await boardModel.getBoardByUUID(boardId);
    
    if (board) {
      // Check if user owns the board
      if (board.created_by && board.created_by !== req.user.id && !req.isAdmin) {
        return res.status(403).json({ error: 'You do not have permission to delete this board' });
      }
      
      // Delete from database
      dbSuccess = await boardModel.deleteBoard(board.id);
      success = dbSuccess;
      
      logger.info('Board deleted from database', {
        boardId,
        internalId: board.id,
        success: dbSuccess
      });
    }
    
    // Database delete successful
    success = dbSuccess;
    
    if (!success) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    logger.info('Board deleted successfully', {
      boardId,
      dbSuccess,
      duration: getElapsedMs(startTime)
    });
    
    res.json({ success });
  } catch (error) {
    logger.error('Failed to delete board', {
      error: error.message,
      boardId,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Version endpoint
router.get('/version', (req, res) => {
  const packageJson = require('../../../package.json');
  res.json({
    version: packageJson.version,
    name: packageJson.name
  });
});

/**
 * Get cell history
 */
router.get('/boards/:boardId/cells/:row/:col/history', async (req, res) => {
  try {
    const { boardId, row, col } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const rowNum = parseInt(row);
    const colNum = parseInt(col);
    
    if (isNaN(rowNum) || isNaN(colNum)) {
      return res.status(400).json({ error: 'Invalid row or column' });
    }
    
    let history = [];
    
    // Get board from database
    const board = await boardModel.getBoardByUUID(boardId);
    
    if (!board) {
      logger.error('Board not found for cell history', { boardId });
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Get cell history from database
    const cellHistoryModel = require('../models/cellHistoryModel');
    history = await cellHistoryModel.getCellHistory(board.id, rowNum, colNum, { limit, offset });
    
    // Format history for consistency
    history = history.map(record => ({
      value: record.value || '',
      marked: !!record.marked,
      type: record.type || 'text',
      timestamp: new Date(record.created_at).getTime(),
      user: record.username || 'Anonymous'
    }));
    
    return res.json({
      history,
      meta: {
        limit,
        offset,
        boardId,
        row: rowNum,
        col: colNum
      }
    });
  } catch (error) {
    logger.error('Failed to get cell history', {
      error: error.message,
      boardId: req.params.boardId,
      row: req.params.row,
      col: req.params.col
    });
    return res.status(500).json({ error: 'Failed to get cell history' });
  }
});

/**
 * Get board settings
 */
router.get('/boards/:boardId/settings', async (req, res) => {
  try {
    const { boardId } = req.params;
    
    let settings = {};
    
    // Get board from database
    const board = await boardModel.getBoardByUUID(boardId);
    
    if (!board) {
      logger.error('Board not found for settings', { boardId });
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Get settings from database
    settings = board.settings || {};
    
    return res.json({ settings });
  } catch (error) {
    logger.error('Failed to get board settings', {
      error: error.message,
      boardId: req.params.boardId
    });
    return res.status(500).json({ error: 'Failed to get board settings' });
  }
});

/**
 * Update board settings
 */
router.put('/boards/:boardId/settings', async (req, res) => {
  try {
    const { boardId } = req.params;
    const settings = req.body;
    
    let success = false;
    
    // Get board from database
    const board = await boardModel.getBoardByUUID(boardId);
    
    if (!board) {
      logger.error('Board not found for settings update', { boardId });
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Check if the user has permission to update settings
    if (board.created_by && board.created_by !== req.user?.id && !req.isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to update this board' });
    }
    
    // Update settings in database
    const updated = await boardModel.updateBoard(board.id, { settings });
    success = !!updated;
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to update board settings' });
    }
    
    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update board settings', {
      error: error.message,
      boardId: req.params.boardId
    });
    return res.status(500).json({ error: 'Failed to update board settings' });
  }
});

module.exports = router; 