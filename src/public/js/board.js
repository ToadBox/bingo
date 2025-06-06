import { fetchBoard } from '/js/api.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';
import { createHeader } from './components.js';

// Initialize theme
initTheme();

// Create header once when the script loads
let header = null;
let titleElement = null;
let gridElement = null;
const boardId = window.location.pathname.split('/').pop();

document.addEventListener('DOMContentLoaded', () => {
  // Get references to DOM elements
  gridElement = document.getElementById('grid');
  
  // Create the header only once when the page loads
  if (!header) {
    header = createHeader('Loading board...', true);
    titleElement = document.getElementById('title');
  }
  
  // Initial load
  fetchAndRenderBoard();
  
  // Set up periodic refresh without duplicating UI elements
  setInterval(fetchAndRenderBoard, 10000);
});

async function fetchAndRenderBoard() {
  Logger.info('Fetching board', { boardId });
  try {
    const board = await fetchBoard(boardId);
    
    if (board) {
      Logger.debug('Board fetched successfully', { boardId, title: board.title });
      renderBoard(board);
    } else {
      Logger.debug('Board unchanged (304 response)');
    }
  } catch (error) {
    Logger.error('Failed to fetch board', { 
      boardId, 
      error: error.message
    });
    if (titleElement) {
      titleElement.textContent = `Error Loading Board: ${error.message}`;
    }
    // Clear grid on error to show something went wrong
    if (gridElement) {
      gridElement.innerHTML = '<div class="error-message">Failed to load board data</div>';
    }
  }
}

function renderBoard(board) {
  if (!board || !board.cells) {
    Logger.error('Invalid board data', { board });
    return;
  }
  
  // Update title
  if (titleElement) {
    titleElement.textContent = board.title || 'Untitled Board';
  }
  
  // Make sure grid element exists
  if (!gridElement) {
    gridElement = document.getElementById('grid');
    if (!gridElement) {
      Logger.error('Grid element not found');
      return;
    }
  }
  
  // Clear existing grid
  gridElement.innerHTML = '';
  
  // Add grid cells
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
  
  Logger.debug('Board rendered', { 
    cellCount: board.cells.flat().length,
    title: board.title
  });
} 