/**
 * IP Extraction Utility
 * 
 * Final Purpose:
 * Extract the real end-user client IP address from an Express HTTP request object,
 * accounting for multi-tier proxy architectures (Vercel Serverless / Edge rewrites -> Nginx -> Express).
 * 
 * Trust note: X-Forwarded-For is only trustworthy because nginx on the VPS REPLACES it with the
 * verified visitor address (see scripts/nginx/origin-secret.conf.template) and refuses direct
 * requests that lack the Vercel origin secret. Do not expose this backend without that nginx.
 *
 * Method of Operation:
 * 1. Checks the `X-Forwarded-For` HTTP header, which contains a comma-separated list of IP addresses
 *    chaining from client to proxies (`client_ip, vercel_ip, nginx_ip`). Splits the string by comma
 *    and extracts the FIRST non-empty IP entry (the original client IP).
 * 2. Checks the `X-Real-IP` HTTP header as a fallback.
 * 3. Falls back to Express's `req.ip` or the underlying socket/connection `remoteAddress`.
 * 4. Strips IPv6-mapped IPv4 prefixes (e.g. `::ffff:192.168.1.1` -> `192.168.1.1`).
 */

/**
 * Extract the real client IP address from an Express request object.
 * 
 * @param {import('express').Request} req - Express request object
 * @returns {string|null} Clean client IP address string or null if unresolvable
 */
export function getClientIp(req) {
  if (!req) return null;

  // 1. Check X-Forwarded-For header (Vercel & Nginx proxy chain)
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    const ips = forwardedFor.split(',');
    for (const ip of ips) {
      const trimmed = ip.trim();
      if (trimmed) {
        return cleanIp(trimmed);
      }
    }
  }

  // 2. Check X-Real-IP header fallback
  const realIp = req.headers?.['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    const trimmed = realIp.trim();
    if (trimmed) {
      return cleanIp(trimmed);
    }
  }

  // 3. Fallback to Express req.ip or raw socket connection address
  const rawIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
  if (rawIp && typeof rawIp === 'string') {
    return cleanIp(rawIp.trim());
  }

  return null;
}

/**
 * Remove IPv6-mapped IPv4 prefix (e.g. ::ffff:203.0.113.1 -> 203.0.113.1).
 * 
 * @param {string} ip - IP address string
 * @returns {string} Normalized IP address
 */
function cleanIp(ip) {
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

export default {
  getClientIp,
};
