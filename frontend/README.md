# ToadBox Bingo Frontend

Modern React frontend for the ToadBox Bingo application, built with TypeScript, Vite, and Tailwind CSS.

## Features

- **Modern React 18** with TypeScript for type safety
- **Vite** for fast development and building
- **Tailwind CSS** for modern, responsive styling
- **React Query** for server state management
- **React Hook Form** with Zod validation
- **React Router v6** for client-side routing
- **Dark/Light theme** support
- **Authentication** with multiple methods (site password, local accounts, OAuth)
- **Real-time updates** via WebSocket integration

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3001`

3. **Make sure the backend is running** at `http://localhost:3000` for API proxy to work.

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (Button, Input, etc.)
│   ├── forms/          # Form components
│   ├── layout/         # Layout components
│   └── auth/           # Authentication components
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── services/           # API service layer
├── contexts/           # React contexts
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── styles/             # Global styles and theme
```

## Key Improvements Over Vanilla Frontend

### 1. **Improved Login Experience**
- Clean tabbed interface for different login methods
- Proper form validation with immediate feedback
- Better loading states and error handling
- Responsive design that works on all devices

### 2. **Type Safety**
- Full TypeScript coverage
- API response type checking
- Runtime validation with Zod schemas

### 3. **Modern Development Experience**
- Hot reload for instant feedback
- ESLint and Prettier for code quality
- Component-based architecture
- Reusable UI components

### 4. **Performance**
- Code splitting and lazy loading
- Optimized bundle sizes
- React Query for efficient data fetching
- Proper caching strategies

### 5. **Accessibility**
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatibility
- High contrast theme support

## Integration with Backend

The frontend communicates with the backend via:

- **REST API** calls to `/api/*` endpoints
- **WebSocket** connection for real-time updates
- **Cookie-based authentication** for session management

API calls are automatically proxied to `http://localhost:3000` during development.

## Authentication Flow

1. **Site Password** - Quick anonymous access
2. **Local Accounts** - Email/password registration and login
3. **OAuth** - Google and Discord integration (when configured)

All authentication state is managed by the `AuthContext` with automatic token refresh and secure logout.

## Deployment

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Serve the built files** from the `dist/` directory with your web server.

3. **Configure API proxy** in production to forward `/api/*` requests to your backend server.

## Development Status

This is the initial implementation focusing on:

✅ **Phase 1: Foundation Setup**
- Project structure and configuration
- Core infrastructure (routing, API client, auth)
- Design system foundations
- Basic authentication pages

🔄 **Phase 2: Authentication System** (Next)
- Complete login/register forms with validation
- OAuth integration
- Protected routes and auth guards

📋 **Phase 3: Board Management** (Planned)
- Board listing and creation
- Real-time board interactions
- Chat system integration

📋 **Phase 4: Advanced Features** (Planned)
- PWA capabilities
- Offline support
- Admin interface
- Performance optimizations

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new components
3. Include proper error handling and loading states
4. Test responsive design on mobile devices
5. Ensure accessibility standards are met 