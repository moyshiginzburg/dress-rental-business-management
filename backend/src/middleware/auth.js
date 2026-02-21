/**
 * Authentication Middleware
 * 
 * Purpose: Protect routes that require authentication.
 * Verifies JWT tokens and attaches user information to requests.
 * 
 * Operation: Checks for Authorization header, verifies the JWT token,
 * and adds the decoded user to req.user.
 */

import jwt from 'jsonwebtoken';
import { authConfig } from '../config/index.js';
import { get } from '../db/database.js';

/**
 * Middleware to require authentication
 * Use on protected routes
 */
export function requireAuth(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'אין הרשאה - נדרשת התחברות'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    
    // Get user from database to ensure they still exist and are active
    const user = get(
      'SELECT id, email, name, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'משתמש לא נמצא'
      });
    }
    
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'חשבון לא פעיל'
      });
    }
    
    // Attach user to request
    req.user = user;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'פג תוקף ההתחברות - נא להתחבר מחדש'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'טוקן לא תקין'
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאת אימות'
    });
  }
}

/**
 * Middleware to optionally attach user if authenticated
 * Use when route works for both authenticated and unauthenticated users
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, authConfig.jwtSecret);
      
      const user = get(
        'SELECT id, email, name, role, is_active FROM users WHERE id = ? AND is_active = 1',
        [decoded.userId]
      );
      
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Ignore errors - just continue without user
    next();
  }
}

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'נדרשת התחברות'
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'אין הרשאות מנהל'
    });
  }
  
  next();
}

/**
 * Generate JWT token for a user
 */
export function generateToken(userId) {
  return jwt.sign(
    { userId },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiresIn }
  );
}

export default {
  requireAuth,
  optionalAuth,
  requireAdmin,
  generateToken
};
