#!/bin/bash
# =============================================================================
# Daily DB Backup to Telegram
#
# Purpose: Send the SQLite database file as a Telegram document once per day,
# providing a third independent backup copy beyond the VPS and Google Drive.
#
# How it works:
#   1. Sources telegram-notify.sh for the shared send_telegram() helper.
#   2. Loads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from local_data/.env
#      (or from the environment if already set).
#   3. Runs SQLite WAL checkpoint (TRUNCATE) to ensure a consistent snapshot.
#   4. Sends the .db file via the Telegram Bot API sendDocument endpoint,
#      with a caption including the date and file size.
#   5. Logs the result to local_data/logs/telegram-backup.log.
#   6. Sends a Telegram text alert if the backup fails.
#
# Cron (daily at 03:00):
#   0 3 * * * /root/dress-rental-business-management/scripts/backup-to-telegram.sh >> /dev/null 2>&1
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/local_data/.env"
DB_PATH="$PROJECT_DIR/local_data/backend_data/backend_data.db"
LOG_FILE="$PROJECT_DIR/local_data/logs/telegram-backup.log"
MARKER_FILE="$PROJECT_DIR/local_data/.last_telegram_db_backup"

# Source shared Telegram helper (provides send_telegram function)
# shellcheck source=./telegram-notify.sh
source "$SCRIPT_DIR/telegram-notify.sh"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

# Load Telegram credentials from .env if not in environment
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

if [ -z "$TOKEN" ] || [ -z "$CHAT_ID" ]; then
    if [ -f "$ENV_FILE" ]; then
        [ -z "$TOKEN" ]   && TOKEN="$(grep -m1 '^TELEGRAM_BOT_TOKEN='   "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
        [ -z "$CHAT_ID" ] && CHAT_ID="$(grep -m1 '^TELEGRAM_CHAT_ID='   "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
    fi
fi

if [ -z "$TOKEN" ] || [ -z "$CHAT_ID" ]; then
    log "SKIP: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured."
    exit 0
fi

# Verify DB file exists
if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database file not found at $DB_PATH"
    send_telegram "DB Telegram backup FAILED: database file not found at $DB_PATH"
    exit 1
fi

# Checkpoint SQLite WAL for a consistent snapshot (same as sync-to-cloud.sh)
if command -v sqlite3 &>/dev/null; then
    log "Checkpointing SQLite WAL..."
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || \
        log "WARNING: WAL checkpoint failed (DB may be locked). Proceeding anyway."
else
    log "WARNING: sqlite3 CLI not found. Skipping WAL checkpoint."
fi

# Skip if no DB changes in the last 24 hours
DB_MTIME="$(stat -c %Y "$DB_PATH" 2>/dev/null || echo 0)"
CUTOFF="$(date -d '24 hours ago' +%s)"
if [ "$DB_MTIME" -lt "$CUTOFF" ]; then
    log "No DB changes in the last 24 hours. Skipping Telegram backup."
    exit 0
fi

# Skip if DB has not changed since last Telegram backup
if [ -f "$MARKER_FILE" ]; then
    LAST_SENT="$(stat -c %Y "$MARKER_FILE" 2>/dev/null || echo 0)"
    if [ "$DB_MTIME" -le "$LAST_SENT" ]; then
        log "No DB changes since last Telegram backup. Skipping."
        exit 0
    fi
fi

DB_SIZE="$(du -sh "$DB_PATH" 2>/dev/null | cut -f1)"
DATE_LABEL="$(date '+%Y-%m-%d')"
CAPTION="DB backup - ${DATE_LABEL} | Size: ${DB_SIZE}"
FILENAME="backend_data-${DATE_LABEL}.db"

log "Sending DB backup to Telegram (size: ${DB_SIZE})..."

HTTP_STATUS="$(curl -s --max-time 120 \
    -o /tmp/tg_backup_response.txt \
    -w "%{http_code}" \
    -X POST "https://api.telegram.org/bot${TOKEN}/sendDocument" \
    -F "chat_id=${CHAT_ID}" \
    -F "caption=${CAPTION}" \
    -F "document=@${DB_PATH};filename=${FILENAME}" 2>/dev/null)" || HTTP_STATUS="000"

if [ "$HTTP_STATUS" = "200" ]; then
    log "DB backup sent successfully to Telegram."
    date '+%Y-%m-%d %H:%M:%S' > "$MARKER_FILE" 2>/dev/null || true
else
    RESPONSE="$(cat /tmp/tg_backup_response.txt 2>/dev/null || echo 'no response')"
    log "ERROR: Telegram backup failed. HTTP ${HTTP_STATUS}. Response: ${RESPONSE}"
    send_telegram "DB Telegram backup FAILED on ${DATE_LABEL}. HTTP: ${HTTP_STATUS}"
    rm -f /tmp/tg_backup_response.txt
    exit 1
fi

rm -f /tmp/tg_backup_response.txt
