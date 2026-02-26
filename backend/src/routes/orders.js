/**
 * Orders Routes
 * 
 * Purpose: Manage rental orders, sewing orders, and sales.
 * Supports multiple dresses per order with individual pricing.
 * 
 * Operation: Provides endpoints for creating, updating,
 * and tracking orders throughout their lifecycle.
 * Integrates with Google Calendar/Tasks and sends email notifications.
 * Language: Success messages in feminine form.
 */

import { Router } from 'express';
import { run, get, all, transaction } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { sendNewOrderNotification, isEmailEnabled } from '../services/email.js';
import { extractReceiptDetails } from '../services/ai.js';
import { sanitizePaymentDetails } from '../services/paymentDetails.js';
import { normalizePhoneNumber } from '../services/phone.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

function getMimeTypeFromFileName(fileName = '') {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function getItemTypeLabel(type) {
  const labels = {
    rental: 'השכרה',
    sewing_for_rental: 'תפירה שנשארת בהשכרה',
    sewing: 'תפירה',
    sale: 'מכירה'
  };
  return labels[type] || type || 'פריט';
}

function syncDressSaleStatus(dressId) {
  if (!dressId) return;

  const hasActiveSaleOrder = get(
    `SELECT 1
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.dress_id = ?
       AND oi.item_type = 'sale'
       AND o.status != 'cancelled'
     LIMIT 1`,
    [dressId]
  );

  if (hasActiveSaleOrder) {
    run(
      `UPDATE dresses
       SET status = 'sold', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [dressId]
    );
    return;
  }

  // If no active sale order exists for this dress, release "sold" status only.
  run(
    `UPDATE dresses
     SET status = 'available', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'sold'`,
    [dressId]
  );
}

/**
 * GET /api/orders
 * List orders with filters
 */
router.get('/', (req, res, next) => {
  try {
    const {
      status,
      customer_id,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    let sql = `
      SELECT o.*, 
             c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             (SELECT COALESCE(SUM(customer_charge_amount), 0) FROM transactions t WHERE t.order_id = o.id) as total_customer_charge,
             (SELECT COALESCE(MAX(date), '') FROM transactions t WHERE t.order_id = o.id) as last_active_date
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }
    if (customer_id) {
      sql += ' AND o.customer_id = ?';
      params.push(customer_id);
    }
    if (startDate) {
      sql += ' AND o.event_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND o.event_date <= ?';
      params.push(endDate);
    }

    const validSortColumns = ['created_at', 'event_date', 'total_price', 'status', 'customer_name', 'last_active_date'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'event_date';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortPrefix = ['customer_name', 'last_active_date'].includes(sortColumn) ? '' : 'o.';
    sql += ` ORDER BY ${sortPrefix}${sortColumn} ${order}`;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const orders = all(sql, params);

    let countSql = 'SELECT COUNT(*) as total FROM orders o WHERE 1=1';
    const countParams = [];
    if (status) {
      countSql += ' AND o.status = ?';
      countParams.push(status);
    }
    if (customer_id) {
      countSql += ' AND o.customer_id = ?';
      countParams.push(customer_id);
    }
    const { total } = get(countSql, countParams);

    res.json({
      success: true,
      data: {
        orders,
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
 * GET /api/orders/:id
 * Get a single order
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const order = get(
      `SELECT o.*, 
              c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
              (SELECT COALESCE(SUM(customer_charge_amount), 0) FROM transactions t WHERE t.order_id = o.id) as total_customer_charge
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = ?`,
      [id]
    );

    if (!order) {
      throw new ApiError(404, 'הזמנה לא נמצאה');
    }

    const items = all(
      `SELECT oi.*, d.name as dress_name, d.photo_url as dress_photo, d.base_price as dress_base_price
       FROM order_items oi
       LEFT JOIN dresses d ON oi.dress_id = d.id
       WHERE oi.order_id = ?
       ORDER BY oi.id`,
      [id]
    );

    const agreement = get(
      'SELECT * FROM agreements WHERE order_id = ?',
      [id]
    );

    res.json({
      success: true,
      data: {
        order,
        items,
        agreement
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      customer_id,
      new_customer,
      event_date,
      total_price,
      deposit_amount,
      deposit_payments,
      notes,
      items
    } = req.body;

    if (!customer_id && !new_customer) {
      throw new ApiError(400, 'נא לבחור לקוחה או להזין פרטי לקוחה חדשה');
    }
    if (!total_price || parseFloat(total_price) <= 0) {
      throw new ApiError(400, 'נא להזין מחיר');
    }
    if (!event_date) {
      throw new ApiError(400, 'נא להזין תאריך אירוע');
    }

    let finalCustomerId = customer_id;
    let customerData = null;

    if (!customer_id && new_customer) {
      if (!new_customer.name || !new_customer.name.trim()) {
        throw new ApiError(400, 'נא להזין שם לקוחה');
      }

      const normalizedNewCustomerPhone = normalizePhoneNumber(new_customer.phone);
      const normalizedNewCustomerEmail = new_customer.email?.trim() || null;
      const existingCustomer = normalizedNewCustomerPhone
        ? get(
            'SELECT id, name, phone, email FROM customers WHERE phone = ?',
            [normalizedNewCustomerPhone]
          )
        : null;

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        customerData = existingCustomer;
      } else {
        const customerResult = run(
          'INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)',
          [
            new_customer.name.trim(),
            normalizedNewCustomerPhone || null,
            normalizedNewCustomerEmail
          ]
        );
        finalCustomerId = customerResult.lastInsertRowid;
        customerData = {
          id: finalCustomerId,
          name: new_customer.name.trim(),
          phone: normalizedNewCustomerPhone || null,
          email: normalizedNewCustomerEmail
        };
      }
    } else {
      customerData = get('SELECT id, name, phone, email FROM customers WHERE id = ?', [customer_id]);
      if (!customerData) {
        throw new ApiError(404, 'לקוחה לא נמצאה');
      }
    }

    let orderSummary = '';
    if (items && items.length > 0) {
      const itemSummaries = items.map(item => {
        const itemType = getItemTypeLabel(item.item_type);
        const wearerInfo = item.wearer_name ? ` (${item.wearer_name})` : '';
        return `${itemType} ${item.dress_name || ''}${wearerInfo}`.trim();
      });
      orderSummary = itemSummaries.join(', ');
    } else {
      orderSummary = 'הזמנה';
    }

    const depositAmt = parseFloat(deposit_amount) || 0;

    const result = run(
      `INSERT INTO orders (customer_id, event_date, total_price, deposit_amount, paid_amount, notes, order_summary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        finalCustomerId,
        event_date,
        parseFloat(total_price),
        depositAmt,
        depositAmt,
        notes || null,
        orderSummary
      ]
    );

    const orderId = result.lastInsertRowid;

    if (items && items.length > 0) {
      for (const item of items) {
        const basePrice = parseFloat(item.base_price) || 0;
        const additionalPayments = parseFloat(item.additional_payments) || 0;
        const finalPrice = parseFloat(item.final_price) || (basePrice + additionalPayments);
        const resolvedItemType = item.item_type || 'rental';

        let resolvedWearerName = item.wearer_name || customerData.name;
        let resolvedDressName = item.dress_name || resolvedWearerName;

        run(
          `INSERT INTO order_items (order_id, dress_id, dress_name, wearer_name, item_type, base_price, additional_payments, final_price, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.dress_id || null,
            resolvedDressName,
            resolvedWearerName,
            resolvedItemType,
            basePrice,
            additionalPayments,
            finalPrice,
            item.notes || null
          ]
        );

        if (item.dress_id) {
          run(
            'UPDATE dresses SET rental_count = rental_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [item.dress_id]
          );

          if (resolvedItemType === 'sale') {
            syncDressSaleStatus(item.dress_id);
          }

          run(
            `INSERT INTO dress_history (dress_id, customer_id, wearer_name, customer_name, amount, rental_type, event_date, notes, order_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.dress_id, finalCustomerId, resolvedWearerName, customerData?.name || null, finalPrice, resolvedItemType || 'rental', event_date, null, orderId]
          );
          run('UPDATE dresses SET total_income = total_income + ? WHERE id = ?', [finalPrice, item.dress_id]);
        }
      }
    }

    const normalizedDepositPayments = [];

    if (deposit_payments && Array.isArray(deposit_payments)) {

      for (const payment of deposit_payments) {
        const pAmt = parseFloat(payment.amount) || 0;
        if (pAmt > 0) {
          let paymentMethod = payment.payment_method || null;
          let confirmationNumber = payment.confirmation_number || null;
          let lastFourDigits = payment.last_four_digits || null;
          let checkNumber = payment.check_number || null;
          let bankDetails = payment.bank_details || null;
          let installments = parseInt(payment.installments, 10);
          if (Number.isNaN(installments) || installments < 1) installments = 1;

          normalizedDepositPayments.push({
            amount: pAmt,
            method: paymentMethod || payment.payment_method || 'לא צוין',
            confirmationNumber: confirmationNumber || null,
            lastFourDigits: lastFourDigits || null,
            checkNumber: checkNumber || null,
            bankDetails: bankDetails || null,
            installments: installments,
            hasFile: Boolean(payment.fileBase64),
            fileBase64: payment.fileBase64 || null,
            fileName: payment.fileName || null
          });

          run(
            `INSERT INTO transactions (date, type, category, customer_id, customer_name, amount, payment_method, order_id, notes, confirmation_number, last_four_digits, check_number, bank_details, installments)
             VALUES (?, 'income', 'order', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              new Date().toISOString().split('T')[0],
              finalCustomerId,
              customerData.name,
              pAmt,
              paymentMethod || 'לא צוין',
              orderId,
              payment.notes || null,
              confirmationNumber || null,
              lastFourDigits || null,
              checkNumber || null,
              bankDetails || null,
              installments
            ]
          );
        }
      }

    }

    const newOrder = get(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = ?`,
      [orderId]
    );

    // 🌟 FAST RESPONSE: Send 201 Created immediately to unblock the UI!
    res.status(201).json({
      success: true,
      message: 'הזמנה נוצרה בהצלחה',
      data: { order: newOrder }
    });

    // 🌟 BACKGROUND PROCESSING: AI + Email
    // Runs asynchronously after res.send() finishes
    (async () => {
      try {
        // 1. Run AI for each deposit payment with a file
        if (deposit_payments && Array.isArray(deposit_payments)) {
          for (let i = 0; i < normalizedDepositPayments.length; i++) {
            const payment = normalizedDepositPayments[i];

            if (payment.hasFile && payment.fileBase64) {
              const buffer = Buffer.from(payment.fileBase64, 'base64');
              const mimeType = getMimeTypeFromFileName(payment.fileName || '');

              const aiData = await extractReceiptDetails(buffer, mimeType, payment.method);

              if (aiData) {
                if (aiData.paymentMethod && (!payment.method || payment.method === 'לא צוין')) payment.method = aiData.paymentMethod;
                if (aiData.confirmationNumber && !payment.confirmationNumber) payment.confirmationNumber = aiData.confirmationNumber;
                if (aiData.lastFourDigits && !payment.lastFourDigits) payment.lastFourDigits = aiData.lastFourDigits;
                if (aiData.checkNumber && !payment.checkNumber) payment.checkNumber = aiData.checkNumber;
                if (aiData.bankDetails && !payment.bankDetails) payment.bankDetails = JSON.stringify(aiData.bankDetails);
                if (aiData.installments && payment.installments <= 1) {
                  let parsedInstal = parseInt(aiData.installments, 10);
                  if (!Number.isNaN(parsedInstal) && parsedInstal > 1) payment.installments = parsedInstal;
                }

                const sanitizedPayment = sanitizePaymentDetails({
                  paymentMethod: payment.method,
                  confirmationNumber: payment.confirmationNumber,
                  lastFourDigits: payment.lastFourDigits,
                  checkNumber: payment.checkNumber,
                  bankDetails: payment.bankDetails,
                  installments: payment.installments
                });

                payment.method = sanitizedPayment.paymentMethod || payment.method;
                payment.confirmationNumber = sanitizedPayment.confirmationNumber;
                payment.lastFourDigits = sanitizedPayment.lastFourDigits;
                payment.checkNumber = sanitizedPayment.checkNumber;
                payment.bankDetails = sanitizedPayment.bankDetails;
                payment.installments = sanitizedPayment.installments;

                // Update the matching transaction in DB
                run(
                  `UPDATE transactions 
                   SET payment_method = ?, confirmation_number = ?, last_four_digits = ?, 
                       check_number = ?, bank_details = ?, installments = ?, updated_at = CURRENT_TIMESTAMP 
                   WHERE id = (
                     SELECT id FROM transactions
                     WHERE order_id = ? AND amount = ? AND type = 'income' AND category = 'order'
                     ORDER BY id DESC
                     LIMIT 1
                   )`,
                  [
                    payment.method || null,
                    payment.confirmationNumber || null,
                    payment.lastFourDigits || null,
                    payment.checkNumber || null,
                    payment.bankDetails || null,
                    payment.installments,
                    orderId,
                    payment.amount
                  ]
                );
              }
            }
          }
        }

        // 2. Send Notifications (Only after AI updated DB)
        if (isEmailEnabled()) {
          const dressesForEmail = (items || []).map((item) => {
            const basePrice = parseFloat(item.base_price) || 0;
            const extra = parseFloat(item.additional_payments) || 0;
            const finalPrice = parseFloat(item.final_price) || (basePrice + extra);
            return {
              name: item.dress_name || item.wearer_name || 'פריט',
              price: finalPrice,
              itemType: item.item_type || 'rental',
              itemTypeLabel: getItemTypeLabel(item.item_type || 'rental')
            };
          });

          await sendNewOrderNotification({
            customerName: customerData.name,
            customerPhone: customerData.phone,
            customerEmail: customerData.email || null,
            eventDate: event_date,
            orderSummary,
            dresses: dressesForEmail,
            totalPrice: parseFloat(total_price),
            deposit: depositAmt,
            depositPayments: normalizedDepositPayments, // Now potentially enriched by AI
            notes
          });
        }
      } catch (backgroundError) {
        console.error('Background Order AI/Email processing failed:', backgroundError);
      }
    })(); // End of Background Promise

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/orders/:id
 * Update an existing order and its items
 */
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      customer_id,
      event_date,
      total_price,
      deposit_amount,
      paid_amount,
      status,
      notes,
      items
    } = req.body;

    const existing = get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existing) {
      throw new ApiError(404, 'הזמנה לא נמצאה');
    }

    transaction(() => {
      // 1. Update the order record
      run(
        `UPDATE orders 
         SET customer_id = ?, event_date = ?, total_price = ?, deposit_amount = ?, paid_amount = ?, 
             status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          customer_id || existing.customer_id,
          event_date || existing.event_date,
          parseFloat(total_price) || existing.total_price,
          parseFloat(deposit_amount) || existing.deposit_amount,
          parseFloat(paid_amount) || existing.paid_amount,
          status || existing.status,
          notes || null,
          id
        ]
      );

      // 2. If items were provided, refresh them
      if (items && Array.isArray(items)) {
        const currentItems = all(
          'SELECT dress_id, item_type FROM order_items WHERE order_id = ? AND dress_id IS NOT NULL',
          [id]
        );
        const saleDressIdsToSync = new Set(
          currentItems
            .filter((item) => item.item_type === 'sale' && item.dress_id)
            .map((item) => item.dress_id)
        );

        // Delete existing items
        run('DELETE FROM order_items WHERE order_id = ?', [id]);

        // Insert new items
        const itemSummaries = [];

        for (const item of items) {
          const basePrice = parseFloat(item.base_price) || 0;
          const additionalPayments = parseFloat(item.additional_payments) || 0;
          const finalPrice = parseFloat(item.final_price) || (basePrice + additionalPayments);
          const resolvedItemType = item.item_type || 'rental';

          run(
            `INSERT INTO order_items (order_id, dress_id, dress_name, wearer_name, item_type, base_price, additional_payments, final_price, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              item.dress_id || null,
              item.dress_name || 'פריט',
              item.wearer_name || null,
              resolvedItemType,
              basePrice,
              additionalPayments,
              finalPrice,
              item.notes || null
            ]
          );

          itemSummaries.push(`${getItemTypeLabel(resolvedItemType)} ${item.dress_name || ''}`.trim());

          if (item.dress_id && resolvedItemType === 'sale') {
            saleDressIdsToSync.add(item.dress_id);
          }
        }

        for (const dressId of saleDressIdsToSync) {
          syncDressSaleStatus(dressId);
        }

        // Update order summary from item types
        if (itemSummaries.length > 0) {
          run('UPDATE orders SET order_summary = ? WHERE id = ?', [itemSummaries.join(', '), id]);
        } else {
          run('UPDATE orders SET order_summary = ? WHERE id = ?', ['הזמנה', id]);
        }
      }
    });

    const updatedOrder = get('SELECT * FROM orders WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'הזמנה עודכנה בהצלחה',
      data: { order: updatedOrder }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/orders/:id
 */
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const order = get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      throw new ApiError(404, 'הזמנה לא נמצאה');
    }

    run('UPDATE orders SET status = \'cancelled\', updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    // Re-sync only dresses that were sold by this order.
    const saleItems = all(
      `SELECT DISTINCT dress_id
       FROM order_items
       WHERE order_id = ?
         AND dress_id IS NOT NULL
         AND item_type = 'sale'`,
      [id]
    );

    for (const item of saleItems) {
      syncDressSaleStatus(item.dress_id);
    }

    res.json({
      success: true,
      message: 'הזמנה בוטלה בהצלחה'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/merge
 * Merge two orders into one.
 * Target order keeps its ID. Source order is deleted.
 * All related records (items, transactions, agreements, history) are moved to the target.
 */
router.post('/merge', (req, res, next) => {
  try {
    const { targetOrderId, sourceOrderId, updatedOrderData } = req.body;

    if (!targetOrderId || !sourceOrderId) {
      throw new ApiError(400, 'חובה לציין מזהה הזמנה למיזוג ומזהה הזמנה יעד');
    }

    if (parseInt(targetOrderId) === parseInt(sourceOrderId)) {
      throw new ApiError(400, 'לא ניתן למזג הזמנה עם עצמה');
    }

    // Start transaction
    transaction(() => {
      // 1. Verify both exist
      const target = get('SELECT * FROM orders WHERE id = ?', [targetOrderId]);
      const source = get('SELECT * FROM orders WHERE id = ?', [sourceOrderId]);

      if (!target || !source) {
        throw new ApiError(404, 'אחת ההזמנות לא נמצאה');
      }

      // 2. Update target order details if provided
      if (updatedOrderData) {
        const { event_date, notes, status } = updatedOrderData;
        run(
          `UPDATE orders 
           SET event_date = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            event_date || target.event_date,
            notes || target.notes,
            status || target.status,
            targetOrderId
          ]
        );
      }

      // 3. Move Order Items
      run('UPDATE order_items SET order_id = ? WHERE order_id = ?', [targetOrderId, sourceOrderId]);

      // 4. Move Transactions (Payments)
      run('UPDATE transactions SET order_id = ? WHERE order_id = ?', [targetOrderId, sourceOrderId]);

      // 5. Move Agreements
      run('UPDATE agreements SET order_id = ? WHERE order_id = ?', [targetOrderId, sourceOrderId]);

      // 6. Move Dress History
      run('UPDATE dress_history SET order_id = ? WHERE order_id = ?', [targetOrderId, sourceOrderId]);

      // 7. Update Totals for Target Order
      // Recalculate total price from items
      const { newTotal } = get(
        'SELECT SUM(final_price) as newTotal FROM order_items WHERE order_id = ?',
        [targetOrderId]
      );

      // Recalculate paid amount from transactions
      const { newPaid } = get(
        "SELECT SUM(amount) as newPaid FROM transactions WHERE order_id = ? AND type = 'income'",
        [targetOrderId]
      );

      // We sum the deposits.
      const newDeposit = (target.deposit_amount || 0) + (source.deposit_amount || 0);

      run(
        'UPDATE orders SET total_price = ?, paid_amount = ?, deposit_amount = ? WHERE id = ?',
        [newTotal || 0, newPaid || 0, newDeposit, targetOrderId]
      );

      // 8. Regenerate Summary
      const items = all(
        'SELECT item_type, dress_name, wearer_name FROM order_items WHERE order_id = ?',
        [targetOrderId]
      );

      let orderSummary = '';
      if (items && items.length > 0) {
        const itemSummaries = items.map(item => {
          const itemType = getItemTypeLabel(item.item_type);
          const wearerInfo = item.wearer_name ? ` (${item.wearer_name})` : '';
          return `${itemType} ${item.dress_name || ''}${wearerInfo}`.trim();
        });
        orderSummary = itemSummaries.join(', ');
      } else {
        orderSummary = 'הזמנה';
      }

      run('UPDATE orders SET order_summary = ? WHERE id = ?', [orderSummary, targetOrderId]);

      // 9. Delete Source Order
      run('DELETE FROM orders WHERE id = ?', [sourceOrderId]);
    });

    res.json({
      success: true,
      message: 'הזמנות אוחדו בהצלחה'
    });

  } catch (error) {
    next(error);
  }
});

export default router;
