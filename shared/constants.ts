/**
 * Shared constants between frontend and backend.
 * This eliminates duplication and ensures consistency across the application.
 */

// Error codes and messages
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BOARD_NOT_FOUND: 'BOARD_NOT_FOUND',
  CELL_NOT_FOUND: 'CELL_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_PENDING: 'ACCOUNT_PENDING',
  ACCOUNT_REJECTED: 'ACCOUNT_REJECTED',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE'
} as const

export const ERROR_MESSAGES = {
  [ERROR_CODES.VALIDATION_ERROR]: 'Invalid input data provided',
  [ERROR_CODES.AUTHENTICATION_REQUIRED]: 'Authentication required to access this resource',
  [ERROR_CODES.ACCESS_DENIED]: 'Access denied. Insufficient permissions',
  [ERROR_CODES.RESOURCE_NOT_FOUND]: 'The requested resource was not found',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later',
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'An internal server error occurred',
  [ERROR_CODES.BOARD_NOT_FOUND]: 'Board not found',
  [ERROR_CODES.CELL_NOT_FOUND]: 'Cell not found',
  [ERROR_CODES.USER_NOT_FOUND]: 'User not found',
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid username or password',
  [ERROR_CODES.ACCOUNT_PENDING]: 'Account is pending approval',
  [ERROR_CODES.ACCOUNT_REJECTED]: 'Account has been rejected',
  [ERROR_CODES.DUPLICATE_RESOURCE]: 'Resource already exists',
  [ERROR_CODES.INVALID_FILE_TYPE]: 'Invalid file type',
  [ERROR_CODES.FILE_TOO_LARGE]: 'File size exceeds maximum limit'
} as const

// Board configuration
export const BOARD_CONFIG = {
  MIN_SIZE: 3,
  MAX_SIZE: 9,
  DEFAULT_SIZE: 5,
  MIN_TITLE_LENGTH: 1,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_CELL_VALUE_LENGTH: 200,
  FREE_SPACE_DEFAULT: true,
  VISIBILITY: {
    PUBLIC: 'public',
    PRIVATE: 'private', 
    GUILD: 'guild'  // Discord guild-only visibility
  },
  CODE_LENGTH: 6,
  PASSWORD_MIN_LENGTH: 4,
  PASSWORD_MAX_LENGTH: 12,
  MAX_BOARDS_PER_USER: 10,
  MAX_CELLS_PER_BOARD: 81  // 9x9 max
} as const

// Image upload configuration
export const IMAGE_CONFIG = {
  ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_WIDTH: 2048,
  MAX_HEIGHT: 2048,
  THUMBNAIL_SIZE: 256,
  UPLOAD_PATH: '/uploads/images'
} as const

// Validation rules
export const VALIDATION_RULES = {
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30,
    PATTERN: /^[a-zA-Z0-9_-]+$/,
    RESERVED_NAMES: ['admin', 'server', 'anonymous', 'system', 'root', 'api', 'www']
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    MAX_LENGTH: 254
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL: false
  },
  SEARCH_QUERY: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100
  },
  PAGINATION: {
    MIN_PAGE: 1,
    MAX_PAGE: 1000,
    MIN_LIMIT: 1,
    MAX_LIMIT: 100,
    DEFAULT_LIMIT: 10
  }
} as const

// WebSocket event types
export const WEBSOCKET_EVENTS = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  
  // Board events
  BOARD_JOIN: 'board:join',
  BOARD_LEAVE: 'board:leave',
  BOARD_UPDATE: 'board:update',
  
  // Cell events
  CELL_UPDATE: 'cell:update',
  CELL_MARK: 'cell:mark',
  CELL_UNMARK: 'cell:unmark',
  
  // Chat events
  CHAT_MESSAGE: 'chat:message',
  CHAT_COMMAND: 'chat:command',
  CHAT_USER_JOIN: 'chat:user_join',
  CHAT_USER_LEAVE: 'chat:user_leave',
  
  // Notification events
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  
  // Admin events
  ADMIN_BROADCAST: 'admin:broadcast',
  ADMIN_USER_UPDATE: 'admin:user_update'
} as const

// API response status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

// Rate limiting configuration
export const RATE_LIMITS = {
  LOGIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_ATTEMPTS: 5
  },
  REGISTER: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_ATTEMPTS: 3
  },
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  UPLOAD: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_UPLOADS: 10
  }
} as const

// Authentication configuration
export const AUTH_CONFIG = {
  SESSION_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  COOKIE_NAME: 'auth_token',
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'lax' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  },
  PROVIDERS: {
    ANONYMOUS: 'anonymous',
    LOCAL: 'local',
    GOOGLE: 'google',
    DISCORD: 'discord'
  }
} as const

// Theme configuration
export const THEME_CONFIG = {
  DEFAULT_THEME: 'light',
  AVAILABLE_THEMES: ['light', 'dark', 'auto'],
  STORAGE_KEY: 'bingo-theme'
} as const

// Component names for logging
export const COMPONENT_NAMES = {
  AUTH: 'Auth',
  BOARD: 'Board',
  USER: 'User',
  ADMIN: 'Admin',
  API: 'API',
  WEBSOCKET: 'WebSocket',
  DATABASE: 'Database',
  VALIDATION: 'Validation',
  UPLOAD: 'Upload',
  CHAT: 'Chat',
  NOTIFICATION: 'Notification'
} as const

// Default board settings
export const DEFAULT_BOARD_SETTINGS = {
  size: BOARD_CONFIG.DEFAULT_SIZE,
  freeSpace: true,
  boardCode: '',
  boardPassword: undefined
} as const

// Performance monitoring thresholds
export const PERFORMANCE_THRESHOLDS = {
  SLOW_REQUEST_MS: 1000,
  SLOW_QUERY_MS: 100,
  HIGH_MEMORY_MB: 100,
  ERROR_RATE_THRESHOLD: 0.05 // 5%
} as const

// Export type helpers
export type ErrorCode = keyof typeof ERROR_CODES
export type WebSocketEvent = typeof WEBSOCKET_EVENTS[keyof typeof WEBSOCKET_EVENTS]
export type ComponentName = typeof COMPONENT_NAMES[keyof typeof COMPONENT_NAMES]
export type AuthProvider = typeof AUTH_CONFIG.PROVIDERS[keyof typeof AUTH_CONFIG.PROVIDERS] 