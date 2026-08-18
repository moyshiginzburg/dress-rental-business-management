#!/bin/bash
# =============================================================================
# Complete Server Migration Script - Direct Install (Backend Only)
#
# Purpose: Fully automated setup on any fresh Ubuntu server for backend-only
# deployment. Frontend stays on Vercel. No Docker - backend runs via pm2.
#
# How it works:
#   1. Installs system packages (Node 20, Chromium, fonts, Git, sqlite3, rclone,
#      nginx, certbot)
#   2. Adds swap if RAM < 3GB
#   3. Creates SSH deploy key for GitHub
#   4. Clones the repository
#   5. Copies secrets from user input (.env and rclone.conf)
#   6. Restores data backup from Google Drive
#   7. Installs backend deps and starts with pm2
#   8. Configures nginx + Let's Encrypt SSL on <IP>.sslip.io (no domain needed)
#   9. Installs cron jobs (auto-update every minute, backup every hour)
#
# Prerequisites:
#   - Fresh Ubuntu 22.04+ with root/sudo
#   - .env and rclone.conf content ready to paste
#   - Access to GitHub repo settings (add deploy key)
#   - Valid email for Let's Encrypt registration
#
# Usage:
#   wget -qO setup.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/master/scripts/setup-new-server.sh
#   bash setup.sh
# =============================================================================

set -euo pipefail

# --- Configuration ---
GITHUB_REPO_SSH="git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git"
GITHUB_REPO_HTTPS="https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git"
INSTALL_DIR="${INSTALL_DIR:-$HOME/dress-rental-business-management}"
RCLONE_CONF_DIR="$HOME/.config/rclone"
RCLONE_CONF="$RCLONE_CONF_DIR/rclone.conf"
CERTBOT_EMAIL="admin@example.com"   # Used for Let's Encrypt registration (expiry notices)
BACKEND_PORT=3001                    # Backend only (frontend on Vercel)

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!!]${NC} $1"; }
error()  { echo -e "${RED}[XX]${NC} $1"; exit 1; }
header() { echo -e "\n${BLUE}${BOLD}══════════════════════════════════════════${NC}"; echo -e "${BLUE}${BOLD}  $1${NC}"; echo -e "${BLUE}${BOLD}══════════════════════════════════════════${NC}\n"; }
ask()    { echo -en "${YELLOW}[??]${NC} $1 "; }

# =============================================================================
header "Step 1/10: System packages (Direct Install)"
# =============================================================================

sudo apt-get update -qq

log "Installing Git, Chromium, fonts, build tools..."
sudo apt-get install -y -qq git chromium fonts-noto-core fonts-noto-color-emoji culmus fonts-dejavu-core curl sqlite3 build-essential

log "Installing Node.js 20 (NodeSource)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y -qq nodejs
fc-cache -f -v 2>/dev/null || true

log "Installing nginx + certbot..."
sudo apt-get install -y -qq nginx certbot python3-certbot-nginx

log "Installing rclone..."
curl -fsSL https://rclone.org/install.sh | sudo bash 2>/dev/null || log "rclone may already be installed"

log "Node: $(node -v)"

# =============================================================================
header "Step 2/10: Swap space"
# =============================================================================

TOTAL_RAM_MB=$(free -m | awk '/^Mem:/ {print $2}')
if [ "$TOTAL_RAM_MB" -lt 3000 ]; then
    if swapon --show | grep -q "/swapfile"; then
        log "Swap already active"
    else
        log "Adding 2GB swap..."
        sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        grep -q "/swapfile" /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    fi
else
    log "RAM OK. No swap needed."
fi

# =============================================================================
header "Step 3/10: GitHub SSH key"
# =============================================================================

SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "server-dress-rental-$(hostname)"
    log "SSH key generated."
fi
ssh-keyscan -H github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null

if ! ssh -T git@github.com 2>&1 | grep -qi "success\|authenticated"; then
    echo ""
    warn "Add this SSH key as a Deploy Key on GitHub:"
    echo ""
    cat "${SSH_KEY}.pub"
    echo ""
    echo "  https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/settings/keys"
    ask "Press Enter after adding the key..."
    read -r
fi

# =============================================================================
header "Step 4/10: Clone repository"
# =============================================================================

if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repository exists. Pulling..."
    cd "$INSTALL_DIR"
    git pull origin master 2>/dev/null || true
else
    mkdir -p "$(dirname "$INSTALL_DIR")"
    if git clone "$GITHUB_REPO_SSH" "$INSTALL_DIR" 2>/dev/null; then
        log "Cloned via SSH."
    else
        warn "SSH failed. Cloning via HTTPS..."
        git clone "$GITHUB_REPO_HTTPS" "$INSTALL_DIR"
    fi
fi

cd "$INSTALL_DIR"
log "Repository ready: $(git log --oneline -1)"

# =============================================================================
header "Step 5/10: Secrets (.env)"
# =============================================================================

mkdir -p "$INSTALL_DIR/local_data"
ENV_FILE="$INSTALL_DIR/local_data/.env"

if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
    log ".env exists. Keeping."
else
    warn "Paste your .env content below, then Ctrl+D on empty line:"
    cat > "$ENV_FILE"
    [ -s "$ENV_FILE" ] || error ".env is empty!"
fi

# =============================================================================
header "Step 6/10: Secrets (rclone.conf)"
# =============================================================================

mkdir -p "$RCLONE_CONF_DIR"
if [ -f "$RCLONE_CONF" ] && [ -s "$RCLONE_CONF" ]; then
    log "rclone.conf exists."
else
    warn "Paste rclone.conf content, then Ctrl+D:"
    cat > "$RCLONE_CONF"
    [ -s "$RCLONE_CONF" ] || error "rclone.conf empty!"
fi

# =============================================================================
header "Step 7/10: Restore data from Google Drive"
# =============================================================================

if rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
    if rclone lsd "gdrive:YOUR_REPO_NAME" &>/dev/null; then
        log "Restoring from backup..."
        bash "$INSTALL_DIR/scripts/sync-from-cloud.sh" || warn "Restore had issues. Continue manually with sync-from-cloud.sh"
    else
        warn "No backup found. Starting with empty data."
    fi
else
    warn "rclone remote 'moyshi' not found. Skip restore."
fi

# =============================================================================
header "Step 8/10: Backend + pm2"
# =============================================================================

cd "$INSTALL_DIR"
log "Installing pm2..."
npm install -g pm2 2>/dev/null || sudo npm install -g pm2

log "Installing backend dependencies..."
cd "$INSTALL_DIR/backend"
npm install

log "Starting backend with pm2..."
cd "$INSTALL_DIR"
bash "$INSTALL_DIR/scripts/start-app.sh"

# Health check
sleep 5
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    log "Backend: healthy (port 3001)"
else
    error "Backend not responding! Check: pm2 logs dress-backend"
fi

# =============================================================================
header "Step 9/10: nginx HTTPS reverse proxy (sslip.io + Let's Encrypt)"
# =============================================================================

# Detect this server's public IP
PUBLIC_IP=$(curl -fsSL https://api.ipify.org 2>/dev/null || curl -fsSL https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
SSLIP_DOMAIN="${PUBLIC_IP//./-}.sslip.io"
PUBLIC_URL="https://${SSLIP_DOMAIN}"

log "Detected public IP: $PUBLIC_IP"
log "sslip.io domain: $SSLIP_DOMAIN"

# Open firewall ports
if command -v ufw &>/dev/null; then
    sudo ufw allow 80/tcp comment 'HTTP for certbot'
    sudo ufw allow 443/tcp comment 'HTTPS nginx'
    sudo ufw allow 22/tcp comment 'SSH' 2>/dev/null || true
    log "UFW: ports 80/443 opened"
fi

# Write HTTP-only nginx config first (certbot needs port 80 accessible before issuing cert)
cat > /etc/nginx/sites-available/dress-backend << NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SSLIP_DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;
        proxy_buffering off;
        client_max_body_size 50M;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/dress-backend /etc/nginx/sites-enabled/dress-backend
rm -f /etc/nginx/sites-enabled/default

nginx -t && sudo systemctl restart nginx
log "nginx: HTTP proxy running"

# Verify HTTP works before getting cert
if curl -sf "http://${SSLIP_DOMAIN}/api/health" > /dev/null 2>&1; then
    log "HTTP health check OK — proceeding to cert issuance"
else
    warn "HTTP health check failed. Check nginx and backend, then run certbot manually:"
    warn "  certbot --nginx -d ${SSLIP_DOMAIN} --non-interactive --agree-tos --email ${CERTBOT_EMAIL} --redirect"
fi

# Get Let's Encrypt cert and enable HTTPS
log "Obtaining Let's Encrypt certificate for ${SSLIP_DOMAIN}..."
if certbot --nginx -d "$SSLIP_DOMAIN" \
    --non-interactive --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --redirect 2>&1; then
    log "SSL certificate obtained. HTTPS enabled: $PUBLIC_URL"
else
    warn "certbot failed. Try manually: certbot --nginx -d ${SSLIP_DOMAIN} --non-interactive --agree-tos --email ${CERTBOT_EMAIL} --redirect"
    PUBLIC_URL="http://${SSLIP_DOMAIN} (SSL pending)"
fi

# Harden nginx config: add security headers and bind to specific IP to avoid conflicts
PUBLIC_IP_ESC=$(echo "$PUBLIC_IP" | sed 's/\./\\./g')
cat > /tmp/dress-rental-nginx-final.conf << NGINXEOF
# Dress Rental Business Management - Backend Reverse Proxy
# nginx + Let's Encrypt SSL on ${SSLIP_DOMAIN}
# Replaces old Tailscale Funnel setup.

server {
    listen ${PUBLIC_IP}:80;
    server_name ${SSLIP_DOMAIN};
    if (\$host = ${SSLIP_DOMAIN}) {
        return 301 https://\$host\$request_uri;
    }
    return 404;
}

server {
    listen ${PUBLIC_IP}:443 ssl http2;
    server_name ${SSLIP_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${SSLIP_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SSLIP_DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    server_tokens off;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;
        proxy_buffering off;
        client_max_body_size 50M;
    }
}
NGINXEOF

cp /tmp/dress-rental-nginx-final.conf /etc/nginx/sites-available/dress-backend
nginx -t && sudo systemctl reload nginx && log "nginx: hardened HTTPS config applied"

# =============================================================================
header "Step 10/10: Cron jobs"
# =============================================================================

(
    crontab -l 2>/dev/null | grep -v "auto-update" | grep -v "sync-to-cloud" | grep -v "backup-to-telegram" | grep -v "daily-security-report"
    echo "* * * * * $INSTALL_DIR/scripts/auto-update-direct.sh >> /dev/null 2>&1"
    # Explicit HOME/RCLONE_CONFIG ensure backup works from cron (minimal env)
    echo "0 * * * * HOME=$HOME RCLONE_CONFIG=$HOME/.config/rclone/rclone.conf $INSTALL_DIR/scripts/sync-to-cloud.sh >> /dev/null 2>&1"
    # Daily DB backup to Telegram at 03:00
    echo "0 3 * * * $INSTALL_DIR/scripts/backup-to-telegram.sh >> /dev/null 2>&1"
    # Daily security report at 23:55 (only sent if suspicious events occurred)
    echo "55 23 * * * $INSTALL_DIR/scripts/daily-security-report.sh >> /dev/null 2>&1"
) | crontab -

log "Auto-update: every minute (GitHub → pm2 restart)"
log "Backup: every hour (local_data → Google Drive)"
log "Telegram DB backup: daily at 03:00"
log "Security report: daily at 23:55 (only if suspicious events found)"

# =============================================================================
header "SETUP COMPLETE! (Direct Install - Backend Only)"
# =============================================================================

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Dress Rental - Direct Install (Backend Only) - Ready!         ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║  Backend (internal):  http://localhost:${BACKEND_PORT}                ║${NC}"
echo -e "${GREEN}${BOLD}║  Public HTTPS:        ${PUBLIC_URL}${NC}"
echo -e "${GREEN}${BOLD}║  Frontend:            https://your-app-name.vercel.app (Vercel)  ║${NC}"
echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
echo -e "${GREEN}${BOLD}║  ACTION REQUIRED: Set in Vercel dashboard:                   ║${NC}"
echo -e "${GREEN}${BOLD}║  NEXT_PUBLIC_API_URL = ${PUBLIC_URL}/api              ║${NC}"
echo -e "${GREEN}${BOLD}║  Then redeploy the Vercel project.                           ║${NC}"
echo -e "${GREEN}${BOLD}║                                                              ║${NC}"
echo -e "${GREEN}${BOLD}║  pm2 logs dress-backend    # View backend logs                 ║${NC}"
echo -e "${GREEN}${BOLD}║  pm2 restart dress-backend # Restart backend                   ║${NC}"
echo -e "${GREEN}${BOLD}║  systemctl status nginx  # Check nginx                       ║${NC}"
echo -e "${GREEN}${BOLD}║  certbot certificates    # Check SSL cert expiry             ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
