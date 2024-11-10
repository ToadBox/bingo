const express = require('express');
const router = express.Router();
const boardService = require('../services/boardService');
const logger = require('../utils/logger');

// Get all boards
router.get('/boards', async (req, res) => {
    try {
        const boards = await boardService.getAllBoards();
        
        // Log the successful fetch with request details
        logger.info('Boards fetched successfully', { 
            req: {
                ip: req.ip || req.connection?.remoteAddress,
                method: req.method,
                path: req.path,
                userAgent: req.get('user-agent')
            },
            status: 200,
            count: boards.length 
        });
        
        res.json(boards);
    } catch (error) {
        logger.error('Failed to fetch boards', { 
            req: {
                ip: req.ip || req.connection?.remoteAddress,
                method: req.method,
                path: req.path,
                userAgent: req.get('user-agent')
            },
            error: error.message 
        });
        res.status(500).json({ error: 'Failed to fetch boards' });
    }
});

// Get specific board
router.get('/board/:boardId', async (req, res) => {
    try {
        const board = await boardService.loadBoard(req.params.boardId);
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        res.json(board);
    } catch (error) {
        logger.error('Error loading board', { 
            boardId: req.params.boardId, 
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to load board' });
    }
});

// Set cell content
router.post('/board/:userId/set-cell', async (req, res) => {
    try {
        const { row, col, content } = req.body;
        const board = boardService.loadBoard(req.params.userId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        await boardService.setCellContent(board, row, col, content);
        res.json(board);
    } catch (error) {
        logger.error('Failed to update cell', { error: error.message });
        res.status(500).json({ error: 'Failed to update cell' });
    }
});

// Mark cell
router.post('/board/:userId/mark-cell', async (req, res) => {
    try {
        const { row, col } = req.body;
        const board = boardService.loadBoard(req.params.userId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        board.cells[row][col].marked = true;
        boardService.saveBoard(board);
        res.json(board);
    } catch (error) {
        logger.error('Failed to mark cell', { error: error.message });
        res.status(500).json({ error: 'Failed to mark cell' });
    }
});

// Logging endpoint
router.post('/logs', (req, res) => {
    const { timestamp, level, message, data } = req.body;
    logger.info('Frontend log received', { timestamp, level, message, data });
    res.sendStatus(200);
});

module.exports = router; 