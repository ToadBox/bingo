import api, { handleApiError } from './api'
import { logger } from '../utils/logger'
import type {
  Board,
  Cell,
  CreateBoardData,
  UpdateBoardData,
  BoardsListResponse
} from '../../../shared/types'

// Re-export types for backward compatibility
export type { Board, CreateBoardData, UpdateBoardData, BoardsListResponse }
export type BoardCell = Cell

export const boardsService = {
  // Get all boards with pagination and filters
  async getBoards(params?: {
    page?: number
    limit?: number
    search?: string
    createdBy?: string
    isPublic?: boolean
    sortBy?: 'created' | 'updated' | 'title'
    sortOrder?: 'asc' | 'desc'
  }): Promise<BoardsListResponse> {
    try {
      const response = await api.get('/boards', { params })
      return response.data
    } catch (error) {
      logger.board.error('Failed to fetch boards', { error, params })
      throw new Error(handleApiError(error))
    }
  },

  // Get a specific board by username and slug
  async getBoard(username: string, slug: string): Promise<Board> {
    try {
      const response = await api.get(`/${username}/${slug}`)
      return response.data
    } catch (error) {
      logger.board.error('Failed to fetch board', { error, username, slug })
      throw new Error(handleApiError(error))
    }
  },

  // Get board cells
  async getBoardCells(boardId: string): Promise<Cell[]> {
    try {
      const response = await api.get(`/boards/${boardId}/cells`)
      return response.data
    } catch (error) {
      logger.board.error('Failed to fetch board cells', { error, boardId })
      throw new Error(handleApiError(error))
    }
  },

  // Create a new board
  async createBoard(data: CreateBoardData): Promise<Board> {
    try {
      const response = await api.post('/boards', data)
      logger.board.info('Board created successfully', { boardId: response.data.id })
      return response.data
    } catch (error) {
      logger.board.error('Failed to create board', { error, data })
      throw new Error(handleApiError(error))
    }
  },

  // Update a board
  async updateBoard(username: string, slug: string, data: UpdateBoardData): Promise<Board> {
    try {
      const response = await api.put(`/${username}/${slug}`, data)
      logger.board.info('Board updated successfully', { username, slug })
      return response.data
    } catch (error) {
      logger.board.error('Failed to update board', { error, username, slug, data })
      throw new Error(handleApiError(error))
    }
  },

  // Delete a board
  async deleteBoard(username: string, slug: string): Promise<void> {
    try {
      await api.delete(`/${username}/${slug}`)
      logger.board.info('Board deleted successfully', { username, slug })
    } catch (error) {
      logger.board.error('Failed to delete board', { error, username, slug })
      throw new Error(handleApiError(error))
    }
  },

  // Update a board cell
  async updateCell(boardId: string, cellId: string, data: {
    value?: string
    type?: 'text' | 'image'
    marked?: boolean
  }): Promise<Cell> {
    try {
      const response = await api.put(`/boards/${boardId}/cells/${cellId}`, data)
      logger.board.info('Cell updated successfully', { boardId, cellId })
      return response.data
    } catch (error) {
      logger.board.error('Failed to update cell', { error, boardId, cellId, data })
      throw new Error(handleApiError(error))
    }
  },

  // Get board statistics
  async getBoardStats(boardId: string): Promise<{
    totalCells: number
    markedCells: number
    completionRate: number
    lastActivity: string
  }> {
    try {
      const response = await api.get(`/boards/${boardId}/stats`)
      return response.data
    } catch (error) {
      logger.board.error('Failed to fetch board stats', { error, boardId })
      throw new Error(handleApiError(error))
    }
  },

  // Get user's boards
  async getUserBoards(username: string, params?: {
    page?: number
    limit?: number
  }): Promise<BoardsListResponse> {
    try {
      const response = await api.get(`/users/${username}/boards`, { params })
      return response.data
    } catch (error) {
      logger.board.error('Failed to fetch user boards', { error, username, params })
      throw new Error(handleApiError(error))
    }
  },

  // Search boards
  async searchBoards(query: string, params?: {
    page?: number
    limit?: number
  }): Promise<BoardsListResponse> {
    try {
      const response = await api.get('/boards/search', { 
        params: { q: query, ...params }
      })
      return response.data
    } catch (error) {
      logger.board.error('Failed to search boards', { error, query, params })
      throw new Error(handleApiError(error))
    }
  }
} 