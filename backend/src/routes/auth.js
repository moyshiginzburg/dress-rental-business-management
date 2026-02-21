/**
 * Authentication Routes
 * 
 * Purpose: Handle user authentication including login, registration,
 * and token verification.
 * 
 * Operation: Provides endpoints for user login, admin creation,
 * password management, and session verification.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { run, get, all } from '../db/database.js';
import { requireAuth, generateToken } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logLogin, logUserAction, LogCategory, LogAction } from '../services/logger.js';

const router = Router();

/**
 * POST /api/auth/login
 * User login with email and password
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    // Validate input
    if (!email || !password) {
      logLogin(email || 'unknown', false, null, null, ipAddress, userAgent, 'חסרים פרטי התחברות');
      throw new ApiError(400, 'נא להזין אימייל וסיסמה');
    }
    
    // Find user
    const user = get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    
    if (!user) {
      logLogin(email, false, null, null, ipAddress, userAgent, 'משתמש לא קיים');
      throw new ApiError(401, 'אימייל או סיסמה שגויים');
    }
    
    if (!user.is_active) {
      logLogin(email, false, user.id, user.name, ipAddress, userAgent, 'חשבון לא פעיל');
      throw new ApiError(401, 'חשבון לא פעיל');
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      logLogin(email, false, user.id, user.name, ipAddress, userAgent, 'סיסמה שגויה');
      throw new ApiError(401, 'אימייל או סיסמה שגויים');
    }
    
    // Update last login
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    
    // Log successful login
    logLogin(email, true, user.id, user.name, ipAddress, userAgent);
    
    // Generate token
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      message: 'התחברת בהצלחה',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'נא להזין סיסמה נוכחית וסיסמה חדשה');
    }
    
    if (newPassword.length < 8) {
      throw new ApiError(400, 'הסיסמה החדשה חייבת להיות לפחות 8 תווים');
    }
    
    // Get current user with password hash
    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValid) {
      throw new ApiError(401, 'הסיסמה הנוכחית שגויה');
    }
    
    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, req.user.id]
    );
    
    // Log password change
    logUserAction(req, LogAction.PASSWORD_CHANGE, LogCategory.AUTH, 'user', req.user.id, req.user.name);
    
    res.json({
      success: true,
      message: 'הסיסמה שונתה בהצלחה'
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/verify
 * Verify if token is still valid
 */
router.post('/verify', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'טוקן תקין',
    data: {
      user: req.user
    }
  });
});

export default router;
