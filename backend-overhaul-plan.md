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

## Current Sprint: React Frontend Migration & API Optimization
### Goals:
- ✅ Remove JSON file dependencies, use SQLite as primary storage
- ✅ Implement cleaner URL structure: `/boards` for listing, `/<username>/<boardId>` for individual boards
- ✅ Add "Create Board" button to home page
- ✅ Improve UI/UX for board management
- ✅ Set server-created boards to use 'server' as username (configurable)
- 🔄 **NEW**: Migrate to React/TypeScript frontend with modern tooling
- 🔄 **NEW**: Optimize backend APIs for SPA integration
- 🔄 **NEW**: Implement proper API versioning and documentation

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
10. 🆕 **React Frontend Migration** - Complete overhaul to modern React/TypeScript stack

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

### 🆕 **Cell-Level Resource Integration**

#### Cell Resources Table
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

#### Cell Resource Summary Table (for performance)
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

#### Enhanced Board Resources Table
```sql
-- Add cell_scope column to existing board_resources table
ALTER TABLE board_resources ADD COLUMN cell_scope TEXT; -- JSON array of cell positions: [{"row": 0, "col": 1}, {"row": 2, "col": 3}]
ALTER TABLE board_resources ADD COLUMN auto_linked BOOLEAN DEFAULT 0; -- Whether resource was auto-linked by keywords
ALTER TABLE board_resources ADD COLUMN keyword_matches TEXT; -- JSON array of matched keywords that triggered auto-linking
```

### Cell-Level Resource Features

#### 1. **Direct Cell-Resource Linking**
- Users can attach resources directly to specific cells
- Support for multiple resources per cell with relevance scoring
- Primary resource designation for most important source per cell
- Rich notes/annotations for why a resource relates to a cell

#### 2. **Auto-Resource Linking**
- Keyword-based matching between cell content and resource titles/descriptions
- ML-based relevance scoring for automatic suggestions
- User approval workflow for auto-suggested links
- Confidence scoring for automated matches

#### 3. **Cell Resource Visualization**
- Visual indicators on cells with attached resources
- Resource count badges on cells
- Color coding based on resource verification status
- Expandable resource previews on cell hover/click

#### 4. **Cross-Cell Resource Analysis**
- Find resources that relate to multiple cells
- Identify cells without supporting resources
- Resource coverage heatmaps across the board
- Duplicate resource detection across cells

### Integration with Existing Features

#### **Chat Commands for Cell Resources**
```
/link <row> <col> <url> [notes] - Link a resource to a specific cell
/unlink <row> <col> <resource_id> - Remove resource from cell
/resources <row> <col> - Show all resources for a cell
/verify <row> <col> <resource_id> - Verify a cell's resource
/suggest <row> <col> - Get auto-suggested resources for a cell
/coverage - Show board resource coverage analysis
```

#### **Analytics Integration**
- Cell-level resource engagement metrics
- Most-resourced cells tracking
- Resource verification rates per cell
- User interaction with cell resources

#### **Board Settings Panel Integration**
```
⚙️ Board Settings
├── 📊 Statistics
│   ├── Resource Coverage Heatmap (by cell)
│   ├── Cell Verification Status
│   └── Resource Engagement per Cell
├── 📰 Resources
│   ├── Cell Resource Management
│   ├── Auto-Linking Configuration
│   ├── Resource Coverage Analysis
│   └── Missing Resource Detection
├── 🔧 Cell Resources Settings
│   ├── Auto-Link Sensitivity
│   ├── Keyword Management
│   ├── Verification Requirements
│   └── Resource Display Options
```

### API Endpoints for Cell Resources

#### Core Cell Resource Operations
```javascript
// Link resource to cell
POST /api/boards/:boardId/cells/:row/:col/resources
{
  "resourceId": 123,
  "relevanceScore": 0.95,
  "notes": "This article directly supports the claim in this cell",
  "isPrimary": true
}

// Get resources for a cell
GET /api/boards/:boardId/cells/:row/:col/resources
Response: {
  "resources": [
    {
      "id": 123,
      "title": "Supporting Article",
      "url": "https://example.com/article",
      "relevanceScore": 0.95,
      "isPrimary": true,
      "isVerified": true,
      "notes": "Direct evidence for this claim",
      "createdAt": "2024-01-01T00:00:00Z",
      "createdBy": "user123"
    }
  ],
  "summary": {
    "totalCount": 3,
    "verifiedCount": 2,
    "disputedCount": 0
  }
}

// Get suggested resources for a cell
GET /api/boards/:boardId/cells/:row/:col/suggested-resources
Response: {
  "suggestions": [
    {
      "resourceId": 456,
      "confidenceScore": 0.87,
      "matchedKeywords": ["election", "voting", "results"],
      "reason": "Keywords match cell content"
    }
  ]
}

// Get board resource coverage
GET /api/boards/:boardId/resource-coverage
Response: {
  "coverage": [
    [2, 0, 1, 3, 0],  // Resource counts per cell in grid format
    [1, 1, 0, 2, 1],
    [0, 0, 0, 1, 2]
  ],
  "summary": {
    "totalCells": 25,
    "resourcedCells": 15,
    "averageResourcesPerCell": 1.2,
    "coveragePercentage": 60
  }
}
```

### Frontend Integration (React Components)

#### **Cell Component Enhancement**
```typescript
// CellResource.tsx - Resource indicator component
interface CellResourceProps {
  cellId: string;
  resourceCount: number;
  verifiedCount: number;
  disputedCount: number;
  primaryResource?: Resource;
}

// ResourceIndicator.tsx - Visual indicator on cells
// Shows resource count badge, verification status, primary resource preview
```

#### **Cell Resource Panel**
```typescript
// CellResourcePanel.tsx - Detailed resource view for a cell
// Shows all resources, verification status, allows adding/removing
// Integrated with the board settings panel

// ResourceSuggestions.tsx - Auto-suggested resources for cells
// ML-powered suggestions based on cell content and board context
```

### Implementation Phases

#### **Phase 1: Core Cell-Resource Linking (Week 1)**
- Create database tables for cell resources
- Implement basic API endpoints for linking/unlinking
- Add resource indicators to cell components
- Create basic resource panel for cells

#### **Phase 2: Auto-Linking & Suggestions (Week 2)**
- Implement keyword-based resource matching
- Create suggestion algorithms
- Add approval workflow for auto-suggestions
- Implement confidence scoring system

#### **Phase 3: Advanced Features (Week 3)**
- Resource coverage analytics and heatmaps
- Chat commands for cell resource management
- Bulk resource operations
- Advanced filtering and search

#### **Phase 4: Integration & Polish (Week 4)**
- Integrate with existing analytics system
- Add to board settings panel
- Performance optimization
- User experience polish

### Use Cases & Benefits

#### **Political Bingo Board Example**
```
Cell A3: "Candidate mentions healthcare"
├── 📰 News Article: "Candidate's Healthcare Plan Announced"
├── 📊 Fact Check: "Healthcare Statistics Verification"
├── 🎥 Video: "Debate Clip - Healthcare Discussion"
└── 📄 Document: "Official Healthcare Policy Document"
```

#### **Research/Study Board**
```
Cell B2: "Hypothesis: X causes Y"
├── 📄 Research Paper: "Study on X-Y Correlation"
├── 📊 Data Set: "Raw Data Supporting Hypothesis"
├── 🔍 Meta-Analysis: "Review of X-Y Studies"
└── ❌ Counter-Evidence: "Study Showing No Correlation"
```

#### **Event Tracking Board**
```
Cell C1: "Feature X Released"
├── 📢 Announcement: "Official Feature Release Post"
├── 📸 Screenshot: "Feature X in Action"
├── 💬 User Feedback: "Community Reactions"
└── 🐛 Bug Reports: "Known Issues with Feature X"
```

### Advantages of Cell-Level Resources

1. **Granular Evidence**: Each claim/cell can have specific supporting evidence
2. **Better Fact-Checking**: Direct source verification for individual claims
3. **Research Organization**: Perfect for academic or investigative boards
4. **Evidence Trail**: Clear documentation of sources for each board element
5. **Collaborative Verification**: Users can contribute sources for specific claims
6. **Context Preservation**: Resources maintain direct connection to specific context
7. **Quality Control**: Cell-by-cell verification and dispute resolution

This cell-level resource system would transform bingo boards from simple tracking tools into comprehensive research and fact-checking platforms, making them incredibly powerful for collaborative information gathering and verification.

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

### ✅ COMPLETED: Backend Optimization & Infrastructure

#### Major Infrastructure Improvements:
1. **Comprehensive Validation Middleware** (`src/private/middleware/validation.js`):
   - Schema-based validation for users, boards, cells, and chat
   - Input sanitization and type checking
   - User ID and Board ID format validation
   - Pagination validation with proper limits
   - Built-in rate limiting functionality

2. **Database Helper Utilities** (`src/private/utils/databaseHelpers.js`):
   - Centralized database operations with error handling
   - Transaction support with proper rollback
   - Paginated query helpers
   - Record existence checking and counting
   - Automated logging for all database operations

3. **Enhanced Board Management** (`src/private/models/boardModel.js`):
   - Updated to use new user ID system (8-character random IDs)
   - Integrated with database helpers for cleaner code
   - Component-specific logging throughout
   - Improved error handling and validation
   - Proper transaction handling for complex operations

4. **Board Versioning System** (`src/private/services/versionService.js`):
   - Complete board snapshot creation and storage
   - Version history with automatic cleanup (50 versions max)
   - Revert functionality with backup creation
   - Comprehensive version management API
   - Optimized storage with JSON snapshots

5. **Database Schema Enhancements**:
   - Added `board_versions` table for versioning system
   - Updated all foreign keys to use new user ID system
   - Proper indexing and constraints for performance

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

### Frontend Status:
- **Current**: Vanilla HTML/CSS/JS with jQuery-style DOM manipulation
- **Issues**: Complex form state management, poor mobile experience, limited reusability
- **Migration Plan**: React/TypeScript with modern tooling (see `frontend-overhaul-plan.md`)
- **Target**: Modern SPA with real-time features and excellent UX

## Next Implementation Phases

### Phase 1: React Frontend Migration (PRIORITY)
**Status**: 🔄 IN PROGRESS
- **Week 1-2**: Setup React/TypeScript project with Vite, Tailwind CSS
- **Week 3-4**: Rebuild authentication system with proper form handling
- **Week 5-6**: Migrate board management and real-time features
- **Week 7**: Testing, optimization, and deployment
- **Benefits**: Modern UI/UX, better maintainability, type safety, improved performance
- **See**: `frontend-overhaul-plan.md` for detailed implementation plan

### Phase 2: API Optimization for SPA
**Status**: 🔄 PLANNED
- Implement proper API versioning (`/api/v1/`)
- Add comprehensive API documentation with OpenAPI/Swagger
- Optimize endpoints for React Query integration
- Implement proper CORS and security headers
- Add API rate limiting per endpoint
- Create type definitions generation for frontend

### Phase 3: Enhanced Image Management
- Create image upload service with Sharp.js
- Implement automatic thumbnail generation
- Add image validation and compression
- Create image gallery for boards

### Phase 4: Advanced User Profiles
- Implement user profile pages
- Add avatar upload and management
- Create user statistics and achievements
- Add user preference settings

### Phase 5: Board Access Controls & Collaboration
- Implement board permission levels
- Create invite system with shareable links
- Add password protection for boards
- Implement real-time collaboration features

### Phase 6: PWA & Offline Support
- Configure service workers
- Implement offline data caching
- Add push notifications
- Create background sync for offline actions

### Phase 7: Search & Discovery
- Implement full-text search for board content
- Create board categorization and tagging
- Add advanced filtering options
- Create board recommendation system

### Phase 8: Board Codes & Video Integration Backend
- **Board Code System** - Unique short codes for easy board access
- **Code Generation APIs** - Automatic code generation and validation
- **Video Integration** - Support for embedded video streams on boards
- **Board Settings Enhancement** - Video URL storage and management

### Phase 9: CLI Chat System with RBAC & Voting
- **Command System** - Chat-based command parsing and execution
- **Role-Based Access Control** - Configurable permissions per board
- **Voting System** - Democratic command execution with real-time voting
- **Command Audit** - Logging and history of all executed commands
- **Permission Templates** - Pre-configured permission sets for different board types

### Phase 10: Board Analytics & Statistics
- **Visit Tracking** - Comprehensive analytics for board usage
- **User Engagement Metrics** - Time spent, interactions, session data
- **Real-time Statistics** - Live dashboard with Highcharts integration
- **Historical Analytics** - Trend analysis and comparison tools
- **Performance Monitoring** - Board load times and user experience metrics

### Phase 11: Resources & News Integration
- **News Feed System** - RSS and API feed subscriptions per board
- **Resource Management** - Manual linking and categorization system
- **Fact-checking Integration** - Community validation and verification
- **Content Aggregation** - Automated news updates and filtering
- **Resource Search** - Advanced search and discovery features

## Chat Command System Specification

### Default Roles & Permissions
- **Owner** - Full access to all commands, can configure permissions
- **Moderator** - Can execute most commands, manage users (assigned by owner)
- **Member** - Can use basic commands, participate in votes
- **Viewer** - Can only view, limited command access

### Core Commands

#### `/watch <video_url>` - Video Control
- **Purpose**: Change or set the board's video stream
- **Arguments**: Video URL (YouTube, Twitch, direct stream)
- **Default Access**: Owner, Moderator
- **Voting**: Configurable (default: enabled for members)
- **Example**: `/watch https://youtube.com/watch?v=abc123`

#### `/theme <theme_name>` - Theme Control
- **Purpose**: Change board theme/appearance
- **Arguments**: Theme name or theme URL
- **Default Access**: Owner, Moderator
- **Voting**: Configurable (default: enabled for members)
- **Example**: `/theme dark-neon`

#### `/reset [type]` - Board Reset
- **Purpose**: Reset board state (all cells, marked cells, or specific areas)
- **Arguments**: Optional type ('all', 'marked', 'cells')
- **Default Access**: Owner only
- **Voting**: Configurable (default: disabled)
- **Example**: `/reset marked`

#### `/kick <user>` - User Management
- **Purpose**: Remove user from board
- **Arguments**: Username or user ID
- **Default Access**: Owner, Moderator
- **Voting**: Configurable (default: disabled)
- **Example**: `/kick @username`

#### `/role <user> <role>` - Role Management
- **Purpose**: Assign roles to users
- **Arguments**: Username and role name
- **Default Access**: Owner only
- **Voting**: Never (security)
- **Example**: `/role @username moderator`

#### `/mute <user> [duration]` - Moderation
- **Purpose**: Temporarily mute user in chat
- **Arguments**: Username, optional duration in minutes
- **Default Access**: Owner, Moderator
- **Voting**: Configurable (default: disabled)
- **Example**: `/mute @username 10`

#### `/lock` / `/unlock` - Board Control
- **Purpose**: Lock/unlock board editing
- **Arguments**: None
- **Default Access**: Owner, Moderator
- **Voting**: Configurable (default: enabled for members)
- **Example**: `/lock`

#### `/announce <message>` - Announcements
- **Purpose**: Send highlighted announcement to all users
- **Arguments**: Message text
- **Default Access**: Owner, Moderator
- **Voting**: Never
- **Example**: `/announce Game starting in 5 minutes!`

#### `/poll <question> [options]` - Polling
- **Purpose**: Create quick polls for users
- **Arguments**: Question and comma-separated options
- **Default Access**: Owner, Moderator, Member
- **Voting**: Never
- **Example**: `/poll What's next? Option A, Option B, Option C`

#### `/help [command]` - Help System
- **Purpose**: Show available commands and usage
- **Arguments**: Optional specific command
- **Default Access**: Everyone
- **Voting**: Never
- **Example**: `/help watch`

### Voting System Mechanics

#### Vote Initiation
1. User types command (e.g., `/watch https://youtube.com/watch?v=abc`)
2. System checks if command requires voting for user's role
3. If voting required, creates vote session with configurable duration
4. Sends vote notification to all eligible users

#### Vote UI Components
- **Vote Notification**: Floating notification with Yes/No buttons
- **Vote Progress**: Real-time vote count and progress bar
- **Vote History**: Log of recent votes and outcomes
- **Vote Settings**: Board owner can configure thresholds and duration

#### Vote Resolution
- **Approval**: Command executes when threshold reached (default 50%)
- **Rejection**: Command rejected if time expires or threshold not met
- **Tie-breaking**: Owner vote counts as 1.5x weight (configurable)

### Permission Configuration

#### Board-Level Settings
- Enable/disable specific commands
- Set voting requirements per command
- Configure vote thresholds (25%, 50%, 75%, unanimous)
- Set vote duration (30s, 1min, 5min, etc.)
- Define command cooldowns

#### Role-Based Permissions
- Assign commands to specific roles
- Override voting requirements per role
- Set command usage limits per role
- Configure role hierarchy and inheritance

### Command Examples in Practice

#### Scenario 1: Member wants to change video
```
Member: /watch https://twitch.tv/streamer123
System: 🗳️ @Member has called a vote to change video to "https://twitch.tv/streamer123"
System: React with ✅ or ❌ to vote (3 minutes remaining)
[Vote buttons appear for all users]
System: ✅ Vote passed! (4 yes, 1 no) Changing video...
```

#### Scenario 2: Owner resets board
```
Owner: /reset all
System: 🔄 Board reset by @Owner (all cells cleared)
```

#### Scenario 3: Moderator creates poll
```
Moderator: /poll Which theme looks better? Neon, Classic, Dark
System: 📊 Poll by @Moderator: "Which theme looks better?"
System: 1️⃣ Neon  2️⃣ Classic  3️⃣ Dark
[Poll interface appears with voting buttons]
```

## Board Settings Panel Specification

### Settings Menu Structure
```
⚙️ Board Settings
├── 📊 Statistics
│   ├── Visit Analytics (Highcharts)
│   ├── User Engagement Metrics
│   ├── Cell Completion Heatmap
│   └── Chat Activity Timeline
├── 📰 Resources
│   ├── News Feed Management
│   ├── Manual Resource Links
│   ├── Fact-checking Queue
│   └── Category Management
├── 🔧 General Settings
│   ├── Board Information
│   ├── Privacy & Access Control
│   ├── Video Integration
│   └── Theme & Appearance
├── 👥 Roles & Permissions
│   ├── User Role Management
│   ├── Command Permissions
│   ├── Voting Configuration
│   └── Moderation Settings
└── 📋 Audit Log
    ├── Command History
    ├── User Actions
    └── System Events
```

## Analytics & Statistics Features

### Visit Tracking Metrics
- **Total Visits**: Unique and returning visitors
- **Auth Type Breakdown**: Anonymous vs authenticated users
- **Session Duration**: Average time spent on board
- **Peak Concurrency**: Maximum simultaneous users
- **Geographic Data**: Visitor locations (if privacy allows)
- **Device Analytics**: Desktop vs mobile usage

### User Engagement Analytics
- **Interaction Heatmap**: Most active board areas
- **Cell Completion Rate**: Which cells get marked most
- **Chat Participation**: Message frequency and user activity
- **Command Usage**: Most used chat commands
- **Vote Participation**: Voting engagement rates

### Highcharts Visualizations
- **Line Charts**: Visit trends over time
- **Bar Charts**: Auth type comparisons
- **Heatmaps**: Board interaction patterns
- **Pie Charts**: User role distributions
- **Area Charts**: Cumulative engagement metrics

## Resources & News Integration

### News Feed Sources
- **RSS Feeds**: Automatic article aggregation
- **API Integration**: News APIs (NewsAPI, Guardian, etc.)
- **Manual Curation**: Board moderators add resources
- **Community Contributions**: Users submit relevant links

### Resource Management
- **Categorization**: Custom categories per board
- **Tagging System**: Flexible tag-based organization
- **Relevance Scoring**: AI/manual scoring for board relevance
- **Verification System**: Community fact-checking

### News Display Below Board
```
┌─────────────────────────────────┐
│         Bingo Board             │
│    [5x5 grid of cells]         │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 📰 Latest News & Resources      │
│ ┌─────────────────────────────┐ │
│ │ 🔴 BREAKING: News Title    │ │
│ │ Source: CNN • 2 min ago     │ │
│ │ ✅ Verified by community    │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 📊 Fact Check: Claim XYZ   │ │
│ │ Source: FactCheck.org       │ │
│ │ ❓ Needs verification       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Fact-Checking Features
- **Verification Queue**: Resources awaiting fact-check
- **Community Verification**: Users can verify/dispute
- **Evidence Linking**: Supporting documentation
- **Credibility Scores**: Source reliability ratings
- **Dispute Resolution**: Moderated fact-checking process

### Resource Categories (Examples for Political Board)
- 🗳️ **Election Updates**: Voting, results, procedures
- 📊 **Polls & Surveys**: Latest polling data
- 🏛️ **Policy Changes**: New legislation, executive orders
- ⚖️ **Legal Developments**: Court cases, legal analysis
- 📺 **Media Coverage**: News articles, video reports
- 🔍 **Fact Checks**: Verified claims and debunks
- 📈 **Economic Data**: Financial markets, employment
- 🌍 **International**: Foreign policy, global events

### News Feed Algorithms
- **Relevance Filtering**: Match keywords to board content
- **Recency Weighting**: Prioritize recent updates
- **Source Diversity**: Balance different news sources
- **User Preferences**: Customizable feed priorities
- **Spam Detection**: Filter out irrelevant content

### Integration with Chat Commands
```
/news add <url> [category] - Add manual resource
/news verify <id> - Verify a resource
/news dispute <id> <reason> - Dispute a resource
/news feeds - Show active news sources
/news search <query> - Search resources
```

  ### Phase 12: Advanced Theme System Backend
- **Theme Storage** - Database tables for custom themes
- **Theme API** - CRUD operations for theme management
- **File Upload** - CSS theme file upload and validation
- **Theme Sharing** - Public theme gallery with ratings
- **Theme Security** - CSS sanitization and validation
- **Per-User Themes** - User theme preferences and defaults

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

### Board Codes Enhancement
Update the existing `boards` table to include:
```sql
-- Add board code column to existing boards table
ALTER TABLE boards ADD COLUMN board_code TEXT UNIQUE;
ALTER TABLE boards ADD COLUMN video_url TEXT;
ALTER TABLE boards ADD COLUMN video_type TEXT; -- 'youtube', 'twitch', 'custom'
```

### Board Codes Table (Alternative approach)
```sql
CREATE TABLE IF NOT EXISTS board_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP, -- Optional expiration
  usage_count INTEGER DEFAULT 0,
  max_uses INTEGER, -- Optional usage limit
  FOREIGN KEY (board_id) REFERENCES boards(id)
);
```

### Chat Commands System Tables

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

### Board Analytics Tables

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

### Resources & News Tables

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

### 🆕 **Cell-Level Resource Integration**

#### Cell Resources Table
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

#### Cell Resource Summary Table (for performance)
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

#### Enhanced Board Resources Table
```sql
-- Add cell_scope column to existing board_resources table
ALTER TABLE board_resources ADD COLUMN cell_scope TEXT; -- JSON array of cell positions: [{"row": 0, "col": 1}, {"row": 2, "col": 3}]
ALTER TABLE board_resources ADD COLUMN auto_linked BOOLEAN DEFAULT 0; -- Whether resource was auto-linked by keywords
ALTER TABLE board_resources ADD COLUMN keyword_matches TEXT; -- JSON array of matched keywords that triggered auto-linking
```

### Cell-Level Resource Features

#### 1. **Direct Cell-Resource Linking**
- Users can attach resources directly to specific cells
- Support for multiple resources per cell with relevance scoring
- Primary resource designation for most important source per cell
- Rich notes/annotations for why a resource relates to a cell

#### 2. **Auto-Resource Linking**
- Keyword-based matching between cell content and resource titles/descriptions
- ML-based relevance scoring for automatic suggestions
- User approval workflow for auto-suggested links
- Confidence scoring for automated matches

#### 3. **Cell Resource Visualization**
- Visual indicators on cells with attached resources
- Resource count badges on cells
- Color coding based on resource verification status
- Expandable resource previews on cell hover/click

#### 4. **Cross-Cell Resource Analysis**
- Find resources that relate to multiple cells
- Identify cells without supporting resources
- Resource coverage heatmaps across the board
- Duplicate resource detection across cells

### Integration with Existing Features

#### **Chat Commands for Cell Resources**
```
/link <row> <col> <url> [notes] - Link a resource to a specific cell
/unlink <row> <col> <resource_id> - Remove resource from cell
/resources <row> <col> - Show all resources for a cell
/verify <row> <col> <resource_id> - Verify a cell's resource
/suggest <row> <col> - Get auto-suggested resources for a cell
/coverage - Show board resource coverage analysis
```

#### **Analytics Integration**
- Cell-level resource engagement metrics
- Most-resourced cells tracking
- Resource verification rates per cell
- User interaction with cell resources

#### **Board Settings Panel Integration**
```
⚙️ Board Settings
├── 📊 Statistics
│   ├── Resource Coverage Heatmap (by cell)
│   ├── Cell Verification Status
│   └── Resource Engagement per Cell
├── 📰 Resources
│   ├── Cell Resource Management
│   ├── Auto-Linking Configuration
│   ├── Resource Coverage Analysis
│   └── Missing Resource Detection
├── 🔧 Cell Resources Settings
│   ├── Auto-Link Sensitivity
│   ├── Keyword Management
│   ├── Verification Requirements
│   └── Resource Display Options
```

### API Endpoints for Cell Resources

#### Core Cell Resource Operations
```javascript
// Link resource to cell
POST /api/boards/:boardId/cells/:row/:col/resources
{
  "resourceId": 123,
  "relevanceScore": 0.95,
  "notes": "This article directly supports the claim in this cell",
  "isPrimary": true
}

// Get resources for a cell
GET /api/boards/:boardId/cells/:row/:col/resources
Response: {
  "resources": [
    {
      "id": 123,
      "title": "Supporting Article",
      "url": "https://example.com/article",
      "relevanceScore": 0.95,
      "isPrimary": true,
      "isVerified": true,
      "notes": "Direct evidence for this claim",
      "createdAt": "2024-01-01T00:00:00Z",
      "createdBy": "user123"
    }
  ],
  "summary": {
    "totalCount": 3,
    "verifiedCount": 2,
    "disputedCount": 0
  }
}

// Get suggested resources for a cell
GET /api/boards/:boardId/cells/:row/:col/suggested-resources
Response: {
  "suggestions": [
    {
      "resourceId": 456,
      "confidenceScore": 0.87,
      "matchedKeywords": ["election", "voting", "results"],
      "reason": "Keywords match cell content"
    }
  ]
}

// Get board resource coverage
GET /api/boards/:boardId/resource-coverage
Response: {
  "coverage": [
    [2, 0, 1, 3, 0],  // Resource counts per cell in grid format
    [1, 1, 0, 2, 1],
    [0, 0, 0, 1, 2]
  ],
  "summary": {
    "totalCells": 25,
    "resourcedCells": 15,
    "averageResourcesPerCell": 1.2,
    "coveragePercentage": 60
  }
}
```

### Frontend Integration (React Components)

#### **Cell Component Enhancement**
```typescript
// CellResource.tsx - Resource indicator component
interface CellResourceProps {
  cellId: string;
  resourceCount: number;
  verifiedCount: number;
  disputedCount: number;
  primaryResource?: Resource;
}

// ResourceIndicator.tsx - Visual indicator on cells
// Shows resource count badge, verification status, primary resource preview
```

#### **Cell Resource Panel**
```typescript
// CellResourcePanel.tsx - Detailed resource view for a cell
// Shows all resources, verification status, allows adding/removing
// Integrated with the board settings panel

// ResourceSuggestions.tsx - Auto-suggested resources for cells
// ML-powered suggestions based on cell content and board context
```

### Implementation Phases

#### **Phase 1: Core Cell-Resource Linking (Week 1)**
- Create database tables for cell resources
- Implement basic API endpoints for linking/unlinking
- Add resource indicators to cell components
- Create basic resource panel for cells

#### **Phase 2: Auto-Linking & Suggestions (Week 2)**
- Implement keyword-based resource matching
- Create suggestion algorithms
- Add approval workflow for auto-suggestions
- Implement confidence scoring system

#### **Phase 3: Advanced Features (Week 3)**
- Resource coverage analytics and heatmaps
- Chat commands for cell resource management
- Bulk resource operations
- Advanced filtering and search

#### **Phase 4: Integration & Polish (Week 4)**
- Integrate with existing analytics system
- Add to board settings panel
- Performance optimization
- User experience polish

### Use Cases & Benefits

#### **Political Bingo Board Example**
```
Cell A3: "Candidate mentions healthcare"
├── 📰 News Article: "Candidate's Healthcare Plan Announced"
├── 📊 Fact Check: "Healthcare Statistics Verification"
├── 🎥 Video: "Debate Clip - Healthcare Discussion"
└── 📄 Document: "Official Healthcare Policy Document"
```

#### **Research/Study Board**
```
Cell B2: "Hypothesis: X causes Y"
├── 📄 Research Paper: "Study on X-Y Correlation"
├── 📊 Data Set: "Raw Data Supporting Hypothesis"
├── 🔍 Meta-Analysis: "Review of X-Y Studies"
└── ❌ Counter-Evidence: "Study Showing No Correlation"
```

#### **Event Tracking Board**
```
Cell C1: "Feature X Released"
├── 📢 Announcement: "Official Feature Release Post"
├── 📸 Screenshot: "Feature X in Action"
├── 💬 User Feedback: "Community Reactions"
└── 🐛 Bug Reports: "Known Issues with Feature X"
```

### Advantages of Cell-Level Resources

1. **Granular Evidence**: Each claim/cell can have specific supporting evidence
2. **Better Fact-Checking**: Direct source verification for individual claims
3. **Research Organization**: Perfect for academic or investigative boards
4. **Evidence Trail**: Clear documentation of sources for each board element
5. **Collaborative Verification**: Users can contribute sources for specific claims
6. **Context Preservation**: Resources maintain direct connection to specific context
7. **Quality Control**: Cell-by-cell verification and dispute resolution

This cell-level resource system would transform bingo boards from simple tracking tools into comprehensive research and fact-checking platforms, making them incredibly powerful for collaborative information gathering and verification.

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