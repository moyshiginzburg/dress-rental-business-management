/**
 * Activity Logger Service
 * 
 * Purpose: Centralized logging service for tracking all system activity.
 * Logs user actions, errors, and system events to local log files.
 * 
 * Operation: Provides functions to log different types of events,
 * written to files for easy debugging and monitoring.
 * 
 * Log Files:
 * - logs/YYYY-MM-DD.log: Daily log file with all activities
 * - logs/errors.log: Recent errors only (last 1000 lines kept)
 * - logs/combined.log: Combined log (rotated when > 10MB)
 */

import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const LOGS_DIR = join(PROJECT_ROOT, 'local_data', 'logs');

// Ensure logs directory exists
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

// Log level colors for console (optional)
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
};

/**
 * Get current date string for daily log file
 */
function getDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Get formatted timestamp for log entries
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Format log entry for file
 */
function formatLogEntry(level, category, action, data) {
  const timestamp = getTimestamp();
  const entry = {
    timestamp,
    level,
    category,
    action,
    ...data,
  };

  // Create human-readable line
  const user = data.userName || data.userEmail || 'anonymous';
  const method = data.requestMethod || '';
  const path = data.requestPath || '';
  const status = data.responseStatus ? `[${data.responseStatus}]` : '';
  const duration = data.durationMs ? `(${data.durationMs}ms)` : '';
  const error = data.errorMessage ? `ERROR: ${data.errorMessage}` : '';

  const readableLine = `${timestamp} [${level}] [${category}] ${action} | user: ${user} | ${method} ${path} ${status} ${duration} ${error}`.trim();

  return {
    json: JSON.stringify(entry),
    readable: readableLine,
  };
}

/**
 * Write to daily log file
 */
function writeToDailyLog(entry) {
  try {
    const dateStr = getDateString();
    const logFile = join(LOGS_DIR, `${dateStr}.log`);
    appendFileSync(logFile, entry.readable + '\n');
  } catch (error) {
    console.error('Failed to write to daily log:', error.message);
  }
}

/**
 * Write to error log file (keep last 1000 errors)
 */
function writeToErrorLog(entry) {
  try {
    const errorLogFile = join(LOGS_DIR, 'errors.log');
    appendFileSync(errorLogFile, entry.readable + '\n' + entry.json + '\n---\n');

    // Rotate error log if too large (> 5MB)
    if (existsSync(errorLogFile)) {
      const stats = statSync(errorLogFile);
      if (stats.size > 5 * 1024 * 1024) {
        const backupFile = join(LOGS_DIR, 'errors.log.bak');
        if (existsSync(backupFile)) {
          // Remove old backup
          renameSync(backupFile, join(LOGS_DIR, 'errors.log.old'));
        }
        renameSync(errorLogFile, backupFile);
      }
    }
  } catch (error) {
    console.error('Failed to write to error log:', error.message);
  }
}

/**
 * Write to combined log file with rotation
 */
function writeToCombinedLog(entry) {
  try {
    const combinedLogFile = join(LOGS_DIR, 'combined.log');
    appendFileSync(combinedLogFile, entry.json + '\n');

    // Rotate if > 10MB
    if (existsSync(combinedLogFile)) {
      const stats = statSync(combinedLogFile);
      if (stats.size > 10 * 1024 * 1024) {
        const timestamp = getDateString();
        const backupFile = join(LOGS_DIR, `combined-${timestamp}.log`);
        renameSync(combinedLogFile, backupFile);
      }
    }
  } catch (error) {
    console.error('Failed to write to combined log:', error.message);
  }
}

/**
 * Write log to all file destinations
 */
function writeToFiles(level, category, action, data) {
  const entry = formatLogEntry(level, category, action, data);

  // Always write to daily log
  writeToDailyLog(entry);

  // Always write to combined log
  writeToCombinedLog(entry);

  // Write errors to error log
  if (level === LOG_LEVELS.ERROR || data.errorMessage) {
    writeToErrorLog(entry);
  }

  // Also log to console for development
  if (process.env.NODE_ENV !== 'production') {
    if (level === LOG_LEVELS.ERROR) {
      console.error(entry.readable);
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(entry.readable);
    }
  }
}

// Log categories
export const LogCategory = {
  AUTH: 'auth',           // Login, logout, password changes
  CUSTOMER: 'customer',   // Customer CRUD operations
  DRESS: 'dress',         // Dress CRUD operations
  ORDER: 'order',         // Order operations
  TRANSACTION: 'transaction', // Financial transactions
  APPOINTMENT: 'appointment', // Appointment operations
  AGREEMENT: 'agreement', // Rental agreements
  SYSTEM: 'system',       // System events
  ERROR: 'error',         // Errors and exceptions
};

// Log actions
export const LogAction = {
  // Auth
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',

  // CRUD
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  SEARCH: 'search',

  // Status changes
  STATUS_CHANGE: 'status_change',

  // Errors
  ERROR: 'error',
  VALIDATION_ERROR: 'validation_error',

  // System
  STARTUP: 'startup',
  SHUTDOWN: 'shutdown',
  BACKUP: 'backup',
};

/**
 * Log an activity to local files
 */
export function logActivity({
  userId = null,
  userEmail = null,
  userName = null,
  action,
  category,
  entityType = null,
  entityId = null,
  entityName = null,
  details = null,
  ipAddress = null,
  userAgent = null,
  requestMethod = null,
  requestPath = null,
  responseStatus = null,
  errorMessage = null,
  errorStack = null,
  durationMs = null,
}) {
  const logData = {
    userId,
    userEmail,
    userName,
    entityType,
    entityId,
    entityName,
    details,
    ipAddress,
    userAgent,
    requestMethod,
    requestPath,
    responseStatus,
    errorMessage,
    errorStack,
    durationMs,
  };

  // Determine log level
  let level = LOG_LEVELS.INFO;
  if (errorMessage || action === LogAction.ERROR) {
    level = LOG_LEVELS.ERROR;
  } else if (action === LogAction.LOGIN_FAILED) {
    level = LOG_LEVELS.WARN;
  }

  // Write to files only (logging must never break business operations)
  writeToFiles(level, category, action, logData);
}

/**
 * Log a user action
 */
export function logUserAction(req, action, category, entityType = null, entityId = null, entityName = null, details = null) {
  const user = req.user;
  logActivity({
    userId: user?.id || null,
    userEmail: user?.email || null,
    userName: user?.name || null,
    action,
    category,
    entityType,
    entityId,
    entityName,
    details,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    requestMethod: req.method,
    requestPath: req.path,
  });
}

/**
 * Log an error
 */
export function logError(req, error, category = LogCategory.ERROR) {
  const user = req?.user;
  logActivity({
    userId: user?.id || null,
    userEmail: user?.email || null,
    userName: user?.name || null,
    action: LogAction.ERROR,
    category,
    errorMessage: error.message,
    errorStack: error.stack,
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.headers?.['user-agent'],
    requestMethod: req?.method,
    requestPath: req?.path,
    responseStatus: error.statusCode || 500,
  });
}

/**
 * Log a login attempt
 */
export function logLogin(email, success, userId = null, userName = null, ipAddress = null, userAgent = null, errorMessage = null) {
  logActivity({
    userId,
    userEmail: email,
    userName,
    action: success ? LogAction.LOGIN : LogAction.LOGIN_FAILED,
    category: LogCategory.AUTH,
    details: success ? { message: 'התחברות מוצלחת' } : { message: 'התחברות נכשלה', reason: errorMessage },
    ipAddress,
    userAgent,
    responseStatus: success ? 200 : 401,
    errorMessage: success ? null : errorMessage,
  });
}

export default {
  LogCategory,
  LogAction,
  logActivity,
  logUserAction,
  logError,
  logLogin
};
