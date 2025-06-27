/**
 * Context Menu for Bingo cells
 * Provides right-click functionality for cell operations
 */

export class ContextMenu {
  constructor() {
    this.menu = null;
    this.activeCell = null;
    this.boardId = null;
    this.callbacks = {
      onMark: null,
      onUnmark: null,
      onEdit: null,
      onClear: null
    };
    
    // Create the menu once
    this.createMenu();
    
    // Close menu on document click
    document.addEventListener('click', this.hideMenu.bind(this));
    
    // Also close on scroll
    document.addEventListener('scroll', this.hideMenu.bind(this));
  }
  
  createMenu() {
    // Create menu element if it doesn't exist
    if (!this.menu) {
      this.menu = document.createElement('div');
      this.menu.className = 'context-menu';
      this.menu.style.display = 'none';
      document.body.appendChild(this.menu);
      
      // Create menu items
      const items = [
        { id: 'mark', label: 'Mark Cell', icon: '✓' },
        { id: 'unmark', label: 'Unmark Cell', icon: '✗' },
        { id: 'edit', label: 'Edit Content', icon: '✏️' },
        { id: 'clear', label: 'Clear Cell', icon: '🗑️' }
      ];
      
      items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.innerHTML = `<span class="menu-icon">${item.icon}</span>${item.label}`;
        
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleMenuItemClick(item.id);
          this.hideMenu();
        });
        
        this.menu.appendChild(menuItem);
      });
    }
  }
  
  showMenu(e, cell, position, boardId, isMarked) {
    e.preventDefault();
    
    // Store reference to active cell and board
    this.activeCell = cell;
    this.boardId = boardId;
    
    // Position the menu
    this.menu.style.left = `${e.pageX}px`;
    this.menu.style.top = `${e.pageY}px`;
    
    // Show/hide mark/unmark options based on current state
    const markItem = this.menu.querySelector('.context-menu-item:nth-child(1)');
    const unmarkItem = this.menu.querySelector('.context-menu-item:nth-child(2)');
    
    if (isMarked) {
      markItem.style.display = 'none';
      unmarkItem.style.display = 'flex';
    } else {
      markItem.style.display = 'flex';
      unmarkItem.style.display = 'none';
    }
    
    // Show the menu
    this.menu.style.display = 'block';
  }
  
  hideMenu() {
    if (this.menu) {
      this.menu.style.display = 'none';
    }
  }
  
  handleMenuItemClick(action) {
    if (!this.activeCell) return;
    
    const position = this.getCellPosition(this.activeCell);
    
    switch (action) {
      case 'mark':
        if (this.callbacks.onMark) {
          this.callbacks.onMark(this.boardId, position.row, position.col);
        }
        break;
      case 'unmark':
        if (this.callbacks.onUnmark) {
          this.callbacks.onUnmark(this.boardId, position.row, position.col);
        }
        break;
      case 'edit':
        if (this.callbacks.onEdit) {
          this.callbacks.onEdit(this.boardId, position.row, position.col);
        }
        break;
      case 'clear':
        if (this.callbacks.onClear) {
          this.callbacks.onClear(this.boardId, position.row, position.col);
        }
        break;
    }
  }
  
  getCellPosition(cell) {
    // Extract the position from the cell-label element
    const labelElement = cell.querySelector('.cell-label');
    if (labelElement) {
      const label = labelElement.textContent;
      const col = label.charCodeAt(0) - 'A'.charCodeAt(0);
      const row = parseInt(label.substring(1), 10) - 1;
      return { row, col };
    }
    return null;
  }
  
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}

// Create a modal dialog for editing cell content
export class EditDialog {
  constructor() {
    this.dialog = null;
    this.createDialog();
    this.onSave = null;
  }
  
  createDialog() {
    this.dialog = document.createElement('div');
    this.dialog.className = 'edit-dialog-overlay';
    this.dialog.innerHTML = `
      <div class="edit-dialog">
        <h3>Edit Cell Content</h3>
        <div class="input-group">
          <label for="content-type">Content Type:</label>
          <select id="content-type">
            <option value="text">Text</option>
            <option value="image">Image URL</option>
          </select>
        </div>
        <div class="input-group">
          <label for="cell-content">Content:</label>
          <textarea id="cell-content" rows="4" placeholder="Enter text or image URL"></textarea>
        </div>
        <div class="dialog-buttons">
          <button class="cancel-btn">Cancel</button>
          <button class="save-btn">Save</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.dialog);
    
    // Set up event listeners
    const cancelBtn = this.dialog.querySelector('.cancel-btn');
    const saveBtn = this.dialog.querySelector('.save-btn');
    
    cancelBtn.addEventListener('click', () => {
      this.hide();
    });
    
    saveBtn.addEventListener('click', () => {
      const type = this.dialog.querySelector('#content-type').value;
      let content = this.dialog.querySelector('#cell-content').value;
      
      // For image URLs, add the 'image:' prefix if it's not already there
      if (type === 'image' && !content.startsWith('image:')) {
        content = 'image:' + content;
      }
      
      if (this.onSave) {
        this.onSave(content);
      }
      
      this.hide();
    });
    
    // Close on background click
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.hide();
      }
    });
    
    // Hide initially
    this.hide();
  }
  
  show(currentContent) {
    // Parse current content to determine type and value
    let type = 'text';
    let content = currentContent || '';
    
    if (content.startsWith('image:')) {
      type = 'image';
      content = content.substring(6);
    }
    
    // Set values in the dialog
    this.dialog.querySelector('#content-type').value = type;
    this.dialog.querySelector('#cell-content').value = content;
    
    // Show the dialog
    this.dialog.style.display = 'flex';
  }
  
  hide() {
    this.dialog.style.display = 'none';
  }
  
  setOnSave(callback) {
    this.onSave = callback;
  }
} 