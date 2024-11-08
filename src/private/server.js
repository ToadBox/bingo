const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Add these debug lines to verify the file location
console.log('Looking for .env file at:', path.join(__dirname, '.env'));
console.log('Environment variables loaded');
console.log('Current directory:', __dirname);
console.log('Env file contents:', {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.TOADBOX_ID
});

const express = require('express');
const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const logger = require('./logger');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = 3000;
const SAVE_FILE = path.join(__dirname, 'bingoState.json');
const columns = ['A', 'B', 'C', 'D', 'E'];

const BOARDS_DIR = path.join(__dirname, 'boards');
const DEFAULT_BOARD_TITLE = 'New Bingo Board';

// Ensure boards directory exists
if (!fs.existsSync(BOARDS_DIR)) {
  fs.mkdirSync(BOARDS_DIR);
}

function getBoardPath(boardId) {
  logger.debug('Getting board path', { boardId });
  const cleanId = boardId.replace(/^(user-|server-)/, '');
  const prefix = boardId.startsWith('server-') ? 'server-' : 'user-';
  const boardPath = path.join(BOARDS_DIR, `${prefix}${cleanId}-board.json`);
  logger.debug('Board path resolved', { boardId, boardPath });
  return boardPath;
}

function createNewBoard(userId, userName) {
  const cleanUserId = userId.replace(/^user-/, '');
  return {
    id: `user-${cleanUserId}`,
    createdBy: userName,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    title: `${userName}'s Bingo Board`,
    cells: Array(5).fill().map((_, rowIndex) =>
      Array(5).fill().map((_, colIndex) => ({
        label: `${columns[colIndex]}${rowIndex + 1}`,
        value: '',
        marked: false
      }))
    ),
  };
}

function loadBoard(boardId) {
  const boardPath = getBoardPath(boardId);
  logger.debug('Loading board', { 
    boardId, 
    path: boardPath,
    exists: fs.existsSync(boardPath)
  });
  
  if (fs.existsSync(boardPath)) {
    try {
      const savedState = fs.readFileSync(boardPath, 'utf8');
      const board = JSON.parse(savedState);
      logger.info('Board loaded successfully', { 
        boardId,
        title: board.title,
        path: boardPath
      });
      return board;
    } catch (error) {
      logger.error('Error parsing board file', {
        boardId,
        path: boardPath,
        error: error.message
      });
      return null;
    }
  }
  logger.warn('Board file not found', { boardId, path: boardPath });
  return null;
}

function saveBoard(board) {
  board.lastUpdated = Date.now();
  const boardPath = getBoardPath(board.id);
  logger.debug('Saving board', { boardId: board.id, path: boardPath });
  
  try {
    fs.writeFileSync(boardPath, JSON.stringify(board, null, 2));
    logger.info('Board saved successfully', { boardId: board.id });
  } catch (error) {
    logger.error('Failed to save board', { boardId: board.id, error: error.message });
    throw error;
  }
}

// Express middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Load saved state
let bingoCard;
try {
  if (fs.existsSync(SAVE_FILE)) {
    const savedState = fs.readFileSync(SAVE_FILE, 'utf8');
    bingoCard = JSON.parse(savedState);
    console.log('Loaded saved bingo state');
  } else {
    bingoCard = {
      title: 'Bingo Card',
      cells: Array(5).fill().map((_, rowIndex) =>
        Array(5).fill().map((_, colIndex) => ({
          label: `${columns[colIndex]}${rowIndex + 1}`,
          value: '',
          marked: false
        }))
      ),
    };
    console.log('Created new bingo state');
  }
} catch (error) {
  console.error('Error loading saved state:', error);
  bingoCard = {
    title: 'Bingo Card',
    cells: Array(5).fill().map((_, rowIndex) =>
      Array(5).fill().map((_, colIndex) => ({
        label: `${columns[colIndex]}${rowIndex + 1}`,
        value: '',
        marked: false
      }))
    ),
  };
}

function saveState() {
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(bingoCard, null, 2));
    console.log('Saved bingo state');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

// API Routes
app.get('/api/get-card', (req, res) => res.json(bingoCard));

app.post('/api/set-cell', (req, res) => {
  const { row, col, content } = req.body;
  bingoCard.cells[row][col].value = content;
  saveState();
  res.json(bingoCard);
});

app.post('/api/clear-cell', (req, res) => {
  const { row, col } = req.body;
  bingoCard.cells[row][col].value = '';
  saveState();
  res.json(bingoCard);
});

app.post('/api/mark-cell', (req, res) => {
  const { row, col } = req.body;
  bingoCard.cells[row][col].marked = true;
  saveState();
  res.json(bingoCard);
});

app.post('/api/unmark-cell', (req, res) => {
  const { row, col } = req.body;
  bingoCard.cells[row][col].marked = false;
  saveState();
  res.json(bingoCard);
});

app.post('/api/set-title', (req, res) => {
  const { title } = req.body;
  bingoCard.title = title;
  saveState();
  res.json(bingoCard);
});

app.get('/bingo', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// Discord Bot Setup
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

function parseCell(cell) {
  const col = cell[0].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  const row = parseInt(cell.substring(1), 10) - 1;
  return { row, col };
}

client.once('ready', async () => {
  logger.info('Discord bot is ready', { username: client.user.tag });
  const commands = [
    new SlashCommandBuilder()
      .setName('bingo')
      .setDescription('Manage bingo boards')
      .addSubcommand(subcommand =>
        subcommand
          .setName('create')
          .setDescription('Create a new bingo board')
          .addStringOption(option =>
            option.setName('title')
            .setDescription('Title for the new board')
            .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('set')
          .setDescription('Set text in a bingo cell')
          .addStringOption(option =>
            option.setName('cell').setDescription('Cell to update (e.g., A4)').setRequired(true)
          )
          .addStringOption(option =>
            option.setName('text').setDescription('Text to set in the cell').setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('mark')
          .setDescription('Mark a cell with an X')
          .addStringOption(option =>
            option.setName('cell').setDescription('Cell to mark (e.g., A4)').setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('unmark')
          .setDescription('Remove the X from a cell')
          .addStringOption(option =>
            option.setName('cell').setDescription('Cell to unmark (e.g., A4)').setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('title')
          .setDescription('Set the bingo card title')
          .addStringOption(option =>
            option.setName('text').setDescription('New title for the bingo card').setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('clear')
          .setDescription('Clear a cell\'s content')
          .addStringOption(option =>
            option.setName('cell').setDescription('Cell to clear (e.g., A4)').setRequired(true)
          )
      ),
  ];

  await client.application.commands.set(commands, process.env.TOADBOX_ID);
  console.log('Commands registered');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'bingo') {
    const userId = interaction.user.id;
    const userName = interaction.user.username;
    
    logger.info('Bingo command received', {
      userId,
      userName,
      subcommand: interaction.options.getSubcommand()
    });
    
    // Load or create user's board
    let board = loadBoard(userId);
    if (!board) {
      board = createNewBoard(userId, userName);
      saveBoard(board);
    }

    const subcommand = interaction.options.getSubcommand();

    switch(subcommand) {
      case 'set':
        const cell = interaction.options.getString('cell');
        const text = interaction.options.getString('text');
        const { row, col } = parseCell(cell);
        board.cells[row][col].value = text;
        saveBoard(board);
        await interaction.reply(`Set cell ${cell} to "${text}"`);
        break;

      case 'mark':
        const markCell = interaction.options.getString('cell');
        const { row: markRow, col: markCol } = parseCell(markCell);
        board.cells[markRow][markCol].marked = true;
        saveBoard(board);
        await interaction.reply(`Marked cell ${markCell} with an X`);
        break;

      case 'unmark':
        const unmarkCell = interaction.options.getString('cell');
        const { row: unmarkRow, col: unmarkCol } = parseCell(unmarkCell);
        board.cells[unmarkRow][unmarkCol].marked = false;
        saveBoard(board);
        await interaction.reply(`Removed the X from cell ${unmarkCell}`);
        break;

      case 'clear':
        const clearCell = interaction.options.getString('cell');
        const { row: clearRow, col: clearCol } = parseCell(clearCell);
        board.cells[clearRow][clearCol].value = '';
        board.cells[clearRow][clearCol].marked = false;
        saveBoard(board);
        await interaction.reply(`Cleared cell ${clearCell}`);
        break;

      case 'title':
        const newTitle = interaction.options.getString('text');
        board.title = newTitle;
        saveBoard(board);
        await interaction.reply(`Updated board title to "${newTitle}"`);
        break;

      default:
        await interaction.reply('Unknown command');
        break;
    }
  }
});

// New route to get all boards
app.get('/api/boards', (req, res) => {
  logger.debug('Fetching all boards');
  try {
    const boards = fs.readdirSync(BOARDS_DIR)
      .filter(file => file.endsWith('-board.json'))
      .map(file => {
        const board = JSON.parse(fs.readFileSync(path.join(BOARDS_DIR, file), 'utf8'));
        return {
          id: board.id,
          title: board.title,
          createdBy: board.createdBy,
          lastUpdated: board.lastUpdated,
          cells: board.cells
        };
      })
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
    logger.info('Boards fetched successfully', { count: boards.length });
    res.json(boards);
  } catch (error) {
    logger.error('Failed to fetch boards', { error: error.message });
    res.status(500).json({ error: 'Failed to load boards' });
  }
});

app.get('/api/board/:boardId', (req, res) => {
  const boardId = req.params.boardId;
  logger.debug('Attempting to load board', { boardId });
  
  try {
    const board = loadBoard(boardId);
    
    if (!board) {
      logger.warn('Board not found', { boardId });
      return res.status(404).json({ error: 'Board not found' });
    }
    
    logger.info('Board loaded successfully', { 
      boardId, 
      title: board.title,
      path: getBoardPath(boardId)
    });
    res.json(board);
  } catch (error) {
    logger.error('Error loading board', { 
      boardId, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ error: 'Failed to load board' });
  }
});

// Board modification routes
app.post('/api/board/:userId/set-cell', (req, res) => {
  try {
    const { row, col, content } = req.body;
    const board = loadBoard(req.params.userId);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    if (content.toLowerCase().startsWith('image:')) {
      const imageUrl = content.slice(6).trim();
      if (!isValidImageUrl(imageUrl)) {
        return res.status(400).json({ error: 'Invalid image URL' });
      }
      board.cells[row][col].value = content;
    } else {
      board.cells[row][col].value = content;
    }
    
    saveBoard(board);
    res.json(board);
  } catch (error) {
    logger.error('Failed to update cell', { error: error.message });
    res.status(500).json({ error: 'Failed to update cell' });
  }
});

app.post('/api/board/:userId/mark-cell', (req, res) => {
  try {
    const { row, col } = req.body;
    const board = loadBoard(req.params.userId);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    board.cells[row][col].marked = true;
    saveBoard(board);
    res.json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark cell' });
  }
});

// Add this with your other routes
app.post('/api/logs', (req, res) => {
  const { timestamp, level, message, data } = req.body;
  logger.info('Frontend log received', { timestamp, level, message, data });
  res.sendStatus(200);
});

// Add this route handler after your other routes
app.get('/board/:boardId', (req, res) => {
  logger.debug('Serving board page', { boardId: req.params.boardId });
  res.sendFile(path.join(__dirname, '../public/board.html'));
});

function isValidImageUrl(url) {
  try {
    const parsed = new URL(url);
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  // Static assets
  if (req.url.match(/\.(css|js|jpg|png|gif)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

app.use(helmet());

// Start the server and bot
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
client.login(process.env.DISCORD_TOKEN); 