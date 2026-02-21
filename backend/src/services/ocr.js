/**
 * OCR Service
 * 
 * Purpose: Extract text from receipt images and parse confirmation numbers
 * using Tesseract.js for local OCR processing.
 * 
 * Operation:
 * 1. Receives image buffer or file path
 * 2. Runs OCR with Hebrew and English language support
 * 3. Parses extracted text based on payment method to find confirmation numbers
 * 4. Returns structured data with confirmation number and last 4 digits (for credit)
 * 
 * Supported payment methods:
 * - ביט (Bit): 13 digits with dashes
 * - פייבוקס (Paybox): 19 alphanumeric characters, returns first 13
 * - אשראי (Credit): up to 10 digits + last 4 digits of card
 * - העברה הפועלים (Bank transfer): 8-9 digits
 */

import Tesseract from 'tesseract.js';
import { logActivity, LogCategory, LogAction } from './logger.js';

/**
 * Extract text from image using OCR
 * @param {Buffer|string} image - Image buffer or file path
 * @returns {Promise<string>} - Extracted text
 */
async function extractText(image) {
  try {
    console.log('Starting OCR text extraction...');
    
    const result = await Tesseract.recognize(
      image,
      'heb+eng', // Hebrew and English
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Only log progress at 25%, 50%, 75%, 100%
            const progress = Math.round(m.progress * 100);
            if (progress % 25 === 0) {
              console.log(`OCR progress: ${progress}%`);
            }
          }
        }
      }
    );
    
    console.log(`OCR completed. Text length: ${result.data.text.length} characters`);
    return result.data.text;
    
  } catch (error) {
    console.error('OCR extraction failed:', error.message);
    throw error;
  }
}

/**
 * Extract receipt data based on payment method
 * @param {Buffer|string} image - Image buffer or file path
 * @param {string} paymentMethod - Payment method (ביט, פייבוקס, אשראי, העברה)
 * @returns {Promise<Object>} - { confirmationNumber, lastFourDigits, rawText }
 */
export async function extractReceiptData(image, paymentMethod) {
  try {
    console.log(`Processing receipt for payment method: ${paymentMethod}`);
    
    const fullText = await extractText(image);
    console.log('Extracted text:', fullText.substring(0, 200) + '...');
    
    let confirmationNumber = null;
    let lastFourDigits = null;
    
    if (!paymentMethod) {
      console.log('No payment method specified');
      return { confirmationNumber: null, lastFourDigits: null, rawText: fullText };
    }
    
    // ביט (Bit) - 13 digits with flexible dash patterns
    if (paymentMethod.includes('ביט')) {
      console.log('Processing ביט payment');
      const bitPattern = /\d+(?:-\d+)+/g;
      const matches = fullText.match(bitPattern);
      
      if (matches) {
        for (const match of matches) {
          const digitsOnly = match.replace(/-/g, '');
          if (digitsOnly.length === 13) {
            confirmationNumber = digitsOnly;
            console.log(`Found ביט confirmation: ${match} -> ${confirmationNumber}`);
            break;
          }
        }
      }
    }
    
    // פייבוקס (Paybox) - 19 alphanumeric, take first 13
    else if (paymentMethod.includes('פייבוקס')) {
      console.log('Processing פייבוקס payment');
      const payboxPattern = /[A-Za-z0-9]{19}/g;
      const matches = fullText.match(payboxPattern);
      
      if (matches && matches.length > 0) {
        confirmationNumber = matches[0].substring(0, 13);
        console.log(`Found פייבוקס confirmation: ${confirmationNumber}`);
      }
    }
    
    // אשראי (Credit) - up to 10 digits + last 4 card digits
    else if (paymentMethod.includes('אשראי')) {
      console.log('Processing אשראי payment');
      
      // Look for 4 consecutive digits (last 4 of card)
      const fourDigitPattern = /(?<!\d-)\b\d{4}\b(?!-\d)/g;
      const fourDigitMatches = fullText.match(fourDigitPattern);
      if (fourDigitMatches && fourDigitMatches.length > 0) {
        lastFourDigits = fourDigitMatches[0];
        console.log(`Found last 4 digits: ${lastFourDigits}`);
      }
      
      // Look for confirmation number (longest up to 10 digits)
      const confirmationPattern = /\b\d{1,10}\b/g;
      const confirmationMatches = fullText.match(confirmationPattern);
      if (confirmationMatches) {
        let longestNumber = '';
        for (const match of confirmationMatches) {
          if (match.length > longestNumber.length && match.length <= 10) {
            longestNumber = match;
          }
        }
        if (longestNumber) {
          confirmationNumber = longestNumber;
          console.log(`Found אשראי confirmation: ${confirmationNumber}`);
        }
      }
    }
    
    // העברה הפועלים (Bank transfer) - 8 or 9 digits
    else if (paymentMethod.includes('העברה')) {
      console.log('Processing העברה הפועלים payment');
      
      // Try with dashes first
      const withDashesPattern = /\d+(?:-\d+)+/g;
      const withDashesMatches = fullText.match(withDashesPattern);
      
      if (withDashesMatches) {
        for (const match of withDashesMatches) {
          const digitsOnly = match.replace(/-/g, '');
          if (digitsOnly.length === 8 || digitsOnly.length === 9) {
            confirmationNumber = digitsOnly;
            console.log(`Found הפועלים confirmation (with dashes): ${match} -> ${confirmationNumber}`);
            break;
          }
        }
      }
      
      // Fallback to non-dashed
      if (!confirmationNumber) {
        const withoutDashesPattern = /\b\d{8,9}\b/g;
        const withoutDashesMatches = fullText.match(withoutDashesPattern);
        if (withoutDashesMatches && withoutDashesMatches.length > 0) {
          confirmationNumber = withoutDashesMatches[0];
          console.log(`Found הפועלים confirmation (no dashes): ${confirmationNumber}`);
        }
      }
    }
    
    // Log the OCR activity
    await logActivity({
      category: LogCategory.TRANSACTION,
      action: LogAction.READ,
      entityType: 'receipt_ocr',
      details: {
        paymentMethod,
        confirmationFound: !!confirmationNumber,
        lastFourFound: !!lastFourDigits
      }
    }).catch(err => console.error('Failed to log OCR activity:', err));
    
    return {
      confirmationNumber,
      lastFourDigits,
      rawText: fullText
    };
    
  } catch (error) {
    console.error('Receipt data extraction failed:', error.message);
    return {
      confirmationNumber: null,
      lastFourDigits: null,
      error: error.message
    };
  }
}

/**
 * Test OCR functionality
 * @param {string} imagePath - Path to test image
 * @param {string} paymentMethod - Payment method to test with
 */
export async function testOcr(imagePath, paymentMethod = 'ביט') {
  console.log('=== OCR Test ===');
  console.log(`Image: ${imagePath}`);
  console.log(`Payment method: ${paymentMethod}`);
  
  const result = await extractReceiptData(imagePath, paymentMethod);
  
  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

export default {
  extractReceiptData,
  extractText,
  testOcr
};
