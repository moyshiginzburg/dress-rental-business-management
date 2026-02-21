# =============================================================================
# Dockerfile - Dress Business Management
#
# Purpose: Build and run both the Next.js frontend and Express.js backend
# in a single container. Includes Chromium and Hebrew fonts for PDF generation.
#
# How it works:
#   Stage 1 (builder) - Install all dependencies, build the Next.js frontend.
#   Stage 2 (runtime) - Slim image with Chromium, Hebrew fonts, and Node.js.
#                        Copies built frontend + backend, runs both via entrypoint.
#
# The container expects a volume mount at /app/local_data for persistent storage
# (database, uploads, logs, .env).
# =============================================================================

# --------------- Stage 1: Build ---------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build tools needed for native modules (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy root package files and workspace configs first for layer caching
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package-lock.json* ./backend/
COPY frontend/package.json frontend/package-lock.json* ./frontend/

# Install all dependencies (workspaces: backend + frontend)
RUN npm install --production=false

# Copy the rest of the source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY apps_script/ ./apps_script/

# Build the Next.js frontend for production
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd frontend && npx next build

# --------------- Stage 2: Runtime ---------------
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Install runtime system dependencies:
#   - chromium: Headless browser for PDF generation (pdfGenerator.js)
#   - fonts-noto-core: High-quality fonts with broad Unicode + Hebrew coverage
#   - fonts-noto-color-emoji: Emoji rendering in PDFs
#   - culmus: Classic Hebrew font collection (David, Miriam, Frank Ruehl, etc.)
#   - fonts-dejavu-core: Fallback sans/serif/mono fonts
#   - tini: Minimal init system to handle signals + zombie reaping in Docker
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-core \
    fonts-noto-color-emoji \
    culmus \
    fonts-dejavu-core \
    tini \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v

# Set Chromium path for pdfGenerator.js (resolveChromePath checks CHROME_BIN first)
ENV CHROME_BIN=/usr/bin/chromium
# Prevent Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1
# Run in production mode
ENV NODE_ENV=production

# Copy built artifacts from builder stage
# Root level
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules

# Backend (no build step needed, just source + deps)
COPY --from=builder /app/backend ./backend

# Frontend (built output + config)
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/package.json ./frontend/
COPY --from=builder /app/frontend/next.config.js ./frontend/
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules

# Apps Script (for reference, not executed in container)
COPY --from=builder /app/apps_script ./apps_script

# Copy entrypoint script
COPY scripts/entrypoint.sh /app/scripts/entrypoint.sh
RUN chmod +x /app/scripts/entrypoint.sh

# Create local_data directory (will be overridden by volume mount)
RUN mkdir -p /app/local_data

# Expose ports (documentation only, actual binding via network_mode: host)
EXPOSE 3000 3001

# Use tini as init to handle signals and zombie processes correctly
ENTRYPOINT ["/usr/bin/tini", "--"]

# Run both frontend and backend via the entrypoint script
CMD ["/app/scripts/entrypoint.sh"]
