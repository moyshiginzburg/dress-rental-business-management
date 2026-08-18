#!/bin/bash
# =============================================================================
# Sync to Cloud - Upload local_data to Google Drive backup
#
# Purpose: Create a consistent backup of all persistent data (database, uploads,
# logs, .env) to Google Drive using rclone.
#
# How it works:
#   1. Checks that rclone is installed and the remote is configured
#   2. Checkpoints the SQLite WAL to ensure database consistency
#   3. Uses rclone sync to mirror local_data/ to Google Drive
#   4. Logs the result
#
# Prerequisites:
#   - rclone installed and configured with a remote named "gdrive:"
#   - The Google Drive remote must have access to create folders
#
# Usage:
#   ./scripts/sync-to-cloud.sh               # Run backup
#   RCLONE_REMOTE=myremote ./scripts/sync-to-cloud.sh  # Custom remote name
# =============================================================================

set -euo pipefail

# --- Configuration ---
# Ensure HOME and RCLONE_CONFIG are set (cron runs with minimal env; causes "remote not found")
# Use absolute path for config when unset - critical for reliable cron execution.
USER_HOME="$(eval echo ~"${USER:-$(whoami)}")"
export HOME="${HOME:-$USER_HOME}"
export HOME="${HOME:-/root}"
if [ -z "${RCLONE_CONFIG:-}" ]; then
    export RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DATA="$PROJECT_DIR/local_data"
RCLONE_REMOTE="${RCLONE_REMOTE:-moyshi}"
DRIVE_PATH="${DRIVE_PATH:-dress-rental-business-management}"
DB_PATH="$LOCAL_DATA/backend_data/backend_data.db"
LOG_FILE="$LOCAL_DATA/logs/cloud-sync.log"
MARKER_FILE="$LOCAL_DATA/.last_cloud_sync"

# Source shared Telegram helper for failure alerts (provides send_telegram function)
# shellcheck source=./telegram-notify.sh
source "$SCRIPT_DIR/telegram-notify.sh"

# --- Helper ---
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

# --- Preflight checks ---
if [ ! -f "$RCLONE_CONFIG" ]; then
    log "ERROR: rclone config not found at $RCLONE_CONFIG (HOME=$HOME). Set RCLONE_CONFIG or run 'rclone config'."
    send_telegram "Google Drive backup FAILED: rclone config not found at $RCLONE_CONFIG"
    exit 1
fi

if ! command -v rclone &>/dev/null; then
    log "ERROR: rclone is not installed. Install it with: curl https://rclone.org/install.sh | sudo bash"
    send_telegram "Google Drive backup FAILED: rclone is not installed on the VPS."
    exit 1
fi

if ! grep -q "^\[${RCLONE_REMOTE}\]" "$RCLONE_CONFIG" 2>/dev/null; then
    log "ERROR: rclone remote '$RCLONE_REMOTE' not defined in $RCLONE_CONFIG"
    send_telegram "Google Drive backup FAILED: rclone remote '$RCLONE_REMOTE' missing from config."
    exit 1
fi

REMOTE_FOUND="false"
for attempt in 1 2 3; do
    if rclone listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE}:"; then
        REMOTE_FOUND="true"
        break
    fi
    log "WARNING: rclone remote '${RCLONE_REMOTE}' not found on attempt ${attempt}/3. Retrying in 5s..."
    sleep 5
done

if [ "$REMOTE_FOUND" != "true" ]; then
    log "WARNING: rclone listremotes still does not show '${RCLONE_REMOTE}'. Proceeding because config contains the remote (possible transient read)."
fi

if [ ! -d "$LOCAL_DATA" ]; then
    log "ERROR: local_data directory not found at $LOCAL_DATA"
    send_telegram "Google Drive backup FAILED: local_data directory not found at $LOCAL_DATA"
    exit 1
fi

# --- Checkpoint SQLite WAL for consistent backup ---
# When SQLite is in WAL mode, uncommitted data lives in .db-wal.
# Checkpointing flushes it into the main .db file so rclone gets a
# consistent snapshot without needing to copy the WAL/SHM files.
if [ -f "$DB_PATH" ] && command -v sqlite3 &>/dev/null; then
    log "Checkpointing SQLite WAL..."
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || \
        log "WARNING: WAL checkpoint failed (DB may be locked). Proceeding anyway."
elif [ -f "$DB_PATH" ]; then
    log "WARNING: sqlite3 CLI not found. Skipping WAL checkpoint. Install with: apt install sqlite3"
fi

# --- Skip if no changes since last successful backup ---
if [ -f "$MARKER_FILE" ]; then
    CHANGED_FILE="$(find "$LOCAL_DATA" -type f \
        ! -path "$LOCAL_DATA/logs/*" \
        ! -path "$LOCAL_DATA/migration_backup/*" \
        ! -path "$LOCAL_DATA/temp_cache/*" \
        ! -name "*.db-shm" \
        ! -name "*.db-wal" \
        ! -name "*.bak*" \
        ! -name "*.backup*" \
        ! -path "$MARKER_FILE" \
        -newer "$MARKER_FILE" \
        -print -quit 2>/dev/null || true)"
    if [ -z "$CHANGED_FILE" ]; then
        log "No changes since last successful backup. Skipping sync."
        exit 0
    fi
fi

# --- Run rclone sync ---
log "Starting backup: $LOCAL_DATA -> ${RCLONE_REMOTE}:${DRIVE_PATH}"

rclone sync "$LOCAL_DATA" "${RCLONE_REMOTE}:${DRIVE_PATH}" \
    --log-level INFO \
    --log-file "$LOG_FILE" \
    --exclude "logs/**" \
    --exclude "migration_backup/**" \
    --exclude "temp_cache/**" \
    --exclude "*.db-shm" \
    --exclude "*.db-wal" \
    --exclude "*.bak*" \
    --exclude "*.backup*"

RCLONE_EXIT=$?

if [ $RCLONE_EXIT -eq 0 ]; then
    date '+%Y-%m-%d %H:%M:%S' > "$MARKER_FILE" 2>/dev/null || true
    log "Backup completed successfully."
else
    log "ERROR: Backup failed with exit code $RCLONE_EXIT"
    send_telegram "Google Drive backup FAILED on $(date '+%Y-%m-%d %H:%M'). Exit code: $RCLONE_EXIT. Check cloud-sync.log on VPS."
    exit $RCLONE_EXIT
fi
