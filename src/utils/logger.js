/**
 * Logger utility with in-memory log storage for web UI
 */

const MAX_LOGS = 200; // Keep last 200 logs
const logs = [];
const listeners = new Set();

// Store current QR code
let currentQR = null;

/**
 * Log levels
 */
const LEVELS = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  DEBUG: 'debug'
};

/**
 * Add a log entry
 */
function addLog(level, message, data = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  };

  logs.push(logEntry);

  // Keep only last MAX_LOGS entries
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  // Notify all listeners
  notifyListeners(logEntry);

  // Also log to console with color
  const consoleMethod = level === 'error' ? console.error : console.log;
  consoleMethod(`[${level.toUpperCase()}]`, message, data || '');
}

/**
 * Convenience methods
 */
function info(message, data) {
  addLog(LEVELS.INFO, message, data);
}

function success(message, data) {
  addLog(LEVELS.SUCCESS, message, data);
}

function warning(message, data) {
  addLog(LEVELS.WARNING, message, data);
}

function error(message, data) {
  addLog(LEVELS.ERROR, message, data);
}

function debug(message, data) {
  addLog(LEVELS.DEBUG, message, data);
}

/**
 * Get all logs
 */
function getLogs(limit = MAX_LOGS) {
  return logs.slice(-limit);
}

/**
 * Clear all logs
 */
function clearLogs() {
  logs.length = 0;
  notifyListeners({ type: 'clear' });
}

/**
 * Add a listener for new logs
 */
function addListener(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Notify all listeners
 */
function notifyListeners(logEntry) {
  listeners.forEach(listener => {
    try {
      listener(logEntry);
    } catch (err) {
      console.error('Error in log listener:', err);
    }
  });
}

/**
 * Store QR code
 */
function setQRCode(qr) {
  currentQR = qr;
  addLog(LEVELS.INFO, '📱 QR Code Generated - Scan with WhatsApp');
  notifyListeners({ type: 'qr', qr });
}

/**
 * Clear QR code
 */
function clearQRCode() {
  currentQR = null;
  notifyListeners({ type: 'qr', qr: null });
}

/**
 * Get current QR code
 */
function getQRCode() {
  return currentQR;
}

module.exports = {
  LEVELS,
  info,
  success,
  warning,
  error,
  debug,
  getLogs,
  clearLogs,
  addListener,
  setQRCode,
  clearQRCode,
  getQRCode
};
