// Frontend logger that matches backend style
interface LogData {
  [key: string]: any;
}

// Colors for browser console
const COLORS = {
  reset: '',
  blue: 'color: #3b82f6',
  green: 'color: #10b981',
  yellow: 'color: #f59e0b',
  red: 'color: #ef4444',
  cyan: 'color: #06b6d4',
  magenta: 'color: #8b5cf6',
  gray: 'color: #6b7280',
  white: 'color: #ffffff'
};

// Component colors
const COMPONENT_COLORS = {
  'React': COLORS.cyan,
  'Auth': COLORS.green,
  'API': COLORS.white,
  'Board': COLORS.green,
  'User': COLORS.cyan,
  'Chat': COLORS.yellow,
  'UI': COLORS.blue,
  'Router': COLORS.magenta,
  'WebSocket': COLORS.cyan,
  'Storage': COLORS.gray
};

// Level colors
const LEVEL_COLORS = {
  ERROR: COLORS.red,
  WARN: COLORS.yellow,
  INFO: COLORS.green,
  DEBUG: COLORS.gray
};

class FrontendLogger {
  private isDevelopment = (import.meta as any).env?.DEV || false;
  private shouldLog = this.isDevelopment || (import.meta as any).env?.VITE_ENABLE_LOGGING === 'true';

  private formatTimestamp(): string {
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

  private log(level: string, message: string, data?: LogData, component = 'React') {
    if (!this.shouldLog) return;

    const timestamp = this.formatTimestamp();
    const componentColor = (COMPONENT_COLORS as any)[component] || COLORS.white;
    const levelColor = (LEVEL_COLORS as any)[level] || COLORS.white;

    if (typeof window !== 'undefined' && window.console) {
      // Browser console with colors
      const styles = [
        componentColor,
        'color: #6b7280',
        levelColor,
        'color: inherit'
      ];

      let logMessage = `%c[${component}]%c[${timestamp}]%c[${level}]%c ${message}`;
      const args = [logMessage, ...styles];

      if (data) {
        args.push('\n', data);
      }

      switch (level) {
        case 'ERROR':
          console.error(...args);
          break;
        case 'WARN':
          console.warn(...args);
          break;
        case 'DEBUG':
          console.debug(...args);
          break;
        default:
          console.log(...args);
      }
    }
  }

  // Component-specific loggers
  createComponentLogger(component: string) {
    return {
      error: (message: string, data?: LogData) => this.log('ERROR', message, data, component),
      warn: (message: string, data?: LogData) => this.log('WARN', message, data, component),
      info: (message: string, data?: LogData) => this.log('INFO', message, data, component),
      debug: (message: string, data?: LogData) => this.log('DEBUG', message, data, component)
    };
  }

  // Default logger methods
  error(message: string, data?: LogData) {
    this.log('ERROR', message, data, 'React');
  }

  warn(message: string, data?: LogData) {
    this.log('WARN', message, data, 'React');
  }

  info(message: string, data?: LogData) {
    this.log('INFO', message, data, 'React');
  }

  debug(message: string, data?: LogData) {
    this.log('DEBUG', message, data, 'React');
  }

  // Component loggers
  auth = this.createComponentLogger('Auth');
  api = this.createComponentLogger('API');
  board = this.createComponentLogger('Board');
  user = this.createComponentLogger('User');
  chat = this.createComponentLogger('Chat');
  ui = this.createComponentLogger('UI');
  router = this.createComponentLogger('Router');
  websocket = this.createComponentLogger('WebSocket');
  storage = this.createComponentLogger('Storage');
}

export const logger = new FrontendLogger(); 