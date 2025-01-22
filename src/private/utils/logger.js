const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const isDevelopment = process.env.NODE_ENV !== 'production';
const defaultLogLevel = isDevelopment ? 'DEBUG' : 'INFO';
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || defaultLogLevel];

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

function formatMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  
  if (data?.req) {
    const reqInfo = {
      ip: data.req.ip || data.req.connection?.remoteAddress || '-',
      method: data.req.method || '-',
      path: data.req.path || '-',
      status: data.status || '-'
    };
    return `[${timestamp}] ${level}: ${message} (${reqInfo.ip} ${reqInfo.method} ${reqInfo.path} ${reqInfo.status})`;
  }
  
  return `[${timestamp}] ${level}: ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
}

function log(level, message, data = null) {
  if (LOG_LEVELS[level] <= currentLogLevel) {
    const formattedMessage = formatMessage(level, message, data);
    console.log(formattedMessage);
    fs.appendFileSync(path.join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.log`), formattedMessage + '\n');
  }
}

module.exports = {
  error: (message, data) => log('ERROR', message, data),
  warn: (message, data) => log('WARN', message, data),
  info: (message, data) => log('INFO', message, data),
  debug: (message, data) => log('DEBUG', message, data)
}; 