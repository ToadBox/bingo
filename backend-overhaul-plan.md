# Bingo Site Backend Overhaul Plan

## Overview
The bingo site has been updated to support:
1. ✅ Multiboard mode - users can create their own boards
2. ✅ SQLite database integration while still supporting existing JSON boards
3. ✅ Unified authentication system/layer with anonymous (site password + optional username), Google and Discord OAuth support
4. ✅ Cell edit history with notifications
5. ✅ Board chat system with @ mentions and slash commands
6. ✅ Configuration system using both config.yml and .env
7. 🔄 **IN PROGRESS** - Full SQLite transition and cleaner routing

## Current Sprint: Full SQLite Transition & Clean Routing
### Goals:
- ✅ Remove JSON file dependencies, use SQLite as primary storage
- ✅ Implement cleaner URL structure: `/boards` for listing, `/<username>/<boardId>` for individual boards
- ✅ Add "Create Board" button to home page
- ✅ Improve UI/UX for board management
- ✅ Set server-created boards to use 'server' as username (configurable)

### New URL Structure:
- `/boards` - List all available boards (replaces current home page board listing)
- `/server/<boardId>` - Server-created boards (e.g., `/server/bingo-main`)
- `/<username>/<boardId>` - User-created boards (e.g., `/alice/my-board`)
- `/` - Landing page with create board button and recent boards

### Database Changes:
- Boards now primarily stored in SQLite
- JSON files used only as fallback/import source
- Board URLs generated from username + board slug
- Server boards use configurable server username (default: 'server')

## New Features to Implement
1. ✅ (partial)WebSockets for real-time updates
2. ✅ (partial)Configurable board sizes (3x3 to 9x9)
3. 🔄 Enhanced image management
4. 🔄 Advanced user profiles
5. 🔄 Advanced board search
6. 🔄 Board access controls
7. 🔄 PWA (Progressive Web App) support
8. ✅ (Partial)API rate limiting and security
9. 🔄 Board versioning with reversion capability

## Completed Database Schema

### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  email TEXT UNIQUE,
  auth_provider TEXT, -- 'local', 'google', 'discord', 'anonymous', etc.
  auth_id TEXT,       -- ID from the provider
  password_hash TEXT, -- For local accounts only
  password_salt TEXT, -- For local accounts only
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  is_admin BOOLEAN DEFAULT 0,
  approval_status TEXT DEFAULT 'pending',
  discord_guild_id TEXT,
  UNIQUE(auth_provider, auth_id)
);
```

### Boards Table
```sql
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,           -- URL-friendly board identifier
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_public BOOLEAN DEFAULT 0,
  description TEXT,
  settings TEXT,                -- JSON: size, freeSpace, etc.
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(created_by, slug)      -- Users can't have duplicate slugs
);
```

### Cells Table
```sql
CREATE TABLE IF NOT EXISTS cells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'text',
  marked BOOLEAN DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  UNIQUE(board_id, row, col)
);
```

### Cell History Table
```sql
CREATE TABLE IF NOT EXISTS cell_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id INTEGER NOT NULL,
  value TEXT,
  type TEXT,
  marked BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY (cell_id) REFERENCES cells(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### Board Chat Table
```sql
CREATE TABLE IF NOT EXISTS board_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  user_id INTEGER,
  message TEXT NOT NULL,
  command TEXT,
  mentions TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Board Members Table
```sql
CREATE TABLE IF NOT EXISTS board_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'viewer',
  notifications_enabled BOOLEAN DEFAULT 1,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_viewed TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(board_id, user_id)
);
```

### Board Settings Table
```sql
CREATE TABLE IF NOT EXISTS board_settings (
  board_id INTEGER PRIMARY KEY,
  chat_enabled BOOLEAN DEFAULT 1,
  mention_notifications BOOLEAN DEFAULT 1,
  edit_notifications BOOLEAN DEFAULT 1,
  public_chat BOOLEAN DEFAULT 1,
  require_approval BOOLEAN DEFAULT 0,
  settings TEXT,
  FOREIGN KEY (board_id) REFERENCES boards(id)
);
```

### Sessions Table
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Notifications Table
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Implementation Progress

### ✅ Completed Features
- Full authentication system with anonymous, Google, Discord support
- SQLite database with all core tables
- WebSocket support for real-time updates
- Board chat with mentions and commands
- Cell history tracking
- Admin panel with user management
- Configuration system (config.yml + .env)
- Startup configuration checks
- Discord bot integration with conditional loading

### 🔄 Current Implementation: Routing & UI Overhaul

#### Backend Changes:
1. **New Route Structure**:
   - `GET /boards` - List all boards with pagination and filters
   - `GET /:username/:boardSlug` - Get specific board by username and slug
   - `POST /boards` - Create new board (generates slug from title)
   - `PUT /:username/:boardSlug` - Update board (owner only)
   - `DELETE /:username/:boardSlug` - Delete board (owner only)

2. **Board Model Updates**:
   - Add `slug` field for URL-friendly identifiers
   - Add methods for slug generation and validation
   - Update board creation to auto-generate slugs
   - Add username-based board retrieval

3. **Server Username Configuration**:
   - Add `serverUsername` to config.yml (default: 'server')
   - Use for all system-created boards
   - Migrate existing server boards to use server username

#### Frontend Changes:
1. **Home Page Redesign**:
   - Add prominent "Create Board" button
   - Show recent boards grid
   - Add search/filter capabilities
   - Navigation to `/boards` for full listing

2. **Board Listing Page** (`/boards`):
   - Paginated board grid
   - Search and filter options
   - Sort by date, popularity, completion
   - User-specific filtering

3. **URL Updates**:
   - Update all board links to use new URL structure
   - Add breadcrumb navigation
   - Handle legacy URL redirects

### New Files Created:
1. `src/private/utils/startupChecks.js` - Configuration validation
2. `src/private/utils/slugGenerator.js` - URL slug generation
3. `src/private/routes/boards.js` - New board routes
4. `src/public/boards.html` - Board listing page
5. `src/public/js/boards.js` - Board listing functionality

### Files Modified:
1. `src/private/server.js` - Updated routing and Discord handling
2. `src/private/models/boardModel.js` - Added slug support
3. `src/private/models/userModel.js` - Fixed anonymous user approval
4. `src/private/routes/auth.js` - Conditional Discord routes
5. `src/public/index.html` - Updated home page UI
6. `src/public/js/index.js` - Updated for new routing
7. `config.yml` - Added server username configuration

## Next Implementation Phases

### Phase 1: Enhanced Image Management
- Create image upload service with Sharp.js
- Implement automatic thumbnail generation
- Add image validation and compression
- Create image gallery for boards

### Phase 2: Advanced User Profiles
- Implement user profile pages
- Add avatar upload and management
- Create user statistics and achievements
- Add user preference settings

### Phase 3: Board Access Controls & Collaboration
- Implement board permission levels
- Create invite system with shareable links
- Add password protection for boards
- Implement real-time collaboration features

### Phase 4: PWA & Offline Support
- Configure service workers
- Implement offline data caching
- Add push notifications
- Create background sync for offline actions

### Phase 5: Search & Discovery
- Implement full-text search for board content
- Create board categorization and tagging
- Add advanced filtering options
- Create board recommendation system

## New Tables Needed

### Board Versions Table
```sql
CREATE TABLE IF NOT EXISTS board_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  snapshot TEXT NOT NULL, -- JSON snapshot of board state
  description TEXT,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(board_id, version_number)
);
```

### User Profiles Table
```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  social_links TEXT, -- JSON format
  preferences TEXT,  -- JSON format
  stats TEXT,        -- JSON format
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Images Table
```sql
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  path TEXT NOT NULL,
  thumbnail_path TEXT,
  metadata TEXT, -- JSON format
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### API Rate Limits Table
```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests_count INTEGER DEFAULT 0,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Implementation Plan for New Features

### 1. WebSockets Implementation
- Integrate Socket.IO with Express
- Create WebSocket event handlers for:
  - Board updates (cell marked/unmarked)
  - Chat messages
  - User presence (joining/leaving boards)
  - Notifications
- Implement rooms based on board IDs
- Create client-side hooks for real-time updates

### 2. Configurable Board Sizes
- Update board model to store board dimensions (rows, columns)
- Add validation for board size (min 3x3, max 9x9)
- Update board creation/edit APIs to handle custom dimensions
- Create board templates for different sizes

### 3. Enhanced Image Management
- Create image upload service with Sharp.js for processing
- Implement automatic generation of thumbnails
- Add image validation (type, size, dimensions)
- Create API endpoints for image upload and retrieval
- Ensure cell image support with proper storage and referencing

### 4. User Profiles Enhancement
- Create user_profiles table
- Add APIs for profile data (view, edit)
- Implement avatar upload and management
- Add user stats tracking (boards created, edits made)
- Create preference settings for users

### 5. Advanced Board Search
- Implement full-text search for board content
- Create indexing system for cell values
- Add filters for:
  - Board size
  - Creation date
  - User ownership
  - Public/private status
  - Tags/categories
- Create API endpoints for search queries

### 6. Board Access Controls
- Expand board_members table functionality
- Implement permission levels (owner, admin, editor, viewer)
- Create invite system with unique links
- Add password protection option for boards
- Create APIs for permission management

### 7. PWA Support Backend
- Configure service workers
- Set up manifest.json with appropriate settings
- Implement offline data caching strategies
- Add push notification support on the backend
- Create background sync for offline actions

### 8. API Rate Limiting and Security
- Implement rate limiting middleware with express-rate-limit
- Create IP and user-based rate limits
- Add security headers with helmet
- Implement CSRF protection
- Add throttling for sensitive endpoints (login, registration)

### 9. Board Versioning
- Create board_versions table
- Implement version snapshots (triggered by significant changes)
- Limit history to 50 versions per board
- Add APIs for:
  - Listing versions
  - Viewing version details
  - Reverting to previous versions
- Create a cleanup mechanism for old versions

## File Changes

### New Files
1. `src/private/websocket/index.js` - WebSocket server setup
2. `src/private/websocket/handlers/` - WebSocket event handlers
3. `src/private/services/imageService.js` - Image processing and management
4. `src/private/services/searchService.js` - Advanced search functionality
5. `src/private/services/versionService.js` - Board versioning
6. `src/private/middleware/rateLimiter.js` - API rate limiting
7. `src/private/models/imageModel.js` - Model for image management
8. `src/private/models/versionModel.js` - Model for board versions
9. `src/private/models/profileModel.js` - Model for user profiles
10. `src/private/routes/images.js` - Image upload/management routes
11. `src/private/routes/search.js` - Search API routes
12. `src/private/routes/versions.js` - Version management routes

### Updates
1. `src/private/models/boardModel.js` - Add board size configuration, access controls
2. `src/private/models/userModel.js` - Add profile management
3. `src/private/routes/api.js` - Add new endpoints for search and board management
4. `src/private/server.js` - Integrate WebSockets, PWA support, rate limiting
5. `src/private/middleware/auth.js` - Enhanced permissions checks
6. `src/private/services/boardService.js` - Add versioning support
7. `src/public/manifest.json` - PWA configuration
8. `src/public/service-worker.js` - PWA offline support 