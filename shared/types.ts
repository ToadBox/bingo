/**
 * Shared TypeScript type definitions for use across frontend and backend.
 * Eliminates duplication and ensures consistency.
 */

export interface User {
  userId: string
  username: string
  email?: string
  authProvider: 'anonymous' | 'local' | 'google' | 'discord'
  approvalStatus: 'approved' | 'pending' | 'rejected'
  createdAt: number
  lastLogin?: number
}

export interface Board {
  id: string
  title: string
  slug: string
  createdBy: string
  createdAt: number
  lastUpdated: number
  isPublic: boolean
  visibility?: 'public' | 'private' | 'guild'
  discordGuildId?: string
  description?: string
  url: string
  settings: BoardSettings
  cellCount?: number
  markedCount?: number
  cells?: Cell[]
  boardCode?: string
}

export interface BoardSettings {
  size: number
  freeSpace: boolean
  boardCode?: string
  boardPassword?: string
  discordGuildId?: string
  [key: string]: any
}

export interface Cell {
  id: string
  row: number
  col: number
  value: string
  type: 'text' | 'image'
  marked: boolean
  lastUpdated: string
  updatedBy?: string
}

export interface CreateBoardData {
  title: string
  description?: string
  isPublic?: boolean
  visibility?: 'public' | 'private' | 'guild'
  discordGuildId?: string
  size?: number
  freeSpace?: boolean
  createdByName?: string
  useServerName?: boolean
}

export interface UpdateBoardData {
  title?: string
  description?: string
  isPublic?: boolean
  settings?: Partial<BoardSettings>
}

export interface BoardsListResponse {
  boards: Board[]
  pagination: PaginationInfo
}

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext?: boolean
  hasPrev?: boolean
}

// Authentication types
export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  username: string
  email: string
  password: string
}

export interface SitePasswordCredentials {
  sitePassword: string
  username?: string
}

export interface AuthResponse {
  success: boolean
  user?: User
  message?: string
  error?: string
  requiresApproval?: boolean
}

export interface AuthConfig {
  methods: string[]
  registration: {
    enabled: boolean
    requiresApproval: boolean
  }
}

// API Response types
export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
  requestId?: string
}

export interface ApiError {
  error: string
  errorCode?: string
  requestId?: string
  context?: any
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationInfo
}

// Error Report types
export interface ErrorReport {
  id: string
  requestId?: string
  component: string
  level: 'error' | 'warn' | 'info' | 'debug'
  message: string
  stackTrace?: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  endpoint?: string
  context?: string
  resolved: boolean
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
}

// Performance Metric types
export interface PerformanceMetric {
  id: number
  requestId?: string
  endpoint: string
  method: string
  durationMs: number
  memoryDeltaMb: number
  statusCode: number
  createdAt: string
}

// WebSocket Event types
export interface WebSocketEvent {
  type: string
  boardId?: string
  userId?: string
  data: any
  timestamp: number
}

// Chat Message types
export interface ChatMessage {
  id: number
  boardId: number
  userId: string
  message: string
  command?: string
  mentions?: string
  createdAt: string
}

// Notification types
export interface Notification {
  id: number
  userId: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
  data?: string
} 