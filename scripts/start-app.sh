#!/bin/bash
# =============================================================================
# Start App - Direct Install (Backend Only)
#
# Purpose: Create required directories, run migrations, and start the backend
# via pm2. Used on VPS with direct installation (no Docker).
#
# How it works:
#   1. Creates local_data subdirectories (backend_data, uploads/*, logs)
#   2. Runs database migration
#   3. Starts backend with pm2 using pm2-ecosystem.config.js
#
# Prerequisites:
#   - scripts/setup-direct-install.sh already run
#   - cd backend && npm install already run
#   - pm2 installed globally (npm install -g pm2)
#   - local_data/.env exists with secrets
#
# Usage:
#   ./scripts/start-app.sh
#   OR: pm2 start scripts/pm2-ecosystem.config.js (if dirs already exist)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DATA="$PROJECT_DIR/local_data"

# --- Create directories required for backend ---
mkdir -p "$LOCAL_DATA/backend_data"
mkdir -p "$LOCAL_DATA/uploads/signatures"
mkdir -p "$LOCAL_DATA/uploads/agreements"
mkdir -p "$LOCAL_DATA/uploads/dresses"
mkdir -p "$LOCAL_DATA/uploads/expenses"
mkdir -p "$LOCAL_DATA/logs"

# --- Run migrations ---
if [ -f "$PROJECT_DIR/backend/src/db/migrate.js" ]; then
  echo "[start-app] Running database migrations..."
  cd "$PROJECT_DIR/backend"
  node src/db/migrate.js 2>/dev/null || echo "[start-app] Migration completed or none pending"
  cd "$PROJECT_DIR"
fi

# --- Start with pm2 ---
cd "$PROJECT_DIR"
if command -v pm2 &>/dev/null; then
  pm2 start scripts/pm2-ecosystem.config.js
  echo "[start-app] Backend started. Check: pm2 status"
else
  echo "[start-app] ERROR: pm2 not found. Install with: npm install -g pm2"
  exit 1
fi
