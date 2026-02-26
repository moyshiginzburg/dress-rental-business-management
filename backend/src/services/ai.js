/**
 * AI Service using Google Gemini
 * 
 * Purpose: Extract structured data from receipt images.
 */

import fetch from 'node-fetch';
import { aiConfig } from '../config/index.js';
import { normalizeMethodCode } from './paymentDetails.js';

const API_KEY = aiConfig.apiKey;
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL_CANDIDATES = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
];
const MODEL_CANDIDATES = [...new Set([...(aiConfig.modelCandidates || []), ...DEFAULT_MODEL_CANDIDATES])];
const MODELS_CACHE_TTL_MS = 30 * 60 * 1000;

let modelsCache = {
  fetchedAt: 0,
  names: null
};

function buildGenerateUrl(modelName) {
  return `${API_BASE_URL}/models/${modelName}:generateContent?key=${API_KEY}`;
}

function buildModelsListUrl() {
  return `${API_BASE_URL}/models?key=${API_KEY}`;
}

async function getAvailableModels() {
  const now = Date.now();
  if (modelsCache.names && (now - modelsCache.fetchedAt) < MODELS_CACHE_TTL_MS) {
    return modelsCache.names;
  }

  try {
    const response = await fetch(buildModelsListUrl(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const payload = await response.json();

    if (!response.ok || !Array.isArray(payload?.models)) {
      console.warn('Gemini models.list failed, falling back to configured model candidates');
      return null;
    }

    const names = new Set(
      payload.models
        .map((m) => (m?.name || '').replace(/^models\//, '').trim())
        .filter(Boolean)
    );

    modelsCache = { fetchedAt: now, names };
    return names;
  } catch (error) {
    console.warn('Gemini models.list request failed, falling back to configured model candidates');
    return null;
  }
}

async function resolveModelsToTry() {
  const available = await getAvailableModels();
  if (!available || available.size === 0) return MODEL_CANDIDATES;

  const filtered = MODEL_CANDIDATES.filter((model) => available.has(model));
  return filtered.length > 0 ? filtered : MODEL_CANDIDATES;
}

function isRetryableModelError(payload, httpStatus) {
  const code = payload?.error?.code || httpStatus;
  const status = payload?.error?.status;

  return (
    code === 404 || // model not found / disabled
    code === 429 || // quota / rate limit
    status === 'RESOURCE_EXHAUSTED' ||
    status === 'NOT_FOUND' ||
    status === 'UNAVAILABLE' ||
    status === 'INTERNAL'
  );
}

/**
 * Extract receipt details using Gemini Vision
 * @param {Buffer} fileBuffer - The image/pdf buffer
 * @param {string} mimeType - The mime type (image/jpeg, image/png, application/pdf)
 * @param {string|null} expectedPaymentMethod - Optional payment method hint from UI/API
 * @returns {Promise<Object>} - Extracted data
 */
export async function extractReceiptDetails(fileBuffer, mimeType, expectedPaymentMethod = null) {
  try {
    if (!API_KEY) {
      console.warn('Gemini API key missing, skipping AI extraction');
      return null;
    }

    console.log('Sending receipt to Gemini AI for analysis...');

    // Convert buffer to base64
    const base64Data = fileBuffer.toString('base64');

    const methodHint = normalizeMethodCode(expectedPaymentMethod);

    const bankIgnorePrompt = businessConfig.bankNumber && businessConfig.bankBranch && businessConfig.bankAccount
      ? `CRITICAL: Ignore the target/recipient account details if they match:
      - Bank: ${businessConfig.bankNumber}
      - Branch: ${businessConfig.bankBranch}
      - Account: ${businessConfig.bankAccount}
      I need the *sender's* details (the payer), not the business owner's details.`
      : `CRITICAL: If the document contains bank details for BOTH the sender and the recipient, 
      ignore the recipient (business) details and extract only the sender's details.
      I need the *sender's* details (the payer), not the business owner's details.`;

    const prompt = `
      Analyze this image of a payment receipt/confirmation. 
      Payment method hint from system (if provided): ${methodHint || 'none'}.
      Identify payment method code as one of: cash, bit, paybox, credit, transfer, check.
      Extract the following fields if visible:
      - confirmation_number (אסמכתא / אישור / מספר פעולה) - REMOVE HYPHENS/DASHES if present.
      - last_four_digits (4 ספרות אחרונות של כרטיס אשראי)
      - check_number (מספר צ'ק)
      - installments (מספר תשלומים - default to 1 if not specified or if it's a single payment)
      - bank_details: Extract bank number, branch number, and account number separately if present.
      
      ${bankIgnorePrompt}

      IMPORTANT method-specific behavior:
      - credit: prioritize confirmation_number + last_four_digits + installments
      - bit/paybox: prioritize confirmation_number only
      - transfer: prioritize confirmation_number + bank_details
      - check: prioritize check_number + bank_details
      - cash: return null for all reference fields, installments=1
      
      Return ONLY a raw JSON object (no markdown, no backticks) with this structure:
      {
        "paymentMethod": "cash|bit|paybox|credit|transfer|check|string",
        "confirmationNumber": "string or null (digits only, no dashes)",
        "lastFourDigits": "string or null",
        "checkNumber": "string or null",
        "installments": "number (default 1)",
        "bankDetails": {
          "bank": "string or null",
          "branch": "string or null",
          "account": "string or null"
        }
      }
    `;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json"
      }
    };

    const modelsToTry = await resolveModelsToTry();

    for (let i = 0; i < modelsToTry.length; i += 1) {
      const modelName = modelsToTry[i];

      try {
        const response = await fetch(buildGenerateUrl(modelName), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!data?.candidates || !data.candidates[0]?.content) {
          console.error(`Gemini API Error (${modelName}):`, JSON.stringify(data));
          if (i < modelsToTry.length - 1 && isRetryableModelError(data, response.status)) {
            continue;
          }
          return null;
        }

        const textResponse = data.candidates[0].content.parts[0].text;
        console.log(`Gemini Raw Response (${modelName}):`, textResponse);

        try {
          // Clean up potential markdown code blocks if Gemini ignores the instruction
          const jsonStr = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(jsonStr);

          // Be tolerant to key variations from LLM responses.
          const pick = (...keys) => {
            for (const key of keys) {
              if (parsed?.[key] !== undefined && parsed?.[key] !== null && parsed?.[key] !== '') {
                return parsed[key];
              }
            }
            return null;
          };

          const rawBankDetails = pick('bankDetails', 'bank_details');
          const normalizedBankDetails = rawBankDetails && typeof rawBankDetails === 'object'
            ? {
              bank: rawBankDetails.bank ?? rawBankDetails.bank_number ?? null,
              branch: rawBankDetails.branch ?? rawBankDetails.branch_number ?? null,
              account: rawBankDetails.account ?? rawBankDetails.account_number ?? null
            }
            : null;

          const rawInstallments = pick('installments', 'num_installments', 'number_of_installments');
          const installments = parseInt(rawInstallments, 10);

          let confirmationNumber = pick('confirmationNumber', 'confirmation_number', 'reference', 'reference_number');
          if (confirmationNumber) {
            // Force removal of hyphens as requested
            confirmationNumber = String(confirmationNumber).replace(/-/g, '');
          }

          return {
            paymentMethod: pick('paymentMethod', 'payment_method', 'method'),
            confirmationNumber: confirmationNumber,
            lastFourDigits: pick('lastFourDigits', 'last_four_digits', 'card_last4', 'last4'),
            checkNumber: pick('checkNumber', 'check_number'),
            installments: Number.isNaN(installments) || installments < 1 ? 1 : installments,
            bankDetails: normalizedBankDetails
          };
        } catch (parseError) {
          console.error(`Failed to parse Gemini JSON (${modelName}):`, parseError);
          return null;
        }
      } catch (requestError) {
        console.error(`Gemini request failed (${modelName}):`, requestError);
        if (i < modelsToTry.length - 1) continue;
        return null;
      }
    }

    return null;

  } catch (error) {
    console.error('AI Service Error:', error);
    return null;
  }
}
