/**
 * Customers Routes
 * 
 * Purpose: CRUD operations for customer management.
 * 
 * Operation: Provides endpoints for listing, searching, creating,
 * updating, and deleting customers.
 * Language: Success messages in feminine form.
 */

import { Router } from 'express';
import { run, get, all } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { normalizePhoneNumber } from '../services/phone.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/customers
 * List all customers with optional search and pagination
 */
router.get('/', (req, res, next) => {
  try {
    const { search, page = 1, limit = 50, sortBy = 'name', sortOrder = 'asc' } = req.query;

    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    // Add search filter
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Add sorting
    const validSortColumns = ['name', 'created_at', 'updated_at', 'source'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${sortColumn} ${order}`;

    // Add pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const customers = all(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM customers WHERE 1=1';
    const countParams = [];
    if (search) {
      countSql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    const { total } = get(countSql, countParams);

    res.json({
      success: true,
      data: {
        customers,
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
 * GET /api/customers/:id
 * Get a single customer by ID with their order history
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const customer = get('SELECT * FROM customers WHERE id = ?', [id]);

    if (!customer) {
      throw new ApiError(404, 'לקוחה לא נמצאה');
    }

    // Get customer's orders
    const orders = all(
      `SELECT o.*
       FROM orders o
       WHERE o.customer_id = ? 
       ORDER BY o.created_at DESC`,
      [id]
    );

    // Get customer's transactions
    const transactions = all(
      'SELECT * FROM transactions WHERE customer_id = ? ORDER BY date DESC LIMIT 20',
      [id]
    );

    // Calculate financials
    const financials = get(
      `SELECT 
        (SELECT COALESCE(SUM(total_price - paid_amount), 0) FROM orders WHERE customer_id = ? AND status != 'cancelled') as order_debt,
        (SELECT COALESCE(SUM(customer_charge_amount), 0) FROM transactions WHERE customer_id = ? AND type = 'expense') as expense_debt
      `,
      [id, id]
    );

    const totalDebt = (financials.order_debt || 0) + (financials.expense_debt || 0);

    res.json({
      success: true,
      data: {
        customer,
        orders,
        transactions,
        financials: {
          order_debt: financials.order_debt || 0,
          expense_debt: financials.expense_debt || 0,
          total_debt: totalDebt
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/customers
 * Create a new customer
 */
router.post('/', (req, res, next) => {
  try {
    const { name, phone, email, source, notes } = req.body;
    const normalizedPhone = normalizePhoneNumber(phone);

    // Validate required fields
    if (!name || !name.trim()) {
      throw new ApiError(400, 'נא להזין שם לקוחה');
    }

    // Check for duplicate (by phone or email if provided)
    if (normalizedPhone) {
      const existing = get('SELECT id FROM customers WHERE phone = ?', [normalizedPhone]);
      if (existing) {
        throw new ApiError(409, 'לקוחה עם מספר טלפון זה כבר קיימת');
      }
    }

    // Insert customer
    const result = run(
      `INSERT INTO customers (name, phone, email, source, notes) 
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), normalizedPhone || null, email || null, source || null, notes || null]
    );

    const newCustomer = get('SELECT * FROM customers WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({
      success: true,
      message: 'לקוחה נוספה בהצלחה',
      data: { customer: newCustomer }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/customers/:id
 * Update a customer
 */
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, email, source, notes } = req.body;
    const normalizedPhone = normalizePhoneNumber(phone);

    // Check if customer exists
    const existing = get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) {
      throw new ApiError(404, 'לקוחה לא נמצאה');
    }

    // Validate required fields
    if (!name || !name.trim()) {
      throw new ApiError(400, 'נא להזין שם לקוחה');
    }

    // Check for duplicate phone (if changed)
    if (normalizedPhone && normalizedPhone !== existing.phone) {
      const duplicate = get(
        'SELECT id FROM customers WHERE phone = ? AND id != ?',
        [normalizedPhone, id]
      );
      if (duplicate) {
        throw new ApiError(409, 'לקוחה אחרת עם מספר טלפון זה כבר קיימת');
      }
    }

    // Update customer
    run(
      `UPDATE customers 
       SET name = ?, phone = ?, email = ?, source = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name.trim(), normalizedPhone || null, email || null, source || null, notes || null, id]
    );

    const updatedCustomer = get('SELECT * FROM customers WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'לקוחה עודכנה בהצלחה',
      data: { customer: updatedCustomer }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/customers/:id
 * Delete a customer
 */
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const existing = get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) {
      throw new ApiError(404, 'לקוחה לא נמצאה');
    }

    // Delete customer
    run('DELETE FROM customers WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'לקוחה נמחקה בהצלחה'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/customers/search/quick
 * Quick search for autocomplete
 */
router.get('/search/quick', (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, data: { customers: [] } });
    }

    const customers = all(
      `SELECT id, name, phone, email 
       FROM customers 
       WHERE (name LIKE ? OR phone LIKE ?)
       ORDER BY name 
       LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );

    res.json({
      success: true,
      data: { customers }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/customers/merge
 * Merge two customers into one.
 * Target customer keeps its ID. Source customer is deleted.
 * All related records (orders, transactions, agreements, etc.) are moved to the target.
 */
router.post('/merge', (req, res, next) => {
  try {
    const { targetCustomerId, sourceCustomerId, updatedTargetData } = req.body;

    if (!targetCustomerId || !sourceCustomerId) {
      throw new ApiError(400, 'חובה לציין מזהה לקוחה למיזוג ומזהה לקוחה יעד');
    }

    if (parseInt(targetCustomerId) === parseInt(sourceCustomerId)) {
      throw new ApiError(400, 'לא ניתן למזג לקוחה עם עצמה');
    }

    // Start transaction
    run('BEGIN TRANSACTION');

    try {
      // 1. Verify both exist
      const target = get('SELECT * FROM customers WHERE id = ?', [targetCustomerId]);
      const source = get('SELECT * FROM customers WHERE id = ?', [sourceCustomerId]);

      if (!target || !source) {
        throw new ApiError(404, 'אחת הלקוחות לא נמצאה');
      }

      // 2. Update target customer details if provided
      if (updatedTargetData) {
        const { name, phone, email, source, notes } = updatedTargetData;
        const normalizedPhone = normalizePhoneNumber(phone);
        
        run(
          `UPDATE customers 
           SET name = ?, phone = ?, email = ?, source = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            name || target.name,
            normalizedPhone || target.phone,
            email || target.email,
            source || target.source,
            notes || target.notes,
            targetCustomerId
          ]
        );
      }

      // 3. Move Orders
      run('UPDATE orders SET customer_id = ? WHERE customer_id = ?', [targetCustomerId, sourceCustomerId]);

      // 4. Move Transactions
      run('UPDATE transactions SET customer_id = ? WHERE customer_id = ?', [targetCustomerId, sourceCustomerId]);

      // 5. Move Agreements
      run('UPDATE agreements SET customer_id = ? WHERE customer_id = ?', [targetCustomerId, sourceCustomerId]);

      // 6. Move Dress History
      run('UPDATE dress_history SET customer_id = ? WHERE customer_id = ?', [targetCustomerId, sourceCustomerId]);

      // 7. Delete Source Customer
      run('DELETE FROM customers WHERE id = ?', [sourceCustomerId]);

      run('COMMIT');

      res.json({
        success: true,
        message: 'לקוחות אוחדו בהצלחה'
      });

    } catch (err) {
      run('ROLLBACK');
      throw err;
    }

  } catch (error) {
    next(error);
  }
});

export default router;
