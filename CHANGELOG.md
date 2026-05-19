# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
