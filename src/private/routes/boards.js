const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const boardModel = require('../models/boardModel');
const userModel = require('../models/userModel');
const { isAuthenticated } = require('../middleware/auth');

// Helper function to measure elapsed time
const getElapsedMs = (start) => {
  const elapsed = process.hrtime(start);
  return elapsed[0] * 1000 + elapsed[1] / 1000000;
};

/**
 * GET /boards - List all boards with pagination and filtering
 */
router.get('/', isAuthenticated, async (req, res) => {
  const startTime = process.hrtime();
  
  try {
    const options = {
      userId: req.user?.id,
      includePublic: true,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
      sortBy: req.query.sortBy || 'last_updated',
      sortOrder: req.query.sortOrder || 'DESC',
      searchTerm: req.query.search || null
    };

    const boards = await boardModel.getAllBoards(options);

    // Format boards for frontend compatibility
    const formattedBoards = boards.map(board => ({
      id: board.uuid,
      title: board.title,
      slug: board.slug,
      createdBy: board.creator_username || 'server',
      createdAt: new Date(board.created_at).getTime(),
      lastUpdated: new Date(board.last_updated).getTime(),
      cellCount: board.cellCount || 0,
      markedCount: board.markedCount || 0,
      isPublic: !!board.is_public,
      description: board.description,
      // Generate URL based on creator
      url: board.creator_username 
        ? `/${board.creator_username}/${board.slug}`
        : `/server/${board.slug}`
    }));

    logger.info('Boards listed successfully', {
      count: formattedBoards.length,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });

    res.json({
      boards: formattedBoards,
      meta: {
        limit: options.limit,
        offset: options.offset,
        total: formattedBoards.length,
        hasMore: formattedBoards.length === options.limit
      }
    });
  } catch (error) {
    logger.error('Failed to list boards', {
      error: error.message,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to list boards' });
  }
});

/**
 * POST /boards - Create a new board
 */
router.post('/', isAuthenticated, async (req, res) => {
  const startTime = process.hrtime();
  
  try {
    const { title, description, isPublic, size, createdByName } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Check if user is anonymous
    const isAnonymous = req.user.auth_provider === 'anonymous';
    
    // For anonymous users, use provided createdByName or default to "Anonymous"
    let displayName = req.user.username;
    if (isAnonymous) {
      displayName = createdByName?.trim() || 'Anonymous';
    }

    const boardData = {
      title: title.trim(),
      description: description?.trim() || '',
      createdBy: req.user.id,
      isPublic: !!isPublic,
      size: size || 5,
      createdByName: displayName // Store the display name for anonymous users
    };

    const board = await boardModel.createBoard(boardData);

    if (!board) {
      return res.status(500).json({ error: 'Failed to create board' });
    }

    // For anonymous users, use a more URL-friendly path structure
    let boardUrl;
    if (isAnonymous) {
      // Use anonymous/<boardId> for anonymous user boards
      boardUrl = `/anonymous/${board.slug}`;
    } else {
      boardUrl = `/${req.user.username}/${board.slug}`;
    }

    // Format for frontend compatibility
    const formattedBoard = {
      id: board.uuid,
      title: board.title,
      slug: board.slug,
      createdBy: displayName,
      createdAt: new Date(board.created_at).getTime(),
      lastUpdated: new Date(board.last_updated).getTime(),
      cells: board.cells || [],
      isPublic: !!board.is_public,
      description: board.description,
      url: boardUrl
    };

    logger.info('Board created successfully', {
      boardId: board.uuid,
      title,
      userId: req.user.id,
      isAnonymous,
      displayName,
      duration: getElapsedMs(startTime)
    });

    res.status(201).json(formattedBoard);
  } catch (error) {
    logger.error('Failed to create board', {
      error: error.message,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to create board' });
  }
});

/**
 * GET /anonymous/:slug - Get anonymous board by slug
 */
router.get('/anonymous/:slug', isAuthenticated, async (req, res) => {
  const { slug } = req.params;
  const startTime = process.hrtime();
  
  try {
    const board = await boardModel.getBoardByAnonymousSlug(slug);

    if (!board) {
      logger.warn('Anonymous board not found', { slug });
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check if user has access to private board
    if (!board.is_public && board.created_by !== req.user?.id && !req.user?.is_admin) {
      logger.warn('Access denied to private anonymous board', {
        slug,
        userId: req.user?.id
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    // Format for frontend compatibility
    const formattedBoard = {
      id: board.uuid,
      title: board.title,
      slug: board.slug,
      createdBy: board.createdByName || 'Anonymous',
      createdAt: new Date(board.created_at).getTime(),
      lastUpdated: new Date(board.last_updated).getTime(),
      cells: board.cells || [],
      isPublic: !!board.is_public,
      description: board.description,
      settings: board.settings ? JSON.parse(board.settings) : {}
    };

    logger.info('Anonymous board retrieved successfully', {
      slug,
      boardId: board.uuid,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });

    res.json(formattedBoard);
  } catch (error) {
    logger.error('Failed to retrieve anonymous board', {
      error: error.message,
      slug,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to retrieve anonymous board' });
  }
});

/**
 * GET /:username/:slug - Get specific board by username and slug
 */
router.get('/:username/:slug', isAuthenticated, async (req, res) => {
  const { username, slug } = req.params;
  const startTime = process.hrtime();
  
  try {
    const board = await boardModel.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
      logger.warn('Board not found', { username, slug });
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check if user has access to private board
    if (!board.is_public && board.created_by !== req.user?.id && !req.user?.is_admin) {
      logger.warn('Access denied to private board', {
        username,
        slug,
        userId: req.user?.id
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    // Format for frontend compatibility
    const formattedBoard = {
      id: board.uuid,
      title: board.title,
      slug: board.slug,
      createdBy: board.username || 'server',
      createdAt: new Date(board.created_at).getTime(),
      lastUpdated: new Date(board.last_updated).getTime(),
      cells: board.cells || [],
      isPublic: !!board.is_public,
      description: board.description,
      settings: board.settings ? JSON.parse(board.settings) : {}
    };

    logger.info('Board retrieved successfully', {
      username,
      slug,
      boardId: board.uuid,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });

    res.json(formattedBoard);
  } catch (error) {
    logger.error('Failed to retrieve board', {
      error: error.message,
      username,
      slug,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to retrieve board' });
  }
});

/**
 * PUT /:username/:slug - Update board (owner only)
 */
router.put('/:username/:slug', isAuthenticated, async (req, res) => {
  const { username, slug } = req.params;
  const startTime = process.hrtime();
  
  try {
    const board = await boardModel.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check ownership
    if (board.created_by !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'You do not have permission to update this board' });
    }

    const { title, description, isPublic } = req.body;
    const updates = {};

    if (title !== undefined) {
      updates.title = title.trim();
    }
    if (description !== undefined) {
      updates.description = description.trim();
    }
    if (isPublic !== undefined) {
      updates.is_public = !!isPublic;
    }

    const updatedBoard = await boardModel.updateBoard(board.id, updates);

    if (!updatedBoard) {
      return res.status(500).json({ error: 'Failed to update board' });
    }

    // Format for frontend compatibility
    const formattedBoard = {
      id: updatedBoard.uuid,
      title: updatedBoard.title,
      slug: updatedBoard.slug,
      createdBy: req.user.username,
      createdAt: new Date(updatedBoard.created_at).getTime(),
      lastUpdated: new Date(updatedBoard.last_updated).getTime(),
      isPublic: !!updatedBoard.is_public,
      description: updatedBoard.description
    };

    logger.info('Board updated successfully', {
      username,
      slug,
      boardId: board.uuid,
      updates,
      userId: req.user.id,
      duration: getElapsedMs(startTime)
    });

    res.json(formattedBoard);
  } catch (error) {
    logger.error('Failed to update board', {
      error: error.message,
      username,
      slug,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to update board' });
  }
});

/**
 * DELETE /:username/:slug - Delete board (owner only)
 */
router.delete('/:username/:slug', isAuthenticated, async (req, res) => {
  const { username, slug } = req.params;
  const startTime = process.hrtime();
  
  try {
    const board = await boardModel.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check ownership
    if (board.created_by !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'You do not have permission to delete this board' });
    }

    const success = await boardModel.deleteBoard(board.id);

    if (!success) {
      return res.status(500).json({ error: 'Failed to delete board' });
    }

    logger.info('Board deleted successfully', {
      username,
      slug,
      boardId: board.uuid,
      userId: req.user.id,
      duration: getElapsedMs(startTime)
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete board', {
      error: error.message,
      username,
      slug,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

/**
 * PUT /:username/:slug/cells/:row/:col - Update cell in board
 */
router.put('/:username/:slug/cells/:row/:col', async (req, res) => {
  const { username, slug, row, col } = req.params;
  const { value, marked, type } = req.body;
  const startTime = process.hrtime();
  
  try {
    const rowNum = parseInt(row);
    const colNum = parseInt(col);
    
    if (isNaN(rowNum) || isNaN(colNum)) {
      return res.status(400).json({ error: 'Invalid row or column' });
    }

    const board = await boardModel.getBoardByUsernameAndSlug(username, slug);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Update cell in database
    const updated = await boardModel.updateCell(board.id, rowNum, colNum, { 
      value: value || '', 
      marked: !!marked, 
      type: type || 'text' 
    }, req.user?.id);

    if (!updated) {
      return res.status(500).json({ error: 'Failed to update cell' });
    }

    const updatedCell = await boardModel.getCell(board.id, rowNum, colNum);

    const result = { 
      success: true, 
      cell: { 
        id: `${rowNum}-${colNum}`, 
        value: updatedCell?.value || '',
        marked: updatedCell?.marked === 1, 
        type: updatedCell?.type || 'text' 
      } 
    };

    logger.info('Cell updated successfully', {
      username,
      slug,
      boardId: board.uuid,
      row: rowNum,
      col: colNum,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to update cell', {
      error: error.message,
      username,
      slug,
      row,
      col,
      userId: req.user?.id,
      duration: getElapsedMs(startTime)
    });
    res.status(500).json({ error: 'Failed to update cell' });
  }
});

module.exports = router; 