const express = require('express');
const router = express.Router();
const boardService = require('../services/boardService');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');

// Add helper function for timing
function getElapsedMs(startTime) {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    return (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
}

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

router.use(apiLimiter);

// Get all boards
router.get('/boards', async (req, res) => {
    const startTime = process.hrtime();
    
    try {
        // Check ETag for caching
        const boards = await boardService.getAllBoards();
        const eTag = boardService._generateETag(boards);
        
        if (req.headers['if-none-match'] === eTag) {
            logger.debug('304 Not Modified', {
                duration: getElapsedMs(startTime)
            });
            return res.status(304).end();
        }

        res.set({
            'ETag': eTag,
            'Cache-Control': 'private, no-cache'
        });

        logger.info('Boards fetched successfully', {
            count: boards.length,
            duration: getElapsedMs(startTime)
        });
        
        res.json(boards);
    } catch (error) {
        logger.error('Failed to fetch boards', {
            error: error.message,
            duration: getElapsedMs(startTime)
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
        
        res.set('Cache-Control', 'public, max-age=150'); // Cache for 2.5 minutes
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
    const { timestamp, level, message, data, path, userAgent } = req.body;
    
    logger.info('Frontend log received', { 
        clientTimestamp: timestamp,
        level,
        message,
        data,
        clientPath: path,
        userAgent,
        ip: req.ip || req.connection?.remoteAddress
    });
    
    res.sendStatus(200);
});

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: boardService.mode,
        timestamp: new Date().toISOString()
    });
});

// Add version to cache responses
router.get('/version', (req, res) => {
    res.json({
        version: process.env.npm_package_version || '9.9.9',
        timestamp: Date.now()
    });
});

module.exports = router; 