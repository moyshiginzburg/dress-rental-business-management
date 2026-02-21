#!/bin/bash
# =============================================================================
# Auto-Update Script - Dress Rental Business Management
#
# Purpose: Poll GitHub for new commits and automatically rebuild/restart the
# Docker container when changes are detected. Designed to run as a cron job
# or systemd timer every minute.
#
# How it works:
#   1. Fetches latest commits from origin/master
#   2. Compares local HEAD with remote HEAD
#   3. If they differ: pulls changes, rebuilds Docker image, restarts container
#   4. Backs up data to Google Drive before rebuilding (safety net)
#   5. Logs all actions to local_data/logs/auto-update.log
#
# Installation (cron):
#   crontab -e
#   * * * * * /path/to/YOUR_REPO_NAME/scripts/auto-update.sh
#
# Installation (systemd timer) - see setup-vps.sh for automated setup.
# =============================================================================

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/local_data/logs/auto-update.log"
LOCK_FILE="/tmp/business-mgmt-auto-update.lock"
BRANCH="${AUTO_UPDATE_BRANCH:-master}"

# --- Helper ---
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

# --- Singleton lock (prevent overlapping runs) ---
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    # Another instance is already running, exit silently
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
    # No changes, exit silently (don't spam log)
    exit 0
fi

# --- New commits detected! ---
log "=========================================="
log "New commits detected!"
log "Local:  $LOCAL_HEAD"
log "Remote: $REMOTE_HEAD"
log "=========================================="

# Show what changed (for the log)
log "Changes:"
git log --oneline "$LOCAL_HEAD..$REMOTE_HEAD" 2>/dev/null | while read -r line; do
    log "  $line"
done

# Run cloud backup before update (safety net)
if [ -x "$SCRIPT_DIR/sync-to-cloud.sh" ]; then
    log "Running pre-update backup..."
    "$SCRIPT_DIR/sync-to-cloud.sh" || log "WARNING: Pre-update backup failed. Continuing with update."
fi

# Pull latest code
log "Pulling latest code..."
git pull origin "$BRANCH" --ff-only || {
    log "ERROR: git pull failed (merge conflict?). Manual intervention needed."
    exit 1
}

# Rebuild and restart Docker container
log "Rebuilding Docker container..."
docker compose down 2>/dev/null || true

docker compose up -d --build --force-recreate 2>&1 | while read -r line; do
    log "  [docker] $line"
done

BUILD_EXIT=${PIPESTATUS[0]}

if [ "$BUILD_EXIT" -eq 0 ]; then
    log "Update complete! Container rebuilt and restarted."
    
    # Wait for health check
    sleep 10
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        log "Health check passed. Backend is running."
    else
        log "WARNING: Health check failed after update. Check container logs."
    fi
else
    log "ERROR: Docker build/start failed with exit code $BUILD_EXIT"
    log "Attempting to restart with previous image..."
    docker compose up -d 2>/dev/null || true
fi

log "=========================================="
