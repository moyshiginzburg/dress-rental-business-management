#!/bin/bash
#
# Dress Rental Business Management - Server Startup Script
#
# Purpose: Start the server and expose it securely via Tailscale Funnel.
#
# Usage: ./start-server.sh
# Run after computer startup or after code changes.
#

set -e

# ===========================================
# Configuration
# ===========================================
PROJECT_DIR="/path/to/your/project"
LOG_DIR="$PROJECT_DIR/local_data/logs"
LOG_FILE="$LOG_DIR/server.log"
FUNNEL_LOG="$LOG_DIR/funnel.log"

# Tailscale Configuration
TAILSCALE_URL="https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net"

# ===========================================
# Helper Functions
# ===========================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cleanup() {
    log "Cleaning up..."
    # Kill known backend process patterns
    pkill -f "node.*src/index.js" 2>/dev/null || true
    pkill -f "node --watch src/index.js" 2>/dev/null || true
    pkill -f "npm run dev:backend" 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    # Kill anything still bound to backend port
    fuser -k 3001/tcp 2>/dev/null || true
    # Stop any existing funnel
    tailscale funnel --off 3001 2>/dev/null || true
    sleep 2
}

# ===========================================
# Main Script
# ===========================================

# Create logs directory if needed
mkdir -p "$LOG_DIR"

log "=========================================="
log "Starting Dress Rental Business Management"
log "=========================================="

# Step 1: Stop existing processes
log "Step 1: Stopping existing processes..."
cleanup

# Step 2: Start backend server
log "Step 2: Starting backend server..."
cd "$PROJECT_DIR/backend"
nohup node src/index.js > "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
log "Backend started with PID: $BACKEND_PID"

# Wait for backend to be ready
log "Waiting for backend to start..."
sleep 5

# Check process is still alive
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "ERROR: Backend process crashed immediately."
    tail -n 80 "$LOG_FILE"
    exit 1
fi

# Check if backend is running
if ! curl -s http://localhost:3001/api/health > /dev/null; then
    log "ERROR: Backend failed to start!"
    tail -n 120 "$LOG_FILE"
    exit 1
fi
log "Backend is running!"

# Step 3: Local Frontend (Disabled - using Vercel)
# log "Step 3: Starting local frontend..."
# cd "$PROJECT_DIR/frontend"
# nohup npm run start > "$LOG_DIR/frontend.log" 2>&1 &
# FRONTEND_PID=$!

# Step 4: Start Tailscale Funnel (Pointed to Backend)
log "Step 4: Starting Tailscale Funnel on port 3001 (Backend)..."
log "Public API URL: $TAILSCALE_URL/api"

# We serve port 3001 (backend) to the internet for Vercel.
nohup tailscale funnel --bg 3001 > "$FUNNEL_LOG" 2>&1 &
FUNNEL_PID=$!

log "Funnel started (PID: $FUNNEL_PID)"

# Step 5: Summary
log "=========================================="
log "Server is running!"
log "=========================================="
log ""
log "Local URLs:"
log "  Frontend: http://localhost:3000"
log "  Backend:  http://localhost:3001"
log ""
log "Public URL (Accessible from anywhere):"
log "  $TAILSCALE_URL"
log ""
log "Process IDs:"
log "  Backend:  $BACKEND_PID"
log "  Funnel:   $FUNNEL_PID"
log ""
log "To stop: ./stop-server.sh (Closes public access)"
log "=========================================="

# Keep script running to show output
echo ""
echo "Press Ctrl+C to detach (servers will keep running)"
echo "Or run ./stop-server.sh to stop everything"
