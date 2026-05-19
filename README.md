# Dress Rental Business Management System

A full-stack business management system for a dress rental and sewing business, replacing a legacy Google Sheets workflow with a modern, mobile-friendly web application.

---

## Current Deployment

| Component | URL / Location | Details |
|-----------|---------------|---------|
| **Main App (for users)** | `https://your-app-name.vercel.app` | Vercel frontend → VPS backend |
| **VPS Backend** | `https://YOUR-VPS-IP-WITH-DASHES.sslip.io` | Backend (pm2) via nginx + Let's Encrypt SSL, frontend on Vercel |
| **Agreement Signing (customers)** | `https://your-app-name.vercel.app/agreement?token=...` | Public page, no auth needed |
| **VPS SSH** | `ssh root@YOUR_VPS_IP` | Ubuntu 24.04, 2GB RAM, 58GB disk |
| **Database** | `local_data/backend_data/backend_data.db` | SQLite, backed up hourly to Google Drive |
| **Google Drive Backup** | `gdrive:YOUR_REPO_NAME/` | rclone remote, auto-synced every hour |

### How the System Runs

```
Customer / Business Owner
        │
        ▼
  your-app-name.vercel.app  ──(API calls)──▶  VPS Backend (pm2)
  (Next.js on Vercel)                      ├── Express :3001 (internal)
                                           ├── nginx :443 → :3001 (HTTPS)
                                           │   (YOUR-VPS-IP-WITH-DASHES.sslip.io)
                                           └── local_data/ (SQLite + uploads)
                                                    │
                                           rclone → Google Drive (hourly backup)
```

---

## What This System Manages

- **Customers** - Contact info, history, and relationships
- **Dresses** - Inventory with photos, status tracking, rental/sale history
- **Orders** - Rentals, sewing, sales (multi-item per order)
- **Transactions** - Income and expense tracking with receipt AI extraction
- **Agreements** - Digital signature via public link (sent via WhatsApp)
- **Google Integration** - Calendar events, Tasks, email notifications (via Apps Script Web App)
- **Dashboard** - Business overview, upcoming events, items needing attention
- **CSV Export** - Filtered data export for bookkeeping

---

## Documentation (Read in Order)

| File | Purpose |
|------|---------|

| **`ARCHITECTURE.md`** | System design, business flows, API endpoints, deployment architecture |
| **`docs/DB-SCHEMA.md`** | Authoritative DB schema (tables, columns, PK/FK, constraints) |
| **`PROJECT_MAP.md`** | File structure and function signatures |
| **`SETUP.md`** | Local development, VPS deployment, migration guide |
| **`CHANGELOG.md`** | Version history and change log |

---

## Quick Reference

### Making Code Changes (Day-to-Day Workflow)

```bash
# 1. Edit code on your local machine
# 2. Commit and push
git add . && git commit -m "description" && git push

# That's it. The VPS detects changes within 1 minute,
# pulls and restarts the backend via pm2.
# Vercel also auto-deploys from the same GitHub push.
```

### Viewing Logs and Debugging

```bash
# Live backend logs (from VPS)
ssh root@YOUR_VPS_IP "pm2 logs dress-backend"

# Application log files (on VPS)
ssh root@YOUR_VPS_IP "ls /root/dress-rental-business-management/local_data/logs/"

# Auto-update log
ssh root@YOUR_VPS_IP "cat /root/dress-rental-business-management/local_data/logs/auto-update.log"

# Backend health check
curl https://YOUR-VPS-IP-WITH-DASHES.sslip.io/api/health
```

### Backup & Restore

```bash
# Manual backup to Google Drive (runs automatically every hour)
ssh root@YOUR_VPS_IP "cd /root/dress-rental-business-management && ./scripts/sync-to-cloud.sh"

# Restore from Google Drive
ssh root@YOUR_VPS_IP "cd /root/dress-rental-business-management && ./scripts/sync-from-cloud.sh"
```

### Migrating to a New Server

```bash
# On the new server (Ubuntu 22.04+):
wget -qO setup.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
bash setup.sh
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS, Radix UI |
| Backend | Node.js 20+, Express.js |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcrypt |
| PDF Generation | Headless Chromium (HTML → PDF with Hebrew support) |
| Image Processing | sharp (WebP conversion + thumbnails) |
| AI (receipts) | Google Gemini Vision API (multi-model fallback) |
| Email | GmailApp via Apps Script Web App (no SMTP / nodemailer in backend) |
| Google Integration | Apps Script Web App (HTTPS POST `doPost`) |
| Deployment | pm2 (Direct Install), nginx + Let's Encrypt, Vercel |
| Backup | rclone → Google Drive |
| Auto-Update | Cron job polling GitHub every minute |

---

## Project Structure

```
dress-rental-business-management/
├── package.json             # Root workspace config
│
├── backend/                 # Express.js API server
│   └── src/
│       ├── index.js         # Entry point (port 3001)
│       ├── config/          # Environment + business config
│       ├── db/              # Database schema + migrations
│       ├── routes/          # REST API endpoints
│       ├── middleware/      # Auth, logging, error handling
│       ├── services/        # Business logic (email, PDF, AI, etc.)
│       └── constants/       # Agreement terms, etc.
│
├── frontend/                # Next.js application
│   ├── next.config.js       # Rewrites /api/* → localhost:3001
│   └── src/
│       ├── app/             # Pages (dashboard, orders, etc.)
│       ├── components/      # Shared UI components
│       └── lib/             # API client, utilities
│
├── apps_script/             # Google Apps Script (calendar, tasks, email)
│   └── Code.js             # Web App doPost — receives HTTP POST from backend
│
├── scripts/                 # Deployment and maintenance
│   ├── setup-new-server.sh  # Full server migration (Direct Install)
│   ├── auto-update-direct.sh      # Git poll + pm2 restart (cron)
│   ├── sync-to-cloud.sh     # Backup local_data → Google Drive
│   ├── sync-from-cloud.sh   # Restore local_data ← Google Drive
│   └── pm2-ecosystem.config.js    # pm2 config for backend
│
├── local_data/              # ⚠️ PERSISTENT DATA (not in Git, backed up to Drive)
│   ├── .env                 # All secrets and configuration
│   ├── backend_data/        # SQLite database (backend_data.db)
│   ├── uploads/             # User uploads
│   │   ├── signatures/      # Raw PNG signature files
│   │   ├── agreements/      # Signed agreement PDFs
│   │   ├── dresses/         # Dress images (WebP + thumbnails)
│   │   └── expenses/        # Expense receipts (YEAR/CATEGORY/YYMMDD ...₪.ext)
│   ├── logs/                # Daily logs, error logs, cloud sync logs
│   └── csv/                 # CSV source files exported from Google Sheets
│
├── docs/
│   └── DB-SCHEMA.md         # Authoritative database schema reference
│
└── dev_tools/
    └── generate_repo_map.py # Regenerate PROJECT_MAP.md
```

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
If you build something useful with this, we'd love to hear about it!
