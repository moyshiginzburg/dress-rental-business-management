# 👗 Dress Rental Business Management System

A self-hosted, full-stack web application for managing a dress rental and sewing business.  
Replace spreadsheets and paper records with a modern, mobile-friendly app — completely under your control.

[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen?logo=node.js)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-blue?logo=sqlite)](https://sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://docker.com/)
[![pm2](https://img.shields.io/badge/pm2-Direct_Install-2B037A?logo=pm2)](https://pm2.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 👥 **Customers** | Contact info, order history, smart search |
| 👗 **Dress Inventory** | Photos, status tracking, rental & sale history |
| 📋 **Orders** | Rentals, sewing, sales — multi-item per order with deposit tracking |
| 💰 **Transactions** | Income & expense tracking with AI receipt scanning (Google Gemini) |
| 📄 **Digital Agreements** | Customer signs via WhatsApp link → PDF generated automatically |
| 📅 **Google Integration** | Calendar events & Tasks via Google Apps Script (no SMTP needed) |
| 📊 **Dashboard** | Business overview, upcoming events, items needing attention |
| 📤 **CSV Export** | Filtered data export for bookkeeping |
| 📱 **Mobile PWA** | Installable on Android/iOS, share receipts from the camera app |

---

## 🚀 Quick Start (5 minutes to running)

### Step 1 — Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
bash scripts/configure.sh
```

The `configure.sh` script asks you a few questions and **automatically fills in your details** across all project files — no manual find-and-replace needed.

### Step 2 — Push to GitHub

```bash
git add .
git commit -m "Configure for my business"
git push -u origin master
```

### Step 3 — Deploy to a VPS

Run this **on your server** (Ubuntu 22.04+):

```bash
wget -qO setup.sh https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
bash setup.sh
```

The script asks you to choose an installation method:

| | Docker Install | Direct Install |
|---|---|---|
| **What runs on VPS** | Frontend + Backend in container | Backend only (pm2) |
| **Frontend** | Included in container | Deployed separately on Vercel |
| **RAM** | ~150+ MB | ~70 MB |
| **Disk** | ~2-4 GB | ~200 MB |
| **Update speed** | Docker rebuild (~1 min) | npm install + pm2 restart (~5s) |
| **Process isolation** | Full (containerized) | Shared with host |

**Docker** — Fully containerized. Avoids dependency conflicts with other software on the server. Good for shared environments with multiple services.

**Direct Install** — Lower resource usage, faster updates, no Docker overhead. Suitable for a dedicated VPS running only this application.

Both options include:
- Free HTTPS via Tailscale Funnel
- Auto-update cron (pulls from GitHub every minute)
- Hourly backup to Google Drive

### Step 4 — Create your admin account

```bash
# On the server, inside the project directory:
node backend/src/scripts/create-admin.js
```

That's it. Your app is live at `https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net`.

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS, Radix UI |
| Backend | Node.js 20+, Express.js |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcrypt |
| PDF Generation | Headless Chromium (Hebrew/RTL support) |
| AI (receipts) | Google Gemini Vision API |
| Email / Google | Apps Script Web App (no SMTP needed) |
| Deployment | Docker **or** Direct Install (pm2), Tailscale Funnel |
| Backup | rclone → Google Drive |
| Auto-Update | Cron job polling GitHub every minute |

---

## ⚙️ Configuration

`configure.sh` sets most things up automatically. Here's what it configures:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Auto-generated** | Random 64-byte secret — configure.sh creates it for you |
| `BUSINESS_NAME` | Yes | Your business name (emails, PDFs, agreements) |
| `BUSINESS_EMAIL` | Yes | Your email address |
| `BUSINESS_PHONE` | Yes | Your phone number |
| `BUSINESS_ADDRESS` | Yes | Your address |
| `PUBLIC_FRONTEND_URL` | Yes (prod) | Your public URL (Tailscale or Vercel) — for WhatsApp agreement links |
| `APPS_SCRIPT_WEB_APP_URL` | Recommended | Google Apps Script URL — for email & Calendar integration |
| `GEMINI_API_KEY` | Optional | AI receipt scanning. Free at [Google AI Studio](https://aistudio.google.com/app/apikey) |

The generated `local_data/.env` file is **never committed to Git** (it's in `.gitignore`).

---

## 📲 Google Apps Script Setup

The system uses Google Apps Script to send emails and create Calendar events — **no SMTP server needed**.

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Paste the contents of `apps_script/Code.js`
3. If you ran `configure.sh`, your email and Drive folder ID are already filled in. Otherwise update these lines at the top:
   ```javascript
   const CONFIG = {
       OWNER_EMAIL: 'you@gmail.com',
       DRIVE_BASE_FOLDER_ID: 'YOUR_GOOGLE_DRIVE_FOLDER_ID',
       TAILSCALE_API_URL: 'https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api',
   };
   ```
4. Click **Deploy → New deployment → Web App**  
   - Execute as: **Me** | Who has access: **Anyone**
5. Copy the Web App URL and add it to `local_data/.env`:
   ```
   APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
   ```

---

## 🏗️ Deployment Architecture

Two deployment modes are supported:

### Option A: Docker Install

```
VPS (Ubuntu 24.04, Docker)
    ├── Docker Container
    │   ├── Next.js Frontend  → :3000
    │   ├── Express Backend   → :3001
    │   └── Chromium (for PDF generation)
    │
    ├── Tailscale Funnel → :3000 (HTTPS)
    ├── cron: auto-update.sh  (Docker rebuild)
    └── cron: sync-to-cloud.sh (hourly → Google Drive)
```

### Option B: Direct Install

```
VPS (Ubuntu 24.04, pm2)
    ├── pm2: dress-backend (Express)  → :3001
    ├── Chromium + Hebrew fonts (system packages)
    │
    ├── Tailscale Funnel → :3001 (HTTPS, backend only)
    ├── cron: auto-update-direct.sh (git pull + pm2 restart)
    └── cron: sync-to-cloud.sh (hourly → Google Drive)

Vercel (separate)
    └── Next.js Frontend (NEXT_PUBLIC_API_URL → VPS backend)
```

### Recommended VPS Specs
- **OS**: Ubuntu 22.04 or 24.04 LTS
- **RAM**: 1GB minimum (Docker needs 2GB+)
- **Storage**: 20GB+
- **CPU**: 1 vCPU minimum

### HTTPS — Free with Tailscale Funnel

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) gives your VPS a permanent public HTTPS URL at no cost — no domain, no reverse proxy, no SSL certificates to manage.

```bash
# Docker mode (frontend + backend):
tailscale funnel --bg 3000

# Direct Install mode (backend only, frontend on Vercel):
tailscale funnel --bg 3001
```

### Optional: Vercel Frontend

Deploy the frontend to Vercel for a cleaner URL while keeping the backend on your VPS.

1. Connect your GitHub repo to [vercel.com](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Add env var: `NEXT_PUBLIC_API_URL=https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api`
4. Update `PUBLIC_FRONTEND_URL` in your VPS `.env` to the Vercel URL

---

## 💾 Backup & Restore

Automatic hourly backup to **Google Drive** via [rclone](https://rclone.org/).

### Setup

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure a Google Drive remote named "gdrive"
rclone config
# Choose: New remote → name it "gdrive" → Google Drive → follow prompts
```

The backup scripts use `RCLONE_REMOTE=gdrive` and `DRIVE_PATH=YOUR_REPO_NAME` by default.

```bash
# Manual backup
./scripts/sync-to-cloud.sh

# Restore from backup
./scripts/sync-from-cloud.sh
```

---

## 📁 Project Structure

```
dress-rental-business-management/
├── scripts/
│   ├── configure.sh              ← Run this first!
│   ├── setup-new-server.sh       ← Full VPS setup (choose Docker or Direct)
│   │
│   ├── # Docker mode:
│   ├── auto-update.sh            ← Git poll + Docker rebuild (cron)
│   ├── entrypoint.sh             ← Docker container entrypoint
│   │
│   ├── # Direct Install mode:
│   ├── setup-direct-install.sh   ← System deps (Node, Chromium, fonts)
│   ├── auto-update-direct.sh     ← Git poll + pm2 restart (cron)
│   ├── pm2-ecosystem.config.js   ← pm2 configuration
│   ├── start-app.sh              ← Create dirs + migrate + pm2 start
│   ├── start-backend.sh          ← Port-wait wrapper for Node
│   ├── wait-for-port.sh          ← Block until TCP port is free
│   │
│   ├── # Shared:
│   ├── sync-to-cloud.sh          ← Backup to Google Drive
│   └── sync-from-cloud.sh        ← Restore from Google Drive
│
├── backend/src/
│   ├── index.js             ← Express entry point (port 3001)
│   ├── config/              ← Env vars + business config
│   ├── db/                  ← SQLite schema + migrations
│   ├── routes/              ← REST API endpoints
│   ├── middleware/           ← Auth, logging, error handling
│   └── services/            ← Email, PDF, AI, image processing
│
├── frontend/src/
│   ├── app/                 ← Next.js pages (dashboard, orders, etc.)
│   ├── components/          ← Shared UI components
│   └── lib/                 ← API client, utilities
│
├── apps_script/
│   └── Code.js              ← Google Apps Script (email + Calendar + Tasks)
│
├── env.example              ← Environment variable template
├── Dockerfile               ← Multi-stage build (Docker mode only)
├── docker-compose.yml       ← Production Docker config
│
└── local_data/              ← ⚠️ PERSISTENT DATA (not in Git)
    ├── .env                 ← Your secrets and config
    ├── backend_data/        ← SQLite database
    ├── uploads/             ← Dress photos, signatures, agreements
    └── logs/                ← Application logs
```

---

## 🔒 Security

- **JWT Secret** is auto-generated by `configure.sh` — a fresh cryptographically random 64-byte value
- **`local_data/`** is git-ignored — secrets never touch version control
- **Apps Script URL** acts as an API key — keep it private
- Run `npm audit` periodically to catch dependency vulnerabilities

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## 🌐 Language Notes

The UI is in **Hebrew (RTL)** by default — this is the original language of the system. All code, comments, and documentation are in English. Hebrew text lives in the React components and can be changed to any language.

---

## 📖 Documentation

| File | Purpose |
|------|---------|
| `README.md` | This file — overview and quick start |
| `SETUP.md` | Extended setup guide and troubleshooting |
| `ARCHITECTURE.md` | System design, business flows, API reference |
| `docs/DB-SCHEMA.md` | Full database schema |
| `CONTRIBUTING.md` | How to contribute |
| `SECURITY.md` | Vulnerability reporting |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and distribute.  
If you build something useful with this, we'd love to hear about it!
