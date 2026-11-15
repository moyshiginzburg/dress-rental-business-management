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
VPS (Ubuntu 24.04+)
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
| `/root/dress-rental-business-management/local_data/backend_data/business.db` | Database |
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

### Automatic Receipts (SmartInvoice) — optional

Receipts (קבלה) for income can be issued automatically through [SmartInvoice](https://smartinvoices.co.il)
(integration notes: `docs/SMARTINVOICE.md`). The feature is controlled by one variable in `local_data/.env`:

```bash
SMARTINVOICE_API_KEY=sk_live_...   # real, legally numbered receipts (cannot be deleted)
# SMARTINVOICE_API_KEY=sk_test_... # sandbox key: every receipt FAILS with a Telegram alert ("מפתח בדיקה"),
#                                  # nothing is issued or blocked - used to test the failure/alert path
# (no value)                       # feature hidden in the UI, no receipts issued
```

The `receipts` table and the `customers.receipt_name` column are created automatically on backend start
(no manual migration). The app has no "test mode" in the UI.

**Turning it on with a live key:**
1. Apps Script must run the current code: after `clasp push`, update the Web App deployment to a new version
   (Deploy → Manage deployments → edit → New version). Otherwise the Drive copy is saved as image/jpeg and the
   owner email has no receipt.
2. Create an `sk_live_` key in the SmartInvoice portal with all scopes, or at least `documents:create` and `documents:read`.
3. Re-check the provider's live docs (`https://smartinvoices.co.il/docs.html`) against `docs/SMARTINVOICE.md`.
4. On the VPS: back up `.env`, set `SMARTINVOICE_API_KEY`, then `pm2 restart dress-backend`.
5. Check the backend log after the restart (`pm2 logs dress-backend`): no errors.
6. Issue one small real receipt (transaction edit page → "שמירה והפקת קבלה") and verify: the number matches
   your SmartInvoice numbering, the PDF opens (button + WhatsApp link), the Drive copy opens as a PDF, the owner
   email arrives with the PDF, the customer gets exactly one email (if she has an address), and no
   "חסרה פרטים" Telegram alert arrived (that alert means the live response shape differs from the expected one).

### Dress Return Reminders (Web Push) — optional

Rental items can be marked as returned in the order view. With VAPID keys configured, every device on which
the owner is logged in to the app gets a push notification each morning (09:00 Israel time, Sunday–Friday)
for rental dresses still not returned 2+ business days after the event, with a one-tap WhatsApp reminder.

```bash
npx web-push generate-vapid-keys        # once, on any machine with Node.js
# then in local_data/.env on the VPS:
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:your-email@example.com
pm2 restart dress-backend
```

The browser asks for notification permission after login (installed PWA recommended on phones).
Without the keys the feature is off; marking dresses as returned still works.

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
| `ORIGIN_SECRET` | same value as `ORIGIN_SECRET` in the VPS `local_data/.env` | Sent by the middleware as the `x-origin-secret` header; required when the VPS was set up with the origin secret (see "Origin secret" below). Mark it sensitive. |

`NEXT_PUBLIC_API_URL` is always required, `ORIGIN_SECRET` whenever the VPS nginx checks it. Images and files use relative paths (`/uploads/...`); Vercel's rewrites proxy them to the VPS using the URL derived from `NEXT_PUBLIC_API_URL`.

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
- **What's sent**: The `business.db` file as a Telegram document
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


### Origin secret (only Vercel may use the backend)

- **What:** nginx drops every backend request that does not carry the header `x-origin-secret`, which the Vercel middleware (`frontend/src/middleware.ts`) adds. Exempt: `/api/health`. `/api/apps-script-logs[/batch]` is open only to Google Apps Script, with its own secret `X-Gas-Log-Secret` (see "Apps Script log secret" below). A direct `curl https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api/customers` therefore returns nothing (HTTP 444); `/api/health` still works for checks. nginx also hands the backend the real visitor IP (Vercel's `X-Vercel-Proxied-For`), so IP-based limits and logs cannot be fooled by a forged `X-Forwarded-For`.
- **Where the secret lives:** Vercel project env var `ORIGIN_SECRET` (sensitive, production + preview), `/etc/nginx/conf.d/dress-origin.conf` (root-only, generated from `scripts/nginx/origin-secret.conf.template`), and `ORIGIN_SECRET=` in `local_data/.env` on the VPS (the copy `scripts/setup-new-server.sh` reads).
- **New server:** `scripts/setup-new-server.sh` generates the secret (when `.env` has none, or an empty one), installs the nginx file and prints a warning: add the same value to the Vercel env vars and redeploy the frontend, otherwise the site cannot reach the backend.
- **Existing server (set up before this feature):** nothing changes until you opt in. To enable it: add `ORIGIN_SECRET=<openssl rand -hex 32>` and `GAS_LOG_SECRET=<openssl rand -hex 32>` to `local_data/.env`; set `ORIGIN_SECRET` in Vercel and redeploy; generate `/etc/nginx/conf.d/dress-origin.conf` from the template (replace `__ORIGIN_SECRET__` and `__GAS_LOG_SECRET__`); apply the `location /` changes from the nginx block in `scripts/setup-new-server.sh` (`if ($origin_deny)`, `X-Real-IP` / `X-Forwarded-For` = `$origin_client_ip`, the `dress-origin.log` access log); then `sudo nginx -t && sudo systemctl reload nginx`.
- **Rotate:** generate a new value (`openssl rand -hex 32`), update the Vercel env var and **redeploy**, update `local_data/.env`, regenerate `/etc/nginx/conf.d/dress-origin.conf` from the template, `sudo nginx -t && sudo systemctl reload nginx`. Between the two updates the site returns errors, so do it in one sitting.
- **Watch it:** `sudo tail -f /var/log/nginx/dress-origin.log` (`ok=1` = came through Vercel, `deny=1` = refused).
- **Emergency rollback (site down because of the secret):** in `/etc/nginx/sites-available/dress-backend` remove the `if ($origin_deny) { return 444; }` block, then `sudo nginx -t && sudo systemctl reload nginx`.
- **New callers:** anything else that must call the backend directly needs its path added to the exemptions in the `$origin_deny` map (or must send the secret).
- **Requirement:** nginx 1.19.4 or newer (`ssl_reject_handshake`), i.e. Ubuntu 24.04 or Debian 12.

### Apps Script log secret

- **What:** only the Apps Script web app may write to `/api/apps-script-logs[/batch]`: it sends `X-Gas-Log-Secret` (`GAS_LOG_SECRET`). nginx refuses everything else on that path (even via the Vercel site), and the backend route checks it again (when `GAS_LOG_SECRET` is not set, the route refuses everything). Nobody can read those logs through the web.
- **Where the secret lives:** `apps_script/Secrets.js` (gitignored, pushed with `clasp push`; copy it from `Secrets.js.example`), `GAS_LOG_SECRET=` in `local_data/.env` on the VPS, and `/etc/nginx/conf.d/dress-origin.conf`.
- **Deploy after changing `apps_script/`:** `cd apps_script && clasp push`, then in the Apps Script editor: Deploy -> Manage deployments -> pencil on the active deployment -> Version: **New version** -> Deploy. Prefer the editor over `clasp deploy -i <id>`, which can leave the web app answering HTTP 403 until the deployment is saved again in the editor.
- **Rotate:** new value in all three places, `clasp push`, new deployment version, reload nginx, restart the backend (`pm2 restart dress-backend`).
- **Check it works:** `sudo grep "apps-script-logs" /var/log/nginx/dress-origin.log | tail` should show `gas=1 deny=0`, status 200.

## Troubleshooting

### Backend Keeps Restarting

```bash
# Check status and logs
ssh root@YOUR_VPS_IP "pm2 status"
ssh root@YOUR_VPS_IP "pm2 logs dress-backend --lines 50"
```

Common causes: missing `.env`, corrupted database, broken dependency install.

### Receipt Failed ("קבלה נכשלה")

The reason is stored in `receipts.error_message` (shown on the transaction edit page, and sent to Telegram as an ERROR).
Common causes: cash above the legal limit (`cash_law_blocked`), invalid key (`invalid_token`), monthly quota
(`api_quota_exceeded`), SmartInvoice unreachable (`network_error`). A bank transfer without details does not fail:
it is sent with reference "0"; PayBox / other methods are sent as a bank transfer with the method name in the reference.
The exact technical reason (per attempt: `timeout after 30000ms`, `fetch failed (ECONNRESET ...)`, `HTTP 502`, ...)
is in the log entry's `details.technicalDetail` and in the `pm2 logs` lines starting with `SmartInvoice POST /documents:`.
To tell an outage on SmartInvoice's side from a problem on ours, run from the VPS and from another network:
`curl -m 30 -o /dev/null -w "%{http_code} %{time_total}\n" https://smartinvoices.co.il/smartinvoice/api/v1/documents`.
A timeout or 502 from both places (while `https://smartinvoices.co.il/` itself loads) means their API is down.
Every failure also sends a Telegram alert ("🧾❌ קבלה לא הופקה") with a direct link to the edit page; receipts stuck
in 'pending' (e.g. after a restart) are retried automatically every 5 minutes. A live receipt whose PDF could not be
saved to Google Drive sends "📁⚠️ קבלה הופקה אבל לא נשמרה בגוגל דרייב".
When the failure is a SmartInvoice outage (no connection, 5xx, rate limit), the alert adds "כשמערכת הקבלות תחזור
לפעול תישלח הודעה נוספת": an outage watcher checks SmartInvoice every 5 minutes (read-only) and, once it answers,
sends ONE message "✅🧾 מערכת הקבלות (SmartInvoice) חזרה לפעול" with the receipts still not issued and their edit
links. Nothing is issued automatically. The watcher is rebuilt on every backend start from failures of the last
24 hours, so after a restart the message may come once more. Follow it in `pm2 logs dress-backend` (lines starting
with `Receipt outage watch:`) and in the activity log (`entityType: receipt_outage_watch`).
Fix the transaction details and press "שמירה וניסיון חוזר להפקת קבלה" on the edit page. Retries are idempotent:
they can never create a duplicate receipt.

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
