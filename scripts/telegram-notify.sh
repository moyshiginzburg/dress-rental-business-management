#!/bin/bash
# =============================================================================
# Telegram Notify Helper
#
# Purpose: Shared helper for sending Telegram messages from bash scripts.
# Provides a send_telegram() function that sends a text message to the
# configured Telegram bot chat.
#
# How it works:
#   - Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from environment variables,
#     falling back to local_data/.env if the variables are not already set.
#   - Sends the message via the Telegram Bot API using curl (POST sendMessage).
#   - Silently no-ops if the token or chat ID are missing or not configured.
#   - Never crashes the calling script: all errors are swallowed.
#
# Usage:
#   source "$(dirname "$0")/telegram-notify.sh"
#   send_telegram "Your message here"
# =============================================================================

_TGNOTIFY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_TGNOTIFY_PROJECT_DIR="$(dirname "$_TGNOTIFY_SCRIPT_DIR")"
_TGNOTIFY_ENV_FILE="$_TGNOTIFY_PROJECT_DIR/local_data/.env"

send_telegram() {
    local message="$1"
    local token="${TELEGRAM_BOT_TOKEN:-}"
    local chat_id="${TELEGRAM_CHAT_ID:-}"

    # Load from local_data/.env if not already in environment
    if [ -z "$token" ] || [ -z "$chat_id" ]; then
        if [ -f "$_TGNOTIFY_ENV_FILE" ]; then
            [ -z "$token" ]   && token="$(grep -m1 '^TELEGRAM_BOT_TOKEN='   "$_TGNOTIFY_ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
            [ -z "$chat_id" ] && chat_id="$(grep -m1 '^TELEGRAM_CHAT_ID='   "$_TGNOTIFY_ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
        fi
    fi

    # Silently skip if not configured
    [ -z "$token" ] || [ -z "$chat_id" ] && return 0

    curl -s --max-time 10 -X POST \
        "https://api.telegram.org/bot${token}/sendMessage" \
        --data-urlencode "text=${message}" \
        --data-urlencode "chat_id=${chat_id}" \
        > /dev/null 2>&1 || true
}
