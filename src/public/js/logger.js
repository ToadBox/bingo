class Logger {
  static LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  };

  static currentLevel = Logger.LEVELS[
    window.localStorage.getItem('logLevel') || 
    (window.location.hostname === 'localhost' ? 'DEBUG' : 'INFO')
  ];

  static formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    
    // For INFO level, only include basic details
    if (level === 'INFO') {
      return {
        timestamp,
        level,
        message,
        path: window.location.pathname
      };
    }
    
    // For other levels, include full data
    return {
      timestamp,
      level,
      message,
      data,
      path: window.location.pathname
    };
  }

  static shouldLog(level) {
    return this.LEVELS[level] <= this.currentLevel;
  }

  static async sendToServer(logData) {
    if (window.location.hostname !== 'localhost') {
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logData)
        });
      } catch (error) {
        console.error('Failed to send log to server:', error);
      }
    }
  }

  static log(level, message, data = null) {
    if (!this.shouldLog(level)) return;
    const logData = this.formatMessage(level, message, data);
    const consoleMsg = `[${logData.timestamp}] ${level}: ${message}`;
    
    switch (level) {
      case 'ERROR':
        console.error(consoleMsg, data || '');
        break;
      case 'WARN':
        console.warn(consoleMsg, data || '');
        break;
      case 'INFO':
        console.info(consoleMsg);
        break;
      case 'DEBUG':
        console.debug(consoleMsg, data || '');
        break;
    }
    
    this.sendToServer(logData);
  }

  static error(message, data = null) { this.log('ERROR', message, data); }
  static warn(message, data = null) { this.log('WARN', message, data); }
  static info(message, data = null) { this.log('INFO', message, data); }
  static debug(message, data = null) { this.log('DEBUG', message, data); }

  static setLogLevel(level) {
    if (this.LEVELS.hasOwnProperty(level)) {
      this.currentLevel = this.LEVELS[level];
      window.localStorage.setItem('logLevel', level);
    }
  }
}

export default Logger; 