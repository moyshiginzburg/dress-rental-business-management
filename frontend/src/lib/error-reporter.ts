/**
 * Client-Side Error Reporter
 * 
 * Purpose: Centralized service to send frontend errors to the backend for logging and Telegram alerts.
 * Features:
 * - Rate limiting (debouncing) to prevent flood
 * - Deduplication of identical errors within a time window
 * - Silent failure (never crashes the app if logging itself fails)
 */

interface ErrorReport {
  message: string;
  stack?: string;
  component?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

// Keep track of recently sent errors to avoid spamming the backend
const recentErrors = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30000; // 30 seconds

/**
 * Generate a simple hash for an error to deduplicate it
 */
function hashError(error: ErrorReport): string {
  return `${error.message}|${error.component || ''}|${error.action || ''}`;
}

/**
 * Send an error report to the backend
 */
export async function reportClientError(error: ErrorReport) {
  try {
    const errorHash = hashError(error);
    const now = Date.now();
    
    // Check if we've seen this exact error recently
    if (recentErrors.has(errorHash)) {
      const lastSeen = recentErrors.get(errorHash)!;
      if (now - lastSeen < DEDUPE_WINDOW_MS) {
        // Skip reporting this duplicate
        return;
      }
    }
    
    recentErrors.set(errorHash, now);
    
    // Clean up old entries from the map to prevent memory leaks
    if (recentErrors.size > 50) {
      for (const [key, timestamp] of recentErrors.entries()) {
        if (now - timestamp > DEDUPE_WINDOW_MS) {
          recentErrors.delete(key);
        }
      }
    }

    // Build the payload
    const payload = {
      ...error,
      page: typeof window !== 'undefined' ? window.location.pathname + window.location.search : 'Server-Side Rendering',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      timestamp: new Date().toISOString()
    };

    // Send it. We don't use the standard api.ts client to avoid circular dependencies
    // and to ensure this works even if the API client is broken
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    
    fetch(`${API_URL}/client-errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      // Don't keep the connection open if the user navigates away
      keepalive: true 
    }).catch(() => {
      // Intentionally swallow fetch errors to avoid infinite error loops
      // If the backend is down, we can't report that the backend is down to the backend.
    });
    
  } catch (e) {
    // Ultimate fail-safe: error reporting must never crash the app
    console.error('Failed to report client error:', e);
  }
}
