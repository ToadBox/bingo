# ToadBox Bingo

A customizable bingo board site with real-time collaboration features.

## Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bingo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

The server will automatically:
- ✅ Check for missing configuration files
- ✅ Create `config.yml` with default settings if missing
- ✅ Create `.env` with default environment variables if missing
- ✅ Create required directories if missing
- ✅ Initialize the database
- ✅ Start the web server

### First Run

On first run, the application will create default configuration files:

- **`config.yml`** - Site configuration (themes, board settings, etc.)
- **`.env`** - Environment variables (passwords, API keys, etc.)

**Important:** After the first run, please review and update the `.env` file with your specific configuration values, especially:
- `SITE_PASSWORD` - Password for anonymous site access
- `ADMIN_PASSWORD` - Password for admin panel access
- `SESSION_SECRET` - Secret for session encryption
- `ROOT_ADMIN_PASSWORD` - Password for root admin account

## Configuration

### Site Password Login

The application supports anonymous access using a site-wide password. Users who enter the correct site password will be automatically approved and can access the bingo boards without needing individual accounts.

### Admin Access

- **Admin Panel**: `/admin` - Access with `ADMIN_PASSWORD`
- **Root Admin**: Created automatically with `ROOT_ADMIN_PASSWORD`

### Environment Variables

Key environment variables (see `.env` file for complete list):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `SITE_PASSWORD` | Password for anonymous access | `your_site_password_here` |
| `ADMIN_PASSWORD` | Admin panel password | `admin` |
| `SESSION_SECRET` | Session encryption secret | `your_session_secret_here` |
| `BOARD_MODE` | Board mode (unified/individual) | `unified` |

## Development

### Development Mode
```bash
npm run dev
```

### Testing
```bash
# Test startup configuration
node test-startup.js

# Run API tests
npm run test
```

## Features

- ✅ **Anonymous Access** - Site password login for quick access
- ✅ **Real-time Collaboration** - WebSocket-based live updates
- ✅ **Multiple Themes** - Light, dark, and high-contrast themes
- ✅ **Admin Panel** - User management and site administration
- ✅ **Discord Integration** - OAuth login and bot commands
- ✅ **Image Support** - Upload and manage board images
- ✅ **Chat System** - Real-time board chat
- ✅ **Notifications** - User and admin notifications

## Troubleshooting

### Site Password Login Issues

If users get stuck on the "pending approval" screen after using the site password:

1. **Check Configuration**: Ensure `SITE_PASSWORD` is set correctly in `.env`
2. **Database Reset**: If the issue persists, the database may need to be reset
3. **Logs**: Check server logs for authentication errors

### Configuration Issues

If configuration files are missing or corrupted:

1. **Delete and Restart**: Delete `config.yml` and `.env`, then restart the server
2. **Manual Creation**: The server will automatically recreate them with defaults
3. **Review Settings**: Update the generated files with your specific values

## License

[Add your license information here] 