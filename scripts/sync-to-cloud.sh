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
# Ensure HOME is set (cron sometimes runs with a minimal environment)
export HOME="${HOME:-/root}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCAL_DATA="$PROJECT_DIR/local_data"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
DRIVE_PATH="${DRIVE_PATH:-YOUR_REPO_NAME}"
DB_PATH="$LOCAL_DATA/backend_data/business.db"
LOG_FILE="$LOCAL_DATA/logs/cloud-sync.log"

# --- Helper ---
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
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

if [ ! -d "$LOCAL_DATA" ]; then
    log "ERROR: local_data directory not found at $LOCAL_DATA"
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

# --- Run rclone sync ---
log "Starting backup: $LOCAL_DATA -> ${RCLONE_REMOTE}:${DRIVE_PATH}"

rclone sync "$LOCAL_DATA" "${RCLONE_REMOTE}:${DRIVE_PATH}" \
    --log-level INFO \
    --log-file "$LOG_FILE" \
    --exclude "logs/**" \
    --exclude "migration_backup/**" \
    --exclude "*.db-shm" \
    --exclude "*.db-wal"

RCLONE_EXIT=$?

if [ $RCLONE_EXIT -eq 0 ]; then
    log "Backup completed successfully."
else
    log "ERROR: Backup failed with exit code $RCLONE_EXIT"
    exit $RCLONE_EXIT
fi
