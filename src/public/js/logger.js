class Logger {
  static LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
  };

  static formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      data
    };
  }

  static async sendToServer(logData) {
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

  static error(message, data = null) {
    const logData = this.formatMessage(this.LEVELS.ERROR, message, data);
    console.error(`[${logData.timestamp}] ${message}`, data || '');
    this.sendToServer(logData);
  }

  static warn(message, data = null) {
    const logData = this.formatMessage(this.LEVELS.WARN, message, data);
    console.warn(`[${logData.timestamp}] ${message}`, data || '');
    this.sendToServer(logData);
  }

  static info(message, data = null) {
    const logData = this.formatMessage(this.LEVELS.INFO, message, data);
    console.info(`[${logData.timestamp}] ${message}`, data || '');
    this.sendToServer(logData);
  }

  static debug(message, data = null) {
    const logData = this.formatMessage(this.LEVELS.DEBUG, message, data);
    console.debug(`[${logData.timestamp}] ${message}`, data || '');
    this.sendToServer(logData);
  }
}

export default Logger; 