/**
 * Configuration Module
 * 
 * Purpose: Centralize all configuration settings for the backend server.
 * Loads environment variables and provides typed configuration objects.
 * 
 * Operation: Reads from .env file (via dotenv) and exports configuration
 * objects for different parts of the application.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from local_data/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..', '..', '..');
const DATA_DIR = join(rootDir, 'local_data');

dotenv.config({ path: join(DATA_DIR, '.env') });

// Server configuration
export const serverConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  publicFrontendUrl: process.env.PUBLIC_FRONTEND_URL || '',
  isDevelopment: process.env.NODE_ENV !== 'production',
};

// Database configuration
export const dbConfig = {
  path: process.env.DATABASE_PATH || join(DATA_DIR, 'backend_data', 'business.db'),
};

// JWT authentication configuration
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'default-dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

// Business information
export const businessConfig = {
  name: process.env.BUSINESS_NAME || 'Your Business Name',
  email: process.env.BUSINESS_EMAIL || 'your-email@example.com',
  phone: process.env.BUSINESS_PHONE || 'YOUR_PHONE_NUMBER',
  address: process.env.BUSINESS_ADDRESS || 'YOUR_BUSINESS_ADDRESS',
  bankNumber: process.env.BUSINESS_BANK_NUMBER || '',
  bankBranch: process.env.BUSINESS_BANK_BRANCH || '',
  bankAccount: process.env.BUSINESS_BANK_ACCOUNT || '',
};

// Apps Script Web App configuration.
// When set, the backend uses HTTP POST to the Apps Script Web App instead of
// email for integrations AND email sending. This bypasses SMTP entirely.
export const appsScriptConfig = {
  webAppUrl: process.env.APPS_SCRIPT_WEB_APP_URL || '',
  enabled: !!process.env.APPS_SCRIPT_WEB_APP_URL,
};

// AI Configuration
export const aiConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  modelCandidates: (process.env.GEMINI_MODEL_CANDIDATES || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
};

// Local file storage (synced with Google Drive).
// On the developer machine these point to a Google Drive folder; on the VPS
// they fall back to local_data/uploads/ (which is backed up via rclone).
const DEFAULT_AGREEMENTS_FOLDER = join(DATA_DIR, 'uploads', 'agreements');
const DEFAULT_EXPENSES_FOLDER = join(DATA_DIR, 'uploads', 'expenses');

export const localStorageConfig = {
  // Base Google Drive synced folder (only valid on dev machine)
  baseFolder: '/path/to/your/google-drive',
  // Expenses and income receipts folder (note: original folder has trailing space in name)
  expensesFolder: process.env.LOCAL_EXPENSES_FOLDER || DEFAULT_EXPENSES_FOLDER,
  // Rental agreements folder (separate from expenses)
  agreementsFolder: process.env.LOCAL_AGREEMENTS_FOLDER || DEFAULT_AGREEMENTS_FOLDER,
};

// Upload configuration
export const uploadConfig = {
  uploadsDir: join(DATA_DIR, 'uploads'),
  signaturesDir: join(DATA_DIR, 'uploads', 'signatures'),
  agreementsDir: join(DATA_DIR, 'uploads', 'agreements'),
  dressesDir: join(DATA_DIR, 'uploads', 'dresses'),
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

// Export all configs as default
export default {
  server: serverConfig,
  db: dbConfig,
  auth: authConfig,
  business: businessConfig,
  upload: uploadConfig,
  localStorage: localStorageConfig,
};
