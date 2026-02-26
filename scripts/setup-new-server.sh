#!/bin/bash
# =============================================================================
# Complete Server Migration Script - Dress Rental Business Management
#
# Purpose: Fully automated setup on any fresh Ubuntu server (VPS or physical).
# Supports TWO installation modes chosen by the user:
#   A) Docker Install  — Runs frontend + backend in a Docker container
#   B) Direct Install  — Runs backend via pm2; frontend on Vercel (lighter)
#
# How it works:
#   1. Asks user to choose installation mode (Docker or Direct Install)
#   2. Installs system packages according to chosen mode
#   3. Adds swap if RAM < 3GB
#   4. Creates SSH deploy key for GitHub
#   5. Clones the repository
#   6. Copies secrets from user input (.env and rclone.conf)
#   7. Restores data backup from Google Drive
#   8. Builds/starts the app (Docker or pm2 depending on mode)
#   9. Authenticates Tailscale and starts Funnel
#  10. Installs cron jobs (auto-update every minute, backup every hour)
#
# Prerequisites:
#   - Fresh Ubuntu 22.04+ with root/sudo access
#   - Internet access
#   - Your .env file content ready to paste
#   - Your rclone.conf content ready to paste
#   - Access to GitHub repo settings (to add deploy key)
#
# Usage:
#   wget -qO setup.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
#   bash setup.sh
#
# Estimated time: ~5-10 minutes (depends on internet speed)
# =============================================================================

set -euo pipefail

# --- Configuration ---
GITHUB_REPO_SSH="git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git"
GITHUB_REPO_HTTPS="https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git"
INSTALL_DIR="$HOME/YOUR_REPO_NAME"
RCLONE_CONF_DIR="$HOME/.config/rclone"
RCLONE_CONF="$RCLONE_CONF_DIR/rclone.conf"
TAILSCALE_HOSTNAME="your-vps-hostname"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!!]${NC} $1"; }
error()  { echo -e "${RED}[XX]${NC} $1"; }
header() { echo -e "\n${BLUE}${BOLD}══════════════════════════════════════════${NC}"; echo -e "${BLUE}${BOLD}  $1${NC}"; echo -e "${BLUE}${BOLD}══════════════════════════════════════════${NC}\n"; }
ask()    { echo -en "${YELLOW}[??]${NC} $1 "; }

# =============================================================================
header "Installation Mode Selection"
# =============================================================================

echo -e "${BOLD}Choose your installation method:${NC}"
echo ""
echo -e "  ${GREEN}1) Docker Install${NC}"
echo -e "     Runs frontend + backend in a Docker container."
echo -e "     Pros: Self-contained, includes frontend locally."
echo -e "     Cons: Higher disk (~2-4 GB) and RAM usage."
echo ""
echo -e "  ${GREEN}2) Direct Install${NC}"
echo -e "     Backend runs via pm2; frontend deployed on Vercel."
echo -e "     Pros: Lightweight (~70 MB RAM), faster updates."
echo -e "     Cons: Frontend must be deployed separately on Vercel."
echo ""
ask "Enter 1 or 2:"
read -r INSTALL_MODE

if [[ "$INSTALL_MODE" != "1" && "$INSTALL_MODE" != "2" ]]; then
    error "Invalid choice. Please run the script again and enter 1 or 2."
    exit 1
fi

if [ "$INSTALL_MODE" = "1" ]; then
    log "Selected: Docker Install"
    FUNNEL_PORT=3000  # Frontend + Backend in container
else
    log "Selected: Direct Install (Backend Only, Frontend on Vercel)"
    FUNNEL_PORT=3001  # Backend only
fi

# =============================================================================
header "Step 1/10: System packages"
# =============================================================================

sudo apt-get update -qq

# Common packages
if command -v git &>/dev/null; then
    log "Git: $(git --version)"
else
    log "Installing Git..."
    sudo apt-get install -y -qq git
fi

if [ "$INSTALL_MODE" = "1" ]; then
    # --- Docker Mode: Install Docker + Docker Compose ---
    if command -v docker &>/dev/null; then
        log "Docker: $(docker --version)"
    else
        log "Installing Docker..."
        curl -fsSL https://get.docker.com | sudo sh
        sudo usermod -aG docker "$USER" 2>/dev/null || true
    fi

    if docker compose version &>/dev/null 2>&1; then
        log "Docker Compose: $(docker compose version 2>/dev/null)"
    else
        log "Installing Docker Compose..."
        sudo apt-get install -y -qq docker-compose-plugin
    fi
else
    # --- Direct Install Mode: Install Node.js, Chromium, fonts, pm2 ---
    log "Installing Chromium, Hebrew fonts, build tools..."
    sudo apt-get install -y -qq chromium fonts-noto-core fonts-noto-color-emoji culmus fonts-dejavu-core curl sqlite3 build-essential

    log "Installing Node.js 20 (NodeSource)..."
    if command -v node &>/dev/null; then
        NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
        if [ "$NODE_VER" -ge 20 ] 2>/dev/null; then
            log "Node.js already installed: $(node -v)"
        else
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
            sudo apt-get install -y -qq nodejs
        fi
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
        sudo apt-get install -y -qq nodejs
    fi
    fc-cache -f -v 2>/dev/null || true
    log "Node: $(node -v)"
fi

# Tailscale
if command -v tailscale &>/dev/null; then
    log "Tailscale: installed"
else
    log "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh 2>/dev/null || log "Tailscale may already be installed"
fi

# rclone
if command -v rclone &>/dev/null; then
    log "rclone: $(rclone version 2>/dev/null | head -1)"
else
    log "Installing rclone..."
    curl -fsSL https://rclone.org/install.sh | sudo bash 2>/dev/null || log "rclone may already be installed"
fi

# sqlite3
if command -v sqlite3 &>/dev/null; then
    log "sqlite3: installed"
else
    log "Installing sqlite3..."
    sudo apt-get install -y -qq sqlite3
fi

# =============================================================================
header "Step 2/10: Swap space"
# =============================================================================

TOTAL_RAM_MB=$(free -m | awk '/^Mem:/ {print $2}')
if [ "$TOTAL_RAM_MB" -lt 3000 ]; then
    if swapon --show | grep -q "/swapfile"; then
        log "Swap already active: $(swapon --show | tail -1)"
    else
        log "RAM is ${TOTAL_RAM_MB}MB (< 3GB). Adding 2GB swap..."
        sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        grep -q "/swapfile" /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
        log "Swap enabled: 2GB"
    fi
else
    log "RAM is ${TOTAL_RAM_MB}MB. No swap needed."
fi

# =============================================================================
header "Step 3/10: GitHub SSH key"
# =============================================================================

SSH_KEY="$HOME/.ssh/id_ed25519"
if [ -f "$SSH_KEY" ]; then
    log "SSH key already exists."
else
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "server-$(hostname)"
    log "SSH key generated."
fi

# Add GitHub to known hosts
ssh-keyscan -H github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null

# Test if we already have GitHub access
if ssh -T git@github.com 2>&1 | grep -qi "success\|authenticated"; then
    log "GitHub SSH access already configured."
else
    echo ""
    warn "═══════════════════════════════════════════════════════════"
    warn "  You need to add this SSH key as a Deploy Key on GitHub"
    warn "═══════════════════════════════════════════════════════════"
    echo ""
    echo -e "  ${BOLD}Public key:${NC}"
    echo ""
    cat "${SSH_KEY}.pub"
    echo ""
    echo "  1. Go to: https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/settings/keys"
    echo "  2. Click 'Add deploy key'"
    echo "  3. Paste the key above"
    echo "  4. Check 'Allow write access' (needed for auto-update)"
    echo "  5. Click 'Add key'"
    echo ""
    ask "Press Enter after adding the key..."
    read -r

    # Verify
    if ssh -T git@github.com 2>&1 | grep -qi "success\|authenticated"; then
        log "GitHub access verified!"
    else
        warn "Could not verify GitHub access. Will try cloning anyway..."
    fi
fi

# =============================================================================
header "Step 4/10: Clone repository"
# =============================================================================

if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repository already exists at $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull origin master 2>/dev/null || warn "git pull failed, continuing with existing code"
else
    log "Cloning repository..."
    if git clone "$GITHUB_REPO_SSH" "$INSTALL_DIR" 2>/dev/null; then
        log "Cloned via SSH."
    else
        warn "SSH clone failed. Trying HTTPS (read-only, auto-update won't work)..."
        git clone "$GITHUB_REPO_HTTPS" "$INSTALL_DIR"
    fi
fi

cd "$INSTALL_DIR"
log "Repository ready. Latest commit: $(git log --oneline -1)"

# =============================================================================
header "Step 5/10: Secrets (.env)"
# =============================================================================

mkdir -p "$INSTALL_DIR/local_data"
ENV_FILE="$INSTALL_DIR/local_data/.env"

if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
    log ".env file exists ($(wc -l < "$ENV_FILE") lines). Keeping it."
    ask "Overwrite with new content? (y/N): "
    read -r overwrite_env
    if [[ "$overwrite_env" != "y" && "$overwrite_env" != "Y" ]]; then
        log "Keeping existing .env"
    else
        echo ""
        warn "Paste your .env file content below, then press Ctrl+D on an empty line:"
        echo ""
        cat > "$ENV_FILE"
        log ".env updated."
    fi
else
    echo ""
    warn "Paste your .env file content below, then press Ctrl+D on an empty line:"
    warn "(Find it on your local machine at: local_data/.env)"
    echo ""
    cat > "$ENV_FILE"
    if [ -s "$ENV_FILE" ]; then
        log ".env created ($(wc -l < "$ENV_FILE") lines)."
    else
        error ".env is empty! Create it manually at: $ENV_FILE"
    fi
fi

# =============================================================================
header "Step 6/10: Secrets (rclone.conf)"
# =============================================================================

mkdir -p "$RCLONE_CONF_DIR"

if [ -f "$RCLONE_CONF" ] && [ -s "$RCLONE_CONF" ]; then
    log "rclone.conf exists. Remotes: $(rclone listremotes 2>/dev/null | tr '\n' ' ')"
    ask "Overwrite with new content? (y/N): "
    read -r overwrite_rclone
    if [[ "$overwrite_rclone" != "y" && "$overwrite_rclone" != "Y" ]]; then
        log "Keeping existing rclone.conf"
    else
        echo ""
        warn "Paste your rclone.conf content below, then press Ctrl+D on an empty line:"
        echo ""
        cat > "$RCLONE_CONF"
        log "rclone.conf updated. Remotes: $(rclone listremotes 2>/dev/null | tr '\n' ' ')"
    fi
else
    echo ""
    warn "Paste your rclone.conf content below, then press Ctrl+D on an empty line:"
    warn "(Find it with: rclone config file)"
    echo ""
    cat > "$RCLONE_CONF"
    if [ -s "$RCLONE_CONF" ]; then
        log "rclone.conf created. Remotes: $(rclone listremotes 2>/dev/null | tr '\n' ' ')"
    else
        error "rclone.conf is empty! Configure manually with: rclone config"
    fi
fi

# =============================================================================
header "Step 7/10: Restore data from Google Drive"
# =============================================================================

if rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
    log "Checking for backup on Google Drive..."
    if rclone lsd "gdrive:YOUR_REPO_NAME" &>/dev/null; then
        log "Backup found! Restoring..."
        bash "$INSTALL_DIR/scripts/sync-from-cloud.sh"
        log "Data restored."
    else
        warn "No backup found at gdrive:YOUR_REPO_NAME"
        warn "Starting with empty data. You can restore later with: ./scripts/sync-from-cloud.sh"
    fi
else
    warn "rclone remote 'gdrive:' not found. Skipping restore."
    warn "Configure rclone and run: ./scripts/sync-from-cloud.sh"
fi

# =============================================================================
header "Step 8/10: Build and start application"
# =============================================================================

cd "$INSTALL_DIR"

if [ "$INSTALL_MODE" = "1" ]; then
    # --- Docker Mode ---
    log "Building Docker image (this may take 5-10 minutes on first run)..."
    docker compose up -d --build 2>&1 | tail -5

    log "Waiting for services to start..."
    sleep 15

    # Health checks
    BACKEND_OK=false
    FRONTEND_OK=false

    for i in 1 2 3; do
        if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
            BACKEND_OK=true
            break
        fi
        sleep 5
    done

    for i in 1 2 3; do
        if curl -sf http://localhost:3000 > /dev/null 2>&1; then
            FRONTEND_OK=true
            break
        fi
        sleep 5
    done

    if [ "$BACKEND_OK" = true ]; then
        log "Backend: healthy (port 3001)"
    else
        error "Backend: not responding! Check logs: docker compose logs"
    fi

    if [ "$FRONTEND_OK" = true ]; then
        log "Frontend: healthy (port 3000)"
    else
        error "Frontend: not responding! Check logs: docker compose logs"
    fi
else
    # --- Direct Install Mode ---
    log "Installing pm2..."
    npm install -g pm2 2>/dev/null || sudo npm install -g pm2

    log "Installing backend dependencies..."
    cd "$INSTALL_DIR/backend"
    npm install

    log "Starting backend with pm2..."
    cd "$INSTALL_DIR"
    bash "$INSTALL_DIR/scripts/start-app.sh"

    # Health check
    BACKEND_OK=false
    sleep 5
    for i in 1 2 3; do
        if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
            BACKEND_OK=true
            break
        fi
        sleep 5
    done

    if [ "$BACKEND_OK" = true ]; then
        log "Backend: healthy (port 3001)"
    else
        error "Backend not responding! Check: pm2 logs dress-backend"
    fi
fi

# =============================================================================
header "Step 9/10: Tailscale Funnel (public HTTPS)"
# =============================================================================

if tailscale status &>/dev/null 2>&1; then
    log "Tailscale already connected."
else
    log "Connecting Tailscale..."
    echo ""
    warn "A browser link will appear. Open it and approve the connection."
    echo ""
    tailscale up --hostname="$TAILSCALE_HOSTNAME" 2>&1 || true
    sleep 3
fi

if tailscale status &>/dev/null 2>&1; then
    # Get the DNS name
    TS_HOSTNAME=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "$TAILSCALE_HOSTNAME")

    log "Starting Tailscale Funnel on port $FUNNEL_PORT..."
    tailscale funnel --bg "$FUNNEL_PORT" 2>/dev/null || warn "Funnel failed. Enable it in Tailscale admin: https://login.tailscale.com/admin/dns"

    PUBLIC_URL="https://$TS_HOSTNAME"
    log "Public URL: $PUBLIC_URL"
else
    warn "Tailscale not connected. Run manually: tailscale up --hostname=$TAILSCALE_HOSTNAME"
    warn "Then: tailscale funnel --bg $FUNNEL_PORT"
    PUBLIC_URL="(not configured yet)"
fi

# =============================================================================
header "Step 10/10: Cron jobs (auto-update + backup)"
# =============================================================================

# Select the correct auto-update script based on install mode
if [ "$INSTALL_MODE" = "1" ]; then
    AUTO_UPDATE_SCRIPT="$INSTALL_DIR/scripts/auto-update.sh"
else
    AUTO_UPDATE_SCRIPT="$INSTALL_DIR/scripts/auto-update-direct.sh"
fi

# Remove old entries and add new ones (idempotent)
(
    crontab -l 2>/dev/null | grep -v "auto-update" | grep -v "sync-to-cloud.sh"
    echo "* * * * * $AUTO_UPDATE_SCRIPT >> /dev/null 2>&1"
    echo "0 * * * * HOME=/root RCLONE_CONFIG=/root/.config/rclone/rclone.conf $INSTALL_DIR/scripts/sync-to-cloud.sh >> /dev/null 2>&1"
) | crontab -

log "Auto-update: every minute (checks GitHub for new commits)"
log "Cloud backup: every hour (syncs local_data to Google Drive)"

# =============================================================================
header "SETUP COMPLETE!"
# =============================================================================

echo ""
if [ "$INSTALL_MODE" = "1" ]; then
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║  Dress Rental Business Management - Docker Install Ready!    ║${NC}"
    echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Public URL:  ${PUBLIC_URL}${NC}"
    echo -e "${GREEN}${BOLD}║  Frontend:    http://localhost:3000                           ║${NC}"
    echo -e "${GREEN}${BOLD}║  Backend:     http://localhost:3001                           ║${NC}"
    echo -e "${GREEN}${BOLD}║  Project:     $INSTALL_DIR${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Auto-update: ON (every minute from GitHub)                  ║${NC}"
    echo -e "${GREEN}${BOLD}║  Auto-backup: ON (every hour to Google Drive)                ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Commands:                                                   ║${NC}"
    echo -e "${GREEN}${BOLD}║    docker compose logs -f        # View live logs            ║${NC}"
    echo -e "${GREEN}${BOLD}║    docker compose restart         # Restart                   ║${NC}"
    echo -e "${GREEN}${BOLD}║    ./scripts/sync-to-cloud.sh     # Manual backup            ║${NC}"
    echo -e "${GREEN}${BOLD}║    ./scripts/sync-from-cloud.sh   # Restore from backup      ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"

    if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
        log "All health checks passed. System is ready to use!"
    else
        warn "Some services may not be running. Check: docker compose logs -f"
    fi
else
    echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║  Dress Rental Business Management - Direct Install Ready!    ║${NC}"
    echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Backend:  http://localhost:3001                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Public:   ${PUBLIC_URL}${NC}"
    echo -e "${GREEN}${BOLD}║  Frontend: Deploy to Vercel (see README.md)                  ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Vercel: Set NEXT_PUBLIC_API_URL = ${PUBLIC_URL}/api${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Auto-update: ON (every minute from GitHub)                  ║${NC}"
    echo -e "${GREEN}${BOLD}║  Auto-backup: ON (every hour to Google Drive)                ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}║  Commands:                                                   ║${NC}"
    echo -e "${GREEN}${BOLD}║    pm2 logs dress-backend         # View logs                ║${NC}"
    echo -e "${GREEN}${BOLD}║    pm2 restart dress-backend      # Restart                  ║${NC}"
    echo -e "${GREEN}${BOLD}║    ./scripts/sync-to-cloud.sh     # Manual backup            ║${NC}"
    echo -e "${GREEN}${BOLD}║    ./scripts/sync-from-cloud.sh   # Restore from backup      ║${NC}"
    echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
    echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"

    if [ "$BACKEND_OK" = true ]; then
        log "Backend health check passed. System is ready!"
    else
        warn "Backend may not be running. Check: pm2 logs dress-backend"
    fi
fi
echo ""
