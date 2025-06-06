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
    max: 500 // limit each IP to 500 requests per windowMs
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
        const board = await boardService.loadBoard(req.params.userId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        // Add user tracking information
        const userInfo = {
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        };
        
        // Add edit history if it doesn't exist
        if (!board.editHistory) {
            board.editHistory = [];
        }
        
        // Add to edit history
        board.editHistory.push({
            type: 'set',
            cell: { row, col },
            content: content,
            user: userInfo
        });
        
        // Trim history if it gets too large
        if (board.editHistory.length > 1000) {
            board.editHistory = board.editHistory.slice(-1000);
        }
        
        await boardService.setCellContent(board, row, col, content);
        res.json(board);
    } catch (error) {
        logger.error('Failed to update cell', { 
            error: error.message,
            stack: error.stack,
            userId: req.params.userId,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to update cell' });
    }
});

// Mark cell
router.post('/board/:userId/mark-cell', async (req, res) => {
    try {
        const { row, col } = req.body;
        const board = await boardService.loadBoard(req.params.userId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        // Add user tracking information
        const userInfo = {
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        };
        
        // Add edit history if it doesn't exist
        if (!board.editHistory) {
            board.editHistory = [];
        }
        
        // Add to edit history
        board.editHistory.push({
            type: 'mark',
            cell: { row, col },
            user: userInfo
        });
        
        board.cells[row][col].marked = true;
        await boardService.saveBoard(board);
        res.json(board);
    } catch (error) {
        logger.error('Failed to mark cell', { 
            error: error.message,
            stack: error.stack,
            userId: req.params.userId,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to mark cell' });
    }
});

// Unmark cell
router.post('/board/:userId/unmark-cell', async (req, res) => {
    try {
        const { row, col } = req.body;
        const board = await boardService.loadBoard(req.params.userId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        // Add user tracking information
        const userInfo = {
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        };
        
        // Add edit history if it doesn't exist
        if (!board.editHistory) {
            board.editHistory = [];
        }
        
        // Add to edit history
        board.editHistory.push({
            type: 'unmark',
            cell: { row, col },
            user: userInfo
        });
        
        board.cells[row][col].marked = false;
        await boardService.saveBoard(board);
        res.json(board);
    } catch (error) {
        logger.error('Failed to unmark cell', { 
            error: error.message,
            stack: error.stack,
            userId: req.params.userId,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to unmark cell' });
    }
});

// Clear cell
router.post('/board/:userId/clear-cell', async (req, res) => {
    try {
        const { row, col } = req.body;
        const board = await boardService.loadBoard(req.params.userId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        // Add user tracking information
        const userInfo = {
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        };
        
        // Add edit history if it doesn't exist
        if (!board.editHistory) {
            board.editHistory = [];
        }
        
        // Add to edit history
        board.editHistory.push({
            type: 'clear',
            cell: { row, col },
            previousValue: board.cells[row][col].value,
            user: userInfo
        });
        
        // Clear both content and marked state
        board.cells[row][col].value = '';
        board.cells[row][col].marked = false;
        
        await boardService.saveBoard(board);
        res.json(board);
    } catch (error) {
        logger.error('Failed to clear cell', { 
            error: error.message,
            stack: error.stack,
            userId: req.params.userId,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to clear cell' });
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

// Get board edit history
router.get('/board/:boardId/history', async (req, res) => {
    try {
        const board = await boardService.loadBoard(req.params.boardId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        // Return the edit history with pagination
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 50;
        
        const history = board.editHistory || [];
        const total = history.length;
        
        // Sort by timestamp descending (newest first)
        const sortedHistory = [...history].sort((a, b) => {
            const timeA = a.user?.timestamp ? new Date(a.user.timestamp) : 0;
            const timeB = b.user?.timestamp ? new Date(b.user.timestamp) : 0;
            return timeB - timeA;
        });
        
        const paginatedHistory = sortedHistory.slice(page * limit, (page + 1) * limit);
        
        res.json({
            history: paginatedHistory,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to fetch board history', { 
            error: error.message,
            stack: error.stack,
            boardId: req.params.boardId,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to fetch board history' });
    }
});

// Admin password management
router.get('/admin/password', async (req, res) => {
    try {
        // For security, only return if an admin password exists, not the actual password
        const adminPassword = process.env.ADMIN_PASSWORD || '';
        res.json({ 
            hasPassword: !!adminPassword,
            message: 'For security reasons, the actual password is not returned'
        });
    } catch (error) {
        logger.error('Failed to get admin password info', { 
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to get admin password info' });
    }
});

router.post('/admin/password', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ error: 'Password cannot be empty' });
        }
        
        // In a production app, you would use a configuration service 
        // or database to store this safely - this is just for demo
        process.env.ADMIN_PASSWORD = password;
        
        logger.info('Admin password updated', { ip: req.ip });
        res.json({ success: true, message: 'Admin password updated successfully' });
    } catch (error) {
        logger.error('Failed to update admin password', { 
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to update admin password' });
    }
});

// Site password management - separate from admin password
router.get('/site/password', async (req, res) => {
    try {
        // For security, only return if a site password exists, not the actual password
        const sitePassword = process.env.SITE_PASSWORD || '';
        res.json({ 
            hasPassword: !!sitePassword,
            message: 'For security reasons, the actual password is not returned'
        });
    } catch (error) {
        logger.error('Failed to get site password info', { 
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to get site password info' });
    }
});

router.post('/site/password', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ error: 'Password cannot be empty' });
        }
        
        // In a production app, you would use a configuration service 
        // or database to store this safely - this is just for demo
        process.env.SITE_PASSWORD = password;
        
        logger.info('Site password updated', { ip: req.ip });
        res.json({ success: true, message: 'Site password updated successfully' });
    } catch (error) {
        logger.error('Failed to update site password', { 
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to update site password' });
    }
});

// Get edit history for a specific cell
router.get('/board/:boardId/cell-history/:row/:col', async (req, res) => {
    try {
        const { row, col } = req.params;
        const rowIndex = parseInt(row);
        const colIndex = parseInt(col);
        
        if (isNaN(rowIndex) || isNaN(colIndex)) {
            return res.status(400).json({ error: 'Invalid row or column' });
        }
        
        const board = await boardService.loadBoard(req.params.boardId);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        if (!board.editHistory) {
            return res.json({ history: [] });
        }
        
        // Get history entries for this specific cell
        const cellHistory = board.editHistory.filter(entry => 
            entry.cell && 
            entry.cell.row === rowIndex && 
            entry.cell.col === colIndex
        );
        
        // Sort by timestamp descending (newest first)
        const sortedHistory = [...cellHistory].sort((a, b) => {
            const timeA = a.user?.timestamp ? new Date(a.user.timestamp) : 0;
            const timeB = b.user?.timestamp ? new Date(b.user.timestamp) : 0;
            return timeB - timeA;
        });
        
        // Return limited history (last 5 edits)
        const recentHistory = sortedHistory.slice(0, 5);
        
        res.json({ history: recentHistory });
    } catch (error) {
        logger.error('Failed to fetch cell history', { 
            error: error.message,
            stack: error.stack,
            boardId: req.params.boardId,
            row: req.params.row,
            col: req.params.col,
            ip: req.ip
        });
        res.status(500).json({ error: 'Failed to fetch cell history' });
    }
});

module.exports = router; 