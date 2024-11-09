const { SlashCommandBuilder } = require('discord.js');
const boardService = require('../services/boardService');
const logger = require('../utils/logger');

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
                )
        ];
    }

    async handleCommand(interaction) {
        if (!interaction.isCommand() || interaction.commandName !== 'bingo') return;
        
        const userId = interaction.user.id;
        const userName = interaction.user.username;
        
        logger.info('Bingo command received', {
            userId,
            userName,
            subcommand: interaction.options.getSubcommand()
        });
        
        // Load or create user's board
        let board = boardService.loadBoard(userId);
        if (!board) {
            board = boardService.createNewBoard(userId, userName);
            boardService.saveBoard(board);
        }

        try {
            await this.handleSubcommand(interaction, board);
        } catch (error) {
            logger.error('Error handling command', { 
                error: error.message,
                userId,
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
                const text = interaction.options.getString('text');
                const { row, col } = boardService.parseCell(cell);
                
                await interaction.deferReply();
                await boardService.setCellContent(board, row, col, text);
                await interaction.editReply(`Set cell ${cell} to "${text}"`);
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
