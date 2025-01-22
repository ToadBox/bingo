const { SlashCommandBuilder } = require('discord.js');
const boardService = require('../services/boardService');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class DiscordCommands {
    setupCommands() {
        return [
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
                )
        ];
    }

    async handleCommand(interaction) {
        if (!interaction.isCommand() || interaction.commandName !== 'bingo') return;
        
        const commandContext = {
            userId: interaction.user.id,
            userName: interaction.user.username,
            subcommand: interaction.options.getSubcommand(),
            guildId: interaction.guildId,
            channelId: interaction.channelId
        };
        
        logger.info('Bingo command received', commandContext);
        
        try {
            // In unified mode, always use the server board
            const boardId = boardService.mode === constants.BOARD_MODES.UNI 
                ? constants.UNIFIED_BOARD_ID 
                : interaction.user.id;

            let board = await boardService.loadBoard(boardId);
            if (!board) {
                if (boardService.mode === constants.BOARD_MODES.UNI) {
                    throw new Error('Server board not found');
                }
                board = boardService.createNewBoard(interaction.user.id, interaction.user.username);
                await boardService.saveBoard(board);
            }

            await this.handleSubcommand(interaction, board);
        } catch (error) {
            logger.error('Error handling command', { 
                error: error.message,
                userId: interaction.user.id,
                command: interaction.options.getSubcommand()
            });
            await interaction.reply({ 
                content: `Error: ${error.message}`, 
                ephemeral: true 
            });
        }
    }

    async handleSubcommand(interaction, board) {
        const subcommand = interaction.options.getSubcommand();

        switch(subcommand) {
            case 'set':
                const cell = interaction.options.getString('cell');
                const type = interaction.options.getString('type');
                const content = interaction.options.getString('content');
                const { row, col } = boardService.parseCell(cell);
                
                await interaction.deferReply();
                try {
                    if (type === 'image') {
                        // Validate URL format
                        if (!content.match(/^https?:\/\/.*\.(jpg|jpeg|png)(\?.*)?$/i)) {
                            throw new Error('Invalid image URL. Must end with .jpg, .jpeg, or .png');
                        }
                        await boardService.setCellContent(board, row, col, content);
                        await interaction.editReply(`Set image in cell ${cell}. The image should appear shortly.`);
                    } else {
                        await boardService.setCellContent(board, row, col, content);
                        await interaction.editReply(`Set cell ${cell} to "${content}"`);
                    }
                } catch (error) {
                    await interaction.editReply(`Failed to set ${type}: ${error.message}`);
                }
                break;

            case 'mark':
                const markCell = interaction.options.getString('cell');
                const { row: markRow, col: markCol } = boardService.parseCell(markCell);
                board.cells[markRow][markCol].marked = true;
                boardService.saveBoard(board);
                await interaction.reply(`Marked cell ${markCell} with an X`);
                break;

            case 'unmark':
                const unmarkCell = interaction.options.getString('cell');
                const { row: unmarkRow, col: unmarkCol } = boardService.parseCell(unmarkCell);
                board.cells[unmarkRow][unmarkCol].marked = false;
                boardService.saveBoard(board);
                await interaction.reply(`Removed the X from cell ${unmarkCell}`);
                break;

            case 'clear':
                const clearCell = interaction.options.getString('cell');
                const { row: clearRow, col: clearCol } = boardService.parseCell(clearCell);
                board.cells[clearRow][clearCol].value = '';
                board.cells[clearRow][clearCol].marked = false;
                boardService.saveBoard(board);
                await interaction.reply(`Cleared cell ${clearCell}`);
                break;

            case 'title':
                const newTitle = interaction.options.getString('text');
                board.title = newTitle;
                boardService.saveBoard(board);
                await interaction.reply(`Updated board title to "${newTitle}"`);
                break;

            default:
                await interaction.reply('Unknown command');
                break;
        }
    }

    async register(client) {
        try {
            const commands = this.setupCommands();
            await client.application.commands.set(commands);
            logger.info('Discord commands registered successfully');
        } catch (error) {
            logger.error('Failed to register Discord commands', { error: error.message });
            throw error;
        }
    }
}

module.exports = new DiscordCommands();
