#!/bin/bash
# =============================================================================
# Wait for Port - Block until a TCP port is free
#
# Purpose: Prevent EADDRINUSE when restarting the backend. Before starting
# the Node server, we wait until nothing is listening on the port. This
# avoids race conditions where pm2 or auto-update restarts before the
# previous process has released the port.
#
# Usage: wait-for-port.sh [PORT] [MAX_SECONDS]
#   PORT: default 3001
#   MAX_SECONDS: how long to wait before giving up (default 60)
#
# Returns: 0 if port became free, 1 if timeout
# =============================================================================

PORT="${1:-3001}"
MAX="${2:-60}"
elapsed=0

while [ "$elapsed" -lt "$MAX" ]; do
  if ! command -v fuser &>/dev/null; then
    if ! lsof -i ":$PORT" &>/dev/null; then
      exit 0
    fi
  else
    if ! fuser "$PORT/tcp" &>/dev/null; then
      exit 0
    fi
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
exit 1
