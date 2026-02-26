# Changelog

All notable changes to the Dress Rental Business Management System will be documented in this file.

## [1.2.0] - 2026-02-26

### Added - Direct Install Option (Backend-Only via pm2)

- **Dual installation support**: `setup-new-server.sh` now asks users to choose between Docker Install (frontend + backend in container) or Direct Install (backend via pm2, frontend on Vercel).
- **New scripts for Direct Install**:
  - `scripts/setup-direct-install.sh` — Install system packages (Node.js 20, Chromium, fonts, build tools)
  - `scripts/pm2-ecosystem.config.js` — pm2 process config for backend (`dress-backend`)
  - `scripts/start-app.sh` — Create directories, run migrations, start pm2
  - `scripts/start-backend.sh` — Startup wrapper that waits for port before launching Node
  - `scripts/wait-for-port.sh` — Block until TCP port is free (prevents EADDRINUSE)
  - `scripts/auto-update-direct.sh` — Git poll + npm install + pm2 restart (with log rotation)

### Changed

- **`setup-new-server.sh`**: Complete rewrite with installation mode selection. Both Docker and Direct Install share common steps (SSH key, clone, secrets, restore, Tailscale, cron) with mode-specific build/start logic.
- **`sync-from-cloud.sh`**: Now detects both Docker and pm2 deployments; stops/restarts the appropriate service during restore.
- **`configure.sh`**: Added new Direct Install scripts to placeholder replacement list.
- **Documentation**: `README.md`, `SETUP.md`, `ARCHITECTURE.md` updated to document both deployment modes with parallel instructions, diagrams, and troubleshooting.

---

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-26

### Changed - Migration Cleanup

- **Removed legacy migration scripts:** Deleted `remove-dress-cost-and-entry-date-columns.js` and removed dead npm script references (`db:add-google-columns`, `db:add-order-items`, `db:add-dress-intended-use`, `db:add-performance-indexes`). The system uses a single initial migration (`schema.js` + `migrate.js`) for one-time installation.
- **entrypoint.sh:** Removed `add-performance-indexes.js` run; indexes are created by `migrate.js` from schema.

### Changed - Customer Creation

- **Optional phone and email:** New customer creation now requires only `name`. Phone and email are optional in: Customers management, New order flow, New transaction flow.
- Backend validation updated for `POST /api/orders` and transactions with `new_customer`.

### Added - Dress Status & Intended Use

- **Custom sewing status:** New dress status `custom_sewing` (תפירה אישית) for dresses in progress.
- **Nullable intended_use:** Dresses can have no designation (`ללא ייעוד`). Schema updated; `intended_use` is nullable.
- **Filtering:** Dresses list supports status filter including `custom_sewing`, and intended-use filter including `ללא ייעוד`.
- **Booking logic:** Only dresses with `status = 'available'` are bookable. Dashboard "available dresses" count reflects this.

### Changed - UX Improvements

- **Dress create/edit as separate pages:** Replaced modal forms with dedicated pages `/dashboard/dresses/new` and `/dashboard/dresses/[id]/edit`.
- **Mobile layout:** Hamburger menu aligned to the right (RTL).
- **Toast swipe:** Swipe-to-dismiss changed from horizontal to vertical (swipe up).

### Fixed - Vercel Image Loading

- **next.config.js:** Rewrites derive backend URL from `NEXT_PUBLIC_API_URL` when set (single env var). Enables correct image proxying on Vercel when backend is on a separate host.
- **resolveFileUrl():** Returns relative paths (`/uploads/...`) so images are requested same-origin; rewrites proxy to the backend. No extra env vars needed.
- Dress images, agreement PDFs, and signatures now load correctly when frontend is on Vercel.

### Removed

- **Tesseract OCR:** Deleted unused `backend/src/services/ocr.js`. Receipt extraction uses only Gemini AI. Reduces node_modules size (~44 MB).

### Changed - Server Robustness

- **Graceful shutdown:** Backend now calls `server.close()` before exit on SIGTERM/SIGINT, releasing the port cleanly. Prevents `EADDRINUSE` on restart.

---

## [1.0.0] - 2026-02-21

### Added
- Initial public release
- Customer management (CRUD, search, history)
- Dress inventory with photos, status tracking, rental/sale history
- Orders (rentals, sewing, sales) with multi-item support
- Transaction tracking (income & expenses) with AI receipt scanning (Google Gemini)
- Digital agreement signing via WhatsApp link (JWT-secured, PDF generated)
- Google Calendar & Tasks integration via Apps Script Web App
- Business dashboard (upcoming events, items needing attention, summary stats)
- CSV export for all datasets (customers, orders, transactions, dresses)
- Mobile-friendly PWA (installable, Android share target for receipts)
- Auto-deployment via GitHub → VPS cron polling
- Automated backup to Google Drive via rclone
- Hebrew RTL UI with Tailwind CSS + Radix UI components
- Headless Chromium PDF generation with Hebrew font support
- JWT authentication with bcrypt password hashing
