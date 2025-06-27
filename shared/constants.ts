// Auto-generated TypeScript definitions for shared constants
// This file is generated from shared/constants.json

export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_001',
  AUTH_INVALID: 'AUTH_002',
  AUTH_EXPIRED: 'AUTH_003',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_004',
  VALIDATION_FAILED: 'VAL_001',
  VALIDATION_MISSING_FIELD: 'VAL_002',
  VALIDATION_INVALID_FORMAT: 'VAL_003',
  RESOURCE_NOT_FOUND: 'RES_001',
  RESOURCE_CONFLICT: 'RES_002',
  RESOURCE_FORBIDDEN: 'RES_003',
  RATE_LIMIT_EXCEEDED: 'RATE_001',
  SERVER_ERROR: 'SRV_001',
  DATABASE_ERROR: 'DB_001',
  WEBSOCKET_ERROR: 'WS_001'
} as const;

export const ERROR_MESSAGES = {
  AUTH_001: 'Authentication required. Please log in.',
  AUTH_002: 'Invalid credentials provided.',
  AUTH_003: 'Session has expired. Please log in again.',
  AUTH_004: 'Insufficient permissions for this action.',
  VAL_001: 'Validation failed for the provided data.',
  VAL_002: 'Required field is missing.',
  VAL_003: 'Invalid format for the provided data.',
  RES_001: 'The requested resource was not found.',
  RES_002: 'Resource conflict detected.',
  RES_003: 'Access to this resource is forbidden.',
  RATE_001: 'Rate limit exceeded. Please try again later.',
  SRV_001: 'An internal server error occurred.',
  DB_001: 'Database operation failed.',
  WS_001: 'WebSocket connection error.'
} as const;

export const BOARD = {
  DEFAULT_SIZE: 5,
  MIN_SIZE: 3,
  MAX_SIZE: 9,
  DEFAULT_TITLE: 'New Bingo Board',
  SLUG_MAX_LENGTH: 50,
  TITLE_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 500,
  CODE_LENGTH: 6,
  PASSWORD_MIN_LENGTH: 4,
  PASSWORD_MAX_LENGTH: 12,
  MAX_VERSIONS: 50,
  AUTO_VERSION_THRESHOLD: 10
} as const;

export const IMAGE = {
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  MAX_FILE_SIZE: 52428800, // 50MB
  COMPRESSION_THRESHOLD: 1048576, // 1MB
  THUMBNAIL_WIDTH: 150,
  THUMBNAIL_HEIGHT: 150,
  MAX_WIDTH: 2048,
  MAX_HEIGHT: 2048
} as const;

export const VALIDATION = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: '^[a-zA-Z0-9_-]+$',
  EMAIL_PATTERN: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  SITE_PASSWORD_MIN_LENGTH: 4,
  SITE_PASSWORD_MAX_LENGTH: 50
} as const;

export const WEBSOCKET = {
  EVENTS: {
    BOARD_UPDATED: 'board:updated',
    CELL_MARKED: 'cell:marked',
    CELL_UNMARKED: 'cell:unmarked',
    CELL_EDITED: 'cell:edited',
    CHAT_MESSAGE: 'chat:message',
    USER_JOINED: 'user:joined',
    USER_LEFT: 'user:left',
    NOTIFICATION: 'notification',
    ERROR: 'error'
  },
  PING_INTERVAL: 30000,
  PING_TIMEOUT: 10000,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 1000
} as const;

export const API = {
  RATE_LIMIT_WINDOW_MS: 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 500,
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: false,
  REQUEST_TIMEOUT: 30000,
  VERSION: 'v1'
} as const;

export const AUTH = {
  PROVIDERS: ['anonymous', 'local', 'google', 'discord'],
  SESSION_EXPIRY: 2592000000, // 30 days
  TOKEN_LENGTH: 64,
  APPROVAL_STATUSES: ['pending', 'approved', 'rejected']
} as const;

export const CACHE = {
  TTL: 300000, // 5 minutes
  MAX_ENTRIES: 1000
} as const;

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
} as const;

// Type definitions
export type ErrorCode = keyof typeof ERROR_CODES;
export type ErrorMessage = keyof typeof ERROR_MESSAGES;
export type AuthProvider = (typeof AUTH.PROVIDERS)[number];
export type ApprovalStatus = (typeof AUTH.APPROVAL_STATUSES)[number];
export type WebSocketEvent = keyof typeof WEBSOCKET.EVENTS;

// Helper functions
export const getErrorMessage = (code: ErrorCode): string => {
  const errorCode = ERROR_CODES[code];
  return ERROR_MESSAGES[errorCode as keyof typeof ERROR_MESSAGES] || 'Unknown error occurred.';
};

export const validateBoardSize = (size: number): boolean => {
  return size >= BOARD.MIN_SIZE && size <= BOARD.MAX_SIZE;
};

export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  if (file.size > IMAGE.MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${IMAGE.MAX_FILE_SIZE / (1024 * 1024)}MB limit` };
  }
  
  if (!(IMAGE.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Allowed types: ' + IMAGE.ALLOWED_MIME_TYPES.join(', ') };
  }
  
  return { valid: true };
};

export const validateUsername = (username: string): { valid: boolean; error?: string } => {
  if (username.length < VALIDATION.USERNAME_MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${VALIDATION.USERNAME_MIN_LENGTH} characters` };
  }
  
  if (username.length > VALIDATION.USERNAME_MAX_LENGTH) {
    return { valid: false, error: `Username must not exceed ${VALIDATION.USERNAME_MAX_LENGTH} characters` };
  }
  
  const regex = new RegExp(VALIDATION.USERNAME_PATTERN);
  if (!regex.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  
  return { valid: true };
};

export const validateEmail = (email: string): { valid: boolean; error?: string } => {
  const regex = new RegExp(VALIDATION.EMAIL_PATTERN);
  if (!regex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
};

export const generateBoardCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < BOARD.CODE_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};