import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { boardsService, type Board, type CreateBoardData, type UpdateBoardData, type BoardsListResponse } from '../services/boards'

// Query keys for consistent caching
export const boardKeys = {
  all: ['boards'] as const,
  lists: () => [...boardKeys.all, 'list'] as const,
  list: (params: any) => [...boardKeys.lists(), params] as const,
  details: () => [...boardKeys.all, 'detail'] as const,
  detail: (username: string, slug: string) => [...boardKeys.details(), username, slug] as const,
  userBoards: (username: string) => [...boardKeys.all, 'user', username] as const,
  search: (query: string) => [...boardKeys.all, 'search', query] as const,
}

// Get boards list with pagination and filters
export function useBoards(params?: {
  page?: number
  limit?: number
  search?: string
  createdBy?: string
  isPublic?: boolean
  sortBy?: 'created' | 'updated' | 'title'
  sortOrder?: 'asc' | 'desc'
}) {
  return useQuery({
    queryKey: boardKeys.list(params),
    queryFn: () => boardsService.getBoards(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  })
}

// Get a specific board
export function useBoard(username: string, slug: string) {
  return useQuery({
    queryKey: boardKeys.detail(username, slug),
    queryFn: () => boardsService.getBoard(username, slug),
    enabled: !!(username && slug),
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 2,
  })
}

// Get user's boards
export function useUserBoards(username: string, params?: {
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: [...boardKeys.userBoards(username), params],
    queryFn: () => boardsService.getUserBoards(username, params),
    enabled: !!username,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Search boards
export function useSearchBoards(query: string, params?: {
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: [...boardKeys.search(query), params],
    queryFn: () => boardsService.searchBoards(query, params),
    enabled: query.length > 0,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

// Create board mutation
export function useCreateBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateBoardData) => boardsService.createBoard(data),
    onSuccess: (newBoard) => {
      // Invalidate and refetch boards list
      queryClient.invalidateQueries({ queryKey: boardKeys.lists() })
      
      // Add the new board to the cache
      queryClient.setQueryData(
        boardKeys.detail(newBoard.creatorUsername || 'unknown', newBoard.slug),
        newBoard
      )
      
      toast.success('Board created successfully!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create board')
    },
  })
}

// Update board mutation
export function useUpdateBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ username, slug, data }: {
      username: string
      slug: string
      data: UpdateBoardData
    }) => boardsService.updateBoard(username, slug, data),
    onSuccess: (updatedBoard, { username, slug }) => {
      // Update the specific board in cache
      queryClient.setQueryData(
        boardKeys.detail(username, slug),
        updatedBoard
      )
      
      // Invalidate boards lists to reflect changes
      queryClient.invalidateQueries({ queryKey: boardKeys.lists() })
      
      toast.success('Board updated successfully!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update board')
    },
  })
}

// Delete board mutation
export function useDeleteBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ username, slug }: { username: string; slug: string }) =>
      boardsService.deleteBoard(username, slug),
    onSuccess: (_, { username, slug }) => {
      // Remove the board from cache
      queryClient.removeQueries({
        queryKey: boardKeys.detail(username, slug)
      })
      
      // Invalidate boards lists
      queryClient.invalidateQueries({ queryKey: boardKeys.lists() })
      queryClient.invalidateQueries({ queryKey: boardKeys.userBoards(username) })
      
      toast.success('Board deleted successfully!')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete board')
    },
  })
}

// Board cells hooks
export function useBoardCells(boardId: string) {
  return useQuery({
    queryKey: ['boards', boardId, 'cells'],
    queryFn: () => boardsService.getBoardCells(boardId),
    enabled: !!boardId,
    staleTime: 1000 * 30, // 30 seconds for real-time feel
  })
}

// Update cell mutation
export function useUpdateCell() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ boardId, cellId, data }: {
      boardId: string
      cellId: string
      data: { value?: string; type?: 'text' | 'image'; marked?: boolean }
    }) => boardsService.updateCell(boardId, cellId, data),
    onSuccess: (updatedCell, { boardId }) => {
      // Update the cells cache
      queryClient.setQueryData(
        ['boards', boardId, 'cells'],
        (oldCells: any) => {
          if (!oldCells) return [updatedCell]
          return oldCells.map((cell: any) =>
            cell.id === updatedCell.id ? updatedCell : cell
          )
        }
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update cell')
    },
  })
}

// Board stats hook
export function useBoardStats(boardId: string) {
  return useQuery({
    queryKey: ['boards', boardId, 'stats'],
    queryFn: () => boardsService.getBoardStats(boardId),
    enabled: !!boardId,
    staleTime: 1000 * 60, // 1 minute
  })
} 