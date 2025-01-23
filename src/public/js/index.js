import { escapeHtml, formatDate } from '/js/utils.js';
import { fetchBoards } from '/js/api.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';

// Initialize theme
initTheme();

async function loadBoards() {
    try {
        const response = await fetch('/api/boards');
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const boards = await response.json();
        Logger.debug('Boards loaded successfully', { count: boards.length });
        updateBoardsDisplay(boards);
    } catch (error) {
        console.error('Failed to load boards:', error);
        document.querySelector('.loading').textContent = 
            'Failed to load boards. Please try refreshing the page.';
    }
}

function updateBoardsDisplay(boards) {
    Logger.debug('Updating boards display', { boardCount: boards.length, boards });
    const boardsGrid = document.getElementById('boards');
    
    if (!boards || boards.length === 0) {
        Logger.info('No boards available');
        boardsGrid.innerHTML = '<p class="empty-state">No boards available. Use /bingo in Discord to get started!</p>';
        return;
    }

    boardsGrid.innerHTML = boards.map(board => {
        try {
            const allCells = board.cells.flat();
            const textCells = allCells.filter(cell => 
                cell && 
                cell.value && 
                typeof cell.value === 'string' && 
                !cell.value.startsWith('image:')
            );
            
            const randomCell = textCells.length > 0 
                ? textCells[Math.floor(Math.random() * textCells.length)] 
                : null;

            // Get incomplete text cells
            const incompleteCells = textCells.filter(cell => !cell.marked);
            
            // Calculate completion stats
            const totalCells = allCells.filter(cell => cell && cell.value).length;
            const completedCells = allCells.filter(cell => cell && cell.value && cell.marked).length;

            return `
                <a class="board-card" 
                   href="/board/${board.id}"
                   role="button"
                   tabindex="0">
                    <h2>${escapeHtml(board.title || 'Untitled Board')}</h2>
                    <div class="preview-container">
                        <div class="mini-grid">
                            ${generateMiniGrid(board.cells)}
                        </div>
                        ${randomCell ? `
                            <div class="preview-text">
                                <p class="random-cell">"${escapeHtml(randomCell.value)}"</p>
                            </div>
                        ` : ''}
                    </div>
                    <div class="board-info">
                        <p>Created by: ${escapeHtml(board.createdBy || 'Unknown')}</p>
                        <p class="last-updated">Last updated: ${formatDate(board.lastUpdated)}</p>
                    </div>
                    <div class="completion-preview">
                        <div class="completion-dots">
                            ${Array(totalCells).fill('○')
                                .map((dot, i) => i < completedCells ? '●' : dot)
                                .join('')}
                        </div>
                        <span class="completion-count">${completedCells}/${totalCells}</span>
                        ${incompleteCells.length > 0 ? `
                            <div class="incomplete-items">
                                <p class="incomplete-header">Still to complete:</p>
                                <ul>
                                    ${incompleteCells.map(cell => 
                                        `<li>${escapeHtml(cell.value)}</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </a>
            `;
        } catch (error) {
            Logger.error('Error generating board card', { 
                boardId: board.id, 
                error: error.message
            });
            return '';
        }
    }).filter(Boolean).join('');
}

function generateMiniGrid(cells) {
    return cells.map(row => 
        row.map(cell => {
            const isCenter = cell.label === 'C3';
            const hasContent = cell && cell.value;
            const isMarked = cell && cell.marked;
            
            return `
                <div class="mini-cell ${hasContent ? 'filled' : ''} ${isMarked ? 'marked' : ''} ${isCenter ? 'center' : ''}">
                    <span class="mini-cell-label">${cell.label}</span>
                    ${isMarked ? '✓' : ''}
                </div>
            `;
        }).join('')
    ).join('');
}

// Initial load and periodic refresh
loadBoards();
setInterval(loadBoards, 5000); 