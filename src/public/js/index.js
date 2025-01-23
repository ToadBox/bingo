import { escapeHtml, formatDate } from '/js/utils.js';
import { fetchBoards } from '/js/api.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';

// Initialize theme
initTheme();

async function loadBoards() {
    const boardsGrid = document.getElementById('boards');
    
    try {
        const boards = await fetchBoards();
        
        // If null, no changes needed
        if (boards === null) {
            Logger.debug('Boards unchanged, skipping update');
            return;
        }

        Logger.debug('Boards changed, updating display', { count: boards?.length });
        
        // Clear loading state
        boardsGrid.innerHTML = '';
        
        // Update display
        updateBoardsDisplay(boards);
    } catch (error) {
        Logger.error('Failed to load boards:', error);
        // Show a more user-friendly error with retry button
        boardsGrid.innerHTML = `
            <div class="error-state">
                Failed to load boards. Please try refreshing the page.
                <br>
                <small>${error.message}</small>
                <br>
                <button onclick="window.location.reload()" class="retry-button">
                    Retry
                </button>
            </div>
        `;
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

    // Store hover states before update
    const hoveredCards = Array.from(document.querySelectorAll('.board-card:hover')).map(card => {
        return {
            boardId: card.getAttribute('href').split('/').pop(),
            rect: card.getBoundingClientRect()
        };
    });

    // Update the board content
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

            const recentlyCompleted = allCells
                .filter(cell => cell && cell.value && cell.marked)
                .slice(-3) // Get last 3 completed items
                .reverse(); // Most recent first

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
                        ${recentlyCompleted.length > 0 ? `
                            <div class="completed-items">
                                <p class="completed-header">Recently completed:</p>
                                <ul>
                                    ${recentlyCompleted.map(cell => 
                                        `<li>${escapeHtml(cell.value)}</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        ` : ''}
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

    // Restore hover states
    hoveredCards.forEach(({ boardId, rect }) => {
        const updatedCard = document.querySelector(`.board-card[href="/board/${boardId}"]`);
        if (updatedCard && isPointInRect(rect, { x: event.clientX, y: event.clientY })) {
            updatedCard.classList.add('hover-preserved');
        }
    });
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

// Helper function to check if mouse is still over element
function isPointInRect(rect, point) {
    return point.x >= rect.left && 
           point.x <= rect.right && 
           point.y >= rect.top && 
           point.y <= rect.bottom;
}

// Initial load and periodic refresh
loadBoards();
const POLL_INTERVAL = 30000; // 30 seconds instead of 10
setInterval(loadBoards, POLL_INTERVAL); 