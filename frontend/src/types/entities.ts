// Centralized entity type definitions for the frontend
// These match the backend database schema and API responses

import type { AuthProvider, ApprovalStatus } from '../../../shared/constants.js';

export interface User {
  userId: string;
  username: string;
  email?: string;
  isAdmin: boolean;
  authProvider: AuthProvider;
  approvalStatus: ApprovalStatus;
  createdAt: number;
  lastLogin?: number;
  discordGuildId?: string;
}

export interface BoardSettings {
  size: number;
  freeSpace: boolean;
  boardCode: string;
  boardPassword?: string;
  chatEnabled?: boolean;
  mentionNotifications?: boolean;
  editNotifications?: boolean;
  publicChat?: boolean;
  requireApproval?: boolean;
}

export interface Board {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  createdBy: string; // username
  createdAt: number;
  lastUpdated: number;
  isPublic: boolean;
  description?: string;
  url: string;
  settings: BoardSettings;
  cellCount?: number;
  markedCount?: number;
  cells?: Cell[];
}

export interface Cell {
  id: string;
  boardId: string;
  row: number;
  col: number;
  value: string;
  type: 'text' | 'image';
  marked: boolean;
  lastUpdated: number;
  updatedBy: string; // username
}

export interface CellHistory {
  id: string;
  cellId: string;
  value: string;
  type: 'text' | 'image';
  marked: boolean;
  createdAt: number;
  createdBy: string; // username
}

export interface ChatMessage {
  id: string;
  boardId: string;
  userId?: string;
  username?: string;
  message: string;
  command?: string;
  mentions?: string[];
  createdAt: number;
}

export interface BoardMember {
  id: string;
  boardId: string;
  userId: string;
  username: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  notificationsEnabled: boolean;
  joinedAt: number;
  lastViewed?: number;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: 'mention' | 'edit' | 'chat' | 'system';
  isRead: boolean;
  createdAt: number;
  data?: any;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserProfile {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  preferences?: UserPreferences;
  stats?: UserStats;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    mentions: boolean;
    edits: boolean;
    chat: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    allowDirectMessages: boolean;
  };
}

export interface UserStats {
  boardsCreated: number;
  cellsEdited: number;
  messagesPosted: number;
  timeSpent: number; // in seconds
  lastActive: number;
}

export interface Image {
  id: string;
  userId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: number;
  path: string;
  thumbnailPath?: string;
  metadata?: Record<string, any>;
}

export interface BoardVersion {
  id: string;
  boardId: string;
  versionNumber: number;
  createdAt: number;
  createdBy: string;
  snapshot: string; // JSON snapshot of board state
  description?: string;
}

// Form data interfaces for API requests
export interface LoginCredentials {
  method: 'site_password' | 'local' | 'google' | 'discord';
  sitePassword?: string;
  username?: string; // For anonymous users to choose their username
  email?: string;
  password?: string;
  idToken?: string; // For Google
  code?: string; // For Discord
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface CreateBoardData {
  title: string;
  description?: string;
  isPublic: boolean;
  size: number;
  freeSpace: boolean;
  boardPassword?: string; // Only for anonymous private boards
}

export interface UpdateBoardData {
  title?: string;
  description?: string;
  isPublic?: boolean;
  settings?: Partial<BoardSettings>;
}

export interface UpdateCellData {
  value: string;
  type: 'text' | 'image';
}

export interface BoardListParams {
  search?: string;
  isPublic?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'title' | 'createdAt' | 'lastUpdated';
  sortOrder?: 'asc' | 'desc';
}

// WebSocket event payloads
export interface WebSocketEvents {
  'board:updated': {
    boardId: string;
    board: Partial<Board>;
  };
  'cell:marked': {
    boardId: string;
    cell: Cell;
  };
  'cell:unmarked': {
    boardId: string;
    cell: Cell;
  };
  'cell:edited': {
    boardId: string;
    cell: Cell;
  };
  'chat:message': {
    boardId: string;
    message: ChatMessage;
  };
  'user:joined': {
    boardId: string;
    user: Pick<User, 'userId' | 'username'>;
  };
  'user:left': {
    boardId: string;
    user: Pick<User, 'userId' | 'username'>;
  };
  'notification': {
    notification: Notification;
  };
  'error': {
    error: string;
    code: string;
  };
}

// Utility types
export type BoardRole = BoardMember['role'];
export type CellType = Cell['type'];
export type NotificationType = Notification['type'];
export type AuthMethod = LoginCredentials['method'];
export type ThemeMode = UserPreferences['theme'];