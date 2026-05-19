/**
 * Dresses Routes
 *
 * Purpose: CRUD operations for dress inventory management, including
 * dress merging functionality.
 *
 * Operation: Provides endpoints for listing, creating, updating, and
 * merging dresses. The DELETE endpoint has been removed in favor of
 * merging — dresses are never hard-deleted or soft-deleted individually.
 * The `is_active` column no longer exists on the dresses table; all
 * dresses in the table are considered active/visible.
 *
 * Merge logic:
 *   - Two dresses are selected; one is the "target" (survives) and the
 *     other is the "source" (deleted after merge).
 *   - dress_history rows of the source are moved to the target.
 *   - order_items rows referencing the source are re-pointed to the target.
 *   - total_income and rental_count are recomputed from dress_history.
 *   - The caller may supply new name/photo/notes for the merged dress.
 */

import { Router } from 'express';
import { run, get, all, transaction } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import multer from 'multer';
import { processDressImage } from '../services/image.js';
import { normalizeTextForSave, normalizeTextForSearch } from '../utils/textUtils.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const validStatuses = ['available', 'sold', 'retired', 'custom_sewing'];
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


// All routes require authentication
router.use(requireAuth);

/**
 * POST /api/dresses/upload
 * Upload and process a dress image.
 *
 * Accepts two content types:
 *   1. multipart/form-data with field "image" — used by the Android share-target path.
 *   2. application/json with field "imageBase64" — used by the direct file-picker path.
 *      Multer silently skips non-multipart requests, so req.body is already parsed by
 *      express.json() middleware and req.file is simply undefined.
 *
 * Both paths produce the same result: a buffer passed to processDressImage().
 */
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    let buffer;

    if (req.file) {
      // multipart/form-data path (share-target)
      buffer = req.file.buffer;
    } else if (req.body?.imageBase64) {
      // JSON base64 path (direct file picker on Android)
      buffer = Buffer.from(req.body.imageBase64, 'base64');
    } else {
      throw new ApiError(400, 'לא הועלה קובץ');
    }

    const { imageUrl, thumbnailUrl } = await processDressImage(buffer);

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
 * List all dresses with optional filters.
 * No is_active filter — all dresses in the table are visible.
 *
 * Supports sorting by last_active_date — the most recent event_date recorded
 * in dress_history for each dress (falls back to dresses.updated_at).
 */
router.get('/', (req, res, next) => {
  try {
    const {
      search,
      status,
      intended_use,
      page = 1,
      limit = 50,
      sortBy = 'last_active_date',
      sortOrder = 'desc'
    } = req.query;

    // last_active_date: latest event_date in dress_history, falling back to updated_at
    let sql = `SELECT d.*,
             COALESCE(
               (SELECT MAX(dh.event_date) FROM dress_history dh WHERE dh.dress_id = d.id),
               d.updated_at
             ) AS last_active_date
      FROM dresses d WHERE 1=1`;
    const params = [];

    // Add search filter — searches by dress name OR wearer names from history/orders
    if (search) {
      sql += ` AND (d.name LIKE ? OR d.id IN (
        SELECT DISTINCT dh.dress_id FROM dress_history dh WHERE dh.wearer_name LIKE ?
        UNION
        SELECT DISTINCT oi.dress_id FROM order_items oi WHERE oi.wearer_name LIKE ?
      ))`;
      const searchPattern = normalizeTextForSearch(search);
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Add status filter
    if (status) {
      if (!validStatuses.includes(status)) {
        throw new ApiError(400, 'סטטוס לא תקין');
      }
      sql += ' AND d.status = ?';
      params.push(status);
    }

    if (intended_use) {
      if (intended_use === '__empty__') {
        sql += ' AND d.intended_use IS NULL';
      } else if (!validIntendedUses.includes(intended_use)) {
        throw new ApiError(400, 'ייעוד שמלה לא תקין');
      } else {
        sql += ' AND d.intended_use = ?';
        params.push(intended_use);
      }
    }

    // Add sorting.
    // last_active_date is a computed alias — referenced directly (not as d.column).
    // All other columns are prefixed with d.
    const validSortColumns = ['name', 'total_income', 'rental_count', 'updated_at', 'last_active_date'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'last_active_date';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const orderByClause = sortColumn === 'last_active_date' ? sortColumn : `d.${sortColumn}`;
    sql += ` ORDER BY ${orderByClause} ${order}`;

    // Add pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const dresses = all(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM dresses d WHERE 1=1';
    const countParams = [];
    if (search) {
      countSql += ` AND (d.name LIKE ? OR d.id IN (
        SELECT DISTINCT dh.dress_id FROM dress_history dh WHERE dh.wearer_name LIKE ?
        UNION
        SELECT DISTINCT oi.dress_id FROM order_items oi WHERE oi.wearer_name LIKE ?
      ))`;
      const searchPattern = normalizeTextForSearch(search);
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    if (status) {
      countSql += ' AND d.status = ?';
      countParams.push(status);
    }
    if (intended_use) {
      if (intended_use === '__empty__') {
        countSql += ' AND d.intended_use IS NULL';
      } else {
        countSql += ' AND d.intended_use = ?';
        countParams.push(intended_use);
      }
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
 * Only dresses marked as `available` are bookable.
 */
router.get('/available', (req, res, next) => {
  try {
    const dresses = all(
      `SELECT id, name, base_price, photo_url, thumbnail_url, rental_count, total_income, status, intended_use
       FROM dresses 
       WHERE status = 'available'
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
 * Get a single dress by ID with rental history.
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const dress = get('SELECT * FROM dresses WHERE id = ?', [id]);

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
 * Create a new dress.
 */
router.post('/', (req, res, next) => {
  try {
    const { name, base_price, status, intended_use, photo_url, thumbnail_url, notes } = req.body;
    const normalizedName = normalizeTextForSave(name);
    const normalizedPhotoUrl = normalizeUploadedImagePath(photo_url);
    const normalizedThumbnailUrl = normalizeUploadedImagePath(thumbnail_url);

    // Validate required fields
    if (!normalizedName) {
      throw new ApiError(400, 'נא להזין שם שמלה');
    }

    // Check for duplicate name
    const existing = get('SELECT id FROM dresses WHERE name = ?', [normalizedName]);
    if (existing) {
      throw new ApiError(409, 'שמלה עם שם זה כבר קיימת');
    }

    if (status && !validStatuses.includes(status)) {
      throw new ApiError(400, 'סטטוס לא תקין');
    }

    const normalizedIntendedUse = intended_use === '' || intended_use === null ? null : intended_use;
    if (normalizedIntendedUse && !validIntendedUses.includes(normalizedIntendedUse)) {
      throw new ApiError(400, 'ייעוד שמלה לא תקין');
    }

    // Insert dress
    const result = run(
      `INSERT INTO dresses (name, base_price, status, intended_use, photo_url, thumbnail_url, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedName,
        Math.round(parseFloat(base_price)) || 0,
        status || 'available',
        normalizedIntendedUse,
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
 * Update a dress.
 */
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, base_price, status, intended_use, photo_url, thumbnail_url, notes } = req.body;
    const normalizedName = normalizeTextForSave(name);
    const normalizedPhotoUrl = normalizeUploadedImagePath(photo_url);
    const normalizedThumbnailUrl = normalizeUploadedImagePath(thumbnail_url);

    // Check if dress exists
    const existing = get('SELECT * FROM dresses WHERE id = ?', [id]);
    if (!existing) {
      throw new ApiError(404, 'שמלה לא נמצאה');
    }

    // Validate required fields
    if (!normalizedName) {
      throw new ApiError(400, 'נא להזין שם שמלה');
    }

    // Check for duplicate name (if changed)
    if (normalizedName !== existing.name) {
      const duplicate = get(
        'SELECT id FROM dresses WHERE name = ? AND id != ?',
        [normalizedName, id]
      );
      if (duplicate) {
        throw new ApiError(409, 'שמלה אחרת עם שם זה כבר קיימת');
      }
    }

    if (status && !validStatuses.includes(status)) {
      throw new ApiError(400, 'סטטוס לא תקין');
    }

    const normalizedIntendedUse = intended_use === '' || intended_use === null ? null : intended_use;
    if (normalizedIntendedUse && !validIntendedUses.includes(normalizedIntendedUse)) {
      throw new ApiError(400, 'ייעוד שמלה לא תקין');
    }

    const nextIntendedUse = normalizedIntendedUse === undefined
      ? existing.intended_use
      : normalizedIntendedUse;

    // Update dress
    run(
      `UPDATE dresses 
       SET name = ?, base_price = ?, status = ?, intended_use = ?, photo_url = ?, thumbnail_url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        normalizedName,
        Math.round(parseFloat(base_price)) || 0,
        status || 'available',
        nextIntendedUse,
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
 * Update dress status.
 */
router.patch('/:id/status', (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!validStatuses.includes(status)) {
      throw new ApiError(400, 'סטטוס לא תקין');
    }

    const existing = get('SELECT * FROM dresses WHERE id = ?', [id]);
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
 * Add a manual rental record to dress history.
 * Used for adding historical events not tied to a formal order.
 */
router.post('/:id/rental', (req, res, next) => {
  try {
    const { id } = req.params;
    const { customer_id, customer_name, amount, rental_type, event_date, notes } = req.body;

    // Check if dress exists
    const dress = get('SELECT * FROM dresses WHERE id = ?', [id]);
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
        Math.round(parseFloat(amount)),
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
      [Math.round(parseFloat(amount)), id]
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
 * POST /api/dresses/merge
 * Merge two dresses into one.
 *
 * The target dress keeps its ID and becomes the surviving dress.
 * The source dress is permanently deleted after the merge.
 *
 * Merge steps:
 *   1. Verify both dresses exist.
 *   2. Update target dress details (name, photo, thumbnail, notes) if provided.
 *   3. Move all dress_history rows from source → target.
 *   4. Update all order_items rows referencing source → target, and update
 *      dress_name on those items to match the new target dress name.
 *   5. Recompute total_income and rental_count for the target dress from
 *      dress_history (single source of truth).
 *   6. Permanently delete the source dress.
 */
router.post('/merge', (req, res, next) => {
  try {
    const { targetDressId, sourceDressId, updatedDressData } = req.body;

    if (!targetDressId || !sourceDressId) {
      throw new ApiError(400, 'חובה לציין מזהה שמלה למיזוג ומזהה שמלה יעד');
    }

    if (parseInt(targetDressId) === parseInt(sourceDressId)) {
      throw new ApiError(400, 'לא ניתן למזג שמלה עם עצמה');
    }

    transaction(() => {
      // 1. Verify both dresses exist
      const target = get('SELECT * FROM dresses WHERE id = ?', [targetDressId]);
      const source = get('SELECT * FROM dresses WHERE id = ?', [sourceDressId]);

      if (!target) {
        throw new ApiError(404, `שמלת היעד (ID ${targetDressId}) לא נמצאה`);
      }
      if (!source) {
        throw new ApiError(404, `שמלת המקור (ID ${sourceDressId}) לא נמצאה`);
      }

      // 2. Update target dress details if provided by the caller
      let finalName = target.name;
      if (updatedDressData) {
        const {
          name,
          photo_url,
          thumbnail_url,
          notes,
          status,
          intended_use,
          base_price
        } = updatedDressData;

        const newName = normalizeTextForSave(name) || target.name;
        const newPhotoUrl = normalizeUploadedImagePath(photo_url) ?? target.photo_url;
        const newThumbnailUrl = normalizeUploadedImagePath(thumbnail_url) ?? target.thumbnail_url;
        const newNotes = notes !== undefined ? notes : target.notes;
        const newStatus = (status && validStatuses.includes(status)) ? status : target.status;
        const normalizedIntendedUse = intended_use === '' ? null : intended_use;
        const newIntendedUse = (normalizedIntendedUse !== undefined && (normalizedIntendedUse === null || validIntendedUses.includes(normalizedIntendedUse)))
          ? normalizedIntendedUse
          : target.intended_use;
        const newBasePrice = base_price !== undefined
          ? (Math.round(parseFloat(base_price)) || target.base_price)
          : target.base_price;

        finalName = newName;

        run(
          `UPDATE dresses
           SET name = ?, photo_url = ?, thumbnail_url = ?, notes = ?,
               status = ?, intended_use = ?, base_price = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newName, newPhotoUrl, newThumbnailUrl, newNotes, newStatus, newIntendedUse, newBasePrice, targetDressId]
        );
      }

      // 3. Move all dress_history rows from source to target
      run(
        'UPDATE dress_history SET dress_id = ? WHERE dress_id = ?',
        [targetDressId, sourceDressId]
      );

      // 4. Update order_items: re-point dress_id and update dress_name snapshot
      run(
        'UPDATE order_items SET dress_id = ?, dress_name = ? WHERE dress_id = ?',
        [targetDressId, finalName, sourceDressId]
      );

      // 5. Recompute total_income and rental_count from dress_history
      const { newTotalIncome } = get(
        'SELECT COALESCE(SUM(amount), 0) as newTotalIncome FROM dress_history WHERE dress_id = ?',
        [targetDressId]
      );
      const { newRentalCount } = get(
        'SELECT COUNT(*) as newRentalCount FROM dress_history WHERE dress_id = ?',
        [targetDressId]
      );

      run(
        'UPDATE dresses SET total_income = ?, rental_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newTotalIncome, newRentalCount, targetDressId]
      );

      // 6. Permanently delete the source dress
      run('DELETE FROM dresses WHERE id = ?', [sourceDressId]);
    });

    res.json({
      success: true,
      message: 'שמלות אוחדו בהצלחה'
    });

  } catch (error) {
    next(error);
  }
});

export default router;
