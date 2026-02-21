/**
 * Transactions Routes
 * 
 * Purpose: Manage income and expense transactions.
 * 
 * Operation: Provides endpoints for listing, creating, updating,
 * and analyzing financial transactions.
 * Language: Success messages in feminine form.
 */

import { Router } from 'express';
import { run, get, all } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { sendNewIncomeNotification, isEmailEnabled, sendDetailedIncomeNotification } from '../services/email.js';
import { extractReceiptDetails } from '../services/ai.js';
import { sanitizePaymentDetails } from '../services/paymentDetails.js';
import { normalizePhoneNumber } from '../services/phone.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Valid categories for income and expenses
const INCOME_CATEGORIES = ['order', 'repair', 'other'];
const EXPENSE_CATEGORIES = ['materials', 'overhead', 'tax', 'equipment', 'salary', 'other'];

// Category display names in Hebrew
const CATEGORY_DISPLAY_NAMES = {
  order: 'הזמנה',
  repair: 'תיקונים',
  other: 'אחר',
  materials: 'חומרים',
  overhead: 'תקורה',
  tax: 'מיסוי',
  equipment: 'ציוד',
  salary: 'משכורות',
};

function getCategoryDisplayName(category) {
  return CATEGORY_DISPLAY_NAMES[category] || category;
}

function normalizeBankDetails(value) {
  const sanitized = sanitizePaymentDetails({
    paymentMethod: null,
    bankDetails: value,
    installments: 1
  });
  return sanitized.bankDetails;
}

/**
 * GET /api/transactions
 * List transactions with filters
 */
router.get('/', (req, res, next) => {
  try {
    const {
      type,
      category,
      customer_id,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Use LEFT JOINs instead of correlated subqueries to avoid per-row scans.
    // The items_breakdown aggregation uses a pre-grouped subquery joined once.
    let sql = `
      SELECT t.*, c.name as customer_full_name,
             oi_agg.items_breakdown,
             o.total_price as order_total_price
      FROM transactions t 
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN (
        SELECT order_id, GROUP_CONCAT(item_type || ':' || final_price) as items_breakdown
        FROM order_items
        GROUP BY order_id
      ) oi_agg ON oi_agg.order_id = t.order_id
      WHERE 1=1
    `;
    const params = [];

    // Add type filter
    if (type && ['income', 'expense'].includes(type)) {
      sql += ' AND t.type = ?';
      params.push(type);
    }
    
    // Add customer_id filter
    if (customer_id) {
      sql += ' AND t.customer_id = ?';
      params.push(customer_id);
    }

    // Add category filter (supports comma-separated values)
    if (category) {
      const categories = category.split(',').filter(Boolean);
      if (categories.length > 0) {
        const placeholders = categories.map(() => '?').join(',');
        sql += ` AND t.category IN (${placeholders})`;
        params.push(...categories);
      }
    }

    // Add date range filter
    if (startDate) {
      sql += ' AND t.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND t.date <= ?';
      params.push(endDate);
    }

    // Add search filter
    if (search) {
      sql += ' AND (t.customer_name LIKE ? OR t.supplier LIKE ? OR t.product LIKE ? OR t.notes LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Add sorting
    const validSortColumns = ['date', 'amount', 'created_at', 'category'];
    const sortColumn = validSortColumns.includes(sortBy) ? `t.${sortBy}` : 't.date';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${order}`;

    // Add pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const transactions = all(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM transactions t WHERE 1=1';
    const countParams = [];
    if (type) {
      countSql += ' AND t.type = ?';
      countParams.push(type);
    }
    if (category) {
      const categories = category.split(',').filter(Boolean);
      if (categories.length > 0) {
        const placeholders = categories.map(() => '?').join(',');
        countSql += ` AND t.category IN (${placeholders})`;
        countParams.push(...categories);
      }
    }
    if (startDate) {
      countSql += ' AND t.date >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countSql += ' AND t.date <= ?';
      countParams.push(endDate);
    }
    if (search) {
      countSql += ' AND (t.customer_name LIKE ? OR t.supplier LIKE ? OR t.product LIKE ? OR t.notes LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    const { total } = get(countSql, countParams);

    res.json({
      success: true,
      data: {
        transactions,
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
 * GET /api/transactions/summary
 * Get financial summary for a period
 */
router.get('/summary', (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;

    const year = new Date().getFullYear();
    const start = startDate || `${year}-01-01`;
    const end = endDate || `${year}-12-31`;

    const totals = get(
      `SELECT 
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses
       FROM transactions 
       WHERE date >= ? AND date <= ?`,
      [start, end]
    );

    const incomeByCategory = all(
      `SELECT category, SUM(amount) as total
       FROM transactions
       WHERE type = 'income' AND date >= ? AND date <= ?
       GROUP BY category
       ORDER BY total DESC`,
      [start, end]
    );

    const expensesByCategory = all(
      `SELECT category, SUM(amount) as total
       FROM transactions
       WHERE type = 'expense' AND date >= ? AND date <= ?
       GROUP BY category
       ORDER BY total DESC`,
      [start, end]
    );

    const monthly = all(
      `SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
       FROM transactions
       WHERE date >= ? AND date <= ?
       GROUP BY strftime('%Y-%m', date)
       ORDER BY month`,
      [start, end]
    );

    res.json({
      success: true,
      data: {
        period: { start, end },
        totals: {
          income: totals.total_income || 0,
          expenses: totals.total_expenses || 0,
          profit: (totals.total_income || 0) - (totals.total_expenses || 0)
        },
        incomeByCategory,
        expensesByCategory,
        monthly
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/transactions/:id
 * Get a single transaction
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const transaction = get(
      `SELECT t.*, c.name as customer_full_name, c.phone as customer_phone
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       WHERE t.id = ?`,
      [id]
    );

    if (!transaction) {
      throw new ApiError(404, 'עסקה לא נמצאה');
    }

    res.json({
      success: true,
      data: { transaction }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transactions
 * Create a new transaction
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      date,
      type,
      category,
      customer_id,
      customer_name,
      supplier,
      product,
      amount,
      payment_method,
      notes,
      order_id,
      customer_charge_amount,
      confirmation_number,
      last_four_digits,
      check_number,
      bank_details,
      installments: requestedInstallments,
      fileBase64,
      fileName
    } = req.body;

    if (!date) {
      throw new ApiError(400, 'נא להזין תאריך');
    }
    if (!type || !['income', 'expense'].includes(type)) {
      throw new ApiError(400, 'נא לבחור סוג עסקה (הכנסה/הוצאה)');
    }
    if (!category) {
      throw new ApiError(400, 'נא לבחור קטגוריה');
    }
    if (!amount || parseFloat(amount) === 0) {
      throw new ApiError(400, 'נא להזין סכום');
    }

    const validCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!validCategories.includes(category)) {
      throw new ApiError(400, 'קטגוריה לא תקינה');
    }

    let finalCustomerId = customer_id;
    let finalCustomerName = customer_name;

    if (req.body.new_customer) {
      const { name, phone, email } = req.body.new_customer;
      const normalizedPhone = normalizePhoneNumber(phone);
      if (!name) {
        throw new ApiError(400, 'שם לקוחה חובה עבור לקוחה חדשה');
      }

      const existingCustomer = normalizedPhone
        ? get('SELECT id, name FROM customers WHERE phone = ?', [normalizedPhone])
        : null;
      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        finalCustomerName = existingCustomer.name;
      } else {
        const result = run(
          'INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)',
          [name, normalizedPhone || null, email || null]
        );
        finalCustomerId = result.lastInsertRowid;
        finalCustomerName = name;
      }
    } else if (finalCustomerId && !finalCustomerName) {
      const existingCustomer = get('SELECT name FROM customers WHERE id = ?', [finalCustomerId]);
      if (existingCustomer) {
        finalCustomerName = existingCustomer.name;
      }
    }

    let paymentMethod = payment_method || null;
    let confirmationNumber = confirmation_number || null;
    let lastFourDigits = last_four_digits || null;
    let checkNumber = check_number || null;
    let bankDetails = normalizeBankDetails(bank_details);
    let installments = parseInt(requestedInstallments, 10);
    if (Number.isNaN(installments) || installments < 1) installments = 1;

    if (fileBase64 && type === 'income') {
      try {
        const buffer = Buffer.from(fileBase64, 'base64');
        const safeFileName = (fileName || '').toLowerCase();
        const mimeType = safeFileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        
        const aiResult = await extractReceiptDetails(buffer, mimeType, paymentMethod);
        
        if (aiResult) {
          if (aiResult.paymentMethod && !paymentMethod) {
            paymentMethod = aiResult.paymentMethod;
          }
          if (aiResult.confirmationNumber && !confirmationNumber) {
            confirmationNumber = aiResult.confirmationNumber;
          }
          if (aiResult.lastFourDigits && !lastFourDigits) {
            lastFourDigits = aiResult.lastFourDigits;
          }
          if (aiResult.checkNumber && !checkNumber) {
            checkNumber = aiResult.checkNumber;
          }
          if (aiResult.bankDetails && !bankDetails) {
            bankDetails = JSON.stringify(aiResult.bankDetails);
          }
          if (aiResult.installments && (!requestedInstallments || parseInt(requestedInstallments, 10) < 1)) {
            installments = parseInt(aiResult.installments, 10);
          }
          console.log('AI Extraction Result:', aiResult);
        }
      } catch (aiError) {
        console.error('AI extraction failed:', aiError);
      }
    }

    const sanitizedPayment = sanitizePaymentDetails({
      paymentMethod,
      confirmationNumber,
      lastFourDigits,
      checkNumber,
      bankDetails,
      installments
    });

    paymentMethod = sanitizedPayment.paymentMethod;
    confirmationNumber = sanitizedPayment.confirmationNumber;
    lastFourDigits = sanitizedPayment.lastFourDigits;
    checkNumber = sanitizedPayment.checkNumber;
    bankDetails = sanitizedPayment.bankDetails;
    installments = sanitizedPayment.installments;

    const result = run(
      `INSERT INTO transactions (date, type, category, customer_id, customer_name, supplier, product, amount, payment_method, notes, order_id, customer_charge_amount, confirmation_number, last_four_digits, check_number, bank_details, installments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        type,
        category,
        finalCustomerId || null,
        finalCustomerName || null,
        supplier || null,
        product || null,
        parseFloat(amount),
        paymentMethod || null,
        notes || null,
        order_id || null,
        type === 'expense' ? (parseFloat(customer_charge_amount) || 0) : 0,
        confirmationNumber || null,
        lastFourDigits || null,
        checkNumber || null,
        bankDetails || null,
        installments || 1
      ]
    );

    const newTransaction = get('SELECT * FROM transactions WHERE id = ?', [result.lastInsertRowid]);

    if (type === 'income' && order_id) {
      const order = get('SELECT * FROM orders WHERE id = ?', [order_id]);
      if (order) {
        const newPaidAmount = (order.paid_amount || 0) + parseFloat(amount);
        run(
          'UPDATE orders SET paid_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPaidAmount, order_id]
        );
      }
    }

    // Fire-and-forget: send notifications in the background to avoid
    // blocking the HTTP response if SMTP is slow or unreachable.
    if (type === 'income' && isEmailEnabled()) {
      let customerPhone = null;
      let customerEmail = null;
      if (finalCustomerId) {
        const customer = get('SELECT phone, email FROM customers WHERE id = ?', [finalCustomerId]);
        customerPhone = customer?.phone;
        customerEmail = customer?.email;
      }

      sendDetailedIncomeNotification({
        customerName: finalCustomerName,
        customerPhone,
        customerEmail,
        amount: parseFloat(amount),
        paymentMethod,
        confirmationNumber,
        lastFourDigits,
        checkNumber,
        bankDetails,
        installments,
        fileBase64,
        fileName
      }).catch(emailError => {
        console.error('Error sending income notification:', emailError.message);
      });
    }

    if (type === 'expense' && isEmailEnabled()) {
      import('../services/email.js').then(({ sendNewExpenseNotification }) => {
        sendNewExpenseNotification({
          amount: parseFloat(amount),
          category: getCategoryDisplayName(category),
          supplier: supplier || null,
          product: product || null,
          notes,
          transactionDate: date,
          fileBase64,
          fileName
        }).catch(emailError => {
          console.error('Error sending expense notification:', emailError.message);
        });
      });
    }

    res.status(201).json({
      success: true,
      message: type === 'income' ? 'הכנסה נוספה בהצלחה' : 'הוצאה נוספה בהצלחה',
      data: { transaction: newTransaction, emailSent: isEmailEnabled() }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/transactions/:id
 * Update a transaction
 */
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      date,
      type,
      category,
      customer_id,
      customer_name,
      supplier,
      product,
      amount,
      payment_method,
      notes,
      confirmation_number,
      last_four_digits,
      check_number,
      bank_details,
      installments
    } = req.body;

    const existing = get('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!existing) {
      throw new ApiError(404, 'עסקה לא נמצאה');
    }

    if (!date) {
      throw new ApiError(400, 'נא להזין תאריך');
    }
    if (!type || !['income', 'expense'].includes(type)) {
      throw new ApiError(400, 'נא לבחור סוג עסקה');
    }
    if (!category) {
      throw new ApiError(400, 'נא לבחור קטגוריה');
    }
    if (!amount || parseFloat(amount) === 0) {
      throw new ApiError(400, 'נא להזין סכום');
    }

    const sanitizedPayment = sanitizePaymentDetails({
      paymentMethod: payment_method,
      confirmationNumber: confirmation_number,
      lastFourDigits: last_four_digits,
      checkNumber: check_number,
      bankDetails: bank_details,
      installments
    });

    run(
      `UPDATE transactions 
       SET date = ?, type = ?, category = ?, customer_id = ?, customer_name = ?, 
           supplier = ?, product = ?, amount = ?, payment_method = ?, notes = ?, confirmation_number = ?, 
           last_four_digits = ?, check_number = ?, bank_details = ?, installments = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        date,
        type,
        category,
        customer_id || null,
        customer_name || null,
        supplier || null,
        product || null,
        parseFloat(amount),
        sanitizedPayment.paymentMethod || null,
        notes || null,
        sanitizedPayment.confirmationNumber || null,
        sanitizedPayment.lastFourDigits || null,
        sanitizedPayment.checkNumber || null,
        sanitizedPayment.bankDetails,
        sanitizedPayment.installments,
        id
      ]
    );

    const updatedTransaction = get('SELECT * FROM transactions WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'עסקה עודכנה בהצלחה',
      data: { transaction: updatedTransaction }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete a transaction
 */
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = get('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!existing) {
      throw new ApiError(404, 'עסקה לא נמצאה');
    }

    run('DELETE FROM transactions WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'עסקה נמחקה בהצלחה'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/transactions/categories/income
 * Get income categories
 */
router.get('/categories/income', (req, res) => {
  res.json({
    success: true,
    data: {
      categories: [
        { value: 'order', label: 'הזמנה' },
        { value: 'repair', label: 'תיקונים' },
        { value: 'other', label: 'אחר' }
      ]
    }
  });
});

/**
 * GET /api/transactions/categories/expense
 * Get expense categories
 */
router.get('/categories/expense', (req, res) => {
  res.json({
    success: true,
    data: {
      categories: [
        { value: 'materials', label: 'חומרים' },
        { value: 'overhead', label: 'תקורה' },
        { value: 'tax', label: 'מיסוי' },
        { value: 'equipment', label: 'ציוד' },
        { value: 'salary', label: 'משכורות' },
        { value: 'other', label: 'אחר' }
      ]
    }
  });
});

export default router;
