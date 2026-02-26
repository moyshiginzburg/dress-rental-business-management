/**
 * Express Server Entry Point
 * 
 * Purpose: Main entry point for the backend API server.
 * Sets up Express with middleware, routes, and error handling.
 * 
 * Operation: Initializes Express, configures middleware,
 * mounts API routes, and starts the HTTP server.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { serverConfig, uploadConfig } from './config/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { requestLogger, errorLogger } from './middleware/activityLogger.js';
import { mkdirSync, existsSync } from 'fs';
// Google services removed - using Apps Script via Email
import { isExpensesFolderAccessible, isAgreementsFolderAccessible } from './services/localStorage.js';
import { isEmailEnabled } from './services/email.js';

// Import routes
import authRoutes from './routes/auth.js';
import customersRoutes from './routes/customers.js';
import dressesRoutes from './routes/dresses.js';
import transactionsRoutes from './routes/transactions.js';
import ordersRoutes from './routes/orders.js';
import agreementsRoutes from './routes/agreements.js';
import dashboardRoutes from './routes/dashboard.js';
import exportRoutes from './routes/export.js';
import appsScriptLogsRoutes from './routes/apps-script-logs.js';

// Ensure upload directories exist
const uploadDirs = [
  uploadConfig.uploadsDir,
  uploadConfig.signaturesDir,
  uploadConfig.agreementsDir,
  uploadConfig.dressesDir
];
for (const dir of uploadDirs) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// Create Express app
const app = express();

// Trust the first proxy (e.g., Tailscale Funnel) to accurately get client IPs for rate-limiting
app.set('trust proxy', 1);

// ===================
// Middleware
// ===================

// CORS configuration - allow multiple frontend URLs for development
const allowedOrigins = [
  serverConfig.frontendUrl,
  serverConfig.publicFrontendUrl,
  'http://localhost:3000',
  'http://localhost:3003',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3003',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or is a Vercel subdomain
    const isAllowed = allowedOrigins.includes(origin) ||
      (origin && origin.endsWith('.vercel.app')) ||
      serverConfig.isDevelopment;

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security headers — adds standard HTTP security headers
// (X-Content-Type-Options, X-Frame-Options, etc.)
// Does NOT affect JWT tokens, cookies, or existing sessions.
app.use(helmet());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(uploadConfig.uploadsDir));

// Request logging in development (console)
if (serverConfig.isDevelopment) {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// Activity logging to database
app.use(requestLogger);

// ===================
// API Routes
// ===================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: serverConfig.nodeEnv
  });
});

// Favicon handler - return empty response to avoid 404 logs
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Handle frontend routes that might accidentally hit the backend
// Redirect to frontend or return helpful message
const frontendRoutes = ['/dashboard', '/customers', '/dresses', '/orders', '/agreements', '/login', '/cashflow', '/export'];
app.get(frontendRoutes, (req, res) => {
  // If this is an API server, redirect to the frontend
  const frontendUrl = serverConfig.frontendUrl || 'http://localhost:3000';
  res.redirect(302, `${frontendUrl}${req.path}`);
});

// Rate limiter for login endpoint only.
// Allows 15 login attempts per 15-minute window per IP.
// Does NOT affect any other API endpoints or authenticated requests.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 15,                    // max 15 attempts per window
  standardHeaders: true,      // return rate limit info in RateLimit-* headers
  legacyHeaders: false,       // disable X-RateLimit-* headers
  message: {
    success: false,
    message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות.',
  },
});

// Mount route modules
app.use('/api/auth', loginRateLimiter, authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/dresses', dressesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/agreements', agreementsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/apps-script-logs', appsScriptLogsRoutes);

// ===================
// Error Handling
// ===================

// 404 handler
app.use(notFoundHandler);

// Error logging middleware
app.use(errorLogger);

// Global error handler
app.use(errorHandler);

// ===================
// Start Server
// ===================

const PORT = serverConfig.port;

const server = app.listen(PORT, async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Dress Rental Business Management - Backend           ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Server running on: http://localhost:${PORT}                   ║`);
  console.log(`║  Environment: ${serverConfig.nodeEnv.padEnd(43)}║`);
  console.log(`║  Frontend URL: ${serverConfig.frontendUrl.padEnd(42)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');

  // Google integration status
  console.log('║  ✓ Google Integration: Via Apps Script (Email)             ║');

  // Check synced folder status
  if (isAgreementsFolderAccessible()) {
    console.log('║  ✓ Agreements Folder: Accessible                            ║');
  } else {
    console.log('║  ✗ Agreements Folder: Not accessible                        ║');
  }

  if (isExpensesFolderAccessible()) {
    console.log('║  ✓ Expenses Folder: Accessible                              ║');
  } else {
    console.log('║  ○ Expenses Folder: Not accessible                          ║');
  }

  // Check email status (Apps Script)
  if (isEmailEnabled()) {
    console.log('║  ✓ Email: Active (via Apps Script)                           ║');
  } else {
    console.log('║  ○ Email: Not configured (Apps Script URL missing)            ║');
  }

  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// Graceful shutdown: close server (releases port) before exit
function shutdown() {
  console.log('\nShutting down server...');
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);  // Force exit if close hangs
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
