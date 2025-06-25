import { escapeHtml, formatDate } from '/js/utils.js';
import { fetchBoards, createBoard } from '/js/api.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';
import { createHeader } from './components.js';

// Initialize theme
initTheme();

// Global state
let currentUser = null;

// Load initial data when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  // Add header
  createHeader('ToadBox Bingo');
  
  // Check authentication status
  await checkAuthStatus();
  
  // Load recent boards
  await loadRecentBoards();
  
  // Setup event listeners
  setupEventListeners();
});

/**
 * Check user authentication status
 */
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/status');
    if (response.ok) {
      const data = await response.json();
      if (data.authenticated && data.user) {
        currentUser = data.user;
        updateUIForAuthStatus(true);
      } else {
        // User is not properly authenticated, redirect to login
        window.location.href = '/login.html';
        return;
      }
    } else {
      // Not authenticated, redirect to login
      window.location.href = '/login.html';
      return;
    }
  } catch (error) {
    Logger.error('Failed to check auth status:', error);
    // Error checking auth, redirect to login
    window.location.href = '/login.html';
    return;
  }
}

/**
 * Update UI based on authentication status
 */
function updateUIForAuthStatus(isAuthenticated) {
  const createBoardBtn = document.getElementById('createBoardBtn');
  
  if (isAuthenticated) {
    createBoardBtn.style.display = 'inline-flex';
    createBoardBtn.disabled = false;
    
    // Show/hide the "Created By" field based on user type
    updateCreatedByField();
  } else {
    createBoardBtn.style.display = 'none';
  }
}

/**
 * Update the "Created By" field visibility based on user type
 */
function updateCreatedByField() {
  const createdByGroup = document.getElementById('createdByGroup');
  
  if (currentUser && isAnonymousUser(currentUser)) {
    createdByGroup.style.display = 'block';
    // Set default value to "Anonymous" if empty
    const createdByInput = document.getElementById('boardCreatedBy');
    if (!createdByInput.value) {
      createdByInput.value = 'Anonymous';
    }
  } else {
    createdByGroup.style.display = 'none';
  }
}

/**
 * Check if user is anonymous
 */
function isAnonymousUser(user) {
  return user && (user.isAnonymous || user.auth_provider === 'anonymous' || 
                  user.username === 'Anonymous User' || user.username.startsWith('Anonymous'));
}

/**
 * Load recent boards for the home page
 */
async function loadRecentBoards() {
  const recentBoardsContainer = document.getElementById('recentBoards');
  
  try {
    // Fetch recent boards (limit to 6 for home page)
    const response = await fetch('/api/boards?limit=6&sortBy=last_updated&sortOrder=DESC');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const boards = data.boards || [];
    
    // Clear loading state
    recentBoardsContainer.innerHTML = '';
    
    if (boards.length === 0) {
      recentBoardsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No boards yet</h3>
          <p>Create your first bingo board to get started!</p>
        </div>
      `;
      return;
    }

    // Display boards
    recentBoardsContainer.innerHTML = boards.map(board => {
      const completionPercentage = board.cellCount > 0 
        ? Math.round((board.markedCount / board.cellCount) * 100) 
        : 0;

      return `
        <a class="board-card" href="${board.url}" role="button" tabindex="0">
          <div class="board-card-header">
            <h3>${escapeHtml(board.title)}</h3>
            <span class="board-status ${board.isPublic ? 'public' : 'private'}">
              ${board.isPublic ? '🌐 Public' : '🔒 Private'}
            </span>
          </div>
          
          <div class="board-preview">
            ${generateMiniGrid(board.cellCount, board.markedCount)}
          </div>
          
          <div class="board-info">
            <p class="board-creator">by ${escapeHtml(board.createdBy)}</p>
            <p class="board-updated">Updated ${formatDate(board.lastUpdated)}</p>
          </div>
          
          <div class="board-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${completionPercentage}%"></div>
            </div>
            <span class="progress-text">${board.markedCount}/${board.cellCount} completed</span>
          </div>
        </a>
      `;
    }).join('');

    Logger.info('Recent boards loaded successfully', { count: boards.length });
  } catch (error) {
    Logger.error('Failed to load recent boards:', error);
    recentBoardsContainer.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Failed to load boards</h3>
        <p>Please try refreshing the page.</p>
        <button onclick="loadRecentBoards()" class="retry-button">
          Retry
        </button>
      </div>
    `;
  }
}

/**
 * Generate a mini grid visualization for the board preview
 */
function generateMiniGrid(totalCells, markedCells) {
  const gridSize = Math.ceil(Math.sqrt(totalCells));
  const cells = [];
  
  for (let i = 0; i < gridSize * gridSize; i++) {
    const isMarked = i < markedCells;
    const hasContent = i < totalCells;
    
    cells.push(`
      <div class="mini-cell ${hasContent ? 'filled' : 'empty'} ${isMarked ? 'marked' : ''}">
        ${isMarked ? '✓' : ''}
      </div>
    `);
  }
  
  return `
    <div class="mini-grid" style="grid-template-columns: repeat(${gridSize}, 1fr);">
      ${cells.join('')}
    </div>
  `;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const createBoardBtn = document.getElementById('createBoardBtn');
  const createBoardModal = document.getElementById('createBoardModal');
  const closeModal = document.getElementById('closeModal');
  const cancelCreate = document.getElementById('cancelCreate');
  const createBoardForm = document.getElementById('createBoardForm');

  // Create board button
  createBoardBtn?.addEventListener('click', () => {
    if (!currentUser) {
      window.location.href = '/login.html';
      return;
    }
    showCreateBoardModal();
  });

  // Close modal events
  closeModal?.addEventListener('click', hideCreateBoardModal);
  cancelCreate?.addEventListener('click', hideCreateBoardModal);
  
  // Click outside modal to close
  createBoardModal?.addEventListener('click', (e) => {
    if (e.target === createBoardModal) {
      hideCreateBoardModal();
    }
  });

  // Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && createBoardModal?.style.display === 'flex') {
      hideCreateBoardModal();
    }
  });

  // Create board form submission
  createBoardForm?.addEventListener('submit', handleCreateBoard);
}

/**
 * Show create board modal
 */
function showCreateBoardModal() {
  const modal = document.getElementById('createBoardModal');
  const form = document.getElementById('createBoardForm');
  
  // Reset form
  form.reset();
  
  // Update the Created By field visibility and default value
  updateCreatedByField();
  
  // Show modal
  modal.style.display = 'flex';
  
  // Focus on title input
  setTimeout(() => {
    document.getElementById('boardTitle')?.focus();
  }, 100);
}

/**
 * Hide create board modal
 */
function hideCreateBoardModal() {
  const modal = document.getElementById('createBoardModal');
  modal.style.display = 'none';
}

/**
 * Handle create board form submission
 */
async function handleCreateBoard(e) {
  e.preventDefault();
  
  const form = e.target;
  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  const buttonText = submitButton.querySelector('.btn-text');
  const buttonLoading = submitButton.querySelector('.btn-loading');
  
  // Show loading state
  submitButton.disabled = true;
  buttonText.style.display = 'none';
  buttonLoading.style.display = 'inline';
  
  try {
    const boardData = {
      title: formData.get('title').trim(),
      description: formData.get('description').trim(),
      size: parseInt(formData.get('size')),
      isPublic: formData.get('isPublic') === 'on'
    };

    // Add createdByName for anonymous users
    if (currentUser && isAnonymousUser(currentUser)) {
      const createdByName = formData.get('createdByName')?.trim();
      if (createdByName) {
        boardData.createdByName = createdByName;
      }
    }

    const response = await fetch('/api/boards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(boardData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create board');
    }

    const board = await response.json();
    
    Logger.info('Board created successfully', { boardId: board.id });
    
    // Hide modal
    hideCreateBoardModal();
    
    // Redirect to the new board
    window.location.href = board.url;
    
  } catch (error) {
    Logger.error('Failed to create board:', error);
    
    // Show error message
    alert(`Failed to create board: ${error.message}`);
    
  } finally {
    // Reset button state
    submitButton.disabled = false;
    buttonText.style.display = 'inline';
    buttonLoading.style.display = 'none';
  }
}

// Expose functions for global access
window.loadRecentBoards = loadRecentBoards; 