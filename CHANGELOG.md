# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
