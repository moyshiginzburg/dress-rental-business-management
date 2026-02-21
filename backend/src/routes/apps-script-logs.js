/**
 * Apps Script Logs Route
 * 
 * Purpose: Receive logs from Google Apps Script and store them locally
 * with the rest of the system logs for easy debugging.
 * 
 * Operation: Accepts POST requests with log entries and writes them to
 * the logs directory alongside other system logs.
 */

import express from 'express';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Get logs directory
const LOGS_DIR = join(process.cwd(), 'local_data', 'logs');

// Ensure logs directory exists
if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Get current date string for log file naming
 */
function getDateString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * POST /api/apps-script-logs
 * Receive and store logs from Apps Script
 * 
 * Body: {
 *   level: 'INFO' | 'WARN' | 'ERROR',
 *   action: string,
 *   message: string,
 *   details?: object,
 *   timestamp?: string
 * }
 */
router.post('/', (req, res) => {
    try {
        const { level = 'INFO', action, message, details, timestamp } = req.body;

        if (!message && !action) {
            return res.status(400).json({ error: 'message or action required' });
        }

        const logTimestamp = timestamp || new Date().toISOString();
        const dateStr = getDateString();

        // Format log entry
        const logEntry = {
            timestamp: logTimestamp,
            source: 'apps-script',
            level,
            action: action || 'log',
            message,
            details,
        };

        // Human-readable line
        const readableLine = `${logTimestamp} [${level}] [apps-script] ${action || 'log'} | ${message}${details ? ' | ' + JSON.stringify(details) : ''}`;

        // Write to apps-script specific log file
        const appsScriptLog = join(LOGS_DIR, `apps-script-${dateStr}.log`);
        appendFileSync(appsScriptLog, readableLine + '\n');

        // Also write to daily log (merged with system logs)
        const dailyLog = join(LOGS_DIR, `${dateStr}.log`);
        appendFileSync(dailyLog, readableLine + '\n');

        // Write errors to error log
        if (level === 'ERROR') {
            const errorLog = join(LOGS_DIR, 'errors.log');
            appendFileSync(errorLog, readableLine + '\n' + JSON.stringify(logEntry, null, 2) + '\n---\n');
        }

        console.log(`[apps-script] ${action}: ${message}`);

        res.json({ success: true });

    } catch (error) {
        console.error('Failed to log apps-script entry:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/apps-script-logs/batch
 * Receive multiple log entries at once
 * 
 * Body: { logs: [{ level, action, message, details, timestamp }] }
 */
router.post('/batch', (req, res) => {
    try {
        const { logs } = req.body;

        if (!logs || !Array.isArray(logs)) {
            return res.status(400).json({ error: 'logs array required' });
        }

        const dateStr = getDateString();
        const appsScriptLog = join(LOGS_DIR, `apps-script-${dateStr}.log`);
        const dailyLog = join(LOGS_DIR, `${dateStr}.log`);
        const errorLog = join(LOGS_DIR, 'errors.log');

        let errorCount = 0;

        for (const log of logs) {
            const { level = 'INFO', action, message, details, timestamp } = log;
            const logTimestamp = timestamp || new Date().toISOString();

            const readableLine = `${logTimestamp} [${level}] [apps-script] ${action || 'log'} | ${message}${details ? ' | ' + JSON.stringify(details) : ''}`;

            appendFileSync(appsScriptLog, readableLine + '\n');
            appendFileSync(dailyLog, readableLine + '\n');

            if (level === 'ERROR') {
                appendFileSync(errorLog, readableLine + '\n---\n');
                errorCount++;
            }
        }

        console.log(`[apps-script] Received ${logs.length} logs (${errorCount} errors)`);

        res.json({ success: true, count: logs.length });

    } catch (error) {
        console.error('Failed to batch log apps-script entries:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
