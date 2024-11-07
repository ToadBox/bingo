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

const app = express();
const PORT = 3000;
const SAVE_FILE = path.join(__dirname, 'bingoState.json');
const columns = ['A', 'B', 'C', 'D', 'E'];

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
  console.log('Discord bot is ready!');
  const commands = [
    new SlashCommandBuilder()
      .setName('bingo')
      .setDescription('Manage the bingo card')
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
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'title') {
      const newTitle = interaction.options.getString('text');
      bingoCard.title = newTitle;
      saveState();
      await interaction.reply(`Set board title to "${newTitle}"`);
      return;
    }

    // For commands that need a cell reference
    const cell = interaction.options.getString('cell');
    const { row, col } = parseCell(cell);

    switch(subcommand) {
      case 'set':
        const text = interaction.options.getString('text');
        bingoCard.cells[row][col].value = text;
        saveState();
        await interaction.reply(`Set cell ${cell} to "${text}"`);
        break;

      case 'mark':
        bingoCard.cells[row][col].marked = true;
        saveState();
        await interaction.reply(`Marked cell ${cell} with an X`);
        break;

      case 'unmark':
        bingoCard.cells[row][col].marked = false;
        saveState();
        await interaction.reply(`Removed the X from cell ${cell}`);
        break;

      case 'clear':
        bingoCard.cells[row][col].value = '';
        bingoCard.cells[row][col].marked = false;
        saveState();
        await interaction.reply(`Cleared cell ${cell}`);
        break;
    }
  }
});

// Start the server and bot
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
client.login(process.env.DISCORD_TOKEN); 