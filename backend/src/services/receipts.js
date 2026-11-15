/**
 * Receipts Service (SmartInvoice integration)
 *
 * Purpose: Issue a legal receipt (קבלה) through the SmartInvoice API for an
 * income transaction, keep a local record of every receipt that was requested,
 * and serve the receipt PDF back to the app.
 *
 * Operation:
 *   1. requestReceipt() writes a `receipts` row with status 'pending' right
 *      when the income is saved (so the UI immediately shows "issuing...").
 *   2. issueReceipt() runs later (in the background, after the AI receipt
 *      extraction filled in the payment references). It reads the transaction,
 *      builds the SmartInvoice request (customer, one line "for what", one
 *      payment with all the reference details folded into `reference`), and
 *      POSTs it with an Idempotency-Key so a retry can never create a second
 *      legal document. The row is then marked 'issued' or 'failed'.
 *   3. When a receipt was issued and the customer has an email, the receipt
 *      is emailed to her by us (Apps Script, the business Gmail) with the PDF
 *      attached - never by SmartInvoice, which only ever receives her name.
 *   4. The live receipt PDF is downloaded once and kept on the server
 *      (local_data/uploads/receipts/<year>/...), which is what the app, the
 *      owner's email and the customer's link serve. It is also saved to Google
 *      Drive (through Apps Script) as "<year>/הכנסות <year>/<yymmdd> <customer> <amount>₪.pdf".
 *   5. Every receipt that was requested but not issued triggers a dedicated
 *      Telegram alert; receipts left 'pending' by a restart are retried by
 *      recoverStuckReceipts() (called periodically from index.js).
 *   6. The WhatsApp message links to SmartInvoice's own public view of the receipt
 *      (the page behind the QR code on the PDF), verified before every share; if
 *      it does not open, it falls back to our signed link (createReceiptShareToken).
 *   7. The name printed on the receipt is chosen per receipt (default: the
 *      customer's saved receipt name, else her app name) and remembered in
 *      customers.receipt_name for her next receipts.
 *
 * Integration notes: docs/SMARTINVOICE.md. The provider changes its API often:
 * re-check the live docs (https://smartinvoices.co.il/docs.html) before changing this.
 * The app has no "test mode": an sk_test_ key makes SmartInvoice answer with a
 * dry-run preview, which is treated as a FAILURE (receipt not issued + alert),
 * never as an issued receipt. Rows with is_test=1 (sandbox previews) are treated
 * as "no receipt".
 *
 * Document type: every receipt is sent as `invoice_type: 'receipt'` (קבלה, no VAT),
 * which fits an exempt dealer (עוסק פטור) or any business that issues plain receipts.
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import db, { run, get, all } from '../db/database.js';
import { createReceiptsTable } from '../db/schema.js';
import { smartInvoiceConfig, serverConfig, authConfig, uploadConfig, businessConfig } from '../config/index.js';
import { sanitizePaymentDetails } from './paymentDetails.js';
import { logActivity, LogAction, LogCategory } from './logger.js';
import { sendTelegramAlert, sendTelegramAlertConfirmed } from './telegram.js';
import { isEmailEnabled, sendFileToDrive, sendReceiptToCustomer } from './email.js';
import { israelTodayIso } from '../utils/israelDate.js';

// The auto-update only restarts the backend (it does not run migrate.js), so an existing
// database gets the receipts table and the customer display-name column here, on first import.
// Idempotent. Skipped while the customers table does not exist yet (a fresh database before
// `npm run db:migrate`, which creates all of this from db/schema.js).
const customerColumns = new Set(db.pragma('table_info(customers)').map((c) => c.name));
if (customerColumns.size > 0) {
  db.exec(createReceiptsTable);
  // The customer's display name on agreements and receipts (NULL = same as customers.name).
  if (!customerColumns.has('receipt_name')) db.exec('ALTER TABLE customers ADD COLUMN receipt_name TEXT');
}

// Public base URL for links sent to customers (same domain as agreement links).
const PUBLIC_APP_URL = (process.env.PUBLIC_FRONTEND_URL || 'https://dress-rental.vercel.app').replace(/\/$/, '');

// Validity of the public receipt link sent on WhatsApp.
const SHARE_LINK_EXPIRY = '90d';

// Google Drive folder per year, relative to the Apps Script base folder (CONFIG.DRIVE_BASE_FOLDER_ID).
const driveIncomeFolder = (year) => `${year}/הכנסות ${year}`;

// SmartInvoice limit for payments[].reference (verified: field_too_long above 100).
const MAX_REFERENCE_LENGTH = 100;

// A pending row older than this is treated as stuck (e.g. the process restarted mid-request).
// Generous on purpose: a new income waits for the AI extraction before its receipt is sent.
const STUCK_PENDING_MS = 10 * 60 * 1000;

// SmartInvoice text limits (`<field>_too_long` above 255); kept well inside them.
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_NAME_LENGTH = 255;

// Default "for what" line per income category.
const DEFAULT_DESCRIPTIONS = {
  order: 'שמלה',
  repair: 'תיקונים',
  other: 'שמלה',
};

// App payment method code -> SmartInvoice payment method.
// SmartInvoice has no PayBox and no "other": both are sent as a bank transfer, with the
// real method written at the start of the reference.
const METHOD_MAP = {
  cash: 'cash',
  credit: 'credit_card',
  bit: 'bit',
  transfer: 'bank_transfer',
  check: 'check',
};
const FALLBACK_METHOD = 'bank_transfer';

// Hebrew labels of the app's payment method codes (for Telegram alerts).
const METHOD_LABELS_HE = {
  cash: 'מזומן', credit: 'אשראי', bit: 'ביט', paybox: 'פייבוקס', transfer: 'העברה', check: "צ'ק", other: 'אחר',
};

// Reference used when a bank transfer has no details at all. SmartInvoice
// rejects a transfer without a reference; "0" is sent instead of failing the receipt.
const EMPTY_TRANSFER_REFERENCE = '0';

// Values that mean "no specific method" (legacy rows store 'לא צוין').
const GENERIC_METHOD_VALUES = new Set(['other', 'לא צוין']);

/**
 * SmartInvoice method for an app payment method code. PayBox, "other" and any
 * unknown free-text method fall back to a bank transfer.
 */
export function toSmartInvoiceMethod(appMethod) {
  return METHOD_MAP[appMethod] || FALLBACK_METHOD;
}

/** Label written at the start of the reference when the method was mapped to a bank transfer. */
function fallbackMethodLabel(appMethod) {
  if (METHOD_MAP[appMethod]) return null;
  if (appMethod === 'paybox') return 'פייבוקס';
  if (!appMethod || GENERIC_METHOD_VALUES.has(appMethod)) return 'אמצעי תשלום אחר';
  return String(appMethod); // free-text method typed by the user, kept as written
}

// Hebrew messages shown to the user for known SmartInvoice error codes.
const ERROR_MESSAGES_HE = {
  not_configured: 'הפקת קבלות אינה מוגדרת במערכת (חסר מפתח SmartInvoice)',
  transaction_missing: 'התנועה של הקבלה לא נמצאה',
  not_income: 'אפשר להפיק קבלה רק עבור הכנסה',
  invalid_amount: 'סכום התנועה אינו תקין להפקת קבלה',
  transfer_reference_required: 'בהעברה בנקאית חובה לציין אסמכתא. יש לעדכן את מספר האסמכתא בתנועה ולנסות שוב',
  cash_law_blocked: 'סכום המזומן חורג מהמותר בחוק צמצום השימוש במזומן',
  payment_mismatch: 'סכום התשלום אינו תואם לסכום הקבלה',
  invalid_token: 'מפתח ה-API של SmartInvoice שגוי או לא בתוקף',
  insufficient_scope: 'למפתח ה-API של SmartInvoice אין הרשאה להפקת מסמכים',
  rate_limited: 'יותר מדי בקשות ל-SmartInvoice. יש לנסות שוב בעוד דקה',
  api_quota_exceeded: 'נוצלה מכסת המסמכים החודשית ב-SmartInvoice',
  invalid_phone: 'מספר הטלפון של הלקוחה אינו תקין לקבלה',
  invalid_email: 'כתובת המייל של הלקוחה אינה תקינה לקבלה',
  network_error: 'אין תקשורת עם SmartInvoice. יש לנסות שוב',
  duplicate_check_failed: 'לא ניתן היה לוודא מול SmartInvoice שהקבלה לא הופקה כבר, ולכן לא נשלחה בקשה נוספת (למניעת קבלה כפולה). יש לנסות שוב מאוחר יותר',
  test_key: 'המפתח שמוגדר במערכת הוא מפתח בדיקה (sk_test): SmartInvoice אישרה את הנתונים, אבל לא הופקה קבלה. יש להגדיר מפתח אמיתי ולנסות שוב',
  duplicate_ambiguous: 'נמצאו ב-SmartInvoice כמה קבלות שעשויות להיות הקבלה הזו, ולכן לא הופקה קבלה נוספת. יש לבדוק בפורטל SmartInvoice',
  server_error: 'שגיאה זמנית בשרת SmartInvoice. יש לנסות שוב',
};

// Receipt ids currently being sent, so two concurrent calls never race on one receipt.
const inFlight = new Set();

// Post-issue work (server copy -> Drive copy -> customer email) still running, per receipt id.
const followUpsByReceipt = new Map();

/** Resolves when the post-issue work of a receipt (copies + customer email) is done. */
export function waitForReceiptFollowUps(receiptId) {
  return followUpsByReceipt.get(Number(receiptId)) || Promise.resolve();
}

/** Whether the receipt feature is available (a SmartInvoice key is configured). Used by the UI. */
export function getReceiptsStatus() {
  return { enabled: smartInvoiceConfig.enabled };
}

/** Default "for what" text for an income category ('order' | 'repair' | 'other'). */
export function getDefaultReceiptDescription(category) {
  return DEFAULT_DESCRIPTIONS[category] || DEFAULT_DESCRIPTIONS.other;
}

/**
 * Normalize the `receipt` options object sent by the frontend.
 * Returns null when no receipt was requested.
 */
export function parseReceiptRequest(value, category) {
  if (!value || typeof value !== 'object' || !value.issue) return null;
  const description = (String(value.description || '').trim() || getDefaultReceiptDescription(category)).slice(0, MAX_DESCRIPTION_LENGTH);
  const notes = String(value.notes || '').trim() || null;
  const customerName = String(value.customer_name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) || null;
  return { description, notes, customerName };
}

/** The name to print on a customer's receipts: her saved receipt name, else her app name. */
export function getCustomerReceiptName(customerId) {
  const c = customerId ? get('SELECT name, receipt_name FROM customers WHERE id = ?', [customerId]) : null;
  return c ? (c.receipt_name || c.name) : null;
}

/**
 * Remember the name chosen for a receipt on the customer, for her next receipts.
 * Stored only when it differs from her app name (NULL = follow the app name, so a later
 * correction of the name in the app applies to receipts too).
 */
export function saveCustomerReceiptName(customerId, receiptName) {
  if (!customerId || !receiptName) return;
  const c = get('SELECT name, receipt_name FROM customers WHERE id = ?', [customerId]);
  if (!c) return;
  const appName = String(c.name || '').replace(/\s+/g, ' ').trim();
  const value = receiptName === appName ? null : receiptName;
  if (value !== (c.receipt_name || null)) {
    run('UPDATE customers SET receipt_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [value, customerId]);
  }
}

function parseBankDetails(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Fold every payment detail the app knows (confirmation number, card digits,
 * installments, check number, bank details) into the single `reference`
 * string that SmartInvoice prints on the receipt (max 100 chars).
 * PayBox / other methods (sent as a bank transfer) start with the real method name.
 * A bank transfer with no details at all gets "0", so the receipt never fails for that.
 */
export function buildPaymentReference(transaction) {
  const p = sanitizePaymentDetails({
    paymentMethod: transaction.payment_method,
    confirmationNumber: transaction.confirmation_number,
    lastFourDigits: transaction.last_four_digits,
    checkNumber: transaction.check_number,
    bankDetails: transaction.bank_details,
    installments: transaction.installments,
  });
  const bank = parseBankDetails(p.bankDetails);
  const parts = [];

  const methodLabel = fallbackMethodLabel(p.paymentMethod);
  if (methodLabel) parts.push(methodLabel);
  if (p.confirmationNumber) parts.push(p.paymentMethod === 'credit' ? `אישור ${p.confirmationNumber}` : p.confirmationNumber);
  if (p.lastFourDigits) parts.push(`כרטיס ${p.lastFourDigits}`);
  if (p.paymentMethod === 'credit' && p.installments > 1) parts.push(`${p.installments} תשלומים`);
  if (p.checkNumber) parts.push(`צ'ק ${p.checkNumber}`);
  if (bank?.bank) parts.push(`בנק ${bank.bank}`);
  if (bank?.branch) parts.push(`סניף ${bank.branch}`);
  if (bank?.account) parts.push(`חשבון ${bank.account}`);

  const reference = parts.join(' · ');
  if (!reference) return toSmartInvoiceMethod(p.paymentMethod) === 'bank_transfer' ? EMPTY_TRANSFER_REFERENCE : null;
  return reference.length > MAX_REFERENCE_LENGTH ? reference.slice(0, MAX_REFERENCE_LENGTH) : reference;
}

/**
 * Create (or re-arm) the receipt row for a transaction, with status 'pending'.
 * An already issued receipt is returned untouched - a transaction gets at most one receipt.
 */
export function requestReceipt(transactionId, { description, notes }) {
  const existing = get('SELECT * FROM receipts WHERE transaction_id = ?', [transactionId]);
  if (existing) {
    if (existing.status === 'issued' && !isObsoleteTestReceipt(existing)) return existing;
    if (isObsoleteTestReceipt(existing)) {
      // A sandbox preview is not a receipt: once a live key is used, start this row over
      // (nothing was ever issued for it, so no duplicate check is needed).
      run(
        `UPDATE receipts SET is_test = 0, document_id = NULL, document_number = NULL, pdf_url = NULL,
           email_sent_to = NULL, drive_file_name = NULL, local_pdf_path = NULL, issued_at = NULL,
           last_request_at = NULL, attempt = attempt + 1 WHERE id = ?`,
        [existing.id]
      );
    }
    run(
      `UPDATE receipts SET status = 'pending', description = ?, notes = ?, error_code = NULL,
         error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [description, notes || null, existing.id]
    );
    return get('SELECT * FROM receipts WHERE id = ?', [existing.id]);
  }

  const result = run(
    'INSERT INTO receipts (transaction_id, status, description, notes) VALUES (?, \'pending\', ?, ?)',
    [transactionId, description, notes || null]
  );
  return get('SELECT * FROM receipts WHERE id = ?', [result.lastInsertRowid]);
}

/**
 * A sandbox preview (is_test=1): never a real receipt, so for
 * every purpose (UI, "already issued" checks) the transaction has no receipt.
 */
export function isObsoleteTestReceipt(receipt) {
  return !!receipt && !!receipt.is_test;
}

/** The transaction's receipt as the app should see it (obsolete test receipts hidden). */
export function getVisibleReceiptByTransactionId(transactionId) {
  const receipt = getReceiptByTransactionId(transactionId);
  return receipt && !isObsoleteTestReceipt(receipt) ? receipt : null;
}

/** True when a pending receipt has been waiting long enough to be considered stuck. */
export function isStuckPending(receipt) {
  if (!receipt || receipt.status !== 'pending') return false;
  const updated = new Date(`${String(receipt.updated_at).replace(' ', 'T')}Z`).getTime();
  return Number.isFinite(updated) && Date.now() - updated > STUCK_PENDING_MS;
}

export function getReceiptById(id) {
  return get('SELECT * FROM receipts WHERE id = ?', [id]);
}

export function getReceiptByTransactionId(transactionId) {
  return get('SELECT * FROM receipts WHERE transaction_id = ?', [transactionId]);
}

/**
 * `technicalDetail` (optional, English) is the exact low-level reason, e.g. the network error of
 * each attempt. It goes to the logs only; the owner sees the Hebrew `message`.
 * `outage: true` = the failure was a temporary problem on SmartInvoice's side (no connection,
 * 5xx, rate limit): the receipt is handed to the outage watcher, which tells the owner on
 * Telegram once SmartInvoice answers again.
 */
function markFailed(receipt, code, message, { consumeKey, technicalDetail = null, outage = false }) {
  // A definitive rejection (4xx) means no document exists for this key, and the
  // next attempt may send a different body - so it must use a fresh key
  // (same key + different body = 422 idempotency_key_reused). After a network
  // failure the document MAY exist, so the key is kept: a retry then replays it.
  run(
    `UPDATE receipts SET status = 'failed', error_code = ?, error_message = ?,
       attempt = attempt + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [code, message, consumeKey ? 1 : 0, receipt.id]
  );
  // Logged without errorMessage on purpose: the dedicated alert below replaces the logger's generic one.
  console.error(`Receipt ${receipt.id} (transaction ${receipt.transaction_id}) failed (${code}): ${message}${technicalDetail ? ` | ${technicalDetail}` : ''}`);
  const details = { transactionId: receipt.transaction_id, status: 'failed', code, message };
  if (technicalDetail) details.technicalDetail = technicalDetail;
  logActivity({
    action: LogAction.UPDATE,
    category: LogCategory.TRANSACTION,
    entityType: 'receipt',
    entityId: receipt.id,
    entityName: receipt.customer_name || null,
    details,
  });
  alertReceiptNotIssued(receipt.id, message, { outage });
  if (outage) watchReceiptForOutage(receipt.id, technicalDetail);
  return get('SELECT * FROM receipts WHERE id = ?', [receipt.id]);
}

/** Telegram alert (the usual alerts group) for a receipt that was requested but not issued. */
function alertReceiptNotIssued(receiptId, reason, { outage = false } = {}) {
  const r = get(
    `SELECT r.*, t.amount AS tx_amount, t.customer_name AS tx_customer, t.payment_method AS tx_method
     FROM receipts r LEFT JOIN transactions t ON t.id = r.transaction_id WHERE r.id = ?`,
    [receiptId]
  );
  if (!r) return;
  const lines = [
    '🧾❌ קבלה לא הופקה',
    `לקוחה: ${r.tx_customer || r.customer_name || 'לא ידוע'}`,
    `סכום: ₪${r.tx_amount ?? r.amount ?? '?'}${r.tx_method ? ` (${METHOD_LABELS_HE[r.tx_method] || r.tx_method})` : ''}`,
    `סיבה: ${reason}`,
    r.transaction_id
      ? `לניסיון חוזר: ${PUBLIC_APP_URL}/dashboard/transactions/${r.transaction_id}/edit`
      : 'התנועה נמחקה',
  ];
  if (outage && r.transaction_id) lines.push('כשמערכת הקבלות תחזור לפעול תישלח הודעה נוספת');
  sendTelegramAlert(lines.join('\n'));
}

/** Telegram alert for a live receipt whose PDF could not be saved to Google Drive. */
function alertDriveSaveFailed(receipt, reason) {
  sendTelegramAlert([
    '📁⚠️ קבלה הופקה אבל לא נשמרה בגוגל דרייב',
    `קבלה: ${receipt.document_number || receipt.id} · לקוחה: ${receipt.customer_name || 'לא ידוע'} · ₪${receipt.amount ?? '?'}`,
    `סיבה: ${reason}`,
  ].join('\n'));
}

function heMessage(code, fallback) {
  return ERROR_MESSAGES_HE[code] || `הפקת הקבלה נכשלה${fallback ? `: ${fallback}` : ''}`;
}

/**
 * Turn a fetch() failure into a short technical description for the logs, e.g.
 * "timeout after 30000ms" or "TypeError: fetch failed (ECONNRESET: socket hang up)".
 * Node's fetch hides the real reason in error.cause, so it is unwrapped here.
 */
function describeNetworkError(error, timeoutMs = smartInvoiceConfig.timeoutMs) {
  if (error?.name === 'TimeoutError') return `timeout after ${timeoutMs}ms`;
  const base = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
  const cause = error?.cause;
  if (!cause) return base;
  const causeText = [cause.code, cause.message].filter(Boolean).join(': ');
  return causeText ? `${base} (${causeText})` : base;
}

/**
 * Low-level call to the SmartInvoice API. Retries network errors, 429 and 5xx
 * (and 409 idempotency_in_progress), but only when the request is safe to
 * repeat: GETs always, POSTs only when they carry an Idempotency-Key.
 * Every failed attempt is logged with its exact reason (timeout, connection
 * error, HTTP status), so a provider outage can be told apart from a problem
 * on our side. Resolves to { status, body } or { networkError, attempts },
 * where `attempts` lists the reason of each failed attempt.
 */
async function callSmartInvoice(method, path, { body, idempotencyKey, raw = false } = {}) {
  const headers = {
    Authorization: `Bearer ${smartInvoiceConfig.apiKey}`,
    Accept: raw ? 'application/pdf' : 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const maxRetries = method === 'GET' || idempotencyKey ? 2 : 0;
  const attempts = [];
  const logPath = path.split('?')[0];
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${smartInvoiceConfig.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(smartInvoiceConfig.timeoutMs),
      });

      if (raw && res.ok) {
        return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') };
      }

      let parsed = {};
      try { parsed = await res.json(); } catch { parsed = {}; }

      const retryable = res.status === 429 || res.status >= 500 || parsed.code === 'idempotency_in_progress';
      if (retryable) {
        const reason = `HTTP ${res.status}${parsed.code ? ` (${parsed.code})` : ''}`;
        attempts.push(reason);
        console.warn(`SmartInvoice ${method} ${logPath}: attempt ${attempt + 1}/${maxRetries + 1} got ${reason}`);
      }
      if (retryable && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return { status: res.status, body: parsed };
    } catch (error) {
      const reason = describeNetworkError(error);
      attempts.push(reason);
      console.warn(`SmartInvoice ${method} ${logPath}: attempt ${attempt + 1}/${maxRetries + 1} failed - ${reason}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return { networkError: error, attempts };
    }
  }
}

/**
 * Issue the receipt of a 'pending' / 'failed' receipt row through SmartInvoice.
 * Never throws: the outcome is stored on the row, which is returned.
 *
 * The receipt is "issued" as soon as SmartInvoice answers (about a second). The post-issue
 * work - server copy, Drive copy (Apps Script) and customer email (Apps Script), a few seconds
 * each - runs after that; by default this waits for it, `waitForFollowUps: false` returns at
 * once (used by the edit-page button, so the owner is not kept waiting).
 */
export async function issueReceipt(receiptId, { waitForFollowUps = true } = {}) {
  const result = await issueReceiptNow(receiptId);
  if (waitForFollowUps && result?.status === 'issued') {
    await waitForReceiptFollowUps(result.id);
    return getReceiptById(result.id);
  }
  return result;
}

async function issueReceiptNow(receiptId) {
  if (inFlight.has(receiptId)) return getReceiptById(receiptId);
  inFlight.add(receiptId);

  try {
    let receipt = getReceiptById(receiptId);
    if (!receipt || receipt.status === 'issued') return receipt;

    if (!smartInvoiceConfig.enabled) {
      return markFailed(receipt, 'not_configured', heMessage('not_configured'), { consumeKey: false });
    }

    const transaction = receipt.transaction_id
      ? get(
        `SELECT t.*, c.name AS customer_full_name, c.receipt_name AS customer_receipt_name,
                c.phone AS customer_phone, c.email AS customer_email
         FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.id = ?`,
        [receipt.transaction_id]
      )
      : null;
    if (!transaction) return markFailed(receipt, 'transaction_missing', heMessage('transaction_missing'), { consumeKey: false });
    if (transaction.type !== 'income') return markFailed(receipt, 'not_income', heMessage('not_income'), { consumeKey: false });

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return markFailed(receipt, 'invalid_amount', heMessage('invalid_amount'), { consumeKey: false });
    }

    const appMethod = sanitizePaymentDetails({ paymentMethod: transaction.payment_method }).paymentMethod;
    const siMethod = toSmartInvoiceMethod(appMethod);

    const reference = buildPaymentReference(transaction);
    // Printed name: the customer's receipt name (chosen in the receipt options), else her app name.
    const customerName = String(transaction.customer_receipt_name || transaction.customer_full_name || transaction.customer_name || 'לקוחה')
      .trim().slice(0, MAX_NAME_LENGTH);
    // Name only, on purpose: SmartInvoice never gets an email (it could store it and email the
    // customer on its own - we send her receipt ourselves) or a phone (validated 7-15 digits and
    // used to merge customers on their side). Neither is needed on a receipt.
    const customer = { name: customerName };

    const payment = { method: siMethod, amount };
    if (reference) payment.reference = reference;

    const requestBody = {
      invoice_type: 'receipt',
      // Explicit issue date = today in Israel, so a receipt issued after midnight is never
      // dated by a provider-side UTC "today" (the Drive / server file names use Israel time too).
      issue_date: israelTodayIso(),
      customer,
      items: [{ description: receipt.description, quantity: 1, unit_price: amount }],
      payments: [payment],
    };
    if (receipt.notes) requestBody.notes = receipt.notes;

    // Duplicate guard: if a request for this receipt was ever sent before, its outcome may be
    // unknown (crash, timeout, 5xx). Before sending again, look in SmartInvoice for a receipt
    // that already matches; adopt it instead of issuing a second one.
    if (receipt.last_request_at) {
      const check = await findExistingReceiptDocument(receipt, { amount, names: [receipt.customer_name, customerName] });
      if (check.error) {
        return markFailed(receipt, 'duplicate_check_failed', heMessage('duplicate_check_failed'), {
          consumeKey: false,
          technicalDetail: check.detail,
          outage: check.outage,
        });
      }
      // Safe direction: anything unclear (several matches, or a same-amount receipt under a
      // different name) stops here with an alert, rather than risking a second legal receipt.
      if (check.matches.length > 1 || (check.matches.length === 0 && check.sameAmountOtherName > 0)) {
        return markFailed(receipt, 'duplicate_ambiguous', heMessage('duplicate_ambiguous'), { consumeKey: false });
      }
      if (check.matches.length === 1) {
        const existing = check.matches[0];
        console.warn(`Receipt ${receipt.id}: found existing SmartInvoice document ${existing.id} - adopting it, not issuing again`);
        run(
          `UPDATE receipts SET customer_name = ?, amount = ?, payment_method = ?, payment_reference = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [receipt.customer_name || customerName, amount, siMethod, receipt.payment_reference || reference, receipt.id]
        );
        return completeIssuedReceipt(getReceiptById(receipt.id), transaction, {
          documentId: existing.id,
          documentNumber: documentNumberOf(existing),
          pdfUrl: existing.pdf_url || null,
          adopted: true,
        });
      }
    }

    // Snapshot what is being sent (kept even if the transaction is deleted later).
    run(
      `UPDATE receipts SET customer_name = ?, amount = ?, payment_method = ?, payment_reference = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [customerName, amount, siMethod, reference, receipt.id]
    );
    receipt = getReceiptById(receipt.id);

    // Unique per receipt row + attempt; the prefixes keep dev / prod and test / live keys apart.
    const envTag = serverConfig.isDevelopment ? 'dev' : 'prod';
    const modeTag = smartInvoiceConfig.testMode ? 'test' : 'live';
    const idempotencyKey = `dress-rental-${envTag}-${modeTag}-receipt-${receipt.id}-${receipt.attempt}`;

    // last_request_at = the earliest request whose outcome is still UNKNOWN. It is set BEFORE
    // sending (a crash mid-request leaves it set), and cleared again only by a definitive
    // rejection of a request that was the only one in doubt. While set, any further attempt
    // runs the duplicate check above.
    const hadUnknownRequest = !!receipt.last_request_at;
    if (!hadUnknownRequest) run('UPDATE receipts SET last_request_at = CURRENT_TIMESTAMP WHERE id = ?', [receipt.id]);

    const result = await callSmartInvoice('POST', '/documents', { body: requestBody, idempotencyKey });

    if (result.networkError) {
      return markFailed(receipt, 'network_error', heMessage('network_error'), {
        consumeKey: false,
        technicalDetail: `POST /documents: ${result.attempts.join(' | ')}`,
        outage: true,
      });
    }

    const { status, body } = result;
    const document = body?.document;
    if (status >= 200 && status < 300 && document) {
      // A sandbox key answers with a dry-run preview: nothing was issued. That is a failure
      // (alert, and the receipt can be issued again once a real key is configured).
      if (body.test_mode === true || document.is_test === true || String(document.number || '').startsWith('TEST-')) {
        if (!hadUnknownRequest) run('UPDATE receipts SET last_request_at = NULL WHERE id = ?', [receipt.id]);
        return markFailed(receipt, 'test_key', heMessage('test_key'), { consumeKey: true });
      }
      // Live responses carry full_invoice_number / invoice_number (per the official WooCommerce plugin).
      return completeIssuedReceipt(receipt, transaction, {
        documentId: document.id || document.document_id || null,
        documentNumber: documentNumberOf(document),
        pdfUrl: document.pdf_url || body.pdf_url || null,
        adopted: false,
      });
    }

    const code = body?.code || (status >= 500 ? 'server_error' : `http_${status}`);
    const detail = body?.message ? String(body.message) : null;
    // 4xx = definitive rejection (consume the key; nothing was created by this request);
    // 5xx = unknown outcome (keep the key and keep last_request_at).
    const definitive = status >= 400 && status < 500 && code !== 'idempotency_in_progress';
    if (definitive && !hadUnknownRequest) run('UPDATE receipts SET last_request_at = NULL WHERE id = ?', [receipt.id]);
    return markFailed(receipt, code, heMessage(code, detail), {
      consumeKey: definitive,
      technicalDetail: `POST /documents: HTTP ${status}${body?.code ? ` (${body.code})` : ''}${detail ? ` - ${detail}` : ''}`,
      outage: isTemporaryProviderFailure(status, body?.code),
    });
  } catch (error) {
    const receipt = getReceiptById(receiptId);
    return receipt ? markFailed(receipt, 'internal_error', heMessage('internal_error', error.message), { consumeKey: false }) : null;
  } finally {
    inFlight.delete(receiptId);
  }
}

/** Receipt number of a SmartInvoice document, whatever field the response uses. */
function documentNumberOf(document) {
  const n = document?.full_invoice_number || document?.invoice_number || document?.number || document?.document_number;
  return n ? String(n) : null;
}

/**
 * Mark a receipt as issued (a new document, or an existing one adopted by the duplicate
 * guard), then: Drive copy and customer email for live receipts. Returns the row.
 */
async function completeIssuedReceipt(receipt, transaction, { documentId, documentNumber, pdfUrl, adopted }) {
  run(
    `UPDATE receipts SET status = 'issued', is_test = 0, document_id = ?, document_number = ?, pdf_url = ?,
       error_code = NULL, error_message = NULL, issued_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [documentId, documentNumber, pdfUrl, receipt.id]
  );
  logActivity({
    action: LogAction.CREATE,
    category: LogCategory.TRANSACTION,
    entityType: 'receipt',
    entityId: receipt.id,
    entityName: receipt.customer_name,
    details: { transactionId: transaction.id, documentNumber, amount: receipt.amount, method: receipt.payment_method, adopted },
  });

  if (!documentId || !documentNumber) {
    sendTelegramAlert([
      '🧾⚠️ קבלה הופקה אבל התשובה של SmartInvoice חסרה פרטים',
      `לקוחה: ${receipt.customer_name || 'לא ידוע'} · ₪${receipt.amount ?? '?'}`,
      `מזהה מסמך: ${documentId || 'חסר'} · מספר קבלה: ${documentNumber || 'חסר'}`,
      'יש לבדוק בפורטל SmartInvoice ולעדכן את הקוד לפי מבנה התשובה האמיתי.',
    ].join('\n'));
  }

  // Post-issue work, in order, as a tracked background job (see waitForReceiptFollowUps).
  const followUps = (async () => {
    // Keep the PDF on the server, then copy it to Google Drive.
    if (documentId) {
      await getReceiptPdf(getReceiptById(receipt.id));
      await saveReceiptToDrive(getReceiptById(receipt.id));
    }
    // Email the receipt to the customer ourselves (business Gmail via Apps Script, PDF attached).
    // SmartInvoice is never asked to send and never gets her address. Exactly one attempt; not
    // repeated for an adopted document (whatever happened then, it is not sent twice).
    if (!adopted && documentId && transaction.customer_email) {
      await emailReceiptToCustomer(getReceiptById(receipt.id), transaction.customer_email);
    }
  })()
    .catch((error) => console.error(`Receipt ${receipt.id}: post-issue work failed:`, error))
    .finally(() => followUpsByReceipt.delete(receipt.id));
  followUpsByReceipt.set(receipt.id, followUps);

  return getReceiptById(receipt.id);
}

/** One attempt to email the receipt PDF to the customer; records the address on success. */
async function emailReceiptToCustomer(receipt, email) {
  const fail = (why) => logActivity({
    action: LogAction.ERROR,
    category: LogCategory.TRANSACTION,
    entityType: 'receipt',
    entityId: receipt.id,
    entityName: receipt.customer_name,
    errorMessage: `Receipt ${receipt.document_number} issued but emailing it to the customer failed: ${why}`,
  });
  try {
    if (!isEmailEnabled()) return fail('Apps Script is not configured');
    const pdf = await getReceiptPdf(receipt);
    if (!pdf) return fail('receipt PDF not available');
    const result = await sendReceiptToCustomer({
      to: email,
      customerName: receipt.customer_name,
      documentNumber: receipt.document_number,
      amount: receipt.amount,
      issuedDate: (() => { const d = israelDateParts(receipt.issued_at); return `${d.yymmdd.slice(4)}/${d.yymmdd.slice(2, 4)}/${d.year}`; })(),
      description: receipt.description,
      pdfBuffer: pdf.buffer,
      fileName: `קבלה ${receipt.document_number || receipt.id}.pdf`,
    });
    if (!result?.success) return fail(result?.error || result?.reason || 'unknown error');
    run('UPDATE receipts SET email_sent_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [email, receipt.id]);
  } catch (error) {
    fail(error.message);
  }
}

const normalizeName = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/** Total of a SmartInvoice document, whatever field the response uses. */
function documentTotalOf(document) {
  for (const key of ['grand_total', 'total', 'amount_ils', 'amount']) {
    const n = Number(document?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Duplicate guard: look in SmartInvoice for receipts that may already be this one.
 * A match = a receipt (not cancelled) with the same total and customer name, from the
 * day before the first request onwards, that is not already linked to another of our receipts.
 * Returns { matches: [documents] } or { error } when SmartInvoice could not be checked.
 */
async function findExistingReceiptDocument(receipt, { amount, names }) {
  const firstRequest = new Date(`${String(receipt.last_request_at).replace(' ', 'T')}Z`);
  const from = new Date((Number.isFinite(firstRequest.getTime()) ? firstRequest.getTime() : Date.now()) - 2 * 86400000)
    .toISOString().slice(0, 10);
  const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const wanted = new Set(names.map(normalizeName).filter(Boolean));
  const linked = new Set(
    all('SELECT document_id FROM receipts WHERE document_id IS NOT NULL AND id != ?', [receipt.id]).map((r) => String(r.document_id))
  );

  const matches = [];
  const seen = new Set();
  let sameAmountOtherName = 0;
  for (let offset = 0; offset < 2000; offset += 100) {
    const params = new URLSearchParams({ type: 'receipt', from, to, limit: '100', offset: String(offset) });
    const result = await callSmartInvoice('GET', `/documents?${params}`);
    if (result.networkError || result.status !== 200 || !Array.isArray(result.body?.documents)) {
      const detail = `GET /documents: ${result.networkError ? result.attempts.join(' | ') : `HTTP ${result.status}`}`;
      console.error(`Receipt ${receipt.id}: duplicate check failed - ${detail}`);
      const outage = !!result.networkError || isTemporaryProviderFailure(result.status, result.body?.code);
      return { error: true, detail, outage };
    }
    let newOnPage = 0;
    for (const doc of result.body.documents) {
      if (!doc?.id || seen.has(String(doc.id))) continue;
      seen.add(String(doc.id));
      newOnPage++;
      if (linked.has(String(doc.id))) continue;
      if (doc.invoice_type && doc.invoice_type !== 'receipt') continue;
      if (doc.status === 'cancelled') continue;
      const total = documentTotalOf(doc);
      if (total === null || Math.abs(total - amount) >= 0.01) continue;
      const name = normalizeName(doc.customer?.name ?? doc.customer_name ?? doc.client_name);
      if (wanted.has(name)) matches.push(doc);
      else sameAmountOtherName++;
    }
    // Stop at the end, or if the server ignores `offset` and repeats the same page.
    if (!result.body.has_more || newOnPage === 0) break;
  }
  return { matches, sameAmountOtherName };
}

/**
 * Convenience for the create flows: request + issue in one call (background use).
 * `options` is the already-parsed object from parseReceiptRequest().
 */
export async function requestAndIssueReceipt(transactionId, options) {
  const receipt = getReceiptByTransactionId(transactionId) || requestReceipt(transactionId, options);
  return issueReceipt(receipt.id);
}

/** Download the receipt PDF from SmartInvoice. */
async function fetchReceiptPdfFromSmartInvoice(receipt) {
  if (!receipt?.document_id) return null;
  const result = await callSmartInvoice('GET', `/documents/${encodeURIComponent(receipt.document_id)}/pdf`, { raw: true });
  return result.buffer || null;
}

/** Local file name: "<yymmdd> <customer> <amount>₪ - קבלה <number>.pdf" (the number keeps it unique). */
function buildReceiptLocalFileName(receipt) {
  const base = buildReceiptDriveFileName(receipt).replace(/\.pdf$/, '');
  return `${base} - קבלה ${cleanForFileName(receipt.document_number) || receipt.id}.pdf`;
}

/**
 * The receipt PDF, served from the server's own copy in
 * local_data/uploads/receipts/. The first call downloads it from SmartInvoice
 * and stores it (path kept in receipts.local_pdf_path, relative to uploads/).
 * Returns { buffer, contentType } or null.
 */
export async function getReceiptPdf(receipt) {
  if (!receipt || receipt.status !== 'issued' || receipt.is_test) return null;

  if (receipt.local_pdf_path) {
    const absolute = path.join(uploadConfig.uploadsDir, receipt.local_pdf_path);
    try {
      return { buffer: await fs.promises.readFile(absolute), contentType: 'application/pdf' };
    } catch {
      console.warn(`Receipt ${receipt.id}: local PDF missing (${receipt.local_pdf_path}), downloading again`);
    }
  }

  const buffer = await fetchReceiptPdfFromSmartInvoice(receipt);
  if (!buffer) return null;
  try {
    const year = israelDateParts(receipt.issued_at).year;
    const relative = path.join('receipts', year, buildReceiptLocalFileName(receipt));
    const absolute = path.join(uploadConfig.uploadsDir, relative);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, buffer);
    run('UPDATE receipts SET local_pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [relative, receipt.id]);
  } catch (error) {
    console.error(`Receipt ${receipt.id}: could not store the PDF locally:`, error.message);
  }
  return { buffer, contentType: 'application/pdf' };
}

/** Characters Google Drive / file systems do not accept in a file name. */
function cleanForFileName(value) {
  return String(value || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Date parts (Israel time) of an SQLite UTC timestamp, or of now. */
function israelDateParts(sqliteUtc) {
  const date = sqliteUtc ? new Date(`${String(sqliteUtc).replace(' ', 'T')}Z`) : new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(Number.isFinite(date.getTime()) ? date : new Date())
      .map((p) => [p.type, p.value])
  );
  return { year: parts.year, yymmdd: `${parts.year.slice(2)}${parts.month}${parts.day}` };
}

/** Drive file name: "<yymmdd> <customer> <amount>₪.pdf" (receipt issue date, Israel time). */
export function buildReceiptDriveFileName(receipt) {
  const { yymmdd } = israelDateParts(receipt.issued_at);
  const amount = Number(receipt.amount);
  const amountText = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${yymmdd} ${cleanForFileName(receipt.customer_name) || 'לקוחה'} ${amountText}₪.pdf`;
}

/**
 * Save a live receipt's PDF to Google Drive through Apps Script, once.
 * Records the file name on success; sends a Telegram alert on failure. Never throws.
 */
export async function saveReceiptToDrive(receipt) {
  try {
    if (!receipt || receipt.status !== 'issued' || receipt.is_test || receipt.drive_file_name) return;
    if (!isEmailEnabled()) {
      alertDriveSaveFailed(receipt, 'החיבור ל-Apps Script אינו מוגדר');
      return;
    }
    const pdf = await getReceiptPdf(receipt);
    if (!pdf) {
      alertDriveSaveFailed(receipt, 'לא ניתן להוריד את ה-PDF מ-SmartInvoice');
      return;
    }
    const fileName = buildReceiptDriveFileName(receipt);
    const folder = driveIncomeFolder(israelDateParts(receipt.issued_at).year);
    const result = await sendFileToDrive({ fileName, folder, fileBuffer: pdf.buffer, mimeType: 'application/pdf' });
    if (result?.success === false) {
      alertDriveSaveFailed(receipt, result.error || 'Apps Script החזיר שגיאה');
      return;
    }
    run('UPDATE receipts SET drive_file_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [`${folder}/${fileName}`, receipt.id]);
  } catch (error) {
    alertDriveSaveFailed(receipt, error.message);
  }
}

/** Signed token for the public receipt PDF link (sent to the customer on WhatsApp). */
export function createReceiptShareToken(receiptId) {
  return jwt.sign({ scope: 'receipt_pdf', receiptId: Number(receiptId) }, authConfig.jwtSecret, { expiresIn: SHARE_LINK_EXPIRY });
}

/** Receipt id from a share token, or null when the token is invalid / expired / of another kind. */
export function resolveReceiptShareToken(token) {
  try {
    const decoded = jwt.verify(String(token || ''), authConfig.jwtSecret);
    return decoded?.scope === 'receipt_pdf' && decoded.receiptId ? decoded.receiptId : null;
  } catch {
    return null;
  }
}

// SmartInvoice's public view of a document, as encoded in the QR code printed on every PDF
// ("סרוק לצפייה"; seen as lhflow.com/fixmaster/i/<id>, same page on smartinvoices.co.il).
// Not documented by the provider - so it is verified before use (see providerViewLinkFor).
const providerViewUrl = (documentId) => `https://smartinvoices.co.il/fixmaster/i/${encodeURIComponent(documentId)}`;

// Document ids whose provider view was verified to open and show the right receipt.
const verifiedProviderViews = new Set();

/**
 * SmartInvoice's public view link of a receipt, or null when it cannot be confirmed: the page
 * must answer 200 and mention the receipt number. Positive results are cached per document.
 */
async function providerViewLinkFor(receipt) {
  if (!receipt?.document_id || !receipt.document_number) return null;
  const url = providerViewUrl(receipt.document_id);
  if (verifiedProviderViews.has(receipt.document_id)) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const html = res.ok ? await res.text() : '';
    if (res.ok && html.includes(String(receipt.document_number))) {
      verifiedProviderViews.add(receipt.document_id);
      return url;
    }
    console.warn(`Receipt ${receipt.id}: SmartInvoice view link did not verify (HTTP ${res.status}); using our own link`);
  } catch (error) {
    console.warn(`Receipt ${receipt.id}: SmartInvoice view link unreachable (${error.message}); using our own link`);
  }
  return null;
}

/**
 * Links for an issued receipt:
 *   link         - our signed link to the server copy (used by the "show receipt" button)
 *   customerLink - what the customer gets on WhatsApp: SmartInvoice's public view when it
 *                  verifies, else our link
 *   whatsappLink - wa.me message (to the customer's phone when known) containing customerLink
 * Returns null when the receipt cannot be shared (missing, not issued, or a sandbox preview).
 */
export async function buildReceiptShareLinks(receiptId) {
  const r = get(
    `SELECT r.*, c.phone AS customer_phone, COALESCE(c.receipt_name, c.name) AS customer_full_name
     FROM receipts r
     LEFT JOIN transactions t ON t.id = r.transaction_id
     LEFT JOIN customers c ON c.id = t.customer_id
     WHERE r.id = ?`,
    [receiptId]
  );
  if (!r || r.status !== 'issued' || r.is_test) return null;

  const link = `${PUBLIC_APP_URL}/api/receipts/public/${encodeURIComponent(createReceiptShareToken(r.id))}`;
  const customerLink = (await providerViewLinkFor(r)) || link;
  const name = r.customer_full_name || r.customer_name || '';
  const text = [
    `שלום${name ? ` ${name}` : ''},`,
    `מצורפת הקבלה${r.document_number ? ` מס' ${r.document_number}` : ''} על סך ₪${r.amount}:`,
    customerLink,
    `תודה, ${businessConfig.name}`,
  ].join('\n');
  const digits = String(r.customer_phone || '').replace(/\D/g, '');
  const phone = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
  const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  return { link, customerLink, whatsappLink, customerPhone: r.customer_phone || null };
}

/**
 * Receipts left 'pending' (e.g. the process restarted between saving the income and
 * issuing its receipt) are retried; a retry that fails sends the usual Telegram alert.
 */
export async function recoverStuckReceipts() {
  const rows = all("SELECT * FROM receipts WHERE status = 'pending'");
  for (const receipt of rows) {
    if (!isStuckPending(receipt) || inFlight.has(receipt.id)) continue;
    console.warn(`Retrying stuck pending receipt ${receipt.id} (transaction ${receipt.transaction_id})`);
    const result = await issueReceipt(receipt.id);
    if (result?.status === 'issued') {
      console.log(`Stuck receipt ${receipt.id} issued on retry`);
      await sendReceiptOwnerEmail(result); // the original flow never got to email it
    }
  }
}

// Last time the "missing copies" sweep ran; it runs at most once an hour (each failure alerts).
let lastCopySweepAt = 0;

/**
 * Live receipts that were issued but whose local / Drive copy is missing (e.g. a restart right
 * after issuing, or Apps Script was down): try again, at most once an hour.
 */
export async function recoverMissingReceiptCopies() {
  if (Date.now() - lastCopySweepAt < 60 * 60 * 1000) return;
  lastCopySweepAt = Date.now();
  const rows = all(
    `SELECT * FROM receipts
     WHERE status = 'issued' AND is_test = 0 AND document_id IS NOT NULL
       AND (local_pdf_path IS NULL OR drive_file_name IS NULL)
       AND issued_at < datetime('now', '-10 minutes')`
  );
  for (const receipt of rows) {
    if (inFlight.has(receipt.id)) continue;
    console.warn(`Receipt ${receipt.id}: completing missing local/Drive copy`);
    await getReceiptPdf(receipt);
    await saveReceiptToDrive(getReceiptById(receipt.id));
  }
}

/**
 * Send the owner the payment email with this receipt (number, details, PDF), for receipts
 * issued outside the original create flow (issued later from the edit page, or recovered).
 * Never throws.
 */
export async function sendReceiptOwnerEmail(receipt) {
  try {
    if (!receipt || !isEmailEnabled() || !receipt.transaction_id) return;
    const t = get(
      `SELECT t.*, c.phone AS customer_phone, c.email AS customer_email
       FROM transactions t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.id = ?`,
      [receipt.transaction_id]
    );
    if (!t) return;
    const { sendDetailedIncomeNotification } = await import('./email.js');
    await sendDetailedIncomeNotification({
      customerName: t.customer_name,
      customerPhone: t.customer_phone,
      customerEmail: t.customer_email,
      amount: t.amount,
      paymentMethod: t.payment_method,
      confirmationNumber: t.confirmation_number,
      lastFourDigits: t.last_four_digits,
      checkNumber: t.check_number,
      bankDetails: t.bank_details,
      installments: t.installments,
      fileBase64: null,
      fileName: null,
      receipt: await buildReceiptEmailInfo(receipt),
      receiptOnly: true,
    });
  } catch (error) {
    console.error(`Failed to send the owner email for receipt ${receipt?.id}:`, error);
  }
}

/**
 * Receipt summary for the owner's notification email (Apps Script): number,
 * test flag, "for what", printed reference, and - for a live receipt - the
 * PDF as base64 so it is attached next to the payment proof.
 * Returns null when no receipt was requested. Never throws.
 */
export async function buildReceiptEmailInfo(receipt) {
  if (!receipt) return null;
  const info = {
    status: receipt.status,
    number: receipt.document_number || null,
    description: receipt.description,
    notes: receipt.notes || null,
    reference: receipt.payment_reference || null,
    emailSentTo: receipt.email_sent_to || null,
    error: receipt.status === 'failed' ? receipt.error_message : null,
    pdfBase64: null,
    pdfFileName: null,
  };
  if (receipt.status === 'issued') {
    try {
      const pdf = await getReceiptPdf(getReceiptById(receipt.id) || receipt);
      if (pdf) {
        info.pdfBase64 = pdf.buffer.toString('base64');
        info.pdfFileName = `קבלה ${receipt.document_number || receipt.id}.pdf`;
      }
    } catch (error) {
      console.error(`Could not fetch PDF of receipt ${receipt.id} for the notification email:`, error.message);
    }
  }
  return info;
}

// ---------------------------------------------------------------------------
// SmartInvoice outage watcher
// ---------------------------------------------------------------------------
//
// Purpose: when a receipt fails because of a temporary problem on SmartInvoice's side
// (no connection, 5xx, rate limit), tell the owner on Telegram as soon as SmartInvoice
// works again, so she knows when to retry. Nothing is issued automatically: a receipt is a
// legal document, the owner retries from the edit page.
//
// Operation:
//   - markFailed(..., { outage: true }) calls watchReceiptForOutage(). The receipt id is kept
//     in memory; the first one starts a 5-minute timer, later ones only join the list.
//   - Every 5 minutes: receipts that are no longer 'failed' (issued meanwhile) are dropped;
//     if none is left the watcher stops silently. Otherwise SmartInvoice is probed with a
//     read-only request (GET /documents?limit=1 - lists, never issues).
//   - Still down (no answer / 5xx / 429): keep waiting. Any other answer: send ONE Telegram
//     message with the still-unissued receipts and their edit links, log it, and stop.
//     If Telegram does not confirm the message, it is sent again on the next check.
//   - The list lives in memory, so a restart (every code deploy restarts the backend) would
//     lose it. resumeReceiptOutageWatch(), called at startup, rebuilds it from the receipts
//     table: receipts still 'failed' with an outage error code from the last 24 hours. No DB
//     column is needed; the price is that a restart after the message was sent, before the
//     owner retried, can send the message once more (only within those 24 hours).

const OUTAGE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const OUTAGE_PROBE_TIMEOUT_MS = 20 * 1000;
const OUTAGE_RESUME_WINDOW_HOURS = 24;
// Error codes stored by markFailed() for temporary SmartInvoice problems (used on resume).
const OUTAGE_ERROR_CODES = ['network_error', 'server_error', 'rate_limited', 'duplicate_check_failed'];

const outageWatch = {
  receiptIds: new Set(),
  timer: null,
  checking: false,
  startedAt: null,
};

/** True when an HTTP answer from SmartInvoice is a temporary problem on their side. */
function isTemporaryProviderFailure(status, code) {
  return status >= 500 || code === 'rate_limited';
}

/** Add a receipt to the outage watch, starting the periodic check if it is not running. */
function watchReceiptForOutage(receiptId, reason = null) {
  if (!smartInvoiceConfig.enabled) return;
  const isNew = !outageWatch.receiptIds.has(receiptId);
  outageWatch.receiptIds.add(receiptId);
  if (isNew) {
    console.warn(`Receipt outage watch: receipt ${receiptId} added (${outageWatch.receiptIds.size} watched)${reason ? ` - ${reason}` : ''}`);
  }
  if (outageWatch.timer) return;

  outageWatch.startedAt = new Date().toISOString();
  outageWatch.timer = setInterval(() => {
    checkOutageRecovery().catch((error) => console.error('Receipt outage watch: check failed:', error));
  }, OUTAGE_CHECK_INTERVAL_MS);
  console.warn(`Receipt outage watch: started, checking SmartInvoice every ${OUTAGE_CHECK_INTERVAL_MS / 60000} minutes`);
  logActivity({
    action: LogAction.CREATE,
    category: LogCategory.SYSTEM,
    entityType: 'receipt_outage_watch',
    details: { event: 'started', receiptIds: [...outageWatch.receiptIds], reason },
  });
}

function stopOutageWatch(event, details = {}) {
  clearInterval(outageWatch.timer);
  const receiptIds = [...outageWatch.receiptIds];
  const startedAt = outageWatch.startedAt;
  outageWatch.timer = null;
  outageWatch.startedAt = null;
  outageWatch.receiptIds.clear();
  console.log(`Receipt outage watch: stopped (${event})`);
  logActivity({
    action: LogAction.UPDATE,
    category: LogCategory.SYSTEM,
    entityType: 'receipt_outage_watch',
    details: { event, receiptIds, startedAt, ...details },
  });
}

/**
 * Read-only check that SmartInvoice answers. Resolves to { down: true, reason } while the
 * outage lasts, else { down: false, status }.
 */
async function probeSmartInvoice() {
  try {
    const res = await fetch(`${smartInvoiceConfig.baseUrl}/documents?limit=1`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${smartInvoiceConfig.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(OUTAGE_PROBE_TIMEOUT_MS),
    });
    let code = null;
    try { code = (await res.json())?.code || null; } catch { /* non-JSON body (e.g. a 502 page) */ }
    if (isTemporaryProviderFailure(res.status, code)) {
      return { down: true, reason: `HTTP ${res.status}${code ? ` (${code})` : ''}` };
    }
    return { down: false, status: res.status, code };
  } catch (error) {
    return { down: true, reason: describeNetworkError(error, OUTAGE_PROBE_TIMEOUT_MS) };
  }
}

/** "25/10" from a YYYY-MM-DD transaction date. */
function shortHebrewDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  return m ? `${m[3]}/${m[2]}` : '';
}

/** Telegram text for the receipts still waiting after the outage. */
function buildOutageRecoveredMessage(rows, probe) {
  const lines = [
    '✅🧾 מערכת הקבלות (SmartInvoice) חזרה לפעול',
    rows.length === 1
      ? 'בזמן התקלה לא הופקה קבלה לתנועה הבאה:'
      : 'בזמן התקלה לא הופקו קבלות לתנועות הבאות:',
    '',
  ];
  for (const r of rows) {
    const method = r.tx_method ? ` (${METHOD_LABELS_HE[r.tx_method] || r.tx_method})` : '';
    const date = shortHebrewDate(r.tx_date);
    lines.push(`• ${r.tx_customer || r.customer_name || 'לקוחה'} – ₪${r.tx_amount ?? r.amount ?? '?'}${method}${date ? `, ${date}` : ''}`);
    lines.push(`  ${PUBLIC_APP_URL}/dashboard/transactions/${r.transaction_id}/edit`);
  }
  lines.push('');
  lines.push(rows.length === 1
    ? 'כדי להפיק את הקבלה: להיכנס לקישור וללחוץ "שמירה וניסיון חוזר להפקת קבלה".'
    : 'כדי להפיק את הקבלות: להיכנס לכל קישור וללחוץ "שמירה וניסיון חוזר להפקת קבלה".');
  if (probe.status < 200 || probe.status >= 300) {
    lines.push(`שימו לב: בבדיקה SmartInvoice ענתה HTTP ${probe.status}${probe.code ? ` (${probe.code})` : ''}, ייתכן שההפקה תיכשל מסיבה אחרת (למשל מפתח API).`);
  }
  return lines.join('\n');
}

/** One periodic check of the outage watch (see the section comment above). */
async function checkOutageRecovery() {
  if (outageWatch.checking || !outageWatch.timer) return;
  outageWatch.checking = true;
  try {
    const ids = [...outageWatch.receiptIds];
    const rows = ids.length
      ? all(
        `SELECT r.id, r.transaction_id, r.customer_name, r.amount,
                t.amount AS tx_amount, t.customer_name AS tx_customer, t.payment_method AS tx_method, t.date AS tx_date
         FROM receipts r JOIN transactions t ON t.id = r.transaction_id
         WHERE r.status = 'failed' AND r.id IN (${ids.map(() => '?').join(',')})
         ORDER BY r.id`,
        ids
      )
      : [];
    // Receipts issued (or transactions deleted) in the meantime need no message.
    const pending = new Set(rows.map((r) => r.id));
    for (const id of ids) if (!pending.has(id)) outageWatch.receiptIds.delete(id);
    if (rows.length === 0) {
      stopOutageWatch('nothing_left');
      return;
    }

    const probe = await probeSmartInvoice();
    if (probe.down) {
      console.log(`Receipt outage watch: SmartInvoice still down (${probe.reason}); ${rows.length} receipt(s) waiting`);
      return;
    }

    const delivery = await sendTelegramAlertConfirmed(buildOutageRecoveredMessage(rows, probe));
    if (delivery === 'sent' || delivery === 'not_configured') {
      stopOutageWatch('recovered', {
        probeStatus: probe.status,
        telegram: delivery,
        transactionIds: rows.map((r) => r.transaction_id),
      });
    } else {
      console.warn(`Receipt outage watch: SmartInvoice is back but the Telegram message was not delivered (${delivery}); retrying on the next check`);
    }
  } finally {
    outageWatch.checking = false;
  }
}

/**
 * Startup: re-watch receipts that failed because of a SmartInvoice outage in the last
 * OUTAGE_RESUME_WINDOW_HOURS hours and are still not issued (the in-memory list was lost by
 * the restart). Returns the number of receipts resumed.
 */
export function resumeReceiptOutageWatch() {
  if (!smartInvoiceConfig.enabled) return 0;
  const rows = all(
    `SELECT id FROM receipts
     WHERE status = 'failed' AND transaction_id IS NOT NULL
       AND error_code IN (${OUTAGE_ERROR_CODES.map(() => '?').join(',')})
       AND updated_at >= datetime('now', ?)`,
    [...OUTAGE_ERROR_CODES, `-${OUTAGE_RESUME_WINDOW_HOURS} hours`]
  );
  for (const r of rows) watchReceiptForOutage(r.id, 'resumed after restart');
  return rows.length;
}
