#!/bin/bash
# =============================================================================
# Auto-Update Script - Direct Install (Backend Only)
#
# Purpose: Poll GitHub for new commits and automatically restart the backend
# when changes are detected. For VPS running backend via pm2 (no Docker).
# Frontend stays on Vercel and is deployed separately via GitHub push.
#
# How it works:
#   1. Fetches latest commits from origin/master
#   2. Compares local HEAD with remote HEAD
#   3. If they differ: pulls changes, npm install (backend only), pm2 restart
#   4. Backs up data to Google Drive before update (safety net)
#   5. Logs all actions to local_data/logs/auto-update.log
#
# Installation (cron):
#   * * * * * /path/to/YOUR_REPO_NAME/scripts/auto-update-direct.sh
# =============================================================================

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/local_data/logs/auto-update.log"
LOCK_FILE="/tmp/dress-mgmt-auto-update-direct.lock"
BRANCH="${AUTO_UPDATE_BRANCH:-master}"
PM2_APP_NAME="dress-backend"
# Line-based rotation: when log exceeds MAX_LINES, trim to KEEP_LINES
LOG_MAX_LINES="${AUTO_UPDATE_LOG_MAX_LINES:-80000}"
LOG_KEEP_LINES="${AUTO_UPDATE_LOG_KEEP_LINES:-60000}"

# --- Helper ---
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

# Line-based rotation: prevents unbounded growth; keeps KEEP_LINES when exceeding MAX_LINES.
rotate_auto_update_log() {
    [ -f "$LOG_FILE" ] || return 0
    local lines
    lines=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
    [ "$lines" -gt "$LOG_MAX_LINES" ] || return 0
    tail -n "$LOG_KEEP_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null || true
}

# --- Singleton lock (prevent overlapping runs) ---
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    exit 0
fi

# --- Main ---
cd "$PROJECT_DIR"

# Fetch latest from remote
git fetch origin "$BRANCH" --quiet 2>/dev/null || {
    log "WARNING: git fetch failed (network issue?). Will retry next cycle."
    exit 0
}

# Compare local and remote HEAD
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    exit 0
fi

# --- New commits detected! ---
rotate_auto_update_log
log "=========================================="
log "New commits detected! (Direct Install)"
log "Local:  $LOCAL_HEAD"
log "Remote: $REMOTE_HEAD"
log "=========================================="

git log --oneline "$LOCAL_HEAD..$REMOTE_HEAD" 2>/dev/null | while read -r line; do
    log "  $line"
done

# Run cloud backup before update (explicit env ensures rclone works when invoked from cron)
if [ -x "$SCRIPT_DIR/sync-to-cloud.sh" ]; then
    log "Running pre-update backup..."
    HOME="${HOME:-/root}" RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}" \
        "$SCRIPT_DIR/sync-to-cloud.sh" || log "WARNING: Pre-update backup failed. Continuing with update."
fi

# Discard local changes to package-lock.json (gitignored, may be modified by npm install)
# Prevents git pull --ff-only from failing when lockfile was locally modified
git restore package-lock.json 2>/dev/null || true

# Pull latest code
log "Pulling latest code..."
git pull origin "$BRANCH" --ff-only || {
    log "ERROR: git pull failed (merge conflict?). Manual intervention needed."
    exit 1
}

# Install backend deps only (no frontend build)
log "Installing backend dependencies..."
cd "$PROJECT_DIR/backend"
npm install 2>&1 | while read -r line; do
    log "  [npm] $line"
done
cd "$PROJECT_DIR"

# Restart backend via pm2 (stop -> force-free port -> wait for port -> start)
log "Restarting backend (pm2)..."
if command -v pm2 &>/dev/null; then
    if pm2 list 2>/dev/null | grep -q "$PM2_APP_NAME"; then
        pm2 stop "$PM2_APP_NAME" 2>/dev/null
        sleep 3
        fuser -k 3001/tcp 2>/dev/null || true
        # Wait for port to be actually free (up to 30s) before starting
        for i in $(seq 1 15); do
            if ! fuser 3001/tcp &>/dev/null; then break; fi
            sleep 2
        done
        sleep 2
        pm2 start "$PM2_APP_NAME" 2>&1 | while read -r line; do
            log "  [pm2] $line"
        done
    else
        log "Backend not in pm2. Starting..."
        cd "$PROJECT_DIR"
        pm2 start scripts/pm2-ecosystem.config.js 2>&1 | while read -r line; do
            log "  [pm2] $line"
        done
    fi
else
    log "ERROR: pm2 not found. Backend not restarted."
    exit 1
fi

# Health check (retry: startup may take up to ~60s if port was busy)
ok=false
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 5
    if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then ok=true; break; fi
done
if $ok; then
    log "Health check passed. Backend is running."
else
    log "WARNING: Health check failed after update. Check: pm2 logs $PM2_APP_NAME"
fi

log "=========================================="
