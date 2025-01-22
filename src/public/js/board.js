import { fetchBoard } from '/js/api.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';

// Initialize theme
initTheme();

const gridElement = document.getElementById('grid');
const titleElement = document.getElementById('title');
const boardId = window.location.pathname.split('/').pop();

async function updateBoard() {
    Logger.info('Updating board', { boardId });
    try {
        const board = await fetchBoard(boardId);
        Logger.debug('Board fetched successfully', { boardId, title: board.title });
        renderBoard(board);
    } catch (error) {
        Logger.error('Failed to fetch board', { 
            boardId, 
            error: error.message,
            response: error.response
        });
        titleElement.textContent = `Error Loading Board: ${error.message}`;
    }
}

function renderBoard(board) {
    titleElement.textContent = board.title;
    gridElement.innerHTML = '';
    
    board.cells.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
            const cellElement = document.createElement('div');
            cellElement.className = 'cell' + (cell.marked ? ' marked' : '');
            
            if (cell.value) {
                if (cell.value.toLowerCase().startsWith('image:')) {
                    const imageUrl = cell.value.slice(6).trim();
                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.alt = 'Cell Image';
                    img.onerror = () => {
                        img.src = '/images/error.png';
                        img.alt = 'Image Load Error';
                    };
                    cellElement.appendChild(img);
                } else {
                    cellElement.textContent = cell.value;
                }
            } else if (rowIndex === 2 && colIndex === 2) {
                // Only show default free space if no value is set
                const img = document.createElement('img');
                img.src = '/images/free-space.png';
                img.alt = 'Free Space';
                cellElement.appendChild(img);
            }
            
            gridElement.appendChild(cellElement);
        });
    });
}

// Initial load and periodic refresh
updateBoard();
setInterval(updateBoard, 10000); 