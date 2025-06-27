export async function fetchBoards() {
  try {
    const lastETag = localStorage.getItem('boardsETag');
    let cachedBoards = null;
    let forceRefresh = false;
    
    try {
      cachedBoards = JSON.parse(localStorage.getItem('boardsData'));
    } catch (e) {
      // Invalid cache data, will fetch fresh
      forceRefresh = true;
    }
    
    const headers = new Headers();
    if (lastETag && !forceRefresh) {
      headers.append('If-None-Match', lastETag);
    }

    const response = await fetch('/api/boards', { 
      headers,
      // Add cache control headers
      cache: forceRefresh ? 'reload' : 'no-cache',
      credentials: 'same-origin'
    });
    
    // Store new ETag if we got one
    const newETag = response.headers.get('ETag');
    if (newETag) {
      localStorage.setItem('boardsETag', newETag);
    }

    // 304 means use cached data
    if (response.status === 304) {
      if (!cachedBoards) {
        // If we get a 304 but have no cached data, make a fresh request
        localStorage.removeItem('boardsETag');
        return fetchBoards(); // Retry without ETag
      }
      return cachedBoards;
    }

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const boards = await response.json();
    // Store the fresh data in cache
    localStorage.setItem('boardsData', JSON.stringify(boards));
    return boards;
    
  } catch (error) {
    // Preserve and rethrow the original error with more context
    throw new Error(`Failed to fetch boards: ${error.message}`);
  }
}

export async function createBoard(title, userId) {
  const response = await fetch('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, userId })
  });
  if (!response.ok) throw new Error('Failed to create board');
  return response.json();
}

export async function fetchBoard(boardId) {
  try {
    const lastETag = localStorage.getItem(`board-${boardId}-ETag`);
    let cachedBoard = null;
    let forceRefresh = false;
    
    try {
      cachedBoard = JSON.parse(localStorage.getItem(`board-${boardId}-data`));
    } catch (e) {
      // Invalid cache data, will fetch fresh
      forceRefresh = true;
    }
    
    const headers = new Headers();
    if (lastETag && !forceRefresh) {
      headers.append('If-None-Match', lastETag);
    }

    const response = await fetch(`/api/board/${boardId}`, { 
      headers,
      cache: forceRefresh ? 'reload' : 'no-cache',
      credentials: 'same-origin'
    });
    
    // Store new ETag if we got one
    const newETag = response.headers.get('ETag');
    if (newETag) {
      localStorage.setItem(`board-${boardId}-ETag`, newETag);
    }

    // 304 means use cached data
    if (response.status === 304) {
      if (!cachedBoard) {
        // If we get a 304 but have no cached data, make a fresh request
        localStorage.removeItem(`board-${boardId}-ETag`);
        return fetchBoard(boardId); // Retry without ETag
      }
      return cachedBoard;
    }

    if (!response.ok) {
      throw new Error(`Failed to load board: ${response.status} ${response.statusText}`);
    }
    
    const board = await response.json();
    // Store the fresh data in cache
    localStorage.setItem(`board-${boardId}-data`, JSON.stringify(board));
    return board;
  } catch (error) {
    throw new Error(`Error fetching board: ${error.message}`);
  }
}

export async function setCell(boardId, row, col, content) {
  const response = await fetch(`/api/board/${boardId}/set-cell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col, content })
  });
  if (!response.ok) throw new Error('Failed to update cell');
  return response.json();
}

export async function toggleMark(boardId, row, col, isMarked) {
  // Use the appropriate endpoint based on current state
  const endpoint = isMarked ? 'unmark' : 'mark';
  
  const response = await fetch(`/api/board/${boardId}/${endpoint}-cell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `Failed to ${endpoint} cell` }));
    throw new Error(errorData.error || `Failed to ${endpoint} cell`);
  }
  
  // Invalidate the board cache to force a refresh next time
  localStorage.removeItem(`board-${boardId}-ETag`);
  
  return response.json();
}

export async function fetchCellHistory(boardId, row, col) {
  try {
    const response = await fetch(`/api/board/${boardId}/cell-history/${row}/${col}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch cell history: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching cell history: ${error.message}`);
  }
}

export async function clearCell(boardId, row, col) {
  // Use the dedicated clear-cell endpoint
  const response = await fetch(`/api/board/${boardId}/clear-cell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to clear cell' }));
    throw new Error(errorData.error || 'Failed to clear cell');
  }
  
  // Invalidate the board cache to force a refresh next time
  localStorage.removeItem(`board-${boardId}-ETag`);
  
  return response.json();
}
