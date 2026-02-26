/**
 * pm2 Ecosystem Config - Backend Only (Direct Install)
 *
 * Purpose: pm2 configuration for running the Express backend without Docker.
 * Used when VPS runs backend directly; frontend is served by Vercel or
 * accessed via the Docker container (if using Docker deployment instead).
 *
 * How it works:
 *   - pm2 runs backend/src/index.js from the backend directory
 *   - Env: NODE_ENV=production, CHROME_BIN for PDF generation
 *   - Single instance, autorestart on crash
 *
 * Usage (from project root):
 *   pm2 start scripts/pm2-ecosystem.config.js
 *   pm2 restart dress-backend
 *   pm2 logs dress-backend
 */

module.exports = {
  apps: [
    {
      name: 'dress-backend',
      cwd: '.',  // project root (start-backend.sh needs it)
      script: 'scripts/start-backend.sh',  // waits for port 3001, then exec node backend
      env: {
        NODE_ENV: 'production',
        CHROME_BIN: '/usr/bin/chromium-browser',  // Ubuntu snap uses chromium-browser; Debian: /usr/bin/chromium
        NEXT_TELEMETRY_DISABLED: '1',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 15000,  // longer: gives time for port to be released before retry
      kill_timeout: 5000,   // Allow graceful shutdown before SIGKILL
      watch: false,
    },
  ],
};
