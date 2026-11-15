/**
 * Telegram Alert Service
 *
 * Purpose: Send real-time error alerts to a configured Telegram group chat
 * via the Telegram Bot API. Used by the logger to notify about backend
 * ERROR-level events as they happen.
 *
 * How it works:
 *   - Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from process.env.
 *   - sendTelegramAlert() sends fire-and-forget: returns immediately, never
 *     blocks request handling, and never throws. sendTelegramAlertConfirmed()
 *     waits for Telegram's answer, for messages whose sender retries on failure.
 *   - Applies a sliding-window rate limit (MAX_MESSAGES_PER_WINDOW per
 *     RATE_LIMIT_WINDOW_MS) to stay well below Telegram's 20 msg/min cap.
 *   - If the rate limit is exceeded, increments a suppressed counter.
 *     The next successfully sent message prepends a suppression notice.
 *   - Silently no-ops when env vars are missing (not configured).
 *   - All network errors are swallowed — alerts must never crash the app.
 */

/** Sliding window duration for rate limiting (1 minute). */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Max messages allowed per window — safely below Telegram's 20/min limit. */
const MAX_MESSAGES_PER_WINDOW = 8;

/** Timestamps (ms) of recently sent messages within the current window. */
let _messageTimestamps = [];

/** Count of messages suppressed due to rate limiting since _suppressedSince. */
let _suppressedCount = 0;

/** ISO timestamp of when the current suppression burst started. */
let _suppressedSince = null;

/**
 * Apply configuration, rate limit, suppression notice and length limit to a message.
 * Returns the request to send ({ token, chatId, text }), or 'not_configured' /
 * 'rate_limited' when nothing should be sent.
 */
function prepareMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return 'not_configured';

  const now = Date.now();

  // Drop expired timestamps from the sliding window
  _messageTimestamps = _messageTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (_messageTimestamps.length >= MAX_MESSAGES_PER_WINDOW) {
    _suppressedCount++;
    if (!_suppressedSince) _suppressedSince = new Date().toISOString();
    return 'rate_limited';
  }

  // Prepend suppression notice if previous messages were dropped
  let fullMessage = message;
  if (_suppressedCount > 0) {
    fullMessage = `[${_suppressedCount} alert(s) suppressed due to rate limiting since ${_suppressedSince}]\n\n${message}`;
    _suppressedCount = 0;
    _suppressedSince = null;
  }

  _messageTimestamps.push(now);

  // Truncate to Telegram's 4096-char limit
  if (fullMessage.length > 4096) {
    fullMessage = fullMessage.slice(0, 4090) + '\n[...]';
  }

  return { token, chatId, text: fullMessage };
}

/** POST one prepared message to the Telegram Bot API. */
function postMessage({ token, chatId, text }) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10000),
  });
}

/**
 * Send a text alert to the configured Telegram chat.
 * Fire-and-forget: returns immediately, never throws.
 *
 * @param {string} message - The message text to send (plain text, max 4096 chars).
 */
export function sendTelegramAlert(message) {
  const prepared = prepareMessage(message);
  if (typeof prepared === 'string') return;
  // Fire-and-forget: do not await, do not propagate errors
  postMessage(prepared).catch(() => {}); // Silent fail — alerts must never crash the app
}

/**
 * Send a text alert and wait for Telegram to confirm it, for messages that must not be lost
 * (the caller retries later on failure). Never throws.
 *
 * @param {string} message - The message text to send (plain text, max 4096 chars).
 * @returns {Promise<'sent'|'failed'|'rate_limited'|'not_configured'>}
 */
export async function sendTelegramAlertConfirmed(message) {
  const prepared = prepareMessage(message);
  if (typeof prepared === 'string') return prepared;
  try {
    const res = await postMessage(prepared);
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export default { sendTelegramAlert, sendTelegramAlertConfirmed };
