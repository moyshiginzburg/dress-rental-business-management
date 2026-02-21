/**
 * Error Handler Middleware
 * 
 * Purpose: Centralized error handling for the Express application.
 * Catches all errors and returns consistent error responses.
 * 
 * Operation: Should be the last middleware in the chain.
 * Logs errors and returns appropriate HTTP responses.
 */

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Not found handler - for unmatched routes
 */
export function notFoundHandler(req, res, next) {
  const error = new ApiError(404, 'הדף המבוקש לא נמצא');
  next(error);
}

/**
 * Global error handler
 */
export function errorHandler(err, req, res, next) {
  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString()
  });
  
  // Determine status code
  let statusCode = err.statusCode || 500;
  let message = err.message || 'שגיאה פנימית בשרת';
  let details = err.details || null;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'שגיאה בנתונים שהוזנו';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = 409;
    message = 'נתונים כפולים או הפרת אילוץ';
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    statusCode = 409;
    message = 'הערך כבר קיים במערכת';
  }
  
  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'שגיאה פנימית בשרת';
    details = null;
  }
  
  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    details,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

export default {
  ApiError,
  notFoundHandler,
  errorHandler
};
