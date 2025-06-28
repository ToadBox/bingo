/**
 * Frontend-specific constants that import from shared constants
 * to eliminate duplication while providing convenient access.
 */

import {
  ERROR_CODES,
  ERROR_MESSAGES,
  BOARD_CONFIG,
  IMAGE_CONFIG,
  VALIDATION_RULES,
  WEBSOCKET_EVENTS,
  HTTP_STATUS,
  THEME_CONFIG,
  DEFAULT_BOARD_SETTINGS
} from '../../../shared/constants'

// Re-export shared constants for frontend use
export {
  ERROR_CODES,
  ERROR_MESSAGES,
  BOARD_CONFIG,
  IMAGE_CONFIG,
  VALIDATION_RULES,
  WEBSOCKET_EVENTS,
  HTTP_STATUS,
  THEME_CONFIG,
  DEFAULT_BOARD_SETTINGS
}

// Frontend-specific constants
export const FRONTEND_CONFIG = {
  API_BASE_URL: (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000',
  DEV_SERVER_PORT: 3001,
  STORAGE_KEYS: {
    THEME: THEME_CONFIG.STORAGE_KEY,
    AUTH_TOKEN: 'auth_token',
    USER_PREFERENCES: 'user_preferences',
    BOARD_FILTERS: 'board_filters'
  },
  DEBOUNCE_DELAYS: {
    SEARCH: 300,
    AUTO_SAVE: 1000,
    RESIZE: 100
  },
  ANIMATION_DURATIONS: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
  }
} as const

// Component display constants
export const DISPLAY_CONFIG = {
  BOARDS_PER_PAGE: 12,
  CELLS_SKELETON_COUNT: 25,
  MAX_TOAST_DURATION: 5000,
  PAGINATION_VISIBLE_PAGES: 5,
  SEARCH_MIN_CHARS: 2,
  INFINITE_SCROLL_THRESHOLD: 200
} as const

// Form validation messages (frontend-specific)
export const FORM_MESSAGES = {
  REQUIRED_FIELD: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  PASSWORD_TOO_SHORT: `Password must be at least ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} characters`,
  USERNAME_TAKEN: 'This username is already taken',
  BOARD_TITLE_REQUIRED: 'Board title is required',
  BOARD_SIZE_INVALID: `Board size must be between ${BOARD_CONFIG.MIN_SIZE} and ${BOARD_CONFIG.MAX_SIZE}`,
  FILE_TOO_LARGE: `File size cannot exceed ${Math.round(IMAGE_CONFIG.MAX_FILE_SIZE / 1024 / 1024)}MB`,
  INVALID_FILE_TYPE: `Only ${IMAGE_CONFIG.ALLOWED_EXTENSIONS.join(', ')} files are allowed`
} as const

// UI state constants
export const UI_STATES = {
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  IDLE: 'idle'
} as const

// Route paths
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  BOARDS: '/boards',
  CREATE_BOARD: '/boards/create',
  MY_BOARDS: '/my-boards',
  ADMIN: '/admin',
  BOARD: (username: string, slug: string) => `/${username}/${slug}`
} as const

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  SAVE: 'Ctrl+S',
  SEARCH: 'Ctrl+K',
  NEW_BOARD: 'Ctrl+N',
  TOGGLE_THEME: 'Ctrl+Shift+T',
  ESCAPE: 'Escape',
  ENTER: 'Enter'
} as const

// Export type helpers for frontend
export type UIState = typeof UI_STATES[keyof typeof UI_STATES]
export type Route = string 