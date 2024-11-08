const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Get log level from environment variable, default to INFO
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= currentLogLevel;
}

function formatMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
  return `[${timestamp}] ${level}: ${message}${dataStr}\n`;
}

function writeToFile(message) {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `${date}.log`);
  fs.appendFileSync(logFile, message);
}

function log(level, message, data = null) {
  if (!shouldLog(level)) return;
  const formattedMessage = formatMessage(level, message, data);
  console.log(formattedMessage);
  writeToFile(formattedMessage);
}

module.exports = {
  error: (message, data) => log('ERROR', message, data),
  warn: (message, data) => log('WARN', message, data),
  info: (message, data) => log('INFO', message, data),
  debug: (message, data) => log('DEBUG', message, data)
}; 