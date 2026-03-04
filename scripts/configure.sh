#!/bin/bash
# =============================================================================
# configure.sh - Interactive Project Setup
#
# Purpose: Fill in all YOUR_* placeholders across the entire project in one
# interactive session. Run this ONCE after cloning the repo to your machine,
# before deploying anywhere.
#
# What it does:
#   1. Asks you for your GitHub repo, business info, VPS details, and Google info
#   2. Updates all scripts, configs, and the Apps Script file automatically
#   3. Generates a ready-to-use local_data/.env file with a secure JWT secret
#   4. Prints your exact next steps
#
# Usage:
#   bash scripts/configure.sh
# =============================================================================

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

header() {
    echo -e "\n${BLUE}${BOLD}══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}  $1${NC}"
    echo -e "${BLUE}${BOLD}══════════════════════════════════════════════════${NC}\n"
}
log()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $1"; }
ask()   { echo -en "  ${BOLD}${1}${NC}\n  ${YELLOW}→${NC} "; }

# --- Helper: replace placeholder in a file ---
replace_in_files() {
    local from="$1"
    local to="$2"
    shift 2
    for file in "$@"; do
        [[ -f "$file" ]] || continue
        if grep -qF "$from" "$file" 2>/dev/null; then
            sed -i "s|${from}|${to}|g" "$file"
        fi
    done
}

# ============================================================
clear
echo -e "${BLUE}${BOLD}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   👗 Dress Rental Business Management System     ║"
echo "  ║              Interactive Setup                   ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  This script fills in your details across all project files."
echo -e "  Press ${BOLD}Enter${NC} to skip any field — you can fill it in later.\n"

# ============================================================
header "Step 1 of 4 — GitHub Repository"
echo -e "  Your project will be hosted on GitHub. Enter the details of"
echo -e "  the repository you created (or are about to create).\n"

ask "Your GitHub username  (e.g. janedoe):"
read -r GITHUB_USER

ask "Repository name       (e.g. dress-rental-business):"
read -r GITHUB_REPO

# ============================================================
header "Step 2 of 4 — Business Information"
echo -e "  These details appear on customer emails, PDFs, and agreements.\n"

ask "Business name         (e.g. Jane's Evening Dresses):"
read -r BUSINESS_NAME

ask "Business email        (e.g. contact@janesdresses.com):"
read -r BUSINESS_EMAIL

ask "Business phone        (e.g. +1-555-123-4567):"
read -r BUSINESS_PHONE

ask "Business address      (e.g. 123 Main St, Tel Aviv):"
read -r BUSINESS_ADDRESS

# ============================================================
header "Step 3 of 4 — Server (VPS) Details"
echo -e "  Skip this section if you haven't set up your server yet."
echo -e "  You can re-run this script later.\n"

ask "VPS IP address        (e.g. 1.2.3.4, or press Enter to skip):"
read -r VPS_IP

ask "Tailscale domain      (the part BEFORE .ts.net, e.g. jane-vps.tail1234):"
read -r TAILSCALE_DOMAIN

# ============================================================
header "Step 4 of 4 — Google Integration (optional)"
echo -e "  Used for sending emails to customers and creating Calendar events."
echo -e "  You can set this up later — see README.md → Google Apps Script Setup.\n"

ask "Your Gmail address    (for notifications, e.g. you@gmail.com):"
read -r OWNER_EMAIL

ask "Google Drive folder ID (from the folder's URL in Drive, or press Enter to skip):"
read -r DRIVE_FOLDER_ID

# ============================================================
header "Applying your configuration…"

ALL_SCRIPTS=(
    "$PROJECT_DIR/scripts/setup-new-server.sh"
    "$PROJECT_DIR/scripts/setup-vps.sh"
    "$PROJECT_DIR/scripts/auto-update.sh"
    "$PROJECT_DIR/scripts/auto-update-direct.sh"
    "$PROJECT_DIR/scripts/sync-to-cloud.sh"
    "$PROJECT_DIR/scripts/sync-from-cloud.sh"
    "$PROJECT_DIR/apps_script/Code.js"
    "$PROJECT_DIR/SETUP.md"
    "$PROJECT_DIR/README.md"
)

if [[ -n "$GITHUB_USER" ]]; then
    replace_in_files "YOUR_GITHUB_USERNAME" "$GITHUB_USER" "${ALL_SCRIPTS[@]}"
    log "GitHub username → $GITHUB_USER"
fi

if [[ -n "$GITHUB_REPO" ]]; then
    replace_in_files "YOUR_REPO_NAME" "$GITHUB_REPO" "${ALL_SCRIPTS[@]}"
    log "Repository name → $GITHUB_REPO"
fi

if [[ -n "$VPS_IP" ]]; then
    replace_in_files "YOUR_VPS_IP" "$VPS_IP" "${ALL_SCRIPTS[@]}"
    log "VPS IP → $VPS_IP"
fi

if [[ -n "$TAILSCALE_DOMAIN" ]]; then
    replace_in_files "YOUR_TAILSCALE_DOMAIN" "$TAILSCALE_DOMAIN" "${ALL_SCRIPTS[@]}"
    log "Tailscale domain → $TAILSCALE_DOMAIN"
fi

if [[ -n "$OWNER_EMAIL" ]]; then
    replace_in_files "your-email@gmail.com" "$OWNER_EMAIL" "${ALL_SCRIPTS[@]}"
    log "Owner email → $OWNER_EMAIL"
fi

if [[ -n "$DRIVE_FOLDER_ID" ]]; then
    replace_in_files "YOUR_GOOGLE_DRIVE_FOLDER_ID" "$DRIVE_FOLDER_ID" "${ALL_SCRIPTS[@]}"
    log "Drive folder ID → $DRIVE_FOLDER_ID"
fi

# ============================================================
header "Generating local_data/.env…"

mkdir -p "$PROJECT_DIR/local_data"

# Generate a secure JWT secret
if command -v node &>/dev/null; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 2>/dev/null)
elif command -v python3 &>/dev/null; then
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(64))" 2>/dev/null)
else
    JWT_SECRET="CHANGE-THIS-$(date +%s)-$(hostname)-random-secret-please-change"
fi

VPS_URL=""
[[ -n "$TAILSCALE_DOMAIN" ]] && VPS_URL="https://${TAILSCALE_DOMAIN}.ts.net"

cat > "$PROJECT_DIR/local_data/.env" << ENVFILE
# =============================================
# Dress Rental Business Management — .env
# Generated by configure.sh on $(date '+%Y-%m-%d')
# =============================================

NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:3000
PUBLIC_FRONTEND_URL=${VPS_URL}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# Business Information
BUSINESS_NAME=${BUSINESS_NAME:-Your Business Name}
BUSINESS_EMAIL=${BUSINESS_EMAIL:-your@email.com}
BUSINESS_PHONE=${BUSINESS_PHONE}
BUSINESS_ADDRESS=${BUSINESS_ADDRESS}

# Google Apps Script Web App URL — fill in after deploying the Apps Script
# See README.md → Google Apps Script Setup
APPS_SCRIPT_WEB_APP_URL=

# Gemini AI — optional, for AI-powered receipt scanning
# Get your free key at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=
ENVFILE

log "Created local_data/.env  (JWT secret already generated ✓)"

# Warn about fields that still need manual input
MISSING=()
[[ -z "$OWNER_EMAIL" ]] && MISSING+=("APPS_SCRIPT_WEB_APP_URL (after deploying Apps Script)")
[[ -z "$VPS_URL" ]] && MISSING+=("PUBLIC_FRONTEND_URL (after setting up Tailscale on VPS)")

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo ""
    warn "Still needs to be filled in local_data/.env manually:"
    for m in "${MISSING[@]}"; do
        echo -e "    ${YELLOW}•${NC} $m"
    done
fi

# ============================================================
header "✅  Done! Your next steps:"

STEP=1

echo -e "  ${BOLD}${STEP}. Commit and push to GitHub${NC}"
((STEP++))
if [[ -n "$GITHUB_USER" && -n "$GITHUB_REPO" ]]; then
    echo -e "     ${YELLOW}git add .${NC}"
    echo -e "     ${YELLOW}git commit -m \"Configure for my business\"${NC}"
    echo -e "     ${YELLOW}git push${NC}"
fi

echo ""
echo -e "  ${BOLD}${STEP}. Deploy to your VPS${NC}  (run this ON the server)"
((STEP++))
if [[ -n "$GITHUB_USER" && -n "$GITHUB_REPO" ]]; then
    echo -e "     ${YELLOW}wget -qO setup.sh https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/master/scripts/setup-new-server.sh${NC}"
else
    echo -e "     ${YELLOW}wget -qO setup.sh https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/master/scripts/setup-new-server.sh${NC}"
fi
echo -e "     ${YELLOW}bash setup.sh${NC}"

echo ""
echo -e "  ${BOLD}${STEP}. Set up Google Apps Script${NC}  (optional but recommended)"
((STEP++))
echo -e "     See ${BOLD}README.md → Google Apps Script Setup${NC} for the 5-step guide."

echo ""
echo -e "  ${BOLD}${STEP}. Create the admin account${NC}  (after VPS is running)"
((STEP++))
echo -e "     ${YELLOW}node backend/src/scripts/create-admin.js${NC}"

echo ""
echo -e "  ─────────────────────────────────────────────────────"
echo -e "  📖 Full guide: ${BOLD}README.md${NC}"
echo -e "  🔧 Troubleshooting: ${BOLD}SETUP.md${NC}"
echo ""
