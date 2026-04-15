# Changelog

All notable changes to the Dress Rental Business Management System will be documented in this file.

## [1.4.0] - 2026-03-05

### Added - Upload File Protection & Global Route Guard

#### Security: Cookie-Based Authentication for Static Files
- **Protected `/uploads` directory**: All files (dress images, signed agreements, expense receipts, order attachments) now require authentication. Previously, anyone who knew/guessed a file URL could access it directly without logging in.
- **Backend: `cookie-parser` middleware** added to `index.js`. The server now reads an `auth_token` cookie on every `/uploads` request and verifies the JWT signature before serving the file. Invalid or missing tokens return `401 Unauthorized`.
- **Backend: Cookie set on login** in `auth.js`. On successful login, the server sends the JWT as an `HttpOnly` cookie (`auth_token`) with `SameSite=Lax`, `Secure` (production), and `maxAge` matching the JWT expiry (default 7 days). This is transparent to the user — the browser sends it automatically with every request, including `<img>` tags.
- **Frontend: `credentials: 'include'`** added to all `fetch()` calls in `api.ts` so the browser sends the cookie with every API and file request through the Vercel→VPS proxy.
- **Frontend: Cookie cleanup on logout** in `api.ts`. When the user logs out, the cookie is expired (`max-age=0`) in addition to clearing `localStorage`.

#### Security: Next.js Middleware for Global Route Protection
- **New `frontend/src/middleware.ts`**: Intercepts every incoming request on Vercel's Edge before any page renders. Unauthenticated visitors (no `auth_token` cookie) are redirected to `/login` for **all** routes except:
  - `/login` — public (login page)
  - `/agreement` — public (customer agreement signing)
  - `/_next`, `/api`, `/uploads`, static assets — handled separately
- **Authenticated users visiting `/login`** are automatically redirected to `/dashboard`.
- **No impact on agreement flow**: The `/agreement` page and its API endpoints remain fully public. Customers signing agreements are unaffected.

#### Global Session Revocation
- To disconnect all active sessions, change the `JWT_SECRET` value in `local_data/.env` and restart the backend. All existing tokens become invalid immediately.

### Changed
- **CORS**: `credentials: true` was already configured; no changes needed.
- **Existing users**: After this update deploys, all logged-in users will need to log in again once to establish the new cookie. Subsequent usage is identical to before.

---

## [1.3.0] - 2026-03-04

### Added - Order Attachments

- **`order_attachments` table:** New database table for storing file attachments linked to orders (images, PDFs, documents).
- **Backend route:** `order-attachments.js` — Full CRUD API for uploading, listing, downloading, updating description, and deleting order attachments.
- **Frontend API:** `orderAttachmentsApi` added to `api.ts` with `list`, `upload`, `updateDescription`, `delete`, and `downloadUrl` helpers.

### Added - Dress Search Enhancement

- **Search by wearer name:** The dress inventory search (`GET /api/dresses`) now also searches by wearer names from `dress_history` and `order_items` tables.
- **Updated search placeholder:** Dress search input now reads "חיפוש לפי שם שמלה או שם לובשת..." to reflect the expanded search.

### Changed - Integer Enforcement for Monetary Values

- **Backend:** All monetary fields (`base_price`, `total_price`, `amount`, `deposit_amount`, `paid_amount`, `additional_payments`, `final_price`, `customer_charge_amount`) are now rounded to the nearest integer using `Math.round()` before storage in `orders.js`, `transactions.js`, and `dresses.js`.
- **Frontend:** All financial number inputs across 5 pages (orders new/edit, transactions new, dresses new/edit) now include `step="1"` and `onKeyDown` handlers that prevent entering decimal points (`.`) or minus signs (`-`).

### Changed - Orders Page UI Improvements

- **Notes badge:** Order cards now display an orange badge with a FileText icon showing truncated order notes, visible at a glance.
- **WhatsApp button relocation:** The WhatsApp button is now a compact green circle next to the phone number in each order card, instead of a large separate action button.
- **Full notes in detail modal:** The order detail modal now shows order notes in a styled orange box with `whitespace-pre-wrap` for multiline support.
- **Action buttons cleanup:** Delete button now includes "ביטול" text label and uses `stopPropagation()` for safer event handling.

### Changed - Form Labels & Placeholders

- **Wearer name placeholder:** Changed from "מי תלבש את השמלה?" to "שם מלא (חובה)" in both new and edit order forms.
- **Wearer name label (edit):** Changed from "שם הלובשת (אופציונלי)" to "שם הלובשת - שם מלא (אופציונלי)".

### Fixed - Email Number Formatting

- **Apps Script `Code.js`:** `amount.toLocaleString()` changed to `amount.toLocaleString('en-US')` to ensure comma separators (e.g., 1,000) instead of locale-dependent formatting in notification emails.

---

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

## 2026-04-15
- Migrated environment from direnv/.venv to venv.
- Regenerated requirements.txt from project imports and existing dependency manifests.
- Updated .gitignore to ignore venv/ and removed obsolete direnv/.venv ignore rules.

