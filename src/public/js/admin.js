import { fetchBoards } from './api.js';
import { initTheme } from './theme.js';
import Logger from './logger.js';

// Initialize theme
initTheme();

// State
let currentBoard = null;
let currentPage = 0;
let totalPages = 1;
let currentFilter = 'all';

// DOM Elements
const boardSelector = document.getElementById('board-selector');
const actionFilter = document.getElementById('action-filter');
const historyTableBody = document.getElementById('history-table-body');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');

// Tab navigation elements
const tabLinks = document.querySelectorAll('.admin-menu a');
const sections = document.querySelectorAll('.admin-section');

// Password elements
const sitePasswordInput = document.getElementById('site-password');
const adminPasswordInput = document.getElementById('admin-password');
const showSitePasswordBtn = document.getElementById('show-site-password');
const showAdminPasswordBtn = document.getElementById('show-admin-password');
const editSitePasswordBtn = document.getElementById('edit-site-password');
const editAdminPasswordBtn = document.getElementById('edit-admin-password');
const sitePasswordActions = document.getElementById('site-password-actions');
const adminPasswordActions = document.getElementById('admin-password-actions');
const newSitePasswordInput = document.getElementById('new-site-password');
const newAdminPasswordInput = document.getElementById('new-admin-password');
const saveSitePasswordBtn = document.getElementById('save-site-password');
const saveAdminPasswordBtn = document.getElementById('save-admin-password');
const cancelSitePasswordBtn = document.getElementById('cancel-site-password');
const cancelAdminPasswordBtn = document.getElementById('cancel-admin-password');
const logoutBtn = document.getElementById('logout-btn');

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load boards for dropdown
        await loadBoards();
        
        // Set up event listeners
        setupEventListeners();
        
        // Load initial history
        if (boardSelector.value) {
            await loadHistory(boardSelector.value);
        }
        
        // Load passwords
        await loadSitePassword();
        await loadAdminPassword();
    } catch (error) {
        Logger.error('Failed to initialize admin page', { error: error.message });
        showError('Failed to initialize admin page: ' + error.message);
    }
});

async function loadBoards() {
    try {
        const boards = await fetchBoards();
        
        // Clear existing options
        boardSelector.innerHTML = '';
        
        // Add boards to dropdown
        boards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.title || board.id;
            boardSelector.appendChild(option);
        });
        
        // Select first board by default
        if (boards.length > 0) {
            boardSelector.value = boards[0].id;
            currentBoard = boards[0];
        }
    } catch (error) {
        Logger.error('Failed to load boards', { error: error.message });
        throw new Error('Failed to load boards: ' + error.message);
    }
}

async function loadHistory(boardId, page = 0, filter = 'all') {
    try {
        currentPage = page;
        currentFilter = filter;
        
        // Fetch history with pagination
        const response = await fetch(`/api/board/${boardId}/history?page=${page}&limit=10&filter=${filter}`);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Update pagination
        totalPages = data.pagination.pages;
        pageInfo.textContent = `Page ${page + 1} of ${Math.max(1, totalPages)}`;
        
        // Enable/disable pagination buttons
        prevPageBtn.disabled = page === 0;
        nextPageBtn.disabled = page >= totalPages - 1;
        
        // Clear existing rows
        historyTableBody.innerHTML = '';
        
        // Add history entries
        data.history.forEach(entry => {
            const row = document.createElement('tr');
            
            // Format timestamp
            const timestamp = entry.user?.timestamp ? new Date(entry.user.timestamp).toLocaleString() : 'Unknown';
            
            // Format action
            const action = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
            
            // Format cell
            const cell = entry.cell ? `${String.fromCharCode(65 + entry.cell.col)}${entry.cell.row + 1}` : 'N/A';
            
            // Format content
            const content = entry.content || '';
            
            // Format IP
            const ip = entry.user?.ip || 'Unknown';
            
            // Create cells
            row.innerHTML = `
                <td>${timestamp}</td>
                <td>${action}</td>
                <td>${cell}</td>
                <td>${content.substring(0, 30)}${content.length > 30 ? '...' : ''}</td>
                <td>${ip}</td>
            `;
            
            historyTableBody.appendChild(row);
        });
        
        // Show message if no history
        if (data.history.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" class="no-data">No history entries found</td>';
            historyTableBody.appendChild(row);
        }
    } catch (error) {
        Logger.error('Failed to load history', { error: error.message, boardId });
        showError('Failed to load history: ' + error.message);
    }
}

function setupEventListeners() {
    // Board selection change
    boardSelector.addEventListener('change', async () => {
        currentPage = 0;
        await loadHistory(boardSelector.value, currentPage, currentFilter);
    });
    
    // Action filter change
    actionFilter.addEventListener('change', async () => {
        currentPage = 0;
        currentFilter = actionFilter.value;
        await loadHistory(boardSelector.value, currentPage, currentFilter);
    });
    
    // Pagination
    prevPageBtn.addEventListener('click', async () => {
        if (currentPage > 0) {
            currentPage--;
            await loadHistory(boardSelector.value, currentPage, currentFilter);
        }
    });
    
    nextPageBtn.addEventListener('click', async () => {
        if (currentPage < totalPages - 1) {
            currentPage++;
            await loadHistory(boardSelector.value, currentPage, currentFilter);
        }
    });
    
    // Tab navigation
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all links
            tabLinks.forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            link.classList.add('active');
            
            // Hide all sections
            sections.forEach(section => section.classList.remove('active'));
            
            // Show selected section
            const sectionId = link.dataset.section;
            document.getElementById(`${sectionId}-section`).classList.add('active');
        });
    });
    
    // Password actions
    showSitePasswordBtn.addEventListener('click', () => togglePasswordVisibility(sitePasswordInput, showSitePasswordBtn));
    showAdminPasswordBtn.addEventListener('click', () => togglePasswordVisibility(adminPasswordInput, showAdminPasswordBtn));
    editSitePasswordBtn.addEventListener('click', () => startEditingPassword('site'));
    editAdminPasswordBtn.addEventListener('click', () => startEditingPassword('admin'));
    saveSitePasswordBtn.addEventListener('click', () => savePassword('site'));
    saveAdminPasswordBtn.addEventListener('click', () => savePassword('admin'));
    cancelSitePasswordBtn.addEventListener('click', () => cancelEditingPassword('site'));
    cancelAdminPasswordBtn.addEventListener('click', () => cancelEditingPassword('admin'));
    
    // Logout
    logoutBtn.addEventListener('click', logout);
}

async function loadSitePassword() {
    try {
        const response = await fetch('/api/site/password');
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        // Just display if a password exists, not the actual value for security
        sitePasswordInput.value = data.hasPassword ? '••••••••' : 'Not set';
    } catch (error) {
        Logger.error('Failed to load site password info', { error: error.message });
        showError('Failed to load site password info: ' + error.message);
    }
}

async function loadAdminPassword() {
    try {
        const response = await fetch('/api/admin/password');
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        // Just display if a password exists, not the actual value for security
        adminPasswordInput.value = data.hasPassword ? '••••••••' : 'Not set';
    } catch (error) {
        Logger.error('Failed to load admin password info', { error: error.message });
        showError('Failed to load admin password info: ' + error.message);
    }
}

function togglePasswordVisibility(inputElement, buttonElement) {
    if (inputElement.type === 'password') {
        inputElement.type = 'text';
        buttonElement.textContent = '🔒';
    } else {
        inputElement.type = 'password';
        buttonElement.textContent = '👁️';
    }
}

function startEditingPassword(type) {
    if (type === 'site') {
        sitePasswordInput.disabled = true;
        sitePasswordActions.style.display = 'block';
        newSitePasswordInput.value = '';
        newSitePasswordInput.focus();
    } else {
        adminPasswordInput.disabled = true;
        adminPasswordActions.style.display = 'block';
        newAdminPasswordInput.value = '';
        newAdminPasswordInput.focus();
    }
}

async function savePassword(type) {
    try {
        let newPassword, endpoint;
        
        if (type === 'site') {
            newPassword = newSitePasswordInput.value;
            endpoint = '/api/site/password';
        } else {
            newPassword = newAdminPasswordInput.value;
            endpoint = '/api/admin/password';
        }
        
        if (!newPassword) {
            showError('Password cannot be empty');
            return;
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        if (type === 'site') {
            sitePasswordInput.value = '••••••••';
            sitePasswordActions.style.display = 'none';
            sitePasswordInput.disabled = true;
            showSuccess('Site password updated successfully');
        } else {
            adminPasswordInput.value = '••••••••';
            adminPasswordActions.style.display = 'none';
            adminPasswordInput.disabled = true;
            showSuccess('Admin password updated successfully');
        }
    } catch (error) {
        Logger.error(`Failed to update ${type} password`, { error: error.message });
        showError(`Failed to update ${type} password: ${error.message}`);
    }
}

function cancelEditingPassword(type) {
    if (type === 'site') {
        sitePasswordActions.style.display = 'none';
        sitePasswordInput.disabled = true;
    } else {
        adminPasswordActions.style.display = 'none';
        adminPasswordInput.disabled = true;
    }
}

async function logout() {
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        window.location.href = '/login.html';
    } catch (error) {
        Logger.error('Failed to logout', { error: error.message });
        showError('Failed to logout: ' + error.message);
    }
}

function showError(message) {
    // Create and show an error toast
    const toast = document.createElement('div');
    toast.className = 'toast error';
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

function showSuccess(message) {
    // Create and show a success toast
    const toast = document.createElement('div');
    toast.className = 'toast success';
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