# Setup & Deployment Guide

> **Production**: Your VPS running Docker, accessible via Tailscale Funnel (and optionally Vercel).

---

## Table of Contents

1. [Local Development](#local-development)
2. [VPS Production Deployment](#vps-production-deployment)
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

## VPS Production Deployment

The production system runs in Docker on a VPS with Tailscale Funnel for HTTPS access.

### Architecture

```
VPS (Ubuntu 24.04, Docker)
├── Docker Container: business-mgmt-app
│   ├── Next.js Frontend  → port 3000
│   ├── Express Backend   → port 3001
│   ├── Chromium (for PDF generation)
│   └── Hebrew fonts (Noto, Culmus, DejaVu)
│
├── Volume Mount: ./local_data → /app/local_data
│   ├── .env (secrets)
│   ├── backend_data/business.db (SQLite)
│   ├── uploads/ (signatures, receipts, dresses, agreements)
│   └── logs/
│
├── Tailscale Funnel → port 3000 (public HTTPS)
├── Cron: auto-update.sh (every minute)
└── Cron: sync-to-cloud.sh (every hour)
```

### Docker Commands

```bash
# SSH into VPS
ssh root@YOUR_VPS_IP

# Go to project directory
cd /root/YOUR_REPO_NAME

# View running containers
docker ps

# View live logs
docker compose logs -f

# Restart the container
docker compose restart

# Full rebuild after manual changes
docker compose up -d --build --force-recreate

# Stop the container
docker compose down
```

### Key Files on VPS

| Path | Purpose |
|------|---------|
| `/root/YOUR_REPO_NAME/` | Project root (Git repo) |
| `/root/YOUR_REPO_NAME/local_data/` | All persistent data |
| `/root/YOUR_REPO_NAME/local_data/.env` | Secrets |
| `/root/YOUR_REPO_NAME/local_data/backend_data/business.db` | Database |
| `/root/YOUR_REPO_NAME/local_data/logs/` | Application + sync logs |
| `/root/.config/rclone/rclone.conf` | Google Drive authentication |

---

## Migrating to a New Server

To move everything to a fresh Ubuntu server in ~5 minutes:

```bash
# On the new server:
wget -qO setup.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
bash setup.sh
```

The script handles all 10 steps:

1. Install Docker, Tailscale, rclone, Git, sqlite3
2. Add swap if RAM < 3GB
3. Create SSH key for GitHub (you add it as Deploy Key)
4. Clone the repository
5. Paste `.env` content (from old server's `local_data/.env`)
6. Paste `rclone.conf` content (from old server's `~/.config/rclone/rclone.conf`)
7. Restore data from Google Drive backup
8. Build and start Docker
9. Connect Tailscale and start Funnel
10. Install auto-update and backup cron jobs

### After Migration

1. Update `NEXT_PUBLIC_API_URL` in Vercel to the new Tailscale URL
2. Redeploy on Vercel
3. Verify `https://YOUR_APP_NAME.vercel.app` works with the new backend
4. Decommission the old server

---

## Vercel Frontend Setup

The Vercel deployment serves the frontend for nice customer-facing URLs.

### Environment Variables (Vercel Dashboard)

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_API_URL` | `https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api` | Points to VPS backend. Used for: (1) API calls; (2) rewrites—`next.config.js` derives backend base URL from this to proxy `/api/*` and `/uploads/*` (images, agreements) to the VPS. |

**This is the only required variable.** Images use relative paths (`/uploads/...`); rewrites proxy them to the VPS. No extra env vars needed.

**After changing env vars**: Trigger a new deployment (Deployments → Redeploy). If images still don't load, use "Clear cache and deploy" or set `VERCEL_FORCE_NO_BUILD_CACHE=1` to force a clean build.

### How It Works

1. Customer/user visits `https://YOUR_APP_NAME.vercel.app`
2. Vercel serves the Next.js frontend
3. Frontend JavaScript calls `NEXT_PUBLIC_API_URL` for API requests
4. VPS backend processes the request and returns data
5. Dress images and agreement files use relative paths (`/uploads/...`); `next.config.js` rewrites proxy them to the backend
6. CORS allows the configured `PUBLIC_FRONTEND_URL` origin

### Agreement Signing Flow

1. Backend generates a signed token for the order
2. Link is created: `https://YOUR_APP_NAME.vercel.app/agreement?token=<JWT>`
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

### Manual Backup

```bash
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && ./scripts/sync-to-cloud.sh"
```

### Restore from Backup

```bash
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && ./scripts/sync-from-cloud.sh"
# This stops Docker, copies data from Drive, and restarts Docker
```

### Local Machine Backup (Legacy)

The local machine has a separate backup script (`~/.your_sync_script.sh`) that backs up to `gdrive:YOUR_BACKUP_FOLDER/`. This is independent and does NOT conflict with the VPS backup. **Do not delete `local_data/` on the local machine** -- the local rclone sync uses `rclone sync` which would propagate the deletion to Drive.

---

## Auto-Update System

### How It Works

1. Cron runs `scripts/auto-update.sh` every minute
2. Script does `git fetch origin master`
3. Compares local HEAD with remote HEAD
4. If different:
   - Runs cloud backup (safety net)
   - `git pull origin master`
   - `docker compose up -d --build --force-recreate`
   - Health check after rebuild
5. If same: exits silently

### Logs

```bash
ssh root@YOUR_VPS_IP "cat /root/YOUR_REPO_NAME/local_data/logs/auto-update.log"
```

### Downtime

Each auto-update causes ~1-2 minutes of downtime while Docker rebuilds. If only the entrypoint or scripts changed (not Dockerfile/dependencies), the rebuild uses cached layers and takes ~10 seconds.

---

## Logs & Debugging

### Container Logs (stdout/stderr)

```bash
# Live tail
ssh root@YOUR_VPS_IP "docker compose -f /root/YOUR_REPO_NAME/docker-compose.yml logs -f"

# Last 100 lines
ssh root@YOUR_VPS_IP "docker compose -f /root/YOUR_REPO_NAME/docker-compose.yml logs --tail 100"
```

### Application Log Files

```bash
# List log files
ssh root@YOUR_VPS_IP "ls -la /root/YOUR_REPO_NAME/local_data/logs/"

# Daily log (today's date)
ssh root@YOUR_VPS_IP "cat /root/YOUR_REPO_NAME/local_data/logs/$(date +%Y-%m-%d).log"

# Error log
ssh root@YOUR_VPS_IP "cat /root/YOUR_REPO_NAME/local_data/logs/errors.log"

# Auto-update log
ssh root@YOUR_VPS_IP "cat /root/YOUR_REPO_NAME/local_data/logs/auto-update.log"

# Cloud sync log
ssh root@YOUR_VPS_IP "cat /root/YOUR_REPO_NAME/local_data/logs/cloud-sync.log"
```

### Health Check

```bash
curl -s https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api/health | python3 -m json.tool
```

### Apps Script Logs

Apps Script logs are sent to the backend at `/api/apps-script-logs/batch`. View them in the application log files or check Google Apps Script execution logs at:
`https://script.google.com/home/projects/<PROJECT_ID>/executions`

---

## Troubleshooting

### Container Keeps Restarting

```bash
# Check exit code and logs
ssh root@YOUR_VPS_IP "docker ps -a"
ssh root@YOUR_VPS_IP "docker logs business-mgmt-app --tail 50"
```

Common causes: missing `.env`, corrupted database, broken dependency install.

### Frontend Not Loading via Vercel

1. Check `NEXT_PUBLIC_API_URL` in Vercel env vars
2. Verify VPS is running: `curl https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api/health`
3. Check CORS: backend `PUBLIC_FRONTEND_URL` env var matches your Vercel URL

### PDF Generation Fails

- Chromium must be installed in the Docker image (see `Dockerfile`)
- Hebrew fonts must be present (`fonts-noto-core`, `culmus`)
- Check `CHROME_BIN` env var points to `/usr/bin/chromium`

### Database Locked

```bash
# Restart container (releases all locks)
ssh root@YOUR_VPS_IP "docker compose -f /root/YOUR_REPO_NAME/docker-compose.yml restart"
```

### Auto-Update Not Working

```bash
# Check cron is installed
ssh root@YOUR_VPS_IP "crontab -l"

# Check the script can run
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && bash scripts/auto-update.sh"

# Check Git can fetch (SSH key must be a Deploy Key on GitHub)
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && git fetch origin master"
```

### Tailscale Funnel Not Working

```bash
ssh root@YOUR_VPS_IP "tailscale status"
ssh root@YOUR_VPS_IP "tailscale funnel status"
# Re-enable:
ssh root@YOUR_VPS_IP "tailscale funnel --bg 3000"
```
