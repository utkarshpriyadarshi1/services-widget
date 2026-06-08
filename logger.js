const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let logFilePath = '';

function initLogger() {
  try {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFilePath = path.join(logsDir, 'app.log');
    
    // Rotate log file if it exceeds 5MB
    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > 5 * 1024 * 1024) {
        fs.renameSync(logFilePath, path.join(logsDir, 'app.old.log'));
      }
    }
    
    writeLog('INFO', 'Logger initialized.');
    writeLog('INFO', `Log file path: ${logFilePath}`);
  } catch (err) {
    console.error('Failed to initialize logger:', err);
  }
}

function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  
  // Mirror to console in development
  console.log(logLine.trim());
  
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, logLine);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }
}

function logInfo(message) {
  writeLog('INFO', message);
}

function logWarn(message) {
  writeLog('WARN', message);
}

function logError(message, error) {
  const errDetail = error ? ` - ${error.stack || error.message || error}` : '';
  writeLog('ERROR', `${message}${errDetail}`);
}

module.exports = {
  initLogger,
  logInfo,
  logWarn,
  logError,
  getLogPath: () => logFilePath
};
