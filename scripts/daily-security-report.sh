#!/bin/bash
# =============================================================================
# Daily Security Report
#
# Purpose: Send a daily Telegram summary of suspicious activity — failed logins,
# unauthorized (401) and forbidden (403) access attempts, and other warnings.
# Helps monitor for brute-force attempts or unauthorized access without
# generating real-time spam during attack bursts.
#
# How it works:
#   1. Parses today's daily log file (local_data/logs/YYYY-MM-DD.log).
#   2. Counts: failed login attempts, 401 responses, 403 responses, WARN events.
#   3. If ANY suspicious events were found, sends a concise Telegram summary.
#   4. If nothing suspicious occurred — no message is sent (zero noise).
#   5. Logs its own run to local_data/logs/security-report.log.
#
# Cron (daily at 23:55, after the full day's activity is recorded):
#   55 23 * * * /root/dress-rental-business-management/scripts/daily-security-report.sh >> /dev/null 2>&1
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/local_data/logs"
TODAY="$(date '+%Y-%m-%d')"
DAILY_LOG="$LOG_DIR/${TODAY}.log"
REPORT_LOG="$LOG_DIR/security-report.log"

# Source shared Telegram helper (provides send_telegram function)
# shellcheck source=./telegram-notify.sh
source "$SCRIPT_DIR/telegram-notify.sh"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    mkdir -p "$LOG_DIR"
    echo "$msg" >> "$REPORT_LOG" 2>/dev/null || true
}

log "Running daily security report for ${TODAY}..."

if [ ! -f "$DAILY_LOG" ]; then
    log "No log file found for today (${DAILY_LOG}). Nothing to report."
    exit 0
fi

# Count suspicious events in today's log.
# grep -c exits 1 when no matches but still outputs "0"; the || assignment
# pattern keeps the captured count when grep succeeds (exit 0) and sets 0
# explicitly when grep finds nothing (exit 1), avoiding a "0\n0" double-output.
FAILED_LOGINS="$(grep -c 'login_failed' "$DAILY_LOG" 2>/dev/null)" || FAILED_LOGINS="0"
UNAUTHORIZED="$(grep -c '\[401\]' "$DAILY_LOG" 2>/dev/null)"       || UNAUTHORIZED="0"
FORBIDDEN="$(grep -c '\[403\]' "$DAILY_LOG" 2>/dev/null)"           || FORBIDDEN="0"
WARN_COUNT="$(grep -c '\[WARN\]' "$DAILY_LOG" 2>/dev/null)"         || WARN_COUNT="0"

TOTAL_SUSPICIOUS=$(( FAILED_LOGINS + UNAUTHORIZED + FORBIDDEN ))

if [ "$TOTAL_SUSPICIOUS" -eq 0 ] && [ "$WARN_COUNT" -eq 0 ]; then
    log "No suspicious activity found today. No report sent."
    exit 0
fi

# Build the report message
REPORT="Security report for ${TODAY}:"

[ "$FAILED_LOGINS" -gt 0 ] && REPORT="${REPORT}"$'\n'"- Failed login attempts: ${FAILED_LOGINS}"
[ "$UNAUTHORIZED"  -gt 0 ] && REPORT="${REPORT}"$'\n'"- Unauthorized (401): ${UNAUTHORIZED}"
[ "$FORBIDDEN"     -gt 0 ] && REPORT="${REPORT}"$'\n'"- Forbidden (403): ${FORBIDDEN}"
[ "$WARN_COUNT"    -gt 0 ] && REPORT="${REPORT}"$'\n'"- Other warnings: ${WARN_COUNT}"

REPORT="${REPORT}"$'\n'"Check logs: ssh root@YOUR_VPS_IP then: cat local_data/logs/${TODAY}.log"

log "Sending security report (${TOTAL_SUSPICIOUS} suspicious events, ${WARN_COUNT} warnings)."
send_telegram "$REPORT"
log "Security report sent."
