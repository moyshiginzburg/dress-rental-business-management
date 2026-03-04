/**
 * Order Attachments Routes
 *
 * Purpose: Manage file attachments (images, documents) linked to orders.
 * Attachments are stored on disk under local_data/uploads/order_attachments/<orderId>/
 * and tracked in the order_attachments DB table.
 *
 * Operation:
 *   GET    /api/orders/:orderId/attachments                        — list
 *   POST   /api/orders/:orderId/attachments                        — upload (multipart)
 *   PATCH  /api/orders/:orderId/attachments/:attachmentId          — update description
 *   DELETE /api/orders/:orderId/attachments/:attachmentId          — delete file + row
 *   GET    /api/orders/:orderId/attachments/:attachmentId/download — force-download
 */

import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { join, extname } from 'path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, createReadStream, statSync } from 'fs';
import { run, get, all } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uploadConfig } from '../config/index.js';

const router = Router({ mergeParams: true });

// Multer: accept up to 20 files at once, 10 MB each, store in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the on-disk directory for a given order's attachments.
 * Creates the directory if it does not exist.
 */
function ensureOrderDir(orderId) {
    const dir = join(uploadConfig.orderAttachmentsDir, String(orderId));
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * Verify that the order exists. Throws 404 if not.
 */
function assertOrderExists(orderId) {
    const order = get('SELECT id FROM orders WHERE id = ?', [orderId]);
    if (!order) {
        throw new ApiError(404, 'הזמנה לא נמצאה');
    }
}

// ---------------------------------------------------------------------------
// GET /api/orders/:orderId/attachments — list all attachments for an order
// ---------------------------------------------------------------------------
router.get('/', (req, res, next) => {
    try {
        const { orderId } = req.params;
        assertOrderExists(orderId);

        const attachments = all(
            `SELECT id, order_id, original_name, stored_name, mime_type, size_bytes, description, created_at
       FROM order_attachments
       WHERE order_id = ?
       ORDER BY created_at DESC`,
            [orderId]
        );

        // Build a URL each client can use to preview or download the file
        const enriched = attachments.map((a) => ({
            ...a,
            url: `/uploads/order_attachments/${orderId}/${a.stored_name}`,
            download_url: `/api/orders/${orderId}/attachments/${a.id}/download`,
        }));

        res.json({ success: true, data: { attachments: enriched } });
    } catch (error) {
        next(error);
    }
});

// ---------------------------------------------------------------------------
// POST /api/orders/:orderId/attachments — upload one or more files
// ---------------------------------------------------------------------------
router.post('/', upload.array('files', 20), (req, res, next) => {
    try {
        const { orderId } = req.params;
        assertOrderExists(orderId);

        if (!req.files || req.files.length === 0) {
            throw new ApiError(400, 'לא הועלו קבצים');
        }

        const dir = ensureOrderDir(orderId);
        const saved = [];

        for (const file of req.files) {
            const ext = extname(file.originalname) || '';
            const storedName = `${randomUUID()}${ext}`;
            const destPath = join(dir, storedName);

            // Write buffer to disk
            writeFileSync(destPath, file.buffer);

            // Insert DB record
            const result = run(
                `INSERT INTO order_attachments (order_id, original_name, stored_name, mime_type, size_bytes, description)
         VALUES (?, ?, ?, ?, ?, NULL)`,
                [orderId, file.originalname, storedName, file.mimetype, file.size]
            );

            saved.push({
                id: Number(result.lastInsertRowid),
                order_id: Number(orderId),
                original_name: file.originalname,
                stored_name: storedName,
                mime_type: file.mimetype,
                size_bytes: file.size,
                description: null,
                url: `/uploads/order_attachments/${orderId}/${storedName}`,
                download_url: `/api/orders/${orderId}/attachments/${result.lastInsertRowid}/download`,
            });
        }

        res.status(201).json({
            success: true,
            message: `${saved.length} קבצים הועלו בהצלחה`,
            data: { attachments: saved },
        });
    } catch (error) {
        next(error);
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/orders/:orderId/attachments/:attachmentId — update description
// ---------------------------------------------------------------------------
router.patch('/:attachmentId', (req, res, next) => {
    try {
        const { orderId, attachmentId } = req.params;
        const { description } = req.body;

        const attachment = get(
            'SELECT * FROM order_attachments WHERE id = ? AND order_id = ?',
            [attachmentId, orderId]
        );
        if (!attachment) {
            throw new ApiError(404, 'קובץ לא נמצא');
        }

        run(
            'UPDATE order_attachments SET description = ? WHERE id = ?',
            [description ?? null, attachmentId]
        );

        res.json({
            success: true,
            message: 'תיאור הקובץ עודכן',
            data: { ...attachment, description: description ?? null },
        });
    } catch (error) {
        next(error);
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/orders/:orderId/attachments/:attachmentId
// ---------------------------------------------------------------------------
router.delete('/:attachmentId', (req, res, next) => {
    try {
        const { orderId, attachmentId } = req.params;

        const attachment = get(
            'SELECT * FROM order_attachments WHERE id = ? AND order_id = ?',
            [attachmentId, orderId]
        );
        if (!attachment) {
            throw new ApiError(404, 'קובץ לא נמצא');
        }

        // Remove from disk (best effort)
        const filePath = join(uploadConfig.orderAttachmentsDir, String(orderId), attachment.stored_name);
        try {
            if (existsSync(filePath)) unlinkSync(filePath);
        } catch { /* ignore disk errors */ }

        // Remove DB row
        run('DELETE FROM order_attachments WHERE id = ?', [attachmentId]);

        res.json({ success: true, message: 'קובץ נמחק בהצלחה' });
    } catch (error) {
        next(error);
    }
});

// ---------------------------------------------------------------------------
// GET /api/orders/:orderId/attachments/:attachmentId/download
// ---------------------------------------------------------------------------
router.get('/:attachmentId/download', (req, res, next) => {
    try {
        const { orderId, attachmentId } = req.params;

        const attachment = get(
            'SELECT * FROM order_attachments WHERE id = ? AND order_id = ?',
            [attachmentId, orderId]
        );
        if (!attachment) {
            throw new ApiError(404, 'קובץ לא נמצא');
        }

        const filePath = join(uploadConfig.orderAttachmentsDir, String(orderId), attachment.stored_name);
        if (!existsSync(filePath)) {
            throw new ApiError(404, 'הקובץ לא נמצא בדיסק');
        }

        const stat = statSync(filePath);
        const encodedName = encodeURIComponent(attachment.original_name);

        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
        res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);

        createReadStream(filePath).pipe(res);
    } catch (error) {
        next(error);
    }
});

export default router;
