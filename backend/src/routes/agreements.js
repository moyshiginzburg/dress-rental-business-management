/**
 * Rental Agreements Routes
 * 
 * Purpose: Handle digital rental agreement signing.
 * Public endpoint for signing, protected endpoints for viewing.
 * 
 * Operation: Generates agreement forms, captures digital signatures,
 * creates Google Calendar events and Tasks, saves to synced folder.
 */

import { Router } from 'express';
import { run, get, all } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { businessConfig, uploadConfig, authConfig } from '../config/index.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { saveAgreementPdf, isAgreementsFolderAccessible } from '../services/localStorage.js';
import { sendAgreementConfirmationToCustomer, sendAgreementNotificationToOwner, isEmailEnabled } from '../services/email.js';
import { generateAgreementPdf } from '../services/pdfGenerator.js';
import { normalizePhoneNumber } from '../services/phone.js';
import { AGREEMENT_TERMS, AGREEMENT_CANCELLATION_POLICY } from '../constants/agreementTerms.js';

const router = Router();
const AGREEMENT_SIGN_TOKEN_EXPIRY = '7d';
// Agreement links sent to customers. Set PUBLIC_FRONTEND_URL in .env to override.
// This is the URL customers see when they receive a WhatsApp link to sign their agreement.
// Change this to your Vercel URL or VPS Tailscale URL.
const FORCED_PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || 'https://YOUR_APP_NAME.vercel.app';

function getOrderForAgreement(orderId) {
  const order = get(
    `SELECT o.id, o.customer_id, o.event_date, o.order_summary,
            c.name as customer_name, c.phone as customer_phone, c.email as customer_email
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = ?`,
    [orderId]
  );

  if (!order) {
    return null;
  }

  const items = all(
    `SELECT id, dress_name, wearer_name, item_type, final_price
     FROM order_items
     WHERE order_id = ?
     ORDER BY id`,
    [orderId]
  );

  return { order, items };
}

function createAgreementToken(orderId) {
  return jwt.sign(
    { scope: 'agreement_sign', orderId: Number(orderId) },
    authConfig.jwtSecret,
    { expiresIn: AGREEMENT_SIGN_TOKEN_EXPIRY }
  );
}

function resolveAgreementToken(token) {
  try {
    const payload = jwt.verify(token, authConfig.jwtSecret);
    if (!payload || payload.scope !== 'agreement_sign' || !payload.orderId) {
      return null;
    }
    return { orderId: Number(payload.orderId) };
  } catch {
    return null;
  }
}

function buildAgreementPrefillPayload(orderWithItems) {
  const { order, items } = orderWithItems;
  return {
    fullName: order.customer_name || '',
    phone: order.customer_phone || '',
    email: order.customer_email || '',
    eventDate: order.event_date || '',
    orderDetails: {
      orderId: order.id,
      orderSummary: order.order_summary || '',
      items: items.map((item) => ({
        id: item.id,
        dressName: item.dress_name || '',
        wearerName: item.wearer_name || '',
        itemType: item.item_type || '',
        finalPrice: Number(item.final_price) || 0,
      })),
    },
  };
}

function getLatestAgreementForOrder(orderId) {
  return get(
    `SELECT id
            , COALESCE(agreed_at, created_at) as signed_at
     FROM agreements
     WHERE order_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [orderId]
  );
}

function hasSignedAgreementForCurrentOrderVersion(orderId) {
  const order = get('SELECT updated_at FROM orders WHERE id = ?', [orderId]);
  if (!order) return false;

  const latestAgreement = getLatestAgreementForOrder(orderId);
  if (!latestAgreement?.signed_at) return false;

  const orderUpdatedAt = order.updated_at || '';
  const signedAt = latestAgreement.signed_at || '';
  if (!orderUpdatedAt || !signedAt) return false;

  // If order wasn't updated after signature, this version is already signed.
  return orderUpdatedAt <= signedAt;
}

function resolvePublicFrontendBaseUrl() {
  const envCandidates = [
    process.env.PUBLIC_FRONTEND_URL,
    process.env.FRONTEND_PUBLIC_URL,
    process.env.APP_PUBLIC_URL,
    FORCED_PUBLIC_FRONTEND_URL,
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    return String(candidate).replace(/\/$/, '');
  }

  return FORCED_PUBLIC_FRONTEND_URL;
}

function cleanForFilename(value) {
  return String(value || '')
    .replace(/[\\\/\:\*\?\"\<\>\|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function saveAgreementPdfToLocalUploads(pdfBuffer, customerName, orderId = null) {
  if (!pdfBuffer) return null;

  if (!existsSync(uploadConfig.agreementsDir)) {
    mkdirSync(uploadConfig.agreementsDir, { recursive: true });
  }

  const cleanName = cleanForFilename(customerName).replace(/\s+/g, '_') || 'customer';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const orderSuffix = orderId ? `_order_${orderId}` : '';
  const filename = `${dateStr}_${cleanName}${orderSuffix}_${uuidv4().slice(0, 8)}.pdf`;
  const pdfPath = join(uploadConfig.agreementsDir, filename);

  writeFileSync(pdfPath, pdfBuffer);

  return {
    pdfPath,
    pdfUrl: `/uploads/agreements/${filename}`,
  };
}

/**
 * GET /api/agreements/config
 * Get agreement configuration (public)
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      businessName: businessConfig.name,
      businessPhone: businessConfig.phone,
      businessEmail: businessConfig.email,
      businessAddress: businessConfig.address
    }
  });
});

/**
 * POST /api/agreements/order/:orderId/sign-link
 * Create a secure public signature link for an order (protected)
 */
router.post('/order/:orderId/sign-link', requireAuth, (req, res, next) => {
  try {
    const orderId = Number.parseInt(req.params.orderId, 10);
    if (Number.isNaN(orderId)) {
      throw new ApiError(400, 'מזהה הזמנה לא תקין');
    }

    const orderWithItems = getOrderForAgreement(orderId);
    if (!orderWithItems) {
      throw new ApiError(404, 'הזמנה לא נמצאה');
    }
    if (hasSignedAgreementForCurrentOrderVersion(orderId)) {
      throw new ApiError(409, 'כבר קיים הסכם חתום להזמנה זו');
    }

    const token = createAgreementToken(orderId);
    const baseUrl = resolvePublicFrontendBaseUrl();
    const link = `${baseUrl}/agreement?token=${encodeURIComponent(token)}`;
    const customerPhone = orderWithItems.order.customer_phone || '';
    const customerName = orderWithItems.order.customer_name || 'לקוחה';
    const whatsappText = encodeURIComponent(
      `היי ${customerName}, מצורף קישור לחתימה דיגיטלית על הסכם:\n${link}`
    );
    const whatsappLink = customerPhone
      ? `https://wa.me/972${customerPhone.replace(/\D/g, '').replace(/^0/, '')}?text=${whatsappText}`
      : null;

    res.json({
      success: true,
      data: {
        orderId,
        link,
        expiresIn: AGREEMENT_SIGN_TOKEN_EXPIRY,
        customerPhone,
        whatsappLink,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agreements/prefill
 * Resolve public signature token into prefilled customer + order data
 */
router.get('/prefill', (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      throw new ApiError(400, 'חסר טוקן חתימה');
    }

    const resolved = resolveAgreementToken(token);
    if (!resolved?.orderId) {
      throw new ApiError(401, 'קישור חתימה לא תקין או שפג תוקפו');
    }

    const orderWithItems = getOrderForAgreement(resolved.orderId);
    if (!orderWithItems) {
      throw new ApiError(404, 'הזמנה לא נמצאה');
    }
    if (hasSignedAgreementForCurrentOrderVersion(resolved.orderId)) {
      throw new ApiError(410, 'ההסכם כבר נחתם והקישור כבר לא זמין');
    }

    res.json({
      success: true,
      data: buildAgreementPrefillPayload(orderWithItems),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agreements/sign
 * Sign a new rental agreement (public)
 * Creates Google Calendar events and Tasks for follow-up
 */
router.post('/sign', async (req, res, next) => {
  try {
    const {
      full_name,
      phone,
      email,
      event_date,
      signature_data,
      order_id,
      token,
    } = req.body;
    const normalizedPhone = normalizePhoneNumber(phone);

    // Validate required fields
    if (!full_name || !full_name.trim()) {
      throw new ApiError(400, 'נא להזין שם מלא');
    }
    if (!normalizedPhone || !normalizedPhone.trim()) {
      throw new ApiError(400, 'נא להזין מספר טלפון');
    }
    if (!signature_data) {
      throw new ApiError(400, 'נא לחתום על ההסכם');
    }

    let resolvedOrderId = order_id ? Number.parseInt(String(order_id), 10) : null;
    if (token) {
      const resolved = resolveAgreementToken(String(token).trim());
      if (!resolved?.orderId) {
        throw new ApiError(401, 'קישור חתימה לא תקין או שפג תוקפו');
      }
      resolvedOrderId = resolved.orderId;
    }

    let orderWithItems = null;
    if (resolvedOrderId) {
      orderWithItems = getOrderForAgreement(resolvedOrderId);
      if (!orderWithItems) {
        throw new ApiError(404, 'הזמנה לא נמצאה');
      }
      if (hasSignedAgreementForCurrentOrderVersion(resolvedOrderId)) {
        throw new ApiError(410, 'ההסכם כבר נחתם והקישור כבר לא זמין');
      }
    }

    // Find or create customer. If signing with order token, update that exact order customer.
    let customerId = null;
    if (orderWithItems?.order?.customer_id) {
      customerId = orderWithItems.order.customer_id;

      const duplicatePhone = get(
        'SELECT id FROM customers WHERE phone = ? AND id != ?',
        [normalizedPhone, customerId]
      );
      if (duplicatePhone) {
        throw new ApiError(409, 'מספר הטלפון כבר קיים אצל לקוחה אחרת');
      }

      run(
        `UPDATE customers
         SET name = ?, phone = ?, email = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [full_name.trim(), normalizedPhone, email || null, customerId]
      );

      run(
        'UPDATE orders SET event_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [event_date || null, resolvedOrderId]
      );
    } else {
      const existingCustomer = get(
        'SELECT id FROM customers WHERE phone = ?',
        [normalizedPhone]
      );

      if (existingCustomer) {
        customerId = existingCustomer.id;
        run(
          `UPDATE customers SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [full_name.trim(), email || null, customerId]
        );
      } else {
        const result = run(
          'INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)',
          [full_name.trim(), normalizedPhone, email || null]
        );
        customerId = result.lastInsertRowid;
      }
    }

    // Save signature image to local uploads
    let signatureUrl = null;
    if (signature_data && signature_data.startsWith('data:image')) {
      // Ensure signature directory exists
      if (!existsSync(uploadConfig.signaturesDir)) {
        mkdirSync(uploadConfig.signaturesDir, { recursive: true });
      }

      // Extract base64 data
      const base64Data = signature_data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Generate unique filename
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const cleanName = full_name.trim().replace(/[^א-תa-zA-Z0-9]/g, '_');
      const filename = `${dateStr}_${cleanName}_${uuidv4().slice(0, 8)}.png`;
      const filepath = join(uploadConfig.signaturesDir, filename);

      // Save file to local uploads
      writeFileSync(filepath, buffer);
      signatureUrl = `/uploads/signatures/${filename}`;
    }

    // Note: Signature is embedded in the PDF which is saved to synced folder later

    // Create agreement record
    const result = run(
      `INSERT INTO agreements 
       (order_id, customer_id, customer_name, customer_phone, customer_email,
        event_date, signature_data, signature_url, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedOrderId || null,
        customerId,
        full_name.trim(),
        normalizedPhone,
        email || null,
        event_date || null,
        signature_data,
        signatureUrl,
        req.ip || req.connection?.remoteAddress || null
      ]
    );

    // Update order if provided
    if (resolvedOrderId) {
      run(
        'UPDATE orders SET agreement_signed = 1, local_signature_path = ? WHERE id = ?',
        [signatureUrl, resolvedOrderId]
      );
    }

    const agreement = get('SELECT * FROM agreements WHERE id = ?', [result.lastInsertRowid]);

    // Note: Google Calendar/Tasks integration is handled when creating the order, not here

    // Generate PDF with embedded signature
    let pdfBuffer = null;
    let savedPdfPath = null;
    let localUploadsPdfPath = null;
    let localUploadsPdfUrl = null;
    try {
      pdfBuffer = await generateAgreementPdf({
        customerName: full_name.trim(),
        customerPhone: normalizedPhone,
        customerEmail: email || '',
        customerAddress: '',
        eventDate: event_date,
        orderSummary: orderWithItems?.order?.order_summary || '',
        orderItems: orderWithItems?.items || [],
        signatureData: signature_data,
        signedAt: agreement.agreed_at,
      });

      console.log('PDF generated successfully');

      const localPdfResult = saveAgreementPdfToLocalUploads(
        pdfBuffer,
        full_name.trim(),
        resolvedOrderId
      );
      if (localPdfResult) {
        localUploadsPdfPath = localPdfResult.pdfPath;
        localUploadsPdfUrl = localPdfResult.pdfUrl;
      }

      // Save PDF to synced folder
      if (isAgreementsFolderAccessible()) {
        const savedResult = saveAgreementPdf(
          pdfBuffer,
          full_name.trim(),
          new Date(),
          resolvedOrderId
        );

        if (savedResult) {
          savedPdfPath = savedResult.pdfPath;
          console.log('Agreement PDF saved to:', savedPdfPath);
        }
      }

      if (localUploadsPdfUrl || savedPdfPath) {
        run(
          'UPDATE agreements SET pdf_url = ? WHERE id = ?',
          [localUploadsPdfUrl || savedPdfPath, agreement.id]
        );
      }

      if (resolvedOrderId && (localUploadsPdfPath || savedPdfPath)) {
        run(
          'UPDATE orders SET local_agreement_path = ? WHERE id = ?',
          [localUploadsPdfPath || savedPdfPath, resolvedOrderId]
        );
      }

    } catch (pdfError) {
      console.error('Error generating/saving PDF:', pdfError.message);
      // Don't fail the agreement if PDF generation fails
    }

    // Fire-and-forget: send confirmation emails in the background.
    // This prevents SMTP timeouts from blocking the HTTP response (socket hang up).
    if (isEmailEnabled()) {
      const emailPayload = {
        customerName: full_name.trim(),
        customerPhone: normalizedPhone,
        customerEmail: email || '',
        eventDate: event_date || null,
        pdfBuffer: pdfBuffer,
      };

      // Customer email (if they have an email)
      if (email) {
        sendAgreementConfirmationToCustomer({
          ...emailPayload,
          customerEmail: email,
        }).then(result => {
          console.log('Customer agreement email result:', result);
        }).catch(err => {
          console.error('Customer agreement email failed:', err);
        });
      }

      // Owner email
      sendAgreementNotificationToOwner(emailPayload).then(result => {
        console.log('Owner agreement email result:', result);
      }).catch(err => {
        console.error('Owner agreement email failed:', err);
      });
    }

    res.status(201).json({
      success: true,
      message: 'ההסכם נחתם בהצלחה!',
      data: {
        agreementId: agreement.id,
        customerName: agreement.customer_name,
        signedAt: agreement.agreed_at,
        emailsSent: isEmailEnabled(),
        pdfSaved: !!(localUploadsPdfPath || savedPdfPath),
        pdfPath: localUploadsPdfPath || savedPdfPath,
        pdfUrl: localUploadsPdfUrl || null
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agreements
 * List all agreements (protected)
 */
router.get('/', requireAuth, (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    const agreements = all(
      `SELECT ra.*, c.phone as customer_phone_from_db
       FROM agreements ra
       LEFT JOIN customers c ON ra.customer_id = c.id
       ORDER BY ra.created_at DESC
       LIMIT ? OFFSET ?`,
      [limitNum, offset]
    );

    const { total } = get('SELECT COUNT(*) as total FROM agreements');

    res.json({
      success: true,
      data: {
        agreements,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agreements/:id
 * Get a single agreement (protected)
 */
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const { id } = req.params;

    const agreement = get(
      `SELECT ra.*, c.name as customer_full_name, c.phone as customer_phone_db
       FROM agreements ra
       LEFT JOIN customers c ON ra.customer_id = c.id
       WHERE ra.id = ?`,
      [id]
    );

    if (!agreement) {
      throw new ApiError(404, 'הסכם לא נמצא');
    }

    res.json({
      success: true,
      data: { agreement }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agreements/terms
 * Get the rental terms text (public)
 */
router.get('/content/terms', (req, res) => {
  res.json({
    success: true,
    data: {
      terms: AGREEMENT_TERMS,
      cancellationPolicy: AGREEMENT_CANCELLATION_POLICY,
      businessName: businessConfig.name,
      businessPhone: businessConfig.phone
    }
  });
});

export default router;
