const { SlashCommandBuilder } = require('discord.js');
const boardService = require('../services/boardService');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class DiscordCommands {
    constructor(boardService) {
        this.boardService = boardService;
        this.allowedGuildId = process.env.TOADBOX;
        
        if (!this.allowedGuildId) {
            logger.warn('TOADBOX guild ID not set in environment variables');
        }
    }

    setupCommands() {
        // Base command builder with common operations
        const bingoCommand = new SlashCommandBuilder()
            .setName('bingo')
            .setDescription('Manage bingo boards');

        // Basic operations (always available in both modes)
        bingoCommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set content in a bingo cell')
                    .addStringOption(option =>
                        option.setName('cell')
                        .setDescription('Cell to update (e.g., A4)')
                        .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('type')
                        .setDescription('Type of content to set')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Text', value: 'text' },
                            { name: 'Image URL', value: 'image' }
                        )
                    )
                    .addStringOption(option =>
                        option.setName('content')
                        .setDescription('Text or image URL to set in the cell')
                        .setRequired(true)
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
                    .setName('clear')
                    .setDescription('Clear a cell\'s content')
                    .addStringOption(option =>
                        option.setName('cell').setDescription('Cell to clear (e.g., A4)').setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('password')
                    .setDescription('Get the current site password')
            );

        // Only add the image command if not in unified mode or if allowed
        if (this.boardService.mode !== constants.BOARD_MODES.UNI || 
            this.boardService.isCommandAllowed('image')) {
            bingoCommand.addSubcommand(subcommand =>
                subcommand
                    .setName('image')
                    .setDescription('Generate an image of the current bingo board')
            );
        }

        // Only add advanced commands if not in unified mode
        if (this.boardService.mode !== constants.BOARD_MODES.UNI) {
            bingoCommand
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
                        .setName('title')
                        .setDescription('Set the bingo card title')
                        .addStringOption(option =>
                            option.setName('text').setDescription('New title for the bingo card').setRequired(true)
                        )
                );
        }

        return [bingoCommand];
    }

    async register(client) {
        try {
            // Register commands only for the specific guild
            const guild = client.guilds.cache.get(this.allowedGuildId);
            
            if (!guild) {
                logger.error('ToadBox guild not found', { guildId: this.allowedGuildId });
                return;
            }

            // Fetch and delete existing guild commands
            const existingCommands = await guild.commands.fetch();
            for (const command of existingCommands.values()) {
                await guild.commands.delete(command);
            }

            // Register new commands for the specific guild
            const commands = this.setupCommands();
            await guild.commands.set(commands);
            
            logger.info('Discord commands registered for ToadBox', { 
                guildId: this.allowedGuildId,
                commandCount: commands.length 
            });
        } catch (error) {
            logger.error('Failed to register Discord commands', { error: error.message });
            throw error;
        }
    }

    async handleCommand(interaction) {
        logger.info('Handling Discord command', {
            command: interaction.commandName,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            username: interaction.user.tag
        });

        // Check if command is from ToadBox
        if (interaction.guildId !== this.allowedGuildId) {
            logger.warn('Command attempted from unauthorized guild', {
                guildId: interaction.guildId,
                userId: interaction.user.id
            });
            await interaction.reply({
                content: '❌ This bot is only available in ToadBox.',
                ephemeral: true
            });
            return;
        }

        const command = interaction.commandName;
        
        try {
            if (command === 'bingo') {
                const subcommand = interaction.options.getSubcommand();
                
                // Check if subcommand is allowed in unified mode
                if (!this.boardService.isCommandAllowed(subcommand)) {
                    logger.info('Subcommand not allowed in unified mode', {
                        subcommand,
                        userId: interaction.user.id
                    });
                    await interaction.reply({
                        content: `⚠️ The command \`/bingo ${subcommand}\` is not available in unified mode. Only basic board operations (set, clear, mark, unmark) are allowed.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            // Use UNIFIED_BOARD_ID in unified mode, otherwise use guildId
            const boardId = this.boardService.mode === constants.BOARD_MODES.UNI 
                ? constants.UNIFIED_BOARD_ID 
                : interaction.guildId;

            logger.info('Loading board for command', {
                boardId,
                mode: this.boardService.mode,
                command
            });

            const board = await this.boardService.loadBoard(boardId);
            if (!board) {
                logger.error('Failed to load unified board', { boardId });
                await interaction.reply({
                    content: '❌ Error loading the unified board. Please contact an administrator.',
                    ephemeral: true
                });
                return;
            }

            logger.info('Board loaded successfully', {
                boardId: board.id,
                title: board.title,
                command
            });

            switch (command) {
                case 'bingo':
                    const subcommand = interaction.options.getSubcommand();
                    logger.info('Processing bingo subcommand', {
                        subcommand,
                        mode: this.boardService.mode
                    });

                    if (this.boardService.mode === constants.BOARD_MODES.UNI && 
                        !this.boardService.isCommandAllowed(subcommand)) {
                        logger.info('Advanced operation attempted in unified mode', {
                            subcommand,
                            userId: interaction.user.id
                        });
                        await interaction.reply({
                            content: '⚠️ Only basic board operations (set, clear, mark, unmark) are available in unified mode.',
                            ephemeral: true
                        });
                        return;
                    }
                    await this.handleSubcommand(interaction, board);
                    break;

                default:
                    logger.warn('Unknown command received', { command });
                    await interaction.reply({
                        content: '❌ Unknown command',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Discord command error', { 
                error: error.message,
                command: interaction?.commandName,
                stack: error.stack,
                user: interaction.user.tag,
                guildId: interaction.guildId
            });
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                ephemeral: true
            });
        }
    }

    async handleSubcommand(interaction, board) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set':
                case 'mark':
                case 'unmark':
                case 'clear':
                    // These commands are always allowed
                    await this.handleBasicOperation(interaction, board, subcommand);
                    break;

                case 'show':
                case 'help':
                    // These commands are view-only and always allowed
                    await this.handleViewOperation(interaction, board, subcommand);
                    break;

                case 'password':
                    // Password command is admin-only
                    await this.handlePasswordCommand(interaction);
                    break;

                case 'image':
                    // Generate board image - now allowed in unified mode
                    if (this.boardService.isCommandAllowed('image')) {
                        await this.handleBoardImageCommand(interaction, board);
                    } else {
                        throw new Error('The image command is not available in this mode');
                    }
                    break;

                default:
                    // All other commands are checked against unified mode
                    if (this.boardService.mode === constants.BOARD_MODES.UNI) {
                        throw new Error('This command is not available in unified mode');
                    }
                    await this.handleAdvancedOperation(interaction, board, subcommand);
            }
        } catch (error) {
            throw error;
        }
    }

    async handleBasicOperation(interaction, board, operation) {
        const cell = interaction.options.getString('cell');
        const type = interaction.options.getString('type');
        const content = interaction.options.getString('content');

        logger.info('Handling basic operation', {
            operation,
            cell,
            type,
            content,
            boardId: board.id,
            userId: interaction.user.id
        });

        try {
            switch (operation) {
                case 'set':
                    await this.boardService.handleCommand('set', board, cell, type, content);
                    await interaction.reply(`Set cell ${cell} to "${content}"`);
                    break;

                case 'mark':
                    await this.boardService.handleCommand('mark', board, cell);
                    await interaction.reply(`Marked cell ${cell} with an X`);
                    break;

                case 'unmark':
                    await this.boardService.handleCommand('unmark', board, cell);
                    await interaction.reply(`Removed the X from cell ${cell}`);
                    break;

                case 'clear':
                    await this.boardService.handleCommand('clear', board, cell);
                    await interaction.reply(`Cleared cell ${cell}`);
                    break;
            }
        } catch (error) {
            logger.error('Failed to perform basic operation', {
                operation,
                cell,
                type,
                content,
                boardId: board.id,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async handleViewOperation(interaction, board, operation) {
        switch (operation) {
            case 'show':
                // Existing show logic
                break;

            case 'help':
                const helpText = this.boardService.mode === constants.BOARD_MODES.UNI
                    ? this.getUnifiedModeHelp()
                    : this.getStandardModeHelp();
                await interaction.reply({
                    content: helpText,
                    ephemeral: true
                });
                break;
        }
    }

    getUnifiedModeHelp() {
        return `
**Available Commands in Unified Mode:**
• \`/bingo set <cell> <value>\` - Set a cell's value
• \`/bingo mark <cell>\` - Mark a cell as complete
• \`/bingo unmark <cell>\` - Remove mark from a cell
• \`/bingo clear <cell>\` - Clear a cell's contents
• \`/bingo image\` - Generate an image of the current board
• \`/bingo password\` - Get the site password

Note: Advanced board management commands are disabled in unified mode.`;
    }

    async handleAdvancedOperation(interaction, board, subcommand) {
        // Implementation of advanced operation handling
        throw new Error('Advanced operation handling not implemented');
    }

    async handlePasswordCommand(interaction) {

        try {
            // Get the site password from environment variable
            const sitePassword = process.env.SITE_PASSWORD || 'dingusForgetsToSetPassword';
            
            await interaction.reply({
                content: `🔑 Current site password: \`${sitePassword}\``,
                ephemeral: true // Make sure only the requestor can see it
            });
            
            logger.info('Password command executed', {
                userId: interaction.user.id,
                username: interaction.user.tag
            });
        } catch (error) {
            logger.error('Failed to execute password command', {
                error: error.message,
                userId: interaction.user.id
            });
            throw error;
        }
    }

    async handleBoardImageCommand(interaction, board) {
        try {
            // First, defer the reply since image generation might take some time
            await interaction.deferReply();
            
            // Generate the board image
            const { createCanvas, loadImage } = require('canvas');
            const fs = require('fs');
            const path = require('path');
            
            // Set up canvas with appropriate dimensions
            const cellSize = 120;
            const padding = 20;
            const headerHeight = 60;
            const width = cellSize * 5 + padding * 2;
            const height = cellSize * 5 + padding * 2 + headerHeight;
            
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            
            // Fill background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            
            // Draw title
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(board.title || 'Bingo Board', width / 2, padding + 30);
            
            // Draw grid
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            
            // Draw cells
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 5; col++) {
                    const cell = board.cells[row][col];
                    const x = padding + col * cellSize;
                    const y = padding + headerHeight + row * cellSize;
                    
                    // Draw cell background
                    ctx.fillStyle = cell.marked ? '#e6ffe6' : '#ffffff';
                    ctx.fillRect(x, y, cellSize, cellSize);
                    
                    // Draw cell border
                    ctx.strokeRect(x, y, cellSize, cellSize);
                    
                    // Draw cell content
                    if (cell.value) {
                        if (cell.value.startsWith('image:')) {
                            try {
                                // Handle image content
                                const imagePath = cell.value.substring(6);
                                const fullImagePath = path.join(process.cwd(), 'src', 'public', imagePath);
                                
                                logger.debug('Loading image for board render', {
                                    imagePath,
                                    fullImagePath,
                                    exists: fs.existsSync(fullImagePath)
                                });
                                
                                if (fs.existsSync(fullImagePath)) {
                                    const img = await loadImage(fullImagePath);
                                    
                                    // Calculate scaled dimensions to fit in cell
                                    const scale = Math.min(
                                        (cellSize - 10) / img.width,
                                        (cellSize - 10) / img.height
                                    );
                                    
                                    const imgWidth = img.width * scale;
                                    const imgHeight = img.height * scale;
                                    
                                    // Center the image in the cell
                                    const imgX = x + (cellSize - imgWidth) / 2;
                                    const imgY = y + (cellSize - imgHeight) / 2;
                                    
                                    ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
                                }
                            } catch (imageError) {
                                // If image loading fails, show text instead
                                ctx.fillStyle = '#ff0000';
                                ctx.font = '10px Arial';
                                ctx.textAlign = 'center';
                                ctx.fillText('[Image Error]', x + cellSize / 2, y + cellSize / 2);
                            }
                        } else {
                            // Handle text content
                            ctx.fillStyle = '#000000';
                            ctx.font = '14px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            
                            // Wrap text if needed
                            const maxWidth = cellSize - 10;
                            const words = cell.value.split(' ');
                            let line = '';
                            let lines = [];
                            
                            for (const word of words) {
                                const testLine = line + (line ? ' ' : '') + word;
                                const metrics = ctx.measureText(testLine);
                                
                                if (metrics.width > maxWidth && line !== '') {
                                    lines.push(line);
                                    line = word;
                                } else {
                                    line = testLine;
                                }
                            }
                            lines.push(line);
                            
                            // Limit to 3 lines max
                            if (lines.length > 3) {
                                lines = lines.slice(0, 2);
                                lines.push('...');
                            }
                            
                            // Draw the text lines
                            const lineHeight = 18;
                            const startY = y + cellSize / 2 - ((lines.length - 1) * lineHeight) / 2;
                            
                            lines.forEach((line, i) => {
                                ctx.fillText(line, x + cellSize / 2, startY + i * lineHeight);
                            });
                        }
                    }
                    
                    // Draw X if marked
                    if (cell.marked) {
                        ctx.strokeStyle = '#ff0000';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(x + 10, y + 10);
                        ctx.lineTo(x + cellSize - 10, y + cellSize - 10);
                        ctx.moveTo(x + cellSize - 10, y + 10);
                        ctx.lineTo(x + 10, y + cellSize - 10);
                        ctx.stroke();
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                    }
                    
                    // Draw cell label
                    ctx.fillStyle = '#888888';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(cell.label, x + 5, y + 5);
                }
            }
            
            // Create a temporary file path for the image
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tempFilePath = path.join(tempDir, `board-${Date.now()}.png`);
            
            // Save canvas to file
            const buffer = canvas.toBuffer('image/png');
            fs.writeFileSync(tempFilePath, buffer);
            
            // Send the image file
            await interaction.editReply({
                content: `Current Bingo Board: ${board.title}`,
                files: [{ attachment: tempFilePath, name: 'bingo-board.png' }]
            });
            
            // Clean up the temp file after sending
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                } catch (cleanupError) {
                    logger.error('Failed to clean up temp image file', {
                        error: cleanupError.message,
                        path: tempFilePath
                    });
                }
            }, 5000);
            
            logger.info('Board image generated successfully', {
                userId: interaction.user.id,
                boardId: board.id
            });
        } catch (error) {
            logger.error('Failed to generate board image', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                boardId: board?.id
            });
            
            // If we already deferred, edit the reply
            if (interaction.deferred) {
                await interaction.editReply({
                    content: `❌ Error generating board image: ${error.message}`
                });
            } else {
                await interaction.reply({
                    content: `❌ Error generating board image: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
}

module.exports = DiscordCommands;
