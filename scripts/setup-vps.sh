#!/bin/bash
# =============================================================================
# VPS Setup Script - Dress Rental Business Management
#
# Purpose: Bootstrap a fresh Ubuntu VPS from zero to a fully running app
# in ~5 minutes. Installs all dependencies, clones the repo, restores data
# from Google Drive, builds Docker, and starts the app with Tailscale Funnel.
#
# How it works:
#   1. Installs system packages: Docker, Docker Compose, Git, Tailscale, rclone, sqlite3
#   2. Sets up SSH key for GitHub access (creates key, shows it for user to add)
#   3. Clones the project repository
#   4. Collects secrets from user (.env content and rclone.conf content)
#   5. Restores data backup from Google Drive
#   6. Builds and starts Docker container
#   7. Sets up Tailscale Funnel for public HTTPS access
#   8. Installs auto-update cron job (polls GitHub every minute)
#   9. Installs hourly cloud backup cron job
#
# Prerequisites:
#   - Fresh Ubuntu 22.04+ VPS with root/sudo access
#   - Internet access
#   - GitHub SSH key or deploy key added to repo
#
# Usage:
#   curl -sL <raw-github-url>/scripts/setup-vps.sh | bash
#   OR
#   bash scripts/setup-vps.sh
# =============================================================================

set -euo pipefail

# --- Configuration ---
GITHUB_REPO="git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git"
INSTALL_DIR="$HOME/YOUR_REPO_NAME"
RCLONE_CONF_DIR="$HOME/.config/rclone"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; }
header() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# =============================================================================
# Step 1: Install System Dependencies
# =============================================================================
header "Step 1: Installing system dependencies"

sudo apt-get update -qq

# Git
if ! command -v git &>/dev/null; then
    log "Installing Git..."
    sudo apt-get install -y -qq git
else
    log "Git already installed: $(git --version)"
fi

# Docker
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    log "Docker installed. Note: you may need to log out and back in for group changes."
else
    log "Docker already installed: $(docker --version)"
fi

# Docker Compose (plugin)
if ! docker compose version &>/dev/null 2>&1; then
    log "Installing Docker Compose plugin..."
    sudo apt-get install -y -qq docker-compose-plugin
else
    log "Docker Compose already installed: $(docker compose version)"
fi

# Tailscale
if ! command -v tailscale &>/dev/null; then
    log "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    log "Tailscale already installed: $(tailscale version 2>/dev/null | head -1)"
fi

# rclone
if ! command -v rclone &>/dev/null; then
    log "Installing rclone..."
    curl -fsSL https://rclone.org/install.sh | sudo bash
else
    log "rclone already installed: $(rclone version | head -1)"
fi

# sqlite3 (for WAL checkpointing during backups)
if ! command -v sqlite3 &>/dev/null; then
    log "Installing sqlite3..."
    sudo apt-get install -y -qq sqlite3
else
    log "sqlite3 already installed"
fi

# =============================================================================
# Step 2: Setup SSH Key for GitHub
# =============================================================================
header "Step 2: GitHub SSH Key Setup"

SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
    log "Generating SSH key..."
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "vps-$(hostname)"
    
    echo ""
    warn "======================================"
    warn "Add this SSH key to your GitHub repo as a Deploy Key:"
    warn "GitHub → Settings → Deploy Keys → Add Deploy Key"
    warn "======================================"
    echo ""
    cat "${SSH_KEY}.pub"
    echo ""
    
    read -p "Press Enter after adding the key to GitHub..."
    
    # Add GitHub to known hosts to avoid interactive prompt
    ssh-keyscan -H github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null
else
    log "SSH key already exists at $SSH_KEY"
fi

# =============================================================================
# Step 3: Clone Repository
# =============================================================================
header "Step 3: Cloning Repository"

if [ -d "$INSTALL_DIR/.git" ]; then
    warn "Repository already exists at $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull origin master || warn "Git pull failed - continuing with existing code"
else
    log "Cloning repository..."
    git clone "$GITHUB_REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

log "Repository ready at $INSTALL_DIR"

# =============================================================================
# Step 4: Collect Secrets
# =============================================================================
header "Step 4: Setting up secrets"

# --- .env file ---
ENV_FILE="$INSTALL_DIR/local_data/.env"
mkdir -p "$INSTALL_DIR/local_data"

if [ -f "$ENV_FILE" ]; then
    warn ".env file already exists. Skipping."
else
    echo ""
    warn "Paste the contents of your .env file below."
    warn "When done, press Ctrl+D on an empty line."
    warn "(You can find it at: local_data/.env on your local machine)"
    echo ""
    
    cat > "$ENV_FILE"
    
    if [ -s "$ENV_FILE" ]; then
        log ".env file created successfully."
    else
        error ".env file is empty! You'll need to create it manually."
    fi
fi

# --- rclone.conf ---
mkdir -p "$RCLONE_CONF_DIR"
RCLONE_CONF="$RCLONE_CONF_DIR/rclone.conf"

if [ -f "$RCLONE_CONF" ]; then
    warn "rclone.conf already exists. Skipping."
else
    echo ""
    warn "Paste the contents of your rclone.conf below."
    warn "When done, press Ctrl+D on an empty line."
    warn "(Find it with: rclone config file)"
    echo ""
    
    cat > "$RCLONE_CONF"
    
    if [ -s "$RCLONE_CONF" ]; then
        log "rclone.conf created successfully."
        log "Available remotes: $(rclone listremotes)"
    else
        error "rclone.conf is empty! You'll need to configure it manually."
    fi
fi

# =============================================================================
# Step 5: Restore Data from Google Drive
# =============================================================================
header "Step 5: Restoring data from Google Drive backup"

cd "$INSTALL_DIR"

if rclone listremotes | grep -q "^gdrive:"; then
    log "Running sync-from-cloud.sh to restore backup..."
    bash scripts/sync-from-cloud.sh || warn "Restore failed or no backup found. Continuing..."
else
    warn "rclone remote 'gdrive:' not found. Skipping restore."
    warn "You can run './scripts/sync-from-cloud.sh' later after configuring rclone."
fi

# =============================================================================
# Step 6: Build and Start Docker
# =============================================================================
header "Step 6: Building and starting Docker container"

cd "$INSTALL_DIR"

# Ensure current user can run docker without sudo
if ! docker ps &>/dev/null 2>&1; then
    warn "Docker requires sudo. Running with sudo..."
    sudo docker compose up -d --build
else
    docker compose up -d --build
fi

# Wait for services to start
log "Waiting for services to start..."
sleep 15

# Health check
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    log "Backend health check passed!"
else
    warn "Backend health check failed. Check logs with: docker compose logs"
fi

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    log "Frontend is running!"
else
    warn "Frontend may still be starting. Check logs with: docker compose logs"
fi

# =============================================================================
# Step 7: Setup Tailscale Funnel
# =============================================================================
header "Step 7: Setting up Tailscale Funnel"

# Check if Tailscale is connected
if ! tailscale status &>/dev/null 2>&1; then
    warn "Tailscale is not connected yet."
    warn "Run: sudo tailscale up"
    warn "Then run: sudo tailscale funnel --bg 3000"
    warn ""
    warn "To enable Funnel, you may need to:"
    warn "  1. Visit https://login.tailscale.com/admin/dns"
    warn "  2. Enable HTTPS certificates"
    warn "  3. Enable Funnel in the ACL policy"
else
    TAILSCALE_HOSTNAME=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "unknown")
    log "Tailscale is connected as: $TAILSCALE_HOSTNAME"
    
    log "Starting Tailscale Funnel on port 3000..."
    sudo tailscale funnel --bg 3000 2>/dev/null && \
        log "Funnel is active! App accessible at: https://$TAILSCALE_HOSTNAME" || \
        warn "Funnel setup failed. You may need to enable it in Tailscale admin."
fi

# =============================================================================
# Step 8: Setup Auto-Update Cron Job
# =============================================================================
header "Step 8: Setting up auto-update and backup cron jobs"

CRON_UPDATE="* * * * * $INSTALL_DIR/scripts/auto-update.sh >> /dev/null 2>&1"
CRON_BACKUP="0 * * * * $INSTALL_DIR/scripts/sync-to-cloud.sh >> /dev/null 2>&1"

# Add cron jobs (idempotent: remove old entries first)
(
    crontab -l 2>/dev/null | grep -v "auto-update.sh" | grep -v "sync-to-cloud.sh"
    echo "$CRON_UPDATE"
    echo "$CRON_BACKUP"
) | crontab -

log "Cron jobs installed:"
log "  - Auto-update: every minute (checks for new GitHub commits)"
log "  - Cloud backup: every hour (syncs local_data to Google Drive)"

# =============================================================================
# Done!
# =============================================================================
header "Setup Complete!"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Dress Rental Business Management - VPS Ready!          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Frontend:   http://localhost:3000                           ║${NC}"
echo -e "${GREEN}║  Backend:    http://localhost:3001                           ║${NC}"
echo -e "${GREEN}║  Project:    $INSTALL_DIR${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Useful commands:                                            ║${NC}"
echo -e "${GREEN}║    docker compose logs -f        # View live logs            ║${NC}"
echo -e "${GREEN}║    docker compose restart         # Restart services          ║${NC}"
echo -e "${GREEN}║    ./scripts/sync-to-cloud.sh     # Manual backup            ║${NC}"
echo -e "${GREEN}║    ./scripts/sync-from-cloud.sh   # Restore from backup      ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Auto-update: Active (checks GitHub every minute)            ║${NC}"
echo -e "${GREEN}║  Auto-backup: Active (syncs to Drive every hour)             ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
