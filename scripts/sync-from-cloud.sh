#!/bin/bash
# =============================================================================
# Sync from Cloud - Download backup from Google Drive to local_data
#
# Purpose: Restore persistent data (database, uploads, .env) from a Google Drive
# backup. Used for initial VPS setup or disaster recovery.
#
# How it works:
#   1. Checks that rclone is installed and the remote is configured
#   2. Stops Docker containers if running (to prevent DB locks)
#   3. Uses rclone copy (not sync) to download from Drive to local_data/
#      - "copy" is safer than "sync" because it won't delete local files
#        that don't exist on Drive (e.g., newly created logs)
#   4. Restarts Docker containers if they were running
#
# Prerequisites:
#   - rclone installed and configured with a remote named "gdrive:"
#
# Usage:
#   ./scripts/sync-from-cloud.sh               # Run restore
#   RCLONE_REMOTE=myremote ./scripts/sync-from-cloud.sh  # Custom remote
# =============================================================================

set -euo pipefail

# --- Configuration ---
# Ensure HOME is set (cron sometimes runs with a minimal environment)
export HOME="${HOME:-/root}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DATA="$PROJECT_DIR/local_data"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
DRIVE_PATH="${DRIVE_PATH:-YOUR_REPO_NAME}"

# --- Helper ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# --- Preflight checks ---
if ! command -v rclone &>/dev/null; then
    log "ERROR: rclone is not installed. Install it with: curl https://rclone.org/install.sh | sudo bash"
    exit 1
fi

if ! rclone listremotes | grep -q "^${RCLONE_REMOTE}:"; then
    log "ERROR: rclone remote '$RCLONE_REMOTE' not found. Run 'rclone config' to set it up."
    exit 1
fi

# --- Check if Drive backup exists ---
log "Checking for backup at ${RCLONE_REMOTE}:${DRIVE_PATH}..."
if ! rclone lsd "${RCLONE_REMOTE}:${DRIVE_PATH}" &>/dev/null; then
    log "WARNING: Backup folder '${DRIVE_PATH}' not found on Drive."
    log "This might be a fresh setup with no existing backup."
    read -p "Continue anyway? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log "Aborted."
        exit 0
    fi
fi

# --- Stop Docker if running (prevent DB lock conflicts) ---
DOCKER_WAS_RUNNING=false
if command -v docker &>/dev/null && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "business-mgmt-app"; then
    log "Stopping Docker container before restore..."
    cd "$PROJECT_DIR"
    docker compose down 2>/dev/null || true
    DOCKER_WAS_RUNNING=true
    sleep 2
fi

# --- Create local_data directory ---
mkdir -p "$LOCAL_DATA"

# --- Run rclone copy (restore) ---
log "Starting restore: ${RCLONE_REMOTE}:${DRIVE_PATH} -> $LOCAL_DATA"

rclone copy "${RCLONE_REMOTE}:${DRIVE_PATH}" "$LOCAL_DATA" \
    --log-level INFO \
    --progress

RCLONE_EXIT=$?

if [ $RCLONE_EXIT -eq 0 ]; then
    log "Restore completed successfully."
    log "Contents of local_data:"
    ls -la "$LOCAL_DATA" 2>/dev/null || true
else
    log "ERROR: Restore failed with exit code $RCLONE_EXIT"
    exit $RCLONE_EXIT
fi

# --- Restart Docker if it was running ---
if [ "$DOCKER_WAS_RUNNING" = true ]; then
    log "Restarting Docker container..."
    cd "$PROJECT_DIR"
    docker compose up -d
fi

log "Done. You can now start the application."
