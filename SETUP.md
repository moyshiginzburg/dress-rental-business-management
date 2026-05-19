# Setup & Deployment Guide

> **Current production**: VPS at `YOUR_VPS_IP`. **Direct Install**: backend via pm2, frontend on Vercel, nginx as HTTPS reverse proxy. URLs: `https://YOUR-VPS-IP-WITH-DASHES.sslip.io` (backend API via nginx), `https://your-app-name.vercel.app` (users).

---

## Table of Contents

1. [Local Development](#local-development)
2. [VPS Production Deployment (Direct Install)](#vps-production-deployment-direct-install)
3. [Migrating to a New Server](#migrating-to-a-new-server)
4. [Vercel Frontend Setup](#vercel-frontend-setup)
5. [Backup & Restore](#backup--restore)
6. [Auto-Update System](#auto-update-system)
7. [Logs & Debugging](#logs--debugging)
8. [Troubleshooting](#troubleshooting)

---

## Local Development

For developing and testing code changes before pushing to production.

### Prerequisites

- Node.js 20+ (`nvm install 20`)
- Google Chrome or Chromium (for PDF generation)
- Git

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Ensure local_data/.env exists with valid secrets
# (Copy from production if starting fresh)

# 3. Start development servers (backend + frontend with hot reload)
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:3000

# 4. To run database migrations
cd backend && npm run db:migrate
```

### Important Notes

- **Do NOT use local development for real business data.** The VPS is the source of truth.
- The local `local_data/` directory may contain an old snapshot. That's fine for testing.
- `next.config.js` rewrites proxy `/api/*` to `localhost:3001` in both dev and production.

---

## VPS Production Deployment (Direct Install)

The production system runs on a VPS: backend via pm2, frontend on Vercel, nginx as HTTPS reverse proxy with Let's Encrypt SSL.

### Architecture

```
VPS (Ubuntu 22.04+)
├── Backend (pm2)     → port 3001 (internal only)
├── nginx             → :80 (redirect) + :443 HTTPS (Let's Encrypt)
│                       proxies all traffic to :3001
│                       domain: YOUR-VPS-IP-WITH-DASHES.sslip.io
├── local_data/       → DB, uploads, logs, .env
├── Cron: auto-update-direct.sh (every minute)
├── Cron: sync-to-cloud.sh (hourly)
├── Cron: backup-to-telegram.sh (daily 03:00)
└── Cron: daily-security-report.sh (daily 23:55)

Vercel (frontend) → NEXT_PUBLIC_API_URL = https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api
```

### Key Files on VPS

| Path | Purpose |
|------|---------|
| `/root/dress-rental-business-management/` | Project root (Git repo) |
| `/root/dress-rental-business-management/local_data/` | All persistent data |
| `/root/dress-rental-business-management/local_data/.env` | Secrets |
| `/root/dress-rental-business-management/local_data/backend_data/backend_data.db` | Database |
| `/root/dress-rental-business-management/local_data/logs/` | Application + sync logs |
| `/root/.config/rclone/rclone.conf` | Google Drive authentication |

### VPS Commands

```bash
# SSH into VPS
ssh root@YOUR_VPS_IP

# View backend status
pm2 status

# View live logs
pm2 logs dress-backend

# Restart backend
pm2 restart dress-backend
```

### New Server

```bash
wget -qO setup.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
bash setup.sh
```

### Key Scripts (Direct Install)

| Script | Purpose |
|--------|---------|
| `scripts/setup-direct-install.sh` | Node 20, Chromium, fonts, build tools |
| `scripts/start-app.sh` | Create dirs, migrate, pm2 start |
| `scripts/auto-update-direct.sh` | git pull → npm install → pm2 restart |
| `scripts/pm2-ecosystem.config.js` | pm2 config (backend only) |
| `scripts/telegram-notify.sh` | Shared Telegram helper sourced by all bash scripts |
| `scripts/backup-to-telegram.sh` | Daily DB file sent to Telegram group (cron 03:00) |
| `scripts/daily-security-report.sh` | Daily security summary to Telegram (cron 23:55) |

### nginx Reverse Proxy (HTTPS)

The backend is exposed via nginx on `YOUR-VPS-IP-WITH-DASHES.sslip.io` (sslip.io resolves the IP embedded in the hostname — no domain purchase needed). SSL cert is managed by Let's Encrypt via certbot.

**Config file:** `/etc/nginx/sites-available/dress-backend`

Key commands:
```bash
# Test nginx config
nginx -t

# Reload nginx (graceful, no downtime)
systemctl reload nginx

# Check SSL cert expiry
certbot certificates

# Renew cert manually (usually automatic)
certbot renew
```

**UFW rules needed:**
```
22/tcp    ALLOW   SSH
80/tcp    ALLOW   HTTP (for certbot renewal challenges + redirect to HTTPS)
443/tcp   ALLOW   HTTPS nginx
```

**How the sslip.io domain works:**
- `YOUR-VPS-IP-WITH-DASHES.sslip.io` resolves to `YOUR_VPS_IP` (VPS public IP) via public DNS
- sslip.io is on the [Public Suffix List](https://publicsuffix.org/), so Let's Encrypt rate limits apply per subdomain (not shared with others)
- No registration or account needed — it just works based on the IP in the hostname

### Log Retention

Logs older than 30 days are automatically deleted by the logger. No separate cron needed.

---

## Migrating to a New Server

```bash
wget -qO setup.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
bash setup.sh
```

This installs deps, clones repo, restores from Drive, starts pm2 backend, and sets up cron. Frontend stays on Vercel.

**Note:** The setup script was written before the nginx migration. After running it on a new server, manually:
1. Install nginx + certbot (see nginx section below)
2. Configure nginx for the new server's sslip.io domain (e.g. `<IP-with-dashes>.sslip.io`)
3. Update `NEXT_PUBLIC_API_URL` in Vercel to `https://<new-sslip-domain>/api`
4. Redeploy on Vercel
5. Verify `https://your-app-name.vercel.app` works
6. Decommission the old server

---

## Vercel Frontend Setup

The Vercel deployment serves the frontend for nice customer-facing URLs.

### Environment Variables (Vercel Dashboard)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api` | Points to VPS backend via nginx. Used for: (1) API calls from the frontend; (2) rewrites—`next.config.js` derives the backend base URL from this to proxy `/api/*` and `/uploads/*` (images, agreements, signatures) to the VPS. |

**This is the only required variable.** Images and files use relative paths (`/uploads/...`); Vercel's rewrites proxy them to the VPS using the URL derived from `NEXT_PUBLIC_API_URL`.

**After changing env vars**: Trigger a new deployment (Deployments → Redeploy). If images still don't load, use "Clear cache and deploy" or set `VERCEL_FORCE_NO_BUILD_CACHE=1` to force a clean build.

### How It Works

1. Customer/user visits `https://your-app-name.vercel.app`
2. Vercel serves the Next.js frontend
3. Frontend JavaScript calls `NEXT_PUBLIC_API_URL` for API requests
4. VPS backend processes the request and returns data
5. Image URLs (dresses, agreements) are resolved to the VPS base URL so the browser fetches them directly from the VPS
6. CORS allows `*.vercel.app` origins

### Agreement Signing Flow

1. Backend generates a signed token for the order
2. Link is created: `https://your-app-name.vercel.app/agreement?token=<JWT>`
3. Business owner sends link to customer via WhatsApp
4. Customer opens link → signs digitally → backend saves agreement + PDF

The agreement URL is set in `backend/src/routes/agreements.js` (`FORCED_PUBLIC_FRONTEND_URL`).

---

## Backup & Restore

### Automatic Backup (VPS → Google Drive)

- **Frequency**: Every hour (cron job)
- **Script**: `scripts/sync-to-cloud.sh`
- **Drive path**: `gdrive:YOUR_REPO_NAME/`
- **What's backed up**: Database, uploads, .env, CSV files
- **What's excluded**: logs, migration backups, WAL/SHM temp files
- **Safety**: SQLite WAL is checkpointed before sync for consistency
- **Failure alert**: Sends Telegram message if rclone fails

### Automatic Backup (VPS → Telegram)

- **Frequency**: Daily at 03:00 (cron job)
- **Script**: `scripts/backup-to-telegram.sh`
- **What's sent**: The `backend_data.db` file as a Telegram document
- **Caption**: Date + file size
- **Failure alert**: Sends Telegram text alert if upload fails

### Telegram Monitoring (Security & Errors)

- **Real-time error alerts**: Backend ERROR-level events → immediate Telegram message
- **Daily security summary**: Failed logins, 401/403 attempts → Telegram at 23:55 (only if events occurred)
- **Script**: `scripts/daily-security-report.sh`
- **Configuration**: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `local_data/.env`

To add Telegram credentials to the VPS:

```bash
ssh root@YOUR_VPS_IP
echo "TELEGRAM_BOT_TOKEN=your_token_here" >> /root/dress-rental-business-management/local_data/.env
echo "TELEGRAM_CHAT_ID=your_chat_id_here" >> /root/dress-rental-business-management/local_data/.env
pm2 restart dress-backend
```

### Manual Backup

```bash
ssh root@YOUR_VPS_IP "cd /root/dress-rental-business-management && ./scripts/sync-to-cloud.sh"
```

### Restore from Backup

```bash
ssh root@YOUR_VPS_IP "cd /root/dress-rental-business-management && ./scripts/sync-from-cloud.sh"
# This stops pm2 backend, copies data from Drive, and restarts pm2
```

### Local Machine Backup (Legacy)

The local machine has a separate backup script (`~/.gdrive_configs/sync_code_to_drive.sh`) that backs up to `gdrive:YOUR_BACKUP_FOLDER/`. This is independent and does NOT conflict with the VPS backup. **Do not delete `local_data/` on the local machine** -- the local rclone sync uses `rclone sync` which would propagate the deletion to Drive.

---

## Auto-Update System

1. Cron runs `scripts/auto-update-direct.sh` every minute
2. `git fetch` → compare HEAD → if different: backup, pull, `npm install` (backend), `pm2 restart dress-backend`
3. Downtime: ~10-30 seconds

### Logs

```bash
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/auto-update.log"
```

---

## Logs & Debugging

### Process Logs

```bash
ssh root@YOUR_VPS_IP "pm2 logs dress-backend"
```

### Application Log Files

```bash
# List log files
ssh root@YOUR_VPS_IP "ls -la /root/dress-rental-business-management/local_data/logs/"

# Daily log (today's date)
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/$(date +%Y-%m-%d).log"

# Error log
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/errors.log"

# Auto-update log
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/auto-update.log"

# Cloud sync log
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/cloud-sync.log"

# Telegram backup log
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/telegram-backup.log"

# Security report log
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/security-report.log"
```

### Health Check

```bash
curl -s https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api/health | python3 -m json.tool
```

### Apps Script Logs

Apps Script logs are sent to the backend at `/api/apps-script-logs/batch`. View them in the application log files or check Google Apps Script execution logs at:
`https://script.google.com/home/projects/<PROJECT_ID>/executions`

---

## Troubleshooting

### Backend Keeps Restarting

```bash
# Check status and logs
ssh root@YOUR_VPS_IP "pm2 status"
ssh root@YOUR_VPS_IP "pm2 logs dress-backend --lines 50"
```

Common causes: missing `.env`, corrupted database, broken dependency install.

### Frontend Not Loading via Vercel

1. Check `NEXT_PUBLIC_API_URL` in Vercel env vars (should be `https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api`)
2. Verify VPS nginx is running: `ssh root@YOUR_VPS_IP "systemctl status nginx"`
3. Verify backend is up: `curl https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api/health`
4. Check CORS: backend allows `*.vercel.app` origins

### PDF Generation Fails

- Chromium must be installed on the VPS (installed by setup-direct-install.sh)
- Hebrew fonts must be present (`fonts-noto-core`, `culmus`)
- Check `CHROME_BIN` env var points to `/usr/bin/chromium` or `/usr/bin/chromium-browser`

### Database Locked

```bash
# Restart backend (releases all locks)
ssh root@YOUR_VPS_IP "pm2 restart dress-backend"
```

### Auto-Update Not Working

```bash
# Check cron is installed
ssh root@YOUR_VPS_IP "crontab -l"

# Check the script can run
ssh root@YOUR_VPS_IP "cd /root/dress-rental-business-management && bash scripts/auto-update-direct.sh"

# Check Git can fetch (SSH key must be a Deploy Key on GitHub)
ssh root@YOUR_VPS_IP "cd /root/dress-rental-business-management && git fetch origin master"
```

### Backup Failed (rclone remote not found)

Cron runs with minimal environment; rclone needs `HOME` and `RCLONE_CONFIG` to find the config. The hourly cron and pre-update backup should include these explicitly. Verify crontab:

```bash
ssh root@YOUR_VPS_IP "crontab -l"
```

The backup line should be: `0 * * * * HOME=/root RCLONE_CONFIG=/root/.config/rclone/rclone.conf /root/.../scripts/sync-to-cloud.sh`. If missing, re-run setup or update the line manually.

### nginx Not Responding

```bash
# Check nginx status
ssh root@YOUR_VPS_IP "systemctl status nginx"

# Test nginx config
ssh root@YOUR_VPS_IP "nginx -t"

# Restart nginx
ssh root@YOUR_VPS_IP "systemctl restart nginx"

# Check ports 80/443 are open
ssh root@YOUR_VPS_IP "ss -tlnp | grep -E '80|443'"

# Check UFW rules
ssh root@YOUR_VPS_IP "ufw status"

# Test directly
curl https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api/health
```

### SSL Certificate Renewal

Certbot auto-renews via systemd timer. To manually renew:
```bash
ssh root@YOUR_VPS_IP "certbot renew --dry-run"
ssh root@YOUR_VPS_IP "certbot renew"
```
Certificate expires every 90 days. Check expiry:
```bash
ssh root@YOUR_VPS_IP "certbot certificates"
```
