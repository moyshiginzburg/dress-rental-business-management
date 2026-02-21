/**
 * Local Storage Service
 * 
 * Purpose: Save files to local synced folders that automatically
 * sync with Google Drive. Used for agreements, receipts, and documents.
 * 
 * Folder Structure:
 * - Expenses: /הוצאות והכנסות עסק/[YEAR]/[CATEGORY]/
 * - Agreements: /הסכמי השכרה/[CUSTOMER_NAME - DATE]/
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { localStorageConfig } from '../config/index.js';
import { logActivity, LogCategory, LogAction } from './logger.js';

/**
 * Ensure a directory exists, create it if it doesn't
 */
function ensureDirectoryExists(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Get the base synced folder path (for backward compatibility)
 */
export function getSyncedFolderPath() {
  return localStorageConfig.expensesFolder;
}

/**
 * Get the expenses folder path
 */
export function getExpensesFolderPath() {
  return localStorageConfig.expensesFolder;
}

/**
 * Get the agreements base folder path
 */
export function getAgreementsFolderPath() {
  ensureDirectoryExists(localStorageConfig.agreementsFolder);
  return localStorageConfig.agreementsFolder;
}

/**
 * Get list of expense categories (subfolders) for a given year
 * @param {number} year - Year to get categories for
 * @returns {string[]} - Array of category names
 */
export function getExpenseCategories(year = new Date().getFullYear()) {
  try {
    const yearFolder = join(localStorageConfig.expensesFolder, year.toString());
    
    if (!existsSync(yearFolder)) {
      return [];
    }
    
    const items = readdirSync(yearFolder, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory())
      .map(item => item.name)
      .sort();
    
  } catch (error) {
    console.error('Error getting expense categories:', error.message);
    return [];
  }
}

/**
 * Format date for folder/filename (YYYY-MM-DD)
 */
function formatDateForFolder(date = new Date()) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Clean string for use in filename/folder name
 */
function cleanForFilename(str) {
  return str.replace(/[\\\/\:\*\?\"\<\>\|]/g, '_').trim();
}

/**
 * Save expense receipt to the synced folder
 * @param {Buffer|string} receiptData - Receipt file data (buffer or base64)
 * @param {string} category - Expense category (folder name)
 * @param {string} description - Description for filename
 * @param {Date} expenseDate - Date of expense (for year folder)
 * @param {string} extension - File extension (default: 'jpg')
 * @returns {string|null} - Path to saved file or null on error
 */
export function saveExpenseReceipt(receiptData, category, description, expenseDate = new Date(), extension = 'jpg') {
  try {
    const year = expenseDate.getFullYear();
    const folderPath = join(localStorageConfig.expensesFolder, year.toString(), cleanForFilename(category));
    ensureDirectoryExists(folderPath);
    
    // Create filename
    const dateStr = formatDateForFolder(expenseDate);
    const cleanDesc = cleanForFilename(description);
    const filename = `${dateStr} ${cleanDesc}.${extension}`;
    const filePath = join(folderPath, filename);
    
    // Convert to buffer if needed
    let buffer = receiptData;
    if (typeof receiptData === 'string') {
      if (receiptData.includes(';base64,')) {
        buffer = Buffer.from(receiptData.split(';base64,')[1], 'base64');
      } else {
        buffer = Buffer.from(receiptData, 'base64');
      }
    }
    
    writeFileSync(filePath, buffer);
    
    console.log(`Saved receipt to: ${filePath}`);
    
    logActivity({
      action: LogAction.CREATE,
      category: LogCategory.TRANSACTION,
      entityType: 'receipt_file',
      entityName: filename,
      details: { path: filePath, category, description },
    });
    
    return filePath;
    
  } catch (error) {
    console.error('Error saving receipt:', error.message);
    logActivity({
      action: LogAction.ERROR,
      category: LogCategory.TRANSACTION,
      errorMessage: `Failed to save receipt: ${error.message}`,
      details: { category, description },
    });
    return null;
  }
}

/**
 * Create agreement folder and save PDF
 * @param {Buffer} pdfBuffer - PDF file buffer with embedded signature
 * @param {string} customerName - Customer name
 * @param {Date} agreementDate - Date of agreement
 * @param {number} orderId - Order ID (optional)
 * @returns {object} - { folderPath, pdfPath } or null on error
 */
export function saveAgreementPdf(pdfBuffer, customerName, agreementDate = new Date(), orderId = null) {
  try {
    const dateStr = formatDateForFolder(agreementDate);
    const cleanName = cleanForFilename(customerName);
    
    // Create folder name: "שם לקוחה - תאריך" or "שם לקוחה - תאריך - מספר הזמנה"
    let folderName = `${cleanName} - ${dateStr}`;
    if (orderId) {
      folderName += ` - ${orderId}`;
    }
    
    const folderPath = join(localStorageConfig.agreementsFolder, folderName);
    ensureDirectoryExists(folderPath);
    
    // Create PDF filename
    const pdfFilename = `הסכם השכרה - ${cleanName}.pdf`;
    const pdfPath = join(folderPath, pdfFilename);
    
    // Save PDF
    writeFileSync(pdfPath, pdfBuffer);
    
    console.log(`Saved agreement PDF to: ${pdfPath}`);
    
    logActivity({
      action: LogAction.CREATE,
      category: LogCategory.AGREEMENT,
      entityType: 'agreement_pdf',
      entityName: pdfFilename,
      details: { folderPath, pdfPath, customerName, orderId },
    });
    
    return { folderPath, pdfPath };
    
  } catch (error) {
    console.error('Error saving agreement PDF:', error.message);
    logActivity({
      action: LogAction.ERROR,
      category: LogCategory.AGREEMENT,
      errorMessage: `Failed to save agreement PDF: ${error.message}`,
      details: { customerName, orderId },
    });
    return null;
  }
}

/**
 * Check if the expenses folder is accessible
 */
export function isExpensesFolderAccessible() {
  try {
    const path = localStorageConfig.expensesFolder;
    
    if (!existsSync(path)) {
      console.warn(`Expenses folder does not exist: ${path}`);
      return false;
    }
    
    readdirSync(path);
    return true;
    
  } catch (error) {
    console.error('Expenses folder not accessible:', error.message);
    return false;
  }
}

/**
 * Check if the agreements folder is accessible
 */
export function isAgreementsFolderAccessible() {
  try {
    const path = localStorageConfig.agreementsFolder;
    
    // Try to create the folder if it doesn't exist
    ensureDirectoryExists(path);
    
    readdirSync(path);
    return true;
    
  } catch (error) {
    console.error('Agreements folder not accessible:', error.message);
    return false;
  }
}

/**
 * Check if any synced folder is accessible (for startup check)
 */
export function isSyncedFolderAccessible() {
  return isExpensesFolderAccessible() || isAgreementsFolderAccessible();
}

/**
 * List files in a folder
 * @param {string} folderPath - Full folder path
 * @returns {string[]} - Array of filenames
 */
export function listFilesInFolder(folderPath) {
  try {
    if (!existsSync(folderPath)) {
      return [];
    }
    
    return readdirSync(folderPath);
    
  } catch (error) {
    console.error('Error listing files:', error.message);
    return [];
  }
}

export default {
  getSyncedFolderPath,
  getExpensesFolderPath,
  getAgreementsFolderPath,
  getExpenseCategories,
  saveExpenseReceipt,
  saveAgreementPdf,
  isExpensesFolderAccessible,
  isAgreementsFolderAccessible,
  isSyncedFolderAccessible,
  listFilesInFolder,
};
