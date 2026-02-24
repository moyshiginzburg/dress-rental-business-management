/**
 * Dresses Routes
 * 
 * Purpose: CRUD operations for dress inventory management.
 * 
 * Operation: Provides endpoints for listing, creating, updating dresses,
 * and tracking their rental history.
 */

import { Router } from 'express';
import { run, get, all } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import multer from 'multer';
import { processDressImage } from '../services/image.js';

const router = Router();
const validStatuses = ['available', 'sold', 'retired'];
const validIntendedUses = ['rental', 'sale'];

function normalizeUploadedImagePath(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith('/uploads/dresses/')) {
    return null;
  }

  return trimmedValue;
}

// Configure multer for memory storage (for sharp processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'רק קבצי תמונה מורשים'));
    }
  }
});

// All routes require authentication
router.use(requireAuth);

/**
 * POST /api/dresses/upload
 * Upload and process a dress image
 */
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'לא הועלה קובץ');
    }

    const { imageUrl, thumbnailUrl } = await processDressImage(req.file.buffer);

    res.json({
      success: true,
      data: { imageUrl, thumbnailUrl }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dresses
 * List all dresses with optional filters
 */
router.get('/', (req, res, next) => {
  try {
    const {
      search,
      status,
      intended_use,
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    let sql = 'SELECT * FROM dresses WHERE is_active = 1';
    const params = [];

    // Add search filter
    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    // Add status filter
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (intended_use) {
      if (!validIntendedUses.includes(intended_use)) {
        throw new ApiError(400, 'ייעוד שמלה לא תקין');
      }
      sql += ' AND intended_use = ?';
      params.push(intended_use);
    }

    // Add sorting
    const validSortColumns = ['name', 'total_income', 'rental_count', 'updated_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${sortColumn} ${order}`;

    // Add pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const dresses = all(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM dresses WHERE is_active = 1';
    const countParams = [];
    if (search) {
      countSql += ' AND name LIKE ?';
      countParams.push(`%${search}%`);
    }
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (intended_use) {
      countSql += ' AND intended_use = ?';
      countParams.push(intended_use);
    }
    const { total } = get(countSql, countParams);

    res.json({
      success: true,
      data: {
        dresses,
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
 * GET /api/dresses/available
 * Get bookable dresses with future booking details.
 * Dresses stay bookable unless sold or retired.
 */
router.get('/available', (req, res, next) => {
  try {
    const dresses = all(
      `SELECT id, name, base_price, photo_url, thumbnail_url, rental_count, total_income, status, intended_use
       FROM dresses 
       WHERE is_active = 1 AND status NOT IN ('sold', 'retired')
       ORDER BY name`
    );

    const futureOrders = all(
      `SELECT 
         oi.dress_id AS booked_dress_id,
         o.id AS order_id,
         date(o.event_date) AS booked_date,
         o.status AS order_status,
         c.name AS customer_name,
         oi.wearer_name
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE oi.dress_id IS NOT NULL
         AND o.status != 'cancelled'
         AND o.event_date IS NOT NULL
         AND date(o.event_date) >= date('now')
       ORDER BY date(o.event_date) ASC, o.id ASC`
    );

    const bookingsByDress = new Map();
    for (const booking of futureOrders) {
      const dressId = booking.booked_dress_id;
      if (!dressId) continue;

      const current = bookingsByDress.get(dressId) || [];
      const alreadyExists = current.some(
        (item) => item.order_id === booking.order_id && item.event_date === booking.booked_date
      );

      if (!alreadyExists) {
        current.push({
          order_id: booking.order_id,
          event_date: booking.booked_date,
          order_status: booking.order_status,
          customer_name: booking.customer_name || null,
          wearer_name: booking.wearer_name || null
        });
      }

      bookingsByDress.set(dressId, current);
    }

    const dressesWithDates = dresses.map((dress) => {
      const upcomingOrders = bookingsByDress.get(dress.id) || [];
      return {
        ...dress,
        booked_dates: upcomingOrders.map((order) => order.event_date),
        upcoming_orders: upcomingOrders
      };
    });

    res.json({
      success: true,
      data: { dresses: dressesWithDates }
    });

  } catch (error) {
    console.error(`[ERROR] /available: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/dresses/:id
 * Get a single dress by ID with rental history
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const dress = get('SELECT * FROM dresses WHERE id = ? AND is_active = 1', [id]);

    if (!dress) {
      throw new ApiError(404, 'שמלה לא נמצאה');
    }

    // Get rental history
    const rentals = all(
      `SELECT dr.*, c.name as customer_full_name, c.phone as customer_phone
       FROM dress_history dr
       LEFT JOIN customers c ON dr.customer_id = c.id
       WHERE dr.dress_id = ?
       ORDER BY dr.created_at DESC`,
      [id]
    );

    const upcomingBookings = all(
      `SELECT 
         o.id AS order_id,
         date(o.event_date) AS event_date,
         o.status AS order_status,
         c.name AS customer_name,
         c.phone AS customer_phone,
         oi.item_type,
         oi.wearer_name
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE oi.dress_id = ?
         AND o.status != 'cancelled'
         AND o.event_date IS NOT NULL
         AND date(o.event_date) >= date('now')
       ORDER BY date(o.event_date) ASC, o.id ASC`,
      [id]
    );

    // Calculate statistics
    const stats = {
      totalIncome: rentals.reduce((sum, r) => sum + (r.amount || 0), 0),
      rentalCount: rentals.length,
      averagePrice: rentals.length > 0
        ? rentals.reduce((sum, r) => sum + (r.amount || 0), 0) / rentals.length
        : 0
    };

    res.json({
      success: true,
      data: {
        dress,
        rentals,
        upcoming_bookings: upcomingBookings,
        stats
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dresses
 * Create a new dress
 */
router.post('/', (req, res, next) => {
  try {
    const { name, base_price, status, intended_use, photo_url, thumbnail_url, notes } = req.body;
    const normalizedPhotoUrl = normalizeUploadedImagePath(photo_url);
    const normalizedThumbnailUrl = normalizeUploadedImagePath(thumbnail_url);

    // Validate required fields
    if (!name || !name.trim()) {
      throw new ApiError(400, 'נא להזין שם שמלה');
    }

    // Check for duplicate name
    const existing = get('SELECT id FROM dresses WHERE name = ? AND is_active = 1', [name.trim()]);
    if (existing) {
      throw new ApiError(409, 'שמלה עם שם זה כבר קיימת');
    }

    if (status && !validStatuses.includes(status)) {
      throw new ApiError(400, 'סטטוס לא תקין');
    }

    if (intended_use && !validIntendedUses.includes(intended_use)) {
      throw new ApiError(400, 'ייעוד שמלה לא תקין');
    }

    // Insert dress
    const result = run(
      `INSERT INTO dresses (name, base_price, status, intended_use, photo_url, thumbnail_url, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        parseFloat(base_price) || 0,
        status || 'available',
        intended_use || 'rental',
        normalizedPhotoUrl,
        normalizedThumbnailUrl,
        notes || null
      ]
    );

    const newDress = get('SELECT * FROM dresses WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({
      success: true,
      message: 'שמלה נוספה בהצלחה',
      data: { dress: newDress }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/dresses/:id
 * Update a dress
 */
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, base_price, status, intended_use, photo_url, thumbnail_url, notes } = req.body;
    const normalizedPhotoUrl = normalizeUploadedImagePath(photo_url);
    const normalizedThumbnailUrl = normalizeUploadedImagePath(thumbnail_url);

    // Check if dress exists
    const existing = get('SELECT * FROM dresses WHERE id = ? AND is_active = 1', [id]);
    if (!existing) {
      throw new ApiError(404, 'שמלה לא נמצאה');
    }

    // Validate required fields
    if (!name || !name.trim()) {
      throw new ApiError(400, 'נא להזין שם שמלה');
    }

    // Check for duplicate name (if changed)
    if (name.trim() !== existing.name) {
      const duplicate = get(
        'SELECT id FROM dresses WHERE name = ? AND id != ? AND is_active = 1',
        [name.trim(), id]
      );
      if (duplicate) {
        throw new ApiError(409, 'שמלה אחרת עם שם זה כבר קיימת');
      }
    }

    if (status && !validStatuses.includes(status)) {
      throw new ApiError(400, 'סטטוס לא תקין');
    }

    if (intended_use && !validIntendedUses.includes(intended_use)) {
      throw new ApiError(400, 'ייעוד שמלה לא תקין');
    }

    // Update dress
    run(
      `UPDATE dresses 
       SET name = ?, base_price = ?, status = ?, intended_use = ?, photo_url = ?, thumbnail_url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name.trim(),
        parseFloat(base_price) || 0,
        status || 'available',
        intended_use || existing.intended_use || 'rental',
        normalizedPhotoUrl,
        normalizedThumbnailUrl,
        notes || null,
        id
      ]
    );

    const updatedDress = get('SELECT * FROM dresses WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'שמלה עודכנה בהצלחה',
      data: { dress: updatedDress }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/dresses/:id/status
 * Update dress status
 */
router.patch('/:id/status', (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!validStatuses.includes(status)) {
      throw new ApiError(400, 'סטטוס לא תקין');
    }

    const existing = get('SELECT * FROM dresses WHERE id = ? AND is_active = 1', [id]);
    if (!existing) {
      throw new ApiError(404, 'שמלה לא נמצאה');
    }

    run(
      'UPDATE dresses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    res.json({
      success: true,
      message: 'סטטוס שמלה עודכן'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dresses/:id/rental
 * Add a rental record to dress history
 */
router.post('/:id/rental', (req, res, next) => {
  try {
    const { id } = req.params;
    const { customer_id, customer_name, amount, rental_type, event_date, notes } = req.body;

    // Check if dress exists
    const dress = get('SELECT * FROM dresses WHERE id = ? AND is_active = 1', [id]);
    if (!dress) {
      throw new ApiError(404, 'שמלה לא נמצאה');
    }

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      throw new ApiError(400, 'נא להזין סכום תקין');
    }

    // Insert history record (wearer_name holds the wearer, customer_name holds the account holder)
    run(
      `INSERT INTO dress_history (dress_id, customer_id, wearer_name, customer_name, amount, rental_type, event_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customer_id || null,
        customer_name || null,
        null,
        parseFloat(amount),
        rental_type || 'rental',
        event_date || null,
        notes || null
      ]
    );

    // Update dress statistics
    run(
      `UPDATE dresses 
       SET total_income = total_income + ?, rental_count = rental_count + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [parseFloat(amount), id]
    );

    res.status(201).json({
      success: true,
      message: 'השכרה נוספה להיסטוריה'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/dresses/:id
 * Soft delete a dress
 */
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = get('SELECT * FROM dresses WHERE id = ? AND is_active = 1', [id]);
    if (!existing) {
      throw new ApiError(404, 'שמלה לא נמצאה');
    }

    run('UPDATE dresses SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'שמלה נמחקה בהצלחה'
    });

  } catch (error) {
    next(error);
  }
});

export default router;
