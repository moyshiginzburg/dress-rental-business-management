/**
 * Push Subscription Routes
 *
 * Purpose: Let the app's service worker register a device for web-push notifications
 * (dress return reminders, see services/pushNotifications.js).
 *
 * Operation:
 *   - GET  /api/push/vapid-key   public VAPID key (no login; null when push is not configured)
 *   - POST /api/push/subscribe   save / refresh a PushSubscription (endpoint is unique)
 *   - POST /api/push/unsubscribe remove a subscription by endpoint
 */

import { Router } from 'express';
import { run } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import config from '../config/index.js';

const router = Router();

// GET /api/push/vapid-key (no auth required for getting the public key)
router.get('/vapid-key', (req, res) => {
  res.json({
    success: true,
    data: {
      publicKey: config.push.publicKey || null
    }
  });
});

// All routes below require authentication
router.use(requireAuth);

/**
 * POST /api/push/subscribe
 * Save a push subscription
 */
router.post('/subscribe', (req, res, next) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      throw new ApiError(400, 'Invalid subscription object');
    }

    const userId = req.user?.id || null;

    // Insert or replace the subscription (endpoint is UNIQUE)
    run(`
      INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        keys_p256dh = excluded.keys_p256dh,
        keys_auth = excluded.keys_auth,
        created_at = CURRENT_TIMESTAMP
    `, [
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    ]);

    res.status(201).json({
      success: true,
      message: 'נרשם בהצלחה להתראות'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/push/unsubscribe
 * Remove a push subscription by endpoint
 */
router.post('/unsubscribe', (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      throw new ApiError(400, 'Endpoint is required');
    }

    run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);

    res.json({
      success: true,
      message: 'התראות בוטלו בהצלחה'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
