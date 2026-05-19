import express from 'express';
import { logActivity, LogCategory, LogAction } from '../services/logger.js';

const router = express.Router();

// Simple in-memory rate limiting to protect against infinite error loops
// Max 10 errors per IP per minute
const rateLimitCache = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  
  if (!rateLimitCache.has(ip)) {
    rateLimitCache.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  
  const record = rateLimitCache.get(ip);
  if (now > record.resetTime) {
    rateLimitCache.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  
  if (record.count >= 10) {
    return true;
  }
  
  record.count++;
  return false;
}

// Clean up expired rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitCache.entries()) {
    if (now > record.resetTime) {
      rateLimitCache.delete(ip);
    }
  }
}, 60 * 1000);

/**
 * @route POST /api/client-errors
 * @desc Receive error reports from the frontend client
 * @access Public (No authentication required, as errors can happen during login)
 */
router.post('/', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress;
  
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, message: 'Too many error reports from this IP' });
  }

  try {
    const { message, stack, page, component, action, userAgent, timestamp, extra } = req.body;

    if (!message || !page) {
      return res.status(400).json({ success: false, message: 'Missing required fields: message and page' });
    }

    // Limit body size if someone sends massive extra data
    const requestSize = req.headers['content-length'];
    if (requestSize && parseInt(requestSize) > 10 * 1024) { // 10KB
      return res.status(413).json({ success: false, message: 'Payload too large' });
    }

    // Format extra data for logs
    let details = null;
    if (extra || component || action) {
      details = {
        ...(component && { component }),
        ...(action && { action }),
        ...(extra && { extra })
      };
    }

    // Send to logger. This will automatically write to error.log and send to Telegram if it's an error level.
    logActivity({
      action: LogAction.ERROR,
      category: LogCategory.FRONTEND_ERROR,
      errorMessage: `[Frontend] ${message}`,
      errorStack: stack || null,
      requestPath: page, // We use requestPath to store the frontend page URL
      userAgent: userAgent || req.headers['user-agent'],
      ipAddress: ip,
      requestHost: req.headers.host,
      forwardedHost: req.headers['x-forwarded-host'],
      details: details,
    });

    res.status(200).json({ success: true, message: 'Error logged successfully' });
  } catch (error) {
    console.error('Failed to process client error report:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
