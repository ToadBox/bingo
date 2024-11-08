export async function fetchBoards() {
  const response = await fetch('/api/boards');
  if (!response.ok) throw new Error('Failed to fetch boards');
  return response.json();
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
  const response = await fetch(`/api/board/${boardId}`);
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
