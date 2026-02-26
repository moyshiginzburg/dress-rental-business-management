#!/bin/bash
# =============================================================================
# Setup Direct Install - System Dependencies for Backend-Only Deployment
#
# Purpose: Install all system packages required to run the backend directly
# (without Docker). Used on VPS when choosing Direct Install over Docker.
#
# How it works:
#   1. Installs Node.js 20 (via NodeSource), Chromium, fonts, build tools
#   2. Runs fc-cache for font discovery
#   3. Does NOT install Docker or frontend — frontend stays on Vercel
#
# Prerequisites: Ubuntu 22.04+ with sudo/root
#
# Usage:
#   sudo bash scripts/setup-direct-install.sh
#   OR from setup-new-server.sh (when Direct Install is chosen)
# =============================================================================

set -euo pipefail

# --- Configuration ---
NODE_VERSION="${NODE_VERSION:-20}"

# --- Helper ---
log()  { echo "[OK] $1"; }
warn() { echo "[!!] $1"; }
error(){ echo "[XX] $1"; exit 1; }

# --- 1. Apt update ---
log "Updating package lists..."
apt-get update -qq

# --- 2. System packages (backend runtime + native modules) ---
PACKAGES="chromium fonts-noto-core fonts-noto-color-emoji culmus fonts-dejavu-core curl git sqlite3"
# Build tools for native modules (better-sqlite3, sharp)
BUILD_PACKAGES="build-essential"

log "Installing runtime packages: $PACKAGES"
apt-get install -y -qq $PACKAGES || error "Failed to install runtime packages"

log "Installing build tools for npm install..."
apt-get install -y -qq $BUILD_PACKAGES || error "Failed to install build tools"

# --- 3. Node.js 20 (NodeSource - avoid Ubuntu's old apt nodejs) ---
if command -v node &>/dev/null; then
  NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 20 ] 2>/dev/null; then
    log "Node.js already installed: $(node -v)"
  else
    warn "Node.js $NODE_VER found but we need 20+. Installing NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs || error "Failed to install Node.js"
  fi
else
  log "Installing Node.js $NODE_VERSION via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs || error "Failed to install Node.js"
fi

log "Node: $(node -v), npm: $(npm -v)"

# --- 4. Font cache (required for PDF Hebrew rendering) ---
log "Running font cache..."
fc-cache -f -v 2>/dev/null || warn "fc-cache failed (fonts may still work)"

log "Setup complete. Next: cd backend && npm install && pm2 start ../scripts/pm2-ecosystem.config.js"
