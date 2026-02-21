#!/bin/bash
#
# Stop all server processes and close public access
#

echo "Stopping Dress Rental Business Management..."

# 1. Stop Public Access (Funnel)
echo "Closing public access..."
tailscale funnel --off 3001 2>/dev/null || true
pkill -f "tailscale funnel" 2>/dev/null || true

# 2. Kill Server Processes
echo "Stopping servers..."
pkill -f "node.*src/index.js" 2>/dev/null || true
pkill -f "node --watch src/index.js" 2>/dev/null || true
pkill -f "npm run dev:backend" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true

# 3. Kill by port (Safety net)
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true

sleep 2

# Verify
if lsof -i :3000 > /dev/null 2>&1 || lsof -i :3001 > /dev/null 2>&1; then
    echo "Warning: Some processes may still be running"
    lsof -i :3000 -i :3001
else
    echo "All processes stopped successfully. Public access is closed."
fi
