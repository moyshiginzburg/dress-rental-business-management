/**
 * Dashboard Routes
 * 
 * Purpose: Provide aggregated data for the admin dashboard.
 * 
 * Operation: Queries multiple tables to generate summary statistics
 * and key metrics for the business overview.
 */

import { Router } from 'express';
import { get, all } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/dashboard/summary
 * Get main dashboard summary
 */
router.get('/summary', (req, res, next) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Compute date range boundaries so we use >= / < on the indexed date column
    // instead of strftime() which forces a full table scan.
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const yearStart = `${currentYear}-01-01`;
    const nextYearStart = `${currentYear + 1}-01-01`;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonthStart = `${nextMonthYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;

    // Single query: monthly + yearly financials in one pass over the index
    const financials = get(
      `SELECT 
        SUM(CASE WHEN type = 'income' AND date >= ? AND date < ? THEN amount ELSE 0 END) as monthly_income,
        SUM(CASE WHEN type = 'expense' AND date >= ? AND date < ? THEN amount ELSE 0 END) as monthly_expenses,
        SUM(CASE WHEN type = 'income' AND date >= ? AND date < ? THEN amount ELSE 0 END) as yearly_income,
        SUM(CASE WHEN type = 'expense' AND date >= ? AND date < ? THEN amount ELSE 0 END) as yearly_expenses
       FROM transactions
       WHERE date >= ? AND date < ?`,
      [
        monthStart, nextMonthStart,
        monthStart, nextMonthStart,
        yearStart, nextYearStart,
        yearStart, nextYearStart,
        yearStart, nextYearStart  // outer WHERE bounds the scan to current year
      ]
    );

    // Single query: orders + customers + dresses counts
    const counts = get(
      `SELECT
        (SELECT COUNT(*) FROM orders WHERE status = 'active') as active_orders,
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT COUNT(*) FROM customers WHERE created_at >= ? AND created_at < ?) as new_customers_month,
        (SELECT COUNT(*) FROM dresses WHERE status = 'available') as available_dresses,
        (SELECT COUNT(*) FROM dresses) as total_dresses`,
      [monthStart, nextMonthStart]
    );

    res.json({
      success: true,
      data: {
        financials: {
          monthly: {
            income: financials.monthly_income || 0,
            expenses: financials.monthly_expenses || 0,
            profit: (financials.monthly_income || 0) - (financials.monthly_expenses || 0)
          },
          yearly: {
            income: financials.yearly_income || 0,
            expenses: financials.yearly_expenses || 0,
            profit: (financials.yearly_income || 0) - (financials.yearly_expenses || 0)
          }
        },
        orders: {
          active: counts.active_orders
        },
        customers: {
          total: counts.total_customers,
          newThisMonth: counts.new_customers_month
        },
        dresses: {
          available: counts.available_dresses,
          total: counts.total_dresses
        },
        period: {
          month: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
          year: String(currentYear)
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/upcoming-events
 * Get upcoming events (orders)
 */
router.get('/upcoming-events', (req, res, next) => {
  try {
    const { days = 7 } = req.query;

    // Upcoming order events (pickups and returns)
    const orderEvents = all(
      `SELECT 
        o.id,
        o.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        o.event_date,
        o.status
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.status = 'active'
         AND o.event_date >= date('now')
         AND o.event_date <= date('now', '+' || ? || ' days')
       ORDER BY o.event_date ASC`,
      [parseInt(days, 10)]
    );

    res.json({
      success: true,
      data: {
        orderEvents
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/recent-transactions
 * Get recent transactions
 */
router.get('/recent-transactions', (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    const transactions = all(
      `SELECT t.*, c.name as customer_full_name
       FROM transactions t
       LEFT JOIN customers c ON t.customer_id = c.id
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ?`,
      [parseInt(limit, 10)]
    );

    res.json({
      success: true,
      data: { transactions }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/monthly-chart
 * Get data for monthly income/expense chart
 */
router.get('/monthly-chart', (req, res, next) => {
  try {
    const { months = 12 } = req.query;

    const data = all(
      `SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
       FROM transactions
       WHERE date >= date('now', '-' || ? || ' months')
       GROUP BY strftime('%Y-%m', date)
       ORDER BY month ASC`,
      [parseInt(months, 10)]
    );

    res.json({
      success: true,
      data: { chartData: data }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/top-dresses
 * Get top performing dresses
 */
router.get('/top-dresses', (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    const dresses = all(
      `SELECT id, name, total_income, rental_count, status
       FROM dresses
       WHERE is_active = 1 AND rental_count > 0
       ORDER BY total_income DESC
       LIMIT ?`,
      [parseInt(limit, 10)]
    );

    res.json({
      success: true,
      data: { dresses }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/requires-attention
 * Get items that require the manager's attention
 * Includes: pending orders (3+ days), customer debts, unreturned dresses
 */
router.get('/requires-attention', (req, res, next) => {
  try {
    // Orders active for more than 3 days
    const pendingOrders = all(
      `SELECT 
        o.id,
        o.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        o.total_price,
        o.paid_amount,
        o.status,
        o.created_at,
        julianday('now') - julianday(o.created_at) as days_pending
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.status = 'active'
         AND julianday('now') - julianday(o.created_at) >= 3
       ORDER BY o.created_at ASC
       LIMIT 10`
    );

    // Customers with outstanding balance (debt from orders + expenses)
    const ordersWithDebt = all(
      `SELECT 
        c.id,
        c.name as customer_name,
        c.phone as customer_phone,
        (
          COALESCE((SELECT SUM(total_price - paid_amount) FROM orders WHERE customer_id = c.id AND status != 'cancelled'), 0) +
          COALESCE((SELECT SUM(customer_charge_amount) FROM transactions WHERE customer_id = c.id AND type = 'expense'), 0)
        ) as balance_due
       FROM customers c
       GROUP BY c.id
       HAVING balance_due > 0
       ORDER BY balance_due DESC
       LIMIT 10`
    );

    // Calculate totals
    const totalPendingOrders = pendingOrders.length;
    const totalDebt = ordersWithDebt.reduce((sum, o) => sum + (o.balance_due || 0), 0);

    res.json({
      success: true,
      data: {
        pendingOrders,
        ordersWithDebt,
        summary: {
          totalPendingOrders,
          totalDebt,
          hasItems: totalPendingOrders > 0 || ordersWithDebt.length > 0
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;
