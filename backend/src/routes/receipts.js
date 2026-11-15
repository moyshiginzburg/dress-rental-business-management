/**
 * Receipts Routes
 *
 * Purpose: Let the app check whether automatic receipts are available, issue
 * (or retry) a receipt for an existing income transaction, and open its PDF.
 *
 * Operation: Thin HTTP layer over services/receipts.js, which talks to the
 * SmartInvoice API. Receipts for new incomes are issued by the transactions /
 * orders create flows; these endpoints cover the "issue later" and "retry"
 * cases (e.g. a cash income saved without a receipt, or a failed attempt).
 * Language: Messages in Hebrew, feminine form.
 */

import { Router } from 'express';
import { get } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  getReceiptsStatus,
  getReceiptById,
  getVisibleReceiptByTransactionId,
  requestReceipt,
  issueReceipt,
  isStuckPending,
  parseReceiptRequest,
  getReceiptPdf,
  sendReceiptOwnerEmail,
  waitForReceiptFollowUps,
  buildReceiptShareLinks,
  resolveReceiptShareToken,
  getCustomerReceiptName,
  saveCustomerReceiptName,
} from '../services/receipts.js';

const router = Router();

/** Send a receipt PDF from SmartInvoice as the HTTP response. */
async function sendReceiptPdf(res, receipt) {
  const pdf = await getReceiptPdf(receipt);
  if (!pdf) throw new ApiError(502, 'לא ניתן לטעון את הקבלה כרגע. נסי שוב');
  const fileName = `קבלה ${receipt.document_number || receipt.id}.pdf`;
  res.setHeader('Content-Type', pdf.contentType);
  res.setHeader('Cache-Control', 'private, no-store'); // personal fiscal document: never cache in proxies
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(pdf.buffer);
}

/**
 * GET /api/receipts/public/:token
 * Public (no login) receipt PDF, for the link sent to the customer on WhatsApp.
 * The token is signed by the server and expires (see SHARE_LINK_EXPIRY).
 */
router.get('/public/:token', async (req, res, next) => {
  try {
    const receiptId = resolveReceiptShareToken(req.params.token);
    const receipt = receiptId ? getReceiptById(receiptId) : null;
    if (!receipt || receipt.status !== 'issued' || receipt.is_test) {
      throw new ApiError(404, 'הקישור לקבלה אינו תקין או שפג תוקפו');
    }
    await sendReceiptPdf(res, receipt);
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

/**
 * GET /api/receipts/status
 * Whether receipts are enabled, and whether the system runs in test (sandbox) mode.
 */
router.get('/status', (req, res) => {
  res.json({ success: true, data: getReceiptsStatus() });
});

/**
 * POST /api/receipts
 * Body: { transaction_id, description?, notes? }
 * Issue a receipt for an existing income transaction, or retry a failed one.
 * Waits for SmartInvoice and returns the resulting receipt row.
 */
router.post('/', async (req, res, next) => {
  try {
    const { transaction_id, description, notes, customer_name } = req.body || {};
    if (!getReceiptsStatus().enabled) {
      throw new ApiError(400, 'הפקת קבלות אינה מוגדרת במערכת');
    }

    const transaction = get('SELECT id, type, category, customer_id FROM transactions WHERE id = ?', [transaction_id]);
    if (!transaction) throw new ApiError(404, 'תנועה לא נמצאה');
    if (transaction.type !== 'income') throw new ApiError(400, 'אפשר להפיק קבלה רק עבור הכנסה');

    const existing = getVisibleReceiptByTransactionId(transaction.id);
    if (existing?.status === 'issued') throw new ApiError(400, 'כבר הופקה קבלה עבור תנועה זו');
    if (existing?.status === 'pending' && !isStuckPending(existing)) {
      throw new ApiError(409, 'הקבלה נמצאת כרגע בהפקה. נסי לרענן בעוד רגע');
    }

    const options = parseReceiptRequest({ issue: true, description, notes, customer_name }, transaction.category);
    saveCustomerReceiptName(transaction.customer_id, options.customerName);
    const pending = requestReceipt(transaction.id, options);
    // Answer as soon as SmartInvoice issued it; copies and emails continue in the background.
    const receipt = await issueReceipt(pending.id, { waitForFollowUps: false });

    if (receipt.status !== 'issued') {
      const failure = new ApiError(400, receipt.error_message || 'הפקת הקבלה נכשלה');
      failure.alreadyAlerted = true; // issueReceipt() already sent the "receipt not issued" alert
      throw failure;
    }

    res.status(201).json({
      success: true,
      message: `קבלה ${receipt.document_number || ''} הופקה בהצלחה`.trim(),
      data: { receipt },
    });

    // Background: once the copies and the customer email are done, send the owner the payment
    // email with the receipt (it reuses the server copy and shows whom the receipt was emailed to).
    waitForReceiptFollowUps(receipt.id).then(() => sendReceiptOwnerEmail(getReceiptById(receipt.id)));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/receipts/customer-name/:customerId
 * Default "name on the receipt" for a customer: her saved receipt name, else her app name.
 */
router.get('/customer-name/:customerId', (req, res, next) => {
  try {
    const name = getCustomerReceiptName(req.params.customerId);
    if (name === null) throw new ApiError(404, 'לקוחה לא נמצאה');
    res.json({ success: true, data: { name } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/receipts/:id/pdf
 * Stream the receipt PDF from SmartInvoice (live receipts only).
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const receipt = getReceiptById(req.params.id);
    if (!receipt) throw new ApiError(404, 'קבלה לא נמצאה');
    if (receipt.is_test) throw new ApiError(404, 'קבלה לא נמצאה');
    if (receipt.status !== 'issued') throw new ApiError(400, 'הקבלה עדיין לא הופקה');

    await sendReceiptPdf(res, receipt);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/receipts/:id/share
 * Public PDF link + WhatsApp link (to the customer's phone when known) for a live receipt.
 */
router.get('/:id/share', async (req, res, next) => {
  try {
    const receipt = getReceiptById(req.params.id);
    if (!receipt) throw new ApiError(404, 'קבלה לא נמצאה');
    if (receipt.is_test) throw new ApiError(404, 'קבלה לא נמצאה');
    const links = await buildReceiptShareLinks(receipt.id);
    if (!links) throw new ApiError(400, 'הקבלה עדיין לא הופקה');
    res.json({ success: true, data: links });
  } catch (error) {
    next(error);
  }
});

export default router;
