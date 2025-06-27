import { fetchBoard, setCell, toggleMark, fetchCellHistory, clearCell } from '/js/api.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';
import { createHeader } from './components.js';
import { ContextMenu, EditDialog } from './contextMenu.js';

// Initialize theme
initTheme();

// Create header once when the script loads
let header = null;
let titleElement = null;
let gridElement = null;
const boardId = window.location.pathname.split('/').pop();

// Create context menu and edit dialog
const contextMenu = new ContextMenu();
const editDialog = new EditDialog();

// Current board data
let currentBoard = null;

// Cell hover timer for showing history
let cellHoverTimer = null;
const HOVER_DELAY = 1000; // 1 second delay before showing history

// Define a cache for failed image URLs to prevent repeated requests
const failedImageCache = new Set();

document.addEventListener('DOMContentLoaded', () => {
  // Get references to DOM elements
  gridElement = document.getElementById('grid');
  
  // Create the header only once when the page loads
  if (!header) {
    header = createHeader('Loading board...', true);
    titleElement = document.getElementById('title');
  }
  
  // Set up the callbacks for the context menu
  setupContextMenu();
  
  // Initial load
  fetchAndRenderBoard();
  
  // Set up periodic refresh without duplicating UI elements
  setInterval(fetchAndRenderBoard, 10000);
  
  // Add global listener to remove any existing history tooltips when clicking elsewhere
  document.addEventListener('click', (e) => {
    // If we clicked outside a cell or history tooltip, remove any tooltips
    if (!e.target.closest('.cell') && !e.target.closest('.history-tooltip')) {
      removeAllHistoryTooltips();
    }
  });
});

function setupContextMenu() {
  contextMenu.setCallbacks({
    onMark: async (boardId, row, col) => {
      try {
        Logger.info('Marking cell', { boardId, row, col });
        await toggleMark(boardId, row, col, false);
        // Update UI immediately
        if (currentBoard && currentBoard.cells[row][col]) {
          currentBoard.cells[row][col].marked = true;
          renderBoard(currentBoard);
          showToast(`Successfully marked cell ${currentBoard.cells[row][col].label}`);
        }
      } catch (error) {
        Logger.error('Failed to mark cell', { boardId, row, col, error: error.message });
        showToast('Failed to mark cell: ' + error.message);
      }
    },
    onUnmark: async (boardId, row, col) => {
      try {
        Logger.info('Unmarking cell', { boardId, row, col });
        await toggleMark(boardId, row, col, true);
        // Update UI immediately
        if (currentBoard && currentBoard.cells[row][col]) {
          currentBoard.cells[row][col].marked = false;
          renderBoard(currentBoard);
          showToast(`Successfully unmarked cell ${currentBoard.cells[row][col].label}`);
        }
      } catch (error) {
        Logger.error('Failed to unmark cell', { boardId, row, col, error: error.message });
        showToast('Failed to unmark cell: ' + error.message);
      }
    },
    onEdit: (boardId, row, col) => {
      // Show edit dialog with current content
      const cellContent = currentBoard.cells[row][col].value || '';
      const cellLabel = currentBoard.cells[row][col].label;
      editDialog.show(cellContent);
      
      // Set up save handler
      editDialog.setOnSave(async (newContent) => {
        try {
          Logger.info('Editing cell', { boardId, row, col, newContent });
          await setCell(boardId, row, col, newContent);
          
          // Update UI immediately
          if (currentBoard && currentBoard.cells[row][col]) {
            currentBoard.cells[row][col].value = newContent;
            renderBoard(currentBoard);
            showToast(`Successfully updated cell ${cellLabel}`);
          }
        } catch (error) {
          Logger.error('Failed to edit cell', { 
            boardId, row, col, 
            error: error.message 
          });
          showToast('Failed to update cell: ' + error.message);
        }
      });
    },
    onClear: async (boardId, row, col) => {
      try {
        Logger.info('Clearing cell', { boardId, row, col });
        const cellLabel = currentBoard.cells[row][col].label;
        // Use the dedicated clearCell function instead of setCell
        await clearCell(boardId, row, col);
        
        // Update UI immediately
        if (currentBoard && currentBoard.cells[row][col]) {
          currentBoard.cells[row][col].value = '';
          currentBoard.cells[row][col].marked = false;
          renderBoard(currentBoard);
          showToast(`Successfully cleared cell ${cellLabel}`);
        }
      } catch (error) {
        Logger.error('Failed to clear cell', { 
          boardId, row, col, 
          error: error.message 
        });
        showToast('Failed to clear cell: ' + error.message);
      }
    }
  });
}

function showToast(message) {
  // Create and show a toast notification
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Show the toast
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // Remove the toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function removeAllHistoryTooltips() {
  document.querySelectorAll('.history-tooltip').forEach(tooltip => {
    tooltip.remove();
  });
}

// Helper function to safely escape HTML
function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function showCellHistory(cell, row, col) {
  try {
    // Remove any existing tooltips
    removeAllHistoryTooltips();
    
    // Fetch the cell history
    const { history } = await fetchCellHistory(boardId, row, col);
    
    if (history.length === 0) {
      return; // No history to show
    }
    
    // Create tooltip container
    const tooltip = document.createElement('div');
    tooltip.className = 'history-tooltip';
    
    // Add title
    const title = document.createElement('h3');
    title.textContent = `History for cell ${currentBoard.cells[row][col].label}`;
    tooltip.appendChild(title);
    
    // Add history entries
    const list = document.createElement('ul');
    history.forEach(entry => {
      const item = document.createElement('li');
      const date = new Date(entry.user?.timestamp || Date.now()).toLocaleString();
      
      // Create elements with proper escaping instead of using innerHTML
      const actionSpan = document.createElement('span');
      actionSpan.className = 'history-action';
      
      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = date;
      
      switch (entry.type) {
        case 'set':
          actionSpan.textContent = 'Edit:';
          
          const contentSpan = document.createElement('span');
          contentSpan.className = 'history-content';
          contentSpan.textContent = entry.content || 'empty';
          
          item.appendChild(actionSpan);
          item.appendChild(contentSpan);
          item.appendChild(dateSpan);
          break;
          
        case 'mark':
          actionSpan.textContent = 'Marked';
          item.appendChild(actionSpan);
          item.appendChild(dateSpan);
          break;
          
        case 'unmark':
          actionSpan.textContent = 'Unmarked';
          item.appendChild(actionSpan);
          item.appendChild(dateSpan);
          break;
          
        default:
          actionSpan.textContent = entry.type;
          item.appendChild(actionSpan);
          item.appendChild(dateSpan);
      }
      
      list.appendChild(item);
    });
    tooltip.appendChild(list);
    
    // Add a close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-tooltip';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => tooltip.remove());
    tooltip.appendChild(closeBtn);
    
    // Position the tooltip near the cell
    const cellRect = cell.getBoundingClientRect();
    document.body.appendChild(tooltip);
    
    // Position tooltip to not go off screen
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = cellRect.left + cellRect.width + 10;
    let top = cellRect.top;
    
    // If tooltip would go off right edge, place it to the left of the cell
    if (left + tooltipRect.width > window.innerWidth) {
      left = cellRect.left - tooltipRect.width - 10;
    }
    
    // If tooltip would go off bottom edge, adjust top position
    if (top + tooltipRect.height > window.innerHeight) {
      top = Math.max(10, window.innerHeight - tooltipRect.height - 10);
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    // Add animation class
    setTimeout(() => {
      tooltip.classList.add('show');
    }, 10);
    
  } catch (error) {
    Logger.error('Failed to show cell history', { 
      boardId, row, col, 
      error: error.message 
    });
  }
}

async function fetchAndRenderBoard() {
  Logger.info('Fetching board', { boardId });
  try {
    const board = await fetchBoard(boardId);
    
    if (board) {
      // Validate board data before rendering
      if (!isValidBoardData(board)) {
        throw new Error('Invalid or corrupted board data received');
      }
      
      Logger.debug('Board fetched successfully', { boardId, title: board.title });
      currentBoard = board; // Store current board
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
      gridElement.innerHTML = `
        <div class="error-message">
          Failed to load board data: ${escapeHtml(error.message)}
          <button onclick="window.location.reload()" class="retry-button">Retry</button>
        </div>
      `;
    }
  }
}

// Helper function to validate board data
function isValidBoardData(board) {
  if (!board || typeof board !== 'object') return false;
  if (!board.id || !board.title) return false;
  if (!Array.isArray(board.cells)) return false;
  
  // Check if cells array has the correct structure (5x5 grid)
  if (board.cells.length !== 5) return false;
  
  for (const row of board.cells) {
    if (!Array.isArray(row) || row.length !== 5) return false;
    
    // Check if each cell has the required properties
    for (const cell of row) {
      if (!cell || typeof cell !== 'object') return false;
      if (typeof cell.label !== 'string') return false;
      // marked and value are optional
    }
  }
  
  return true;
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
  board.cells.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const cellElement = document.createElement('div');
      cellElement.className = 'cell' + (cell.marked ? ' marked' : '');
      cellElement.dataset.row = rowIndex;
      cellElement.dataset.col = colIndex;
      
      // Use the existing label from the board data
      const label = document.createElement('span');
      label.className = 'cell-label';
      label.textContent = cell.label;
      cellElement.appendChild(label);
      
      if (cell.value) {
        if (cell.value.toLowerCase().startsWith('image:')) {
          const imageUrl = cell.value.slice(6).trim();
          const img = createCellImage(imageUrl);
          cellElement.appendChild(img);
        } else {
          const content = document.createElement('span');
          content.className = 'cell-content';
          content.textContent = cell.value;
          cellElement.appendChild(content);
        }
      } else if (cell.label === 'C3') { // Center cell
        const img = createCellImage('/images/free-space.png');
        cellElement.appendChild(img);
      }
      
      // Add hover history
      cellElement.addEventListener('mouseenter', () => {
        // Only show history after a delay
        cellHoverTimer = setTimeout(() => {
          cellElement.classList.add('cell-hover-active');
          showCellHistory(cellElement, rowIndex, colIndex);
        }, HOVER_DELAY);
      });
      
      cellElement.addEventListener('mouseleave', () => {
        // Clear the timer if mouse leaves before delay
        if (cellHoverTimer) {
          clearTimeout(cellHoverTimer);
          cellHoverTimer = null;
        }
        cellElement.classList.remove('cell-hover-active');
      });
      
      // Add context menu
      cellElement.addEventListener('contextmenu', (e) => {
        contextMenu.showMenu(e, cellElement, { row: rowIndex, col: colIndex }, boardId, cell.marked);
      });
      
      // Add click handler for marking/unmarking
      cellElement.addEventListener('dblclick', async () => {
        try {
          const action = cell.marked ? 'unmarking' : 'marking';
          await toggleMark(boardId, rowIndex, colIndex, cell.marked);
          // Update UI immediately
          cell.marked = !cell.marked;
          cellElement.classList.toggle('marked', cell.marked);
          showToast(`Successfully ${cell.marked ? 'marked' : 'unmarked'} cell ${cell.label}`);
        } catch (error) {
          Logger.error('Failed to toggle mark', { 
            boardId, row: rowIndex, col: colIndex, 
            error: error.message 
          });
          showToast(`Failed to ${cell.marked ? 'unmark' : 'mark'} cell: ${error.message}`);
        }
      });
      
      gridElement.appendChild(cellElement);
    });
  });
  
  Logger.debug('Board rendered', { 
    cellCount: board.cells.flat().length,
    title: board.title
  });
}

// Helper function to handle image loading with error caching
function createCellImage(imageUrl, fallbackSrc = '/images/error.png') {
  // If this URL already failed, use the error image immediately
  if (failedImageCache.has(imageUrl)) {
    const img = document.createElement('img');
    img.src = fallbackSrc;
    img.alt = 'Image Load Error (Cached)';
    img.className = 'cell-image error-image';
    return img;
  }
  
  const img = document.createElement('img');
  img.alt = 'Cell Image';
  img.className = 'cell-image';
  
  // Add loading state
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'image-loading';
  loadingIndicator.textContent = 'Loading...';
  
  // Prevent infinite loops by only setting src after attaching error handler
  img.onerror = () => {
    // Add to failed cache
    failedImageCache.add(imageUrl);
    // Replace with error image
    img.src = fallbackSrc;
    img.alt = 'Image Load Error';
    img.className = 'cell-image error-image';
    // Remove loading indicator
    if (loadingIndicator.parentNode) {
      loadingIndicator.remove();
    }
  };
  
  img.onload = () => {
    // Remove loading indicator
    if (loadingIndicator.parentNode) {
      loadingIndicator.remove();
    }
  };
  
  // Use a container to hold both the loading indicator and image
  const container = document.createElement('div');
  container.className = 'image-container';
  container.appendChild(loadingIndicator);
  container.appendChild(img);
  
  // Set src after error handler is attached
  setTimeout(() => {
    img.src = imageUrl;
  }, 10);
  
  return container;
} 