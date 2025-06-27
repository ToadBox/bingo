const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// ANSI color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Component colors for easy identification
const COMPONENT_COLORS = {
  'Server': COLORS.blue,
  'Auth': COLORS.green,
  'Database': COLORS.magenta,
  'WebSocket': COLORS.cyan,
  'Discord': COLORS.yellow,
  'API': COLORS.white,
  'Board': COLORS.green,
  'User': COLORS.cyan,
  'Chat': COLORS.yellow,
  'Image': COLORS.magenta,
  'Admin': COLORS.red,
  'Config': COLORS.gray,
  'Migration': COLORS.blue,
  'Frontend': COLORS.cyan,
  'React': COLORS.cyan
};

// Level colors
const LEVEL_COLORS = {
  ERROR: COLORS.red,
  WARN: COLORS.yellow,
  INFO: COLORS.green,
  DEBUG: COLORS.gray
};

const isDevelopment = process.env.NODE_ENV !== 'production';
const defaultLogLevel = isDevelopment ? 'DEBUG' : 'INFO';
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || defaultLogLevel];

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

function formatTimestamp() {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric' 
  });
  const time = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  return `${date} ${time}`;
}

function formatMessage(level, message, data = null, component = 'Server') {
  const timestamp = formatTimestamp();
  const isoTimestamp = new Date().toISOString();
  
  // Console format with colors (always)
    const componentColor = COMPONENT_COLORS[component] || COLORS.white;
    const levelColor = LEVEL_COLORS[level] || COLORS.white;
    
  let consoleMessage = `${componentColor}[${component}]${COLORS.reset}` +
                    `${COLORS.gray}[${timestamp}]${COLORS.reset}` +
                    `${levelColor}[${level}]${COLORS.reset} ` +
                    `${message}`;
    
    if (data) {
      if (data.req) {
        const reqInfo = {
          ip: data.req.ip || data.req.connection?.remoteAddress || '-',
          method: data.req.method || '-',
          path: data.req.path || '-',
          status: data.status || '-'
        };
        consoleMessage += ` ${COLORS.dim}(${reqInfo.ip} ${reqInfo.method} ${reqInfo.path} ${reqInfo.status})${COLORS.reset}`;
      } else {
        consoleMessage += ` ${COLORS.dim}${JSON.stringify(data)}${COLORS.reset}`;
    }
  }
  
  // File format (always plain text for logs)
  const fileMessage = `[${component}][${isoTimestamp}][${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
  
  return { consoleMessage, fileMessage };
}

function log(level, message, data = null, component = 'Server') {
  if (LOG_LEVELS[level] <= currentLogLevel) {
    const formatted = formatMessage(level, message, data, component);
    console.log(formatted.consoleMessage);
    
    // Write to file
    const logFile = path.join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, formatted.fileMessage + '\n');
  }
}

// Create loggers for different components
function createComponentLogger(component) {
  return {
    error: (message, data) => log('ERROR', message, data, component),
    warn: (message, data) => log('WARN', message, data, component),
    info: (message, data) => log('INFO', message, data, component),
    debug: (message, data) => log('DEBUG', message, data, component)
  };
}

// Default logger (Server component)
const defaultLogger = {
  error: (message, data) => log('ERROR', message, data, 'Server'),
  warn: (message, data) => log('WARN', message, data, 'Server'),
  info: (message, data) => log('INFO', message, data, 'Server'),
  debug: (message, data) => log('DEBUG', message, data, 'Server'),
  
  // Component-specific loggers
  auth: createComponentLogger('Auth'),
  database: createComponentLogger('Database'),
  websocket: createComponentLogger('WebSocket'),
  discord: createComponentLogger('Discord'),
  api: createComponentLogger('API'),
  board: createComponentLogger('Board'),
  user: createComponentLogger('User'),
  chat: createComponentLogger('Chat'),
  image: createComponentLogger('Image'),
  admin: createComponentLogger('Admin'),
  config: createComponentLogger('Config'),
  migration: createComponentLogger('Migration'),
  frontend: createComponentLogger('Frontend'),
  react: createComponentLogger('React')
};

module.exports = defaultLogger; 