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
    
    board.cells.forEach((row) => {
        row.forEach((cell) => {
            const cellElement = document.createElement('div');
            cellElement.className = 'cell' + (cell.marked ? ' marked' : '');
            
            // Use the existing label from the board data
            const label = document.createElement('span');
            label.className = 'cell-label';
            label.textContent = cell.label;
            cellElement.appendChild(label);
            
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
                    const content = document.createElement('span');
                    content.className = 'cell-content';
                    content.textContent = cell.value;
                    cellElement.appendChild(content);
                }
            } else if (cell.label === 'C3') { // Center cell
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