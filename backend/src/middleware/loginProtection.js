/**
 * Login Brute-Force Protection
 *
 * Final Purpose:
 * Slow down password guessing against POST /api/auth/login WITHOUT giving anybody a way
 * to lock the real users out. The key of the limit is therefore never something an outsider
 * can choose (no e-mail address, no client-supplied header).
 *
 * Method of Operation:
 * - loginPeerLimiter is an express-rate-limit instance keyed on `req.ip`. nginx on the VPS
 *   (conf.d/dress-origin.conf, see scripts/nginx/origin-secret.conf.template) writes the visitor's real address into X-Forwarded-For: for
 *   traffic from the Vercel site it is Vercel's X-Vercel-Proxied-For (not forgeable by the
 *   visitor), for anything else it is the TCP peer. Direct requests without the origin
 *   secret are refused by nginx before they reach this code, so nobody can pose as another
 *   visitor. With `trust proxy = 1`, `req.ip` is that single trusted value.
 * - Result: a guesser only ever limits their OWN address. IPv6 addresses are collapsed to
 *   their /56 subnet (ipKeyGenerator) so one attacker cannot rotate through its own block.
 * - Only failed attempts (HTTP 4xx/5xx) consume the budget (skipSuccessfulRequests); a
 *   person who mistypes a few times is never affected.
 * - Mounted in index.js on the login path only.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Per-peer limiter for POST /api/auth/login.
 */
export const loginPeerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,                       // failed attempts per visitor address per window
  skipSuccessfulRequests: true,    // only failures consume the budget
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip, 56),
  message: {
    success: false,
    message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות.',
  },
});

export default {
  loginPeerLimiter,
};
