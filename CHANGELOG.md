# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-11-15
### Added
- **Automatic receipts (optional, SmartInvoice):** every income (new transaction, each deposit payment of a new order, or later from the transaction edit page) can issue a legal receipt (קבלה) through the SmartInvoice API. Per payment: "issue a receipt" checkbox (checked by default for every payment method, can be unchecked), customer name on the receipt, "for what" and an optional note. The PDF is stored on the server, copied to Google Drive and emailed to the customer by the app (SmartInvoice only receives the customer's name). Idempotency keys and a duplicate guard make sure a retry never issues a second receipt; failures send a Telegram alert, and a SmartInvoice outage sends one message when the service is back. The transactions list shows a receipt badge with "show" and "send on WhatsApp" buttons. Enabled only when `SMARTINVOICE_API_KEY` is set. See `docs/SMARTINVOICE.md`.
- **Customer display name:** a "שם לתצוגה (בהסכם ובקבלה)" field in the new-order form and in the customer edit dialog. It is used on the agreement link, on receipts and in WhatsApp reminders, so the internal name in the app may keep private notes. All searches also find a customer by it. When a customer signs an agreement, the name she types is saved as her display name and no longer overwrites the internal name.
- **Dress return tracking:** rental items can be marked as returned in the order view, with a ready WhatsApp reminder for dresses not yet returned.
- **Return reminders (optional, Web Push):** a daily job (09:00 Israel time, Sunday–Friday) sends a push notification to the owner's devices for rental dresses not returned 2+ business days after the event, with a one-tap WhatsApp reminder. Enabled only when VAPID keys are set.
- **Telegram login alerts:** successful and failed admin logins are reported to the Telegram alerts chat (when configured); the daily security report also counts successful logins.
- **Origin secret (new servers):** `scripts/setup-new-server.sh` installs an nginx rule so that only the Vercel site (header `x-origin-secret`, Vercel env var `ORIGIN_SECRET`) can call the backend, passes the real visitor IP to the backend, rejects unknown hosts and common bot-scanner paths. See SETUP.md → "Origin secret" (existing servers can opt in manually).

### Changed
- **Login protection:** failed logins are limited per visitor address (30 per 15 minutes, IPv6 grouped by /56), on the login path only, with no per-account lockout. Attempted passwords are no longer written to the error log.
- **Apps Script log endpoint:** `/api/apps-script-logs` now accepts log lines only with the `X-Gas-Log-Secret` header (`GAS_LOG_SECRET` in `.env` and in `apps_script/Secrets.js`), limits batch size and level, and strips line breaks so log lines cannot be forged. Without `GAS_LOG_SECRET` the endpoint refuses all log lines (the rest of the Apps Script keeps working).
- **Backend binds to 127.0.0.1 by default** (`BIND_HOST` to override), so only nginx on the same machine can reach it.
- **Agreement signing links** stay valid until the end of the event day (Israel time) instead of a fixed 7 days.
- **AI receipt extraction:** stricter rules for bank transfer screenshots — bank details are taken only from the sender's section and are never guessed or copied from the recipient's section.
- **Lists keep their place:** the dresses list restores its filters, sort, view mode and scroll position after editing a dress; customers, dresses, orders and transactions lists keep the previous results on screen while refreshing.
- **Dresses "last activity" sort** no longer changes when a dress is merely edited; dresses without any history are listed last.
- **WhatsApp links** open the WhatsApp app directly (`whatsapp://`).
- **Apps Script:** Drive uploads honour the file's MIME type (receipt PDFs); owner payment emails include the receipt details and PDF; the manifest includes the Web App settings.
- **Service worker:** shows push notifications and handles their clicks (open the order, or the WhatsApp reminder; only WhatsApp links are followed).

### Fixed
- **Business dates use the Israeli day:** deposit transactions of new orders, agreement and signature file names, the "upcoming bookings" of a dress, the dashboard monthly chart and the CSV export name no longer use the UTC day, which is the previous day between midnight and 02:00/03:00 Israel time (`utils/israelDate.js`).
- **Order deposits:** the AI details of a deposit payment are saved to that payment's own transaction (two deposits with the same amount could overwrite each other).
- **New order with an incomplete deposit:** saving is blocked when a deposit row has a proof file, a non-cash method or payment details but no amount (it used to be dropped silently); a "נקה תשלום" button resets the row.
- **Global search** searches all orders on the server instead of only the first page.
- **Missing backend files:** `services/telegram.js` and `utils/textUtils.js` were imported but missing, so the backend could not start.
- **CORS:** requests from a disallowed origin are refused cleanly instead of producing a 500 error and an alert.
- **AI receipt extraction crashed when building its prompt:** `services/ai.js` used the business settings without importing them. The optional business bank account (`BUSINESS_BANK_NUMBER` / `_BRANCH` / `_ACCOUNT`, now listed in `env.example`) is passed to the AI as the recipient account that must never be reported as the payer's.
- **Apps Script fallback OCR** (used only when the AI found no payment details) now looks for a bank-transfer confirmation number for every bank, not only for a payment method label that names one specific bank.
- **Database backups:** `backup-to-telegram.sh` and `sync-to-cloud.sh` looked for `backend_data.db`, while the backend creates `business.db`, so the daily Telegram backup failed and the Drive backup skipped its pre-sync WAL checkpoint. All scripts and docs now use `business.db`.
- **Defaults made generic:** the rclone remote default is now `gdrive` (as documented), the Apps Script Drive folder ID is a placeholder to fill in, and the CSV export file name has no fixed prefix.

### Upgrade notes
- Run `npm install` (new backend dependencies: `web-push`, `node-cron`); the auto-update script does this.
- The new database table / columns (`receipts`, `push_subscriptions`, `customers.receipt_name`, `order_items.returned`, `order_items.returned_at`) are added automatically when the backend starts.
- To keep shipping Apps Script logs to the backend: set `GAS_LOG_SECRET` in `local_data/.env`, copy `apps_script/Secrets.js.example` to `apps_script/Secrets.js` with the same value, `clasp push` and deploy a new Web App version.
- If something calls the backend from another machine (not through nginx), set `BIND_HOST=0.0.0.0`.
- The new nginx configuration in `scripts/setup-new-server.sh` needs nginx 1.19.4+ (Ubuntu 24.04). Existing servers keep their nginx configuration until they opt in (SETUP.md → "Origin secret").

## [1.4.0] - 2026-08-18
### Added
- **Data Fetching & Cache:** Integrated SWR (`swr`) data fetching and cache management across all primary dashboard views (Overview, Customers, Dresses, Orders, Transactions) with instant local state updates and optimistic mutations.
- **Session Management:** Added a dedicated `POST /api/auth/logout` endpoint that reliably clears the server-side `HttpOnly` authentication cookie alongside client-side token removal.
- **Transaction Editing:** Enhanced transaction edit endpoints and forms to support updating linked order IDs and customer charge amounts.

### Fixed
- **Timezone Precision:** Fixed order open/completed predicates and dashboard financial statistics to compute dates in local timezone (`Asia/Jerusalem`) rather than UTC, resolving date-boundary mismatches in SQLite queries during late evening hours.
- **Auth Redirect Loops:** Added automatic `HttpOnly` cookie expiration headers across all 401 Unauthorized backend responses and global error handlers to prevent stale cookie redirect loops.
- **Transaction Filtering:** Fixed category filtering logic on the transactions page to distinguish transaction-level categories (`order`, `repair`, `other`) from item breakdown sub-types (`rental`, `sewing`), ensuring order payments display correctly.
- **Order Balance Consistency:** Aligned order balance calculations across the UI to strictly compute `total_price + total_customer_charge - paid_amount`.
- **Payment Method Validation:** Enforced mandatory payment method selection in order deposits and transaction creation with clear validation errors.
- **Backup Automation:** Updated cloud synchronization scripts with dynamic user home resolution and expanded backup exclude filters (`temp_cache/**`, `*.bak*`, `*.backup*`).

## [1.3.0] - 2026-05-19
### Added
- **Dress Catalog:** Added a new "Last Active" sorting option, now set as the default view for the catalog.
- **Data Integrity:** Introduced robust, transactional record-merging workflows for both Customers and Dresses. This replaces the old deletion mechanics and cleanly consolidates history, orders, and financial data between merged records.
- **Transactions:** Enhanced the AI-based receipt processing flow with improved UI loading states (to prevent submission errors during image compression) and detailed backend logging for missing receipts.
- **Logging & Monitoring:** Implemented automated backend log rotation (30-day retention) and intelligent real-time Telegram alerts for server errors (filtering out bot/scanner noise).
- **Error Tracking:** Introduced a dedicated `/api/client-errors` endpoint to capture client-side React crashes and log them centrally to the backend.
- **Upload Reliability:** Engineered sequential, chunked upload mechanisms for order attachments and a base64 JSON upload fallback for dress images on Android. This fully resolves binary corruption and bypasses Vercel's strict ~4.5MB reverse-proxy body limits.

### Changed
- **Data Management:** Completely removed soft/hard deletion capabilities for Customers and Dresses from the UI and API to enforce strict data integrity (only merging is now permitted).
- **Deployment:** Deprecated all Docker deployment configurations. The system now exclusively supports and recommends Direct Install (PM2 + Nginx) for significant performance and resource usage improvements.
- **Database Schema:** Normalized the initial schema deployment script to ensure a clean, one-step initialization for new installations without legacy patch migrations.

## [1.2.0] - 2026-04-15
### Changed
- Migrated Python environment from `direnv/.venv` to standard `venv` for better cross-platform compatibility and reproducible requirements.

## [1.1.2] - 2026-03-05
### Security
- Protected `/uploads` route with JWT verification middleware (cookie or header).
- Added global route guard in Next.js middleware to redirect unauthenticated visitors to `/login`.
- Replaced token-based transport with secure `HttpOnly` JWT cookies for all API calls.

## [1.1.1] - 2026-03-04
### Added
- Order attachments: full backend CRUD and frontend UI modal.
- Expanded dress search to query against historical wearer names.
- Modernized orders page with inline WhatsApp action buttons and notes badges.

### Fixed
- Enforced strict integer-only monetary values globally (backend rounding + frontend restrictions).
- Standardized amount formatting in Google Apps Script notification emails.

## [1.1.0] - 2026-02-26
### Added
- Direct Install deployment option using `pm2`, introduced as an alternative to Docker setups.
- General feature improvements and bug fixes across the dashboard.

## [1.0.1] - 2026-02-24
### Added
- Advanced multi-criteria sorting for customers and orders.
- Background processing for AI receipt extraction and notifications, drastically improving transaction UI responsiveness.
- Local expense receipt file storage with smart metadata-based renaming.
- Backend security hardening: added `helmet` and authentication route rate limiting.

### Fixed
- Resolved transactions count parameter handling in filtered searches.
- Fixed a duplicate response edge case in the order creation flow.
- Improved dress upload flow with stricter client-side MIME-type validation.
- Aligned dress status handling across schemas, routes, and frontend state.

## [1.0.0] - 2026-02-22
### Added
- Initial Open Source Release.
- Complete Business Management Dashboard with responsive UI (Next.js 15).
- Dress inventory catalog, comprehensive order management, and digital agreements flow via mobile browser.
- Financial transaction tracking with AI receipt extraction using Gemini.
- Google Calendar and Tasks integration.
- Daily database backups to Telegram and automated hourly backups to Google Drive.
- Role-based authentication (Admin/User).
