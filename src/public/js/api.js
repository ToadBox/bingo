export async function fetchBoards() {
  try {
    const lastETag = localStorage.getItem('boardsETag');
    let cachedBoards = null;
    
    try {
      cachedBoards = JSON.parse(localStorage.getItem('boardsData'));
    } catch (e) {
      // Invalid cache data, will fetch fresh
    }
    
    const headers = new Headers();
    if (lastETag) {
      headers.append('If-None-Match', lastETag);
    }

    const response = await fetch('/api/boards', { 
      headers,
      // Add cache control headers
      cache: 'no-cache',
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
        throw new Error('Cache missing, please refresh');
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
  const lastETag = localStorage.getItem(`board-${boardId}-ETag`);
  
  const headers = new Headers();
  if (lastETag) {
    headers.append('If-None-Match', lastETag);
  }

  const response = await fetch(`/api/board/${boardId}`, { headers });
  
  const newETag = response.headers.get('ETag');
  if (newETag) {
    localStorage.setItem(`board-${boardId}-ETag`, newETag);
  }

  if (response.status === 304) return null;
  if (!response.ok) throw new Error('Board not found');
  return response.json();
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
  const response = await fetch(`/api/board/${boardId}/${isMarked ? 'unmark' : 'mark'}-cell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col })
  });
  if (!response.ok) throw new Error('Failed to toggle mark');
  return response.json();
}
