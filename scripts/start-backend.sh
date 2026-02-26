#!/usr/bin/env bash
# =============================================================================
# Backend Startup Wrapper - Wait for port then start Node server
#
# Purpose: Prevent EADDRINUSE on deploy/restart. pm2 and auto-update call
# this script instead of node directly. It waits for port 3001 to be free
# before launching the backend, ensuring clean restarts.
#
# Flow:
#   1. Wait up to 60s for port 3001 to be free
#   2. Exec into node src/index.js (replaces this shell)
#
# Used by: scripts/pm2-ecosystem.config.js
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR/backend"

# Wait for port 3001 to be free (prevents EADDRINUSE on fast restarts)
"$SCRIPT_DIR/wait-for-port.sh" 3001 60

exec node src/index.js
