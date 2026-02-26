# Setup & Deployment Guide

> **Two deployment options available:**  
> **Docker Install** (frontend + backend in container) or **Direct Install** (backend via pm2, frontend on Vercel).

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

### Docker Install

The production system runs in Docker on a VPS with Tailscale Funnel for HTTPS access.

#### Architecture

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
│   ├── uploads/ (signatures, dresses, agreements, expenses)
│   └── logs/
│
├── Tailscale Funnel → port 3000 (public HTTPS)
├── Cron: auto-update.sh (every minute)
└── Cron: sync-to-cloud.sh (every hour)
```

#### Docker Commands

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

### Direct Install

The production system runs backend via pm2; frontend is deployed on Vercel.

#### Architecture

```
VPS (Ubuntu 24.04, pm2)
├── pm2: dress-backend (Express Backend → port 3001)
├── Chromium + Hebrew fonts (installed as system packages)
│
├── local_data/
│   ├── .env (secrets)
│   ├── backend_data/business.db (SQLite)
│   ├── uploads/ (signatures, dresses, agreements, expenses)
│   └── logs/
│
├── Tailscale Funnel → port 3001 (public HTTPS, backend only)
├── Cron: auto-update-direct.sh (every minute)
└── Cron: sync-to-cloud.sh (every hour)

Vercel (separate)
└── Next.js Frontend (NEXT_PUBLIC_API_URL → VPS)
```

#### pm2 Commands

```bash
# SSH into VPS
ssh root@YOUR_VPS_IP

# Go to project directory
cd /root/YOUR_REPO_NAME

# View pm2 status
pm2 status

# View live logs
pm2 logs dress-backend

# Restart backend
pm2 restart dress-backend

# Start backend (if stopped)
bash scripts/start-app.sh

# Stop backend
pm2 stop dress-backend
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

The script asks you to choose: **Docker** or **Direct Install**, then handles all 10 steps:

1. Install system packages (Docker **or** Node.js + Chromium + pm2)
2. Add swap if RAM < 3GB
3. Create SSH key for GitHub (you add it as Deploy Key)
4. Clone the repository
5. Paste `.env` content (from old server's `local_data/.env`)
6. Paste `rclone.conf` content (from old server's `~/.config/rclone/rclone.conf`)
7. Restore data from Google Drive backup
8. Build and start app (Docker compose **or** pm2)
9. Connect Tailscale and start Funnel
10. Install auto-update and backup cron jobs

### After Migration

1. Update `NEXT_PUBLIC_API_URL` in Vercel to the new Tailscale URL (if using Vercel)
2. Redeploy on Vercel
3. Verify everything works with the new backend
4. Decommission the old server

---

## Vercel Frontend Setup

The Vercel deployment serves the frontend for nice customer-facing URLs. **Required for Direct Install mode; optional for Docker mode.**

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
# This stops Docker/pm2, copies data from Drive, and restarts automatically
```

### Local Machine Backup (Legacy)

The local machine has a separate backup script (`~/.your_sync_script.sh`) that backs up to `gdrive:YOUR_BACKUP_FOLDER/`. This is independent and does NOT conflict with the VPS backup. **Do not delete `local_data/` on the local machine** -- the local rclone sync uses `rclone sync` which would propagate the deletion to Drive.

---

## Auto-Update System

### How It Works

Both modes poll GitHub for new commits every minute via cron.

#### Docker Mode (`auto-update.sh`)

1. `git fetch origin master`
2. If local != remote:
   - Pre-update backup (safety net)
   - `git pull origin master`
   - `docker compose up -d --build --force-recreate`
   - Health check after rebuild
3. **Downtime**: ~1-2 minutes (Docker rebuild)

#### Direct Install Mode (`auto-update-direct.sh`)

1. `git fetch origin master`
2. If local != remote:
   - Pre-update backup (safety net)
   - `git pull origin master`
   - `cd backend && npm install`
   - pm2 stop → wait for port → pm2 start
   - Health check
3. **Downtime**: ~5 seconds (no rebuild needed)

### Logs

```bash
ssh root@YOUR_VPS_IP "cat /root/YOUR_REPO_NAME/local_data/logs/auto-update.log"
```

---

## Logs & Debugging

### Docker Mode — Container Logs

```bash
# Live tail
ssh root@YOUR_VPS_IP "docker compose -f /root/YOUR_REPO_NAME/docker-compose.yml logs -f"

# Last 100 lines
ssh root@YOUR_VPS_IP "docker compose -f /root/YOUR_REPO_NAME/docker-compose.yml logs --tail 100"
```

### Direct Install Mode — pm2 Logs

```bash
# Live tail
ssh root@YOUR_VPS_IP "pm2 logs dress-backend"

# Last 100 lines
ssh root@YOUR_VPS_IP "pm2 logs dress-backend --lines 100"
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

### Docker: Container Keeps Restarting

```bash
# Check exit code and logs
ssh root@YOUR_VPS_IP "docker ps -a"
ssh root@YOUR_VPS_IP "docker logs business-mgmt-app --tail 50"
```

Common causes: missing `.env`, corrupted database, broken dependency install.

### Direct Install: Backend Not Starting

```bash
# Check pm2 status
ssh root@YOUR_VPS_IP "pm2 status"

# Check pm2 error logs
ssh root@YOUR_VPS_IP "pm2 logs dress-backend --err --lines 50"

# Port conflict? Check what's on port 3001
ssh root@YOUR_VPS_IP "fuser 3001/tcp"
```

Common causes: missing `.env`, port still in use (EADDRINUSE), missing Node.js dependencies.

### Frontend Not Loading via Vercel

1. Check `NEXT_PUBLIC_API_URL` in Vercel env vars
2. Verify VPS is running: `curl https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api/health`
3. Check CORS: backend `PUBLIC_FRONTEND_URL` env var matches your Vercel URL

### PDF Generation Fails

- Chromium must be installed (Docker: in the image; Direct: as system package)
- Hebrew fonts must be present (`fonts-noto-core`, `culmus`)
- Check `CHROME_BIN` env var points to chromium binary

### Database Locked

```bash
# Docker: restart container
ssh root@YOUR_VPS_IP "docker compose -f /root/YOUR_REPO_NAME/docker-compose.yml restart"

# Direct Install: restart pm2
ssh root@YOUR_VPS_IP "pm2 restart dress-backend"
```

### Auto-Update Not Working

```bash
# Check cron is installed
ssh root@YOUR_VPS_IP "crontab -l"

# Check the script can run (Docker mode)
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && bash scripts/auto-update.sh"

# Check the script can run (Direct Install mode)
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && bash scripts/auto-update-direct.sh"

# Check Git can fetch (SSH key must be a Deploy Key on GitHub)
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && git fetch origin master"
```

### Tailscale Funnel Not Working

```bash
ssh root@YOUR_VPS_IP "tailscale status"
ssh root@YOUR_VPS_IP "tailscale funnel status"
# Re-enable (Docker: port 3000, Direct Install: port 3001):
ssh root@YOUR_VPS_IP "tailscale funnel --bg 3000"  # Docker
ssh root@YOUR_VPS_IP "tailscale funnel --bg 3001"  # Direct Install
```

### Backup Troubleshooting

If backup (`sync-to-cloud.sh`) fails from cron:
```bash
# Check the rclone config is accessible
ssh root@YOUR_VPS_IP "RCLONE_CONFIG=/root/.config/rclone/rclone.conf rclone listremotes"

# Run backup manually with verbose output
ssh root@YOUR_VPS_IP "cd /root/YOUR_REPO_NAME && HOME=/root RCLONE_CONFIG=/root/.config/rclone/rclone.conf bash scripts/sync-to-cloud.sh"
```
