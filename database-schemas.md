# Database Schema Reference

This document contains all database table definitions and relationships for the Bingo application.

## Core Tables

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
  creator_username TEXT,        -- Username for consistent display
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_public BOOLEAN DEFAULT 0,
  description TEXT,
  settings TEXT,                -- JSON: size, freeSpace, boardCode, etc.
  board_code TEXT UNIQUE,       -- Unique 6-character join code
  video_url TEXT,               -- Optional video stream URL
  video_type TEXT,              -- 'youtube', 'twitch', 'custom'
  schema_version INTEGER DEFAULT 1,
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

## Chat & Communication

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

## Board Management

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

## Advanced Features

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

## Command System

### Board Roles Table
```sql
CREATE TABLE IF NOT EXISTS board_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  name TEXT NOT NULL, -- 'owner', 'moderator', 'member', 'viewer'
  display_name TEXT NOT NULL,
  color TEXT, -- Hex color for role display
  permissions TEXT NOT NULL, -- JSON array of command permissions
  is_default BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  UNIQUE(board_id, name)
);
```

### Board User Roles Table
```sql
CREATE TABLE IF NOT EXISTS board_user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES board_roles(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(board_id, user_id)
);
```

### Chat Commands Table
```sql
CREATE TABLE IF NOT EXISTS chat_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  command TEXT NOT NULL, -- e.g., 'watch', 'theme', 'reset'
  arguments TEXT, -- JSON array of command arguments
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'executed'
  requires_vote BOOLEAN DEFAULT 0,
  vote_threshold DECIMAL(3,2) DEFAULT 0.5, -- 50% by default
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP,
  executed_by INTEGER,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (executed_by) REFERENCES users(id)
);
```

### Command Votes Table
```sql
CREATE TABLE IF NOT EXISTS command_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote BOOLEAN NOT NULL, -- true = yes, false = no
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (command_id) REFERENCES chat_commands(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(command_id, user_id)
);
```

### Board Command Settings Table
```sql
CREATE TABLE IF NOT EXISTS board_command_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  command_name TEXT NOT NULL, -- 'watch', 'theme', 'reset', etc.
  enabled BOOLEAN DEFAULT 1,
  requires_vote BOOLEAN DEFAULT 0,
  vote_threshold DECIMAL(3,2) DEFAULT 0.5,
  vote_duration INTEGER DEFAULT 300, -- seconds
  cooldown_duration INTEGER DEFAULT 0, -- seconds between uses
  allowed_roles TEXT, -- JSON array of role names
  settings TEXT, -- JSON for command-specific settings
  FOREIGN KEY (board_id) REFERENCES boards(id),
  UNIQUE(board_id, command_name)
);
```

## Analytics & Monitoring

### Board Visits Table
```sql
CREATE TABLE IF NOT EXISTS board_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  user_id INTEGER, -- NULL for anonymous visits
  session_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  auth_type TEXT, -- 'anonymous', 'site_password', 'local', 'google', 'discord'
  visit_duration INTEGER, -- seconds
  page_views INTEGER DEFAULT 1,
  interactions INTEGER DEFAULT 0, -- clicks, cell marks, chat messages
  referrer TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Board Interactions Table
```sql
CREATE TABLE IF NOT EXISTS board_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  user_id INTEGER,
  session_id TEXT,
  interaction_type TEXT NOT NULL, -- 'cell_mark', 'cell_unmark', 'chat_message', 'command_use', 'vote_cast'
  interaction_data TEXT, -- JSON data specific to interaction type
  cell_id INTEGER, -- For cell-related interactions
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cell_id) REFERENCES cells(id)
);
```

### Board Statistics Cache Table
```sql
CREATE TABLE IF NOT EXISTS board_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  date DATE NOT NULL,
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  anonymous_visits INTEGER DEFAULT 0,
  authenticated_visits INTEGER DEFAULT 0,
  average_duration INTEGER DEFAULT 0,
  total_interactions INTEGER DEFAULT 0,
  chat_messages INTEGER DEFAULT 0,
  commands_used INTEGER DEFAULT 0,
  cells_marked INTEGER DEFAULT 0,
  peak_concurrent_users INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  UNIQUE(board_id, date)
);
```

## Resources & News System

### Board News Sources Table
```sql
CREATE TABLE IF NOT EXISTS board_news_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL, -- 'rss', 'api', 'manual'
  source_url TEXT,
  api_key TEXT, -- For API-based sources
  is_active BOOLEAN DEFAULT 1,
  fetch_interval INTEGER DEFAULT 3600, -- seconds
  last_fetched TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  settings TEXT, -- JSON for source-specific settings
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### Board Resources Table
```sql
CREATE TABLE IF NOT EXISTS board_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'article', 'video', 'document', 'fact_check', 'news'
  source_id INTEGER, -- References news_sources if auto-fetched
  tags TEXT, -- JSON array of tags
  is_verified BOOLEAN DEFAULT 0,
  verification_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  relevance_score DECIMAL(3,2) DEFAULT 0, -- 0-1 relevance to board
  cell_scope TEXT, -- JSON array of cell positions
  auto_linked BOOLEAN DEFAULT 0, -- Whether resource was auto-linked by keywords
  keyword_matches TEXT, -- JSON array of matched keywords that triggered auto-linking
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (source_id) REFERENCES board_news_sources(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### Resource Verifications Table
```sql
CREATE TABLE IF NOT EXISTS resource_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  verification_type TEXT NOT NULL, -- 'verified', 'disputed', 'outdated', 'irrelevant'
  comment TEXT,
  evidence_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES board_resources(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(resource_id, user_id)
);
```

### Board Resource Categories Table
```sql
CREATE TABLE IF NOT EXISTS board_resource_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT, -- Hex color for category display
  icon TEXT, -- Icon name or emoji
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  UNIQUE(board_id, name)
);
```

### Resource Category Assignments Table
```sql
CREATE TABLE IF NOT EXISTS resource_category_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (resource_id) REFERENCES board_resources(id),
  FOREIGN KEY (category_id) REFERENCES board_resource_categories(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(resource_id, category_id)
);
```

## Cell-Level Resources

### Cell Resources Table
```sql
CREATE TABLE IF NOT EXISTS cell_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id INTEGER NOT NULL,
  resource_id INTEGER NOT NULL,
  relevance_score DECIMAL(3,2) DEFAULT 1.0, -- How relevant is this resource to this cell
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  notes TEXT, -- Optional notes about why this resource relates to this cell
  is_primary BOOLEAN DEFAULT 0, -- Whether this is the primary resource for the cell
  FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES board_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  UNIQUE(cell_id, resource_id)
);
```

### Cell Resource Summary Table (for performance)
```sql
CREATE TABLE IF NOT EXISTS cell_resource_summary (
  cell_id INTEGER PRIMARY KEY,
  resource_count INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 0,
  disputed_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  primary_resource_id INTEGER,
  FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_resource_id) REFERENCES board_resources(id)
);
```

## Performance & Caching

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

## Theme System

### Themes Table
```sql
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER,
  css_content TEXT NOT NULL,
  is_public BOOLEAN DEFAULT 0,
  is_approved BOOLEAN DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### User Theme Preferences Table
```sql
CREATE TABLE IF NOT EXISTS user_theme_preferences (
  user_id INTEGER PRIMARY KEY,
  active_theme_id INTEGER,
  custom_css TEXT,
  preferences TEXT, -- JSON format for theme settings
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (active_theme_id) REFERENCES themes(id)
);
```

### Theme Ratings Table
```sql
CREATE TABLE IF NOT EXISTS theme_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(theme_id, user_id)
);
```

## Indexes for Performance

```sql
-- User lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_auth_provider_id ON users(auth_provider, auth_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Board lookup indexes
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON boards(created_by);
CREATE INDEX IF NOT EXISTS idx_boards_creator_username ON boards(creator_username);
CREATE INDEX IF NOT EXISTS idx_boards_slug ON boards(slug);
CREATE INDEX IF NOT EXISTS idx_boards_board_code ON boards(board_code);
CREATE INDEX IF NOT EXISTS idx_boards_is_public ON boards(is_public);

-- Cell lookup indexes
CREATE INDEX IF NOT EXISTS idx_cells_board_id ON cells(board_id);
CREATE INDEX IF NOT EXISTS idx_cells_board_row_col ON cells(board_id, row, col);

-- Session lookup indexes
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Chat lookup indexes
CREATE INDEX IF NOT EXISTS idx_board_chat_board_id ON board_chat(board_id);
CREATE INDEX IF NOT EXISTS idx_board_chat_created_at ON board_chat(created_at);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_board_visits_board_id ON board_visits(board_id);
CREATE INDEX IF NOT EXISTS idx_board_visits_created_at ON board_visits(created_at);
CREATE INDEX IF NOT EXISTS idx_board_interactions_board_id ON board_interactions(board_id);
```

## Database Relationships

- **Users** ← one-to-many → **Boards** (created_by)
- **Users** ← one-to-many → **Sessions** 
- **Boards** ← one-to-many → **Cells**
- **Boards** ← one-to-many → **Board Chat**
- **Boards** ← one-to-many → **Board Members**
- **Boards** ← one-to-many → **Board Resources**
- **Cells** ← one-to-many → **Cell History**
- **Cells** ← many-to-many → **Board Resources** (via Cell Resources)
- **Users** ← many-to-many → **Boards** (via Board Members)
- **Commands** ← one-to-many → **Command Votes** 