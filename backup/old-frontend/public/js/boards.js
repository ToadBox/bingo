import { escapeHtml, formatDate } from '/js/utils.js';
import Logger from '/js/logger.js';
import { initTheme } from '/js/theme.js';
import { createHeader } from './components.js';

// Initialize theme
initTheme();

// Global state
let currentUser = null;
let currentFilters = {
  search: '',
  sortBy: 'last_updated',
  sortOrder: 'DESC',
  limit: 20,
  offset: 0
};
let allBoards = [];
let hasMoreBoards = true;
let isLoading = false;

// Load initial data when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  // Add header
  createHeader('All Boards');
  
  // Check authentication status
  await checkAuthStatus();
  
  // Load boards
  await loadBoards(true);
  
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
      currentUser = data.user;
      updateUIForAuthStatus(true);
    } else {
      updateUIForAuthStatus(false);
    }
  } catch (error) {
    Logger.error('Failed to check auth status:', error);
    updateUIForAuthStatus(false);
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
 * Load boards with current filters
 */
async function loadBoards(reset = false) {
  if (isLoading) return;
  
  isLoading = true;
  const boardsGrid = document.getElementById('boardsGrid');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const loadMoreContainer = document.getElementById('loadMoreContainer');
  const paginationInfo = document.getElementById('paginationInfo');
  const boardCount = document.getElementById('boardCount');
  
  try {
    // Reset state if needed
    if (reset) {
      currentFilters.offset = 0;
      allBoards = [];
      hasMoreBoards = true;
      boardsGrid.innerHTML = '<div class="loading">Loading boards...</div>';
      loadMoreContainer.style.display = 'none';
    }
    
    // Show loading on load more button
    if (!reset && loadMoreBtn) {
      loadMoreBtn.textContent = 'Loading...';
      loadMoreBtn.disabled = true;
    }
    
    // Build query parameters
    const params = new URLSearchParams({
      limit: currentFilters.limit.toString(),
      offset: currentFilters.offset.toString(),
      sortBy: currentFilters.sortBy,
      sortOrder: currentFilters.sortOrder
    });
    
    if (currentFilters.search) {
      params.append('search', currentFilters.search);
    }
    
    const response = await fetch(`/api/boards?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const boards = data.boards || [];
    
    // Update state
    if (reset) {
      allBoards = boards;
    } else {
      allBoards = [...allBoards, ...boards];
    }
    
    hasMoreBoards = data.meta?.hasMore || boards.length === currentFilters.limit;
    
    // Update display
    displayBoards(allBoards, reset);
    
    // Update pagination info
    boardCount.textContent = allBoards.length;
    paginationInfo.style.display = 'block';
    
    // Show/hide load more button
    if (hasMoreBoards && allBoards.length > 0) {
      loadMoreContainer.style.display = 'block';
      loadMoreBtn.textContent = 'Load More Boards';
      loadMoreBtn.disabled = false;
    } else {
      loadMoreContainer.style.display = 'none';
    }
    
    Logger.info('Boards loaded successfully', { 
      count: boards.length, 
      total: allBoards.length,
      hasMore: hasMoreBoards
    });
    
  } catch (error) {
    Logger.error('Failed to load boards:', error);
    
    if (reset) {
      boardsGrid.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load boards</h3>
          <p>Please try refreshing the page.</p>
          <button onclick="loadBoards(true)" class="retry-button">
            Retry
          </button>
        </div>
      `;
    } else {
      // Reset load more button
      loadMoreBtn.textContent = 'Load More Boards';
      loadMoreBtn.disabled = false;
      alert('Failed to load more boards. Please try again.');
    }
  } finally {
    isLoading = false;
  }
}

/**
 * Display boards in the grid
 */
function displayBoards(boards, reset = false) {
  const boardsGrid = document.getElementById('boardsGrid');
  
  if (boards.length === 0) {
    boardsGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No boards found</h3>
        <p>Try adjusting your search or filters, or create a new board!</p>
      </div>
    `;
    return;
  }
  
  const boardsHTML = boards.map(board => {
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
          ${board.description ? `<p class="board-description">${escapeHtml(board.description)}</p>` : ''}
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
  
  if (reset) {
    boardsGrid.innerHTML = boardsHTML;
  } else {
    boardsGrid.innerHTML += boardsHTML;
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
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const sortBy = document.getElementById('sortBy');
  const sortOrder = document.getElementById('sortOrder');
  const clearFilters = document.getElementById('clearFilters');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const createBoardBtn = document.getElementById('createBoardBtn');
  const createBoardModal = document.getElementById('createBoardModal');
  const closeModal = document.getElementById('closeModal');
  const cancelCreate = document.getElementById('cancelCreate');
  const createBoardForm = document.getElementById('createBoardForm');

  // Search functionality
  searchBtn?.addEventListener('click', handleSearch);
  searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });

  // Filter changes
  sortBy?.addEventListener('change', handleFilterChange);
  sortOrder?.addEventListener('change', handleFilterChange);

  // Clear filters
  clearFilters?.addEventListener('click', () => {
    searchInput.value = '';
    sortBy.value = 'last_updated';
    sortOrder.value = 'DESC';
    currentFilters = {
      search: '',
      sortBy: 'last_updated',
      sortOrder: 'DESC',
      limit: 20,
      offset: 0
    };
    loadBoards(true);
  });

  // Load more
  loadMoreBtn?.addEventListener('click', () => {
    currentFilters.offset += currentFilters.limit;
    loadBoards(false);
  });

  // Create board functionality
  createBoardBtn?.addEventListener('click', () => {
    if (!currentUser) {
      window.location.href = '/login.html';
      return;
    }
    showCreateBoardModal();
  });

  // Modal controls
  closeModal?.addEventListener('click', hideCreateBoardModal);
  cancelCreate?.addEventListener('click', hideCreateBoardModal);
  
  createBoardModal?.addEventListener('click', (e) => {
    if (e.target === createBoardModal) {
      hideCreateBoardModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && createBoardModal?.style.display === 'flex') {
      hideCreateBoardModal();
    }
  });

  createBoardForm?.addEventListener('submit', handleCreateBoard);
}

/**
 * Handle search
 */
function handleSearch() {
  const searchInput = document.getElementById('searchInput');
  currentFilters.search = searchInput.value.trim();
  currentFilters.offset = 0;
  loadBoards(true);
}

/**
 * Handle filter changes
 */
function handleFilterChange() {
  const sortBy = document.getElementById('sortBy');
  const sortOrder = document.getElementById('sortOrder');
  
  currentFilters.sortBy = sortBy.value;
  currentFilters.sortOrder = sortOrder.value;
  currentFilters.offset = 0;
  
  loadBoards(true);
}

/**
 * Show create board modal
 */
function showCreateBoardModal() {
  const modal = document.getElementById('createBoardModal');
  const form = document.getElementById('createBoardForm');
  
  form.reset();
  
  // Update the Created By field visibility and default value
  updateCreatedByField();
  
  modal.style.display = 'flex';
  
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
    alert(`Failed to create board: ${error.message}`);
    
  } finally {
    // Reset button state
    submitButton.disabled = false;
    buttonText.style.display = 'inline';
    buttonLoading.style.display = 'none';
  }
}

// Expose functions for global access
window.loadBoards = loadBoards; 