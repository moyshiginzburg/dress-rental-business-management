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
 * - logs/errors.log: Recent errors only (rotated when > 5MB)
 * - logs/combined.log: Combined log (rotated when > 10MB)
 * - Self-cleanup: Files older than 30 days are deleted automatically (once per day)
 */

import { appendFileSync, existsSync, mkdirSync, statSync, renameSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendTelegramAlert } from './telegram.js';

/** Log retention in days. Files older than this are deleted during daily cleanup. */
const LOG_RETENTION_DAYS = 30;
/** In-memory flag: have we already scheduled cleanup for today? Avoids many setImmediate calls. */
let cleanupScheduledForDate = null;

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const LOGS_DIR = join(PROJECT_ROOT, 'local_data', 'logs');
const LAST_CLEANUP_FILE = join(LOGS_DIR, '.last_cleanup');

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
 * Cleanup old log files (30-day retention).
 * Removes: daily logs (YYYY-MM-DD.log), rotated combined-*.log, errors.log.old/.bak older than LOG_RETENTION_DAYS.
 * Runs asynchronously and must never crash the backend (wrap in try/catch).
 * Called at most once per day (checked via logs/.last_cleanup).
 */
function cleanupOldLogs() {
  try {
    const today = getDateString();
    if (existsSync(LAST_CLEANUP_FILE)) {
      const lastDate = readFileSync(LAST_CLEANUP_FILE, 'utf8').trim();
      if (lastDate === today) {
        return; // Already ran today
      }
    }

    if (!existsSync(LOGS_DIR)) return;
    const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const files = readdirSync(LOGS_DIR);
    let removed = 0;

    for (const file of files) {
      if (file.startsWith('.') || file === 'errors.log' || file === 'combined.log') continue;

      const filePath = join(LOGS_DIR, file);
      let shouldDelete = false;

      // Daily logs: YYYY-MM-DD.log
      const dailyMatch = /^\d{4}-\d{2}-\d{2}\.log$/.test(file);
      // Rotated combined: combined-YYYY-MM-DD.log
      const combinedMatch = /^combined-\d{4}-\d{2}-\d{2}\.log$/.test(file);
      // Error backups: errors.log.old, errors.log.bak
      const errorBackupMatch = /^errors\.log\.(old|bak)$/.test(file);

      if (dailyMatch || combinedMatch || errorBackupMatch) {
        try {
          const stats = statSync(filePath);
          if (stats.mtimeMs < cutoffTime) {
            shouldDelete = true;
          }
        } catch {
          // Ignore stat errors (file may have been deleted)
        }
      }

      if (shouldDelete) {
        try {
          unlinkSync(filePath);
          removed++;
        } catch {
          // Ignore unlink errors (permission, lock)
        }
      }
    }

    // Always record that we ran today (prevents re-run after server restart)
    writeFileSync(LAST_CLEANUP_FILE, today, 'utf8');
    if (removed > 0 && process.env.NODE_ENV !== 'production') {
      console.log(`[logger] Cleaned up ${removed} old log file(s)`);
    }
  } catch (err) {
    // Must never throw - logging must not break the app
    if (process.env.NODE_ENV !== 'production') {
      console.error('[logger] cleanupOldLogs failed:', err.message);
    }
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

  // Write errors to error log and send real-time Telegram alert
  if (level === LOG_LEVELS.ERROR || data.errorMessage) {
    writeToErrorLog(entry);

    if (!shouldSendTelegramAlert(data)) {
      return;
    }

    const pathInfo = data.requestPath
      ? `${data.requestMethod || ''} ${data.requestPath}`.trim()
      : '';
    const hostInfo = data.requestHost || data.forwardedHost
      ? `Host: ${data.requestHost || data.forwardedHost}`
      : null;
    const forwardedHostInfo = data.forwardedHost ? `Forwarded-Host: ${data.forwardedHost}` : null;
    const alertLines = [
      `[ERROR] ${category} - ${action}`,
      `Error: ${data.errorMessage || 'unknown error'}`,
      pathInfo ? `Path: ${pathInfo}` : null,
      hostInfo,
      forwardedHostInfo,
      `Time: ${getTimestamp()}`,
    ].filter(Boolean);
    sendTelegramAlert(alertLines.join('\n'));
  }

  // Run log cleanup at most once per day (async, non-blocking)
  const today = getDateString();
  if (cleanupScheduledForDate !== today) {
    cleanupScheduledForDate = today;
    setImmediate(() => cleanupOldLogs());
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

const BOT_404_PATHS = new Set(['/robots.txt', '/favicon.ico', '/favicon.png', '/']);

function extractHost(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).host;
    } catch {
      return null;
    }
  }
  return trimmed.split('/')[0];
}

function buildFrontendHosts() {
  const hosts = new Set(['dress-rental.vercel.app']);
  const envCandidates = [
    process.env.PUBLIC_FRONTEND_URL,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
  ].filter(Boolean);
  for (const value of envCandidates) {
    const host = extractHost(value);
    if (host) hosts.add(host);
  }
  return hosts;
}

function isFromFrontendLink(data) {
  const host = extractHost(data.requestHost);
  const forwardedHost = extractHost(data.forwardedHost);
  const refererHost = extractHost(data.referer);
  const frontendHosts = buildFrontendHosts();

  const matchesFrontend = (candidate) =>
    candidate && (frontendHosts.has(candidate) || candidate.endsWith('.vercel.app'));

  return (
    matchesFrontend(host) ||
    matchesFrontend(forwardedHost) ||
    matchesFrontend(refererHost)
  );
}

function shouldSendTelegramAlert(data) {
  const status = data.responseStatus;
  const path = data.requestPath || '';

  // For 404 errors, only alert if it's a broken link within our own app
  if (status === 404) {
    // If it's not from our frontend, it's likely a bot or direct backend hit. Ignore.
    if (!isFromFrontendLink(data)) {
      return false;
    }

    // If it is from our frontend, check if it's a path that should exist
    const isOurPath = path.startsWith('/api/') || path.startsWith('/uploads/');
    if (!isOurPath) {
      // Common bot paths or accidental root hits from frontend are not critical
      return false;
    }

    // Otherwise, it's a 404 on an API or upload path coming from our frontend -> Alert (Broken Link)
    return true;
  }

  return true;
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
  FRONTEND_ERROR: 'frontend_error', // Client-side errors
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
  requestHost = null,
  forwardedHost = null,
  referer = null,
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
    requestHost,
    forwardedHost,
    referer,
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
    requestHost: req.headers.host || null,
    forwardedHost: req.headers['x-forwarded-host'] || null,
    referer: req.headers.referer || req.headers.referrer || null,
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
    requestHost: req?.headers?.host || null,
    forwardedHost: req?.headers?.['x-forwarded-host'] || null,
    referer: req?.headers?.referer || req?.headers?.referrer || null,
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
