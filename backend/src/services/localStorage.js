/**
 * Local Storage Service
 * 
 * Purpose: Save files to local synced folders that automatically
 * sync with Google Drive. Used for agreements, expenses, and documents.
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
 * Format date as YYMMDD for expense filenames
 */
function formatDateYYMMDD(date = new Date()) {
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Save expense receipt to the synced folder.
 *
 * Filename format: "[YYMMDD] [supplier] [description] [amount]₪.[ext]"
 * Folder structure: expenses/[YEAR]/[category]/
 *
 * @param {Buffer|string} receiptData  - Receipt file data (buffer or base64)
 * @param {string}        category     - Expense category (folder name, e.g. 'חומרים')
 * @param {string}        description  - Description of the expense
 * @param {string}        supplier     - Supplier / store name (may be empty string)
 * @param {number}        amount       - Expense amount in ILS
 * @param {Date}          expenseDate  - Date of expense (determines year sub-folder)
 * @param {string}        extension    - File extension without dot (default: 'jpg')
 * @returns {string|null} Path to the saved file, or null on error
 */
export function saveExpenseReceipt(receiptData, category, description, supplier, amount, expenseDate = new Date(), extension = 'jpg') {
  try {
    const year = expenseDate.getFullYear();
    const folderPath = join(localStorageConfig.expensesFolder, year.toString(), cleanForFilename(category));
    ensureDirectoryExists(folderPath);

    // Build filename: "[YYMMDD] [supplier] [description] [amount]₪.ext"
    const dateStr = formatDateYYMMDD(expenseDate);
    const parts = [dateStr];
    if (supplier && supplier.trim()) parts.push(cleanForFilename(supplier.trim()));
    if (description && description.trim()) parts.push(cleanForFilename(description.trim()));
    if (amount != null) parts.push(`${amount}₪`);
    const filename = `${parts.join(' ')}.${extension}`;
    const filePath = join(folderPath, filename);

    // Convert to buffer if needed
    let buffer = receiptData;
    if (typeof receiptData === 'string') {
      buffer = Buffer.from(
        receiptData.includes(';base64,') ? receiptData.split(';base64,')[1] : receiptData,
        'base64'
      );
    }

    writeFileSync(filePath, buffer);
    console.log(`Saved expense receipt to: ${filePath}`);

    logActivity({
      action: LogAction.CREATE,
      category: LogCategory.TRANSACTION,
      entityType: 'receipt_file',
      entityName: filename,
      details: { path: filePath, category, description, supplier, amount },
    });

    return filePath;

  } catch (error) {
    console.error('Error saving expense receipt:', error.message);
    logActivity({
      action: LogAction.ERROR,
      category: LogCategory.TRANSACTION,
      errorMessage: `Failed to save expense receipt: ${error.message}`,
      details: { category, description, supplier, amount },
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

/**
 * Rename or move an existing expense receipt locally
 * @param {Date} oldDate        - Original expense date
 * @param {string} oldCategory  - Original category
 * @param {string} oldSupplier  - Original supplier
 * @param {string} oldDesc      - Original notes/product
 * @param {number} oldAmount    - Original amount
 * @param {string} extension    - File extension (e.g. 'jpg')
 * @param {Date} newDate        - New expense date
 * @param {string} newCategory  - New category
 * @param {string} newSupplier  - New supplier
 * @param {string} newDesc      - New notes/product
 * @param {number} newAmount    - New amount
 * @returns {boolean} True if successful or not needed, false on error
 */
export async function renameExpenseReceipt(
  oldDate, oldCategory, oldSupplier, oldDesc, oldAmount, extension,
  newDate, newCategory, newSupplier, newDesc, newAmount
) {
  try {
    const fs = await import('fs');

    // Build OLD path
    const oldYear = oldDate.getFullYear();
    const oldFolderPath = join(localStorageConfig.expensesFolder, oldYear.toString(), cleanForFilename(oldCategory));

    const oldDateStr = formatDateYYMMDD(oldDate);
    const oldParts = [oldDateStr];
    if (oldSupplier && oldSupplier.trim()) oldParts.push(cleanForFilename(oldSupplier.trim()));
    if (oldDesc && oldDesc.trim()) oldParts.push(cleanForFilename(oldDesc.trim()));
    if (oldAmount != null) oldParts.push(`${oldAmount}₪`);
    const oldFilename = `${oldParts.join(' ')}.${extension}`;
    const oldFilePath = join(oldFolderPath, oldFilename);

    if (!existsSync(oldFilePath)) {
      console.log(`Rename skipped: Old local file not found at ${oldFilePath}`);
      return false; // Not a strict error, might only live in Drive, but return false
    }

    // Build NEW path
    const newYear = newDate.getFullYear();
    const newFolderPath = join(localStorageConfig.expensesFolder, newYear.toString(), cleanForFilename(newCategory));
    ensureDirectoryExists(newFolderPath);

    const newDateStr = formatDateYYMMDD(newDate);
    const newParts = [newDateStr];
    if (newSupplier && newSupplier.trim()) newParts.push(cleanForFilename(newSupplier.trim()));
    if (newDesc && newDesc.trim()) newParts.push(cleanForFilename(newDesc.trim()));
    if (newAmount != null) newParts.push(`${newAmount}₪`);
    const newFilename = `${newParts.join(' ')}.${extension}`;
    const newFilePath = join(newFolderPath, newFilename);

    if (oldFilePath === newFilePath) {
      return true; // No change needed
    }

    fs.renameSync(oldFilePath, newFilePath);
    console.log(`Renamed local expense receipt: ${oldFilename} -> ${newFilename}`);

    logActivity({
      action: LogAction.UPDATE,
      category: LogCategory.TRANSACTION,
      entityType: 'receipt_file',
      entityName: newFilename,
      details: { oldPath: oldFilePath, newPath: newFilePath }
    });

    return true;

  } catch (error) {
    console.error('Error renaming expense receipt locally:', error.message);
    return false;
  }
}

export default {
  getSyncedFolderPath,
  getExpensesFolderPath,
  getAgreementsFolderPath,
  getExpenseCategories,
  saveExpenseReceipt,
  renameExpenseReceipt,
  saveAgreementPdf,
  isExpensesFolderAccessible,
  isAgreementsFolderAccessible,
  isSyncedFolderAccessible,
  listFilesInFolder,
};
