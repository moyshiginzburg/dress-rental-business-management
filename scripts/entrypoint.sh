#!/bin/bash
# =============================================================================
# Container Entrypoint - Dress Rental Business Management
#
# Purpose: Start both the Express.js backend (port 3001) and the Next.js
# frontend (port 3000) inside a single container. Handles graceful shutdown.
#
# How it works:
#   1. Starts the backend (Node.js Express) in the background
#   2. Starts the frontend (Next.js production server) in the foreground
#   3. On SIGTERM/SIGINT, sends signals to both processes for clean shutdown
#
# The backend reads its config from /app/local_data/.env (volume-mounted).
# The frontend proxies /api/* requests to backend via next.config.js rewrites.
# =============================================================================

set -e

echo "============================================="
echo "  Dress Rental Business Management - Starting"
echo "============================================="
echo ""

# Ensure local_data subdirectories exist (they may not on first run)
mkdir -p /app/local_data/backend_data
mkdir -p /app/local_data/uploads/signatures
mkdir -p /app/local_data/uploads/agreements
mkdir -p /app/local_data/uploads/receipts
mkdir -p /app/local_data/uploads/dresses
mkdir -p /app/local_data/uploads/expenses
mkdir -p /app/local_data/logs

# Run database migrations if migration script exists
echo "[entrypoint] Running database migrations..."
cd /app/backend
node src/db/migrate.js 2>/dev/null || echo "[entrypoint] No pending migrations (or migrate.js not found)"

# Start the backend server in the background
echo "[entrypoint] Starting backend on port 3001..."
cd /app/backend
node src/index.js &
BACKEND_PID=$!

# Wait briefly for backend to initialize
sleep 3

# Verify backend started successfully
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[entrypoint] ERROR: Backend failed to start!"
    exit 1
fi

echo "[entrypoint] Backend started (PID: $BACKEND_PID)"

# Start the frontend server in the background
# Note: "next" binary is hoisted to /app/node_modules/.bin/ by npm workspaces,
# so we use the absolute path rather than the local node_modules/.bin/.
echo "[entrypoint] Starting frontend on port 3000..."
cd /app/frontend
/app/node_modules/.bin/next start &
FRONTEND_PID=$!

echo "[entrypoint] Frontend started (PID: $FRONTEND_PID)"
echo ""
echo "============================================="
echo "  Both services running"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001"
echo "============================================="

# Graceful shutdown handler: forward signals to child processes
shutdown() {
    echo ""
    echo "[entrypoint] Shutting down..."
    kill "$FRONTEND_PID" 2>/dev/null
    kill "$BACKEND_PID" 2>/dev/null
    wait "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" 2>/dev/null
    echo "[entrypoint] Shutdown complete."
    exit 0
}

trap shutdown SIGTERM SIGINT

# Wait for either process to exit. If one crashes, shut down the other.
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?

echo "[entrypoint] A process exited with code $EXIT_CODE. Shutting down..."
shutdown
