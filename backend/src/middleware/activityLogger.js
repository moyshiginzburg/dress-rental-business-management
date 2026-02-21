/**
 * Activity Logger Middleware
 * 
 * Purpose: Automatically log all API requests and responses.
 * Captures request details, response status, and timing.
 */

import { logActivity, LogCategory, LogAction } from '../services/logger.js';

/**
 * Middleware to log all requests
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end to capture response
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    // Don't log health checks or static files
    if (req.path === '/api/health' || req.path.startsWith('/uploads')) {
      return originalEnd.call(this, chunk, encoding);
    }
    
    // Determine category from path
    let category = LogCategory.SYSTEM;
    let entityType = null;
    
    if (req.path.includes('/auth')) {
      category = LogCategory.AUTH;
    } else if (req.path.includes('/customers')) {
      category = LogCategory.CUSTOMER;
      entityType = 'customer';
    } else if (req.path.includes('/dresses')) {
      category = LogCategory.DRESS;
      entityType = 'dress';
    } else if (req.path.includes('/orders')) {
      category = LogCategory.ORDER;
      entityType = 'order';
    } else if (req.path.includes('/transactions')) {
      category = LogCategory.TRANSACTION;
      entityType = 'transaction';
    } else if (req.path.includes('/agreements')) {
      category = LogCategory.AGREEMENT;
      entityType = 'agreement';
    }
    
    // Determine action from method
    let action = LogAction.READ;
    switch (req.method) {
      case 'POST':
        action = LogAction.CREATE;
        break;
      case 'PUT':
      case 'PATCH':
        action = LogAction.UPDATE;
        break;
      case 'DELETE':
        action = LogAction.DELETE;
        break;
      case 'GET':
        action = req.path.includes('search') ? LogAction.SEARCH : 
                 req.params.id ? LogAction.READ : LogAction.LIST;
        break;
    }
    
    // Extract entity ID from path if present
    const idMatch = req.path.match(/\/(\d+)/);
    const entityId = idMatch ? parseInt(idMatch[1], 10) : null;
    
    // Log the activity
    const user = req.user;
    logActivity({
      userId: user?.id || null,
      userEmail: user?.email || null,
      userName: user?.name || null,
      action,
      category,
      entityType,
      entityId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      requestMethod: req.method,
      requestPath: req.path,
      responseStatus: res.statusCode,
      durationMs: duration,
    });
    
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
}

/**
 * Error logging middleware
 */
export function errorLogger(err, req, res, next) {
  const user = req.user;
  
  logActivity({
    userId: user?.id || null,
    userEmail: user?.email || null,
    userName: user?.name || null,
    action: LogAction.ERROR,
    category: LogCategory.ERROR,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    requestMethod: req.method,
    requestPath: req.path,
    responseStatus: err.statusCode || 500,
    errorMessage: err.message,
    errorStack: err.stack,
  });
  
  next(err);
}

export default {
  requestLogger,
  errorLogger,
};
