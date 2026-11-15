/**
 * Apps Script Logs Route
 *
 * Final Purpose:
 * Receive log lines from the Google Apps Script web app (apps_script/Code.js, flushLogs) and
 * store them locally with the rest of the system logs for easy debugging. ONLY that script
 * may write here, and what it writes cannot damage the log files.
 *
 * Method of Operation:
 * - Authentication: every request must carry the header X-Gas-Log-Secret equal to the
 *   GAS_LOG_SECRET setting (local_data/.env on the VPS; the same value is in the Apps Script
 *   project file Secrets.js and in nginx, see scripts/nginx/origin-secret.conf.template). nginx
 *   already drops requests without it; this check is the second, independent layer. If the
 *   secret is not configured the route refuses everything (fail closed).
 * - Sanitizing: the level is limited to DEBUG/INFO/WARN/ERROR, text fields are cut to a maximum
 *   length and stripped of line breaks (so a sender cannot forge extra log lines), a batch is
 *   limited to MAX_BATCH entries.
 * - Storage: each entry is appended to apps-script-<date>.log, to the daily log, and, for level
 *   ERROR, to errors.log.
 * - This route only WRITES. There is intentionally no endpoint that reads the logs back.
 */

import express from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { appsScriptConfig } from '../config/index.js';

const router = express.Router();

// Get logs directory
const LOGS_DIR = join(process.cwd(), 'local_data', 'logs');

// Ensure logs directory exists
if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
}

const ALLOWED_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const MAX_BATCH = 200;          // entries per request (one web-app run sends a handful)
const MAX_ACTION = 100;         // characters
const MAX_MESSAGE = 2000;       // characters
const MAX_DETAILS = 4000;       // characters of serialized details

/**
 * Get current date string for log file naming
 */
function getDateString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Compare the presented secret with the configured one without leaking timing information.
 */
function secretMatches(presented, expected) {
    const a = createHash('sha256').update(String(presented ?? '')).digest();
    const b = createHash('sha256').update(String(expected)).digest();
    return timingSafeEqual(a, b);
}

/**
 * Require the shared secret sent by the Apps Script project.
 */
function requireGasSecret(req, res, next) {
    const expected = appsScriptConfig.logSecret;
    if (!expected) {
        return res.status(503).json({ error: 'log endpoint not configured' });
    }
    if (!secretMatches(req.headers['x-gas-log-secret'], expected)) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    next();
}

/**
 * Turn any value into a single line of at most `max` characters.
 */
function oneLine(value, max) {
    return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, max);
}

/**
 * Validate one raw entry from the Apps Script and build the line that is written to the logs.
 *
 * @param {object} raw - { level, action, message, details, timestamp }
 * @returns {{ level: string, action: string, readableLine: string, entry: object } | null}
 */
function buildLogLine(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const level = ALLOWED_LEVELS.includes(String(raw.level).toUpperCase())
        ? String(raw.level).toUpperCase()
        : 'INFO';
    const action = oneLine(raw.action || 'log', MAX_ACTION);
    const message = oneLine(raw.message, MAX_MESSAGE);
    const parsedTime = raw.timestamp ? new Date(raw.timestamp) : null;
    const timestamp = parsedTime && !Number.isNaN(parsedTime.getTime())
        ? parsedTime.toISOString()
        : new Date().toISOString();

    let detailsText = '';
    if (raw.details) {
        try {
            detailsText = oneLine(JSON.stringify(raw.details), MAX_DETAILS);
        } catch {
            detailsText = '[unserializable details]';
        }
    }

    const readableLine = `${timestamp} [${level}] [apps-script] ${action} | ${message}${detailsText ? ' | ' + detailsText : ''}`;
    return {
        level,
        action,
        readableLine,
        entry: { timestamp, source: 'apps-script', level, action, message, details: detailsText || undefined },
    };
}

router.use(requireGasSecret);

/**
 * POST /api/apps-script-logs
 * Receive and store one log entry from Apps Script
 *
 * Body: { level?, action?, message, details?, timestamp? }
 */
router.post('/', (req, res) => {
    try {
        const { action, message } = req.body || {};

        if (!message && !action) {
            return res.status(400).json({ error: 'message or action required' });
        }

        const built = buildLogLine(req.body);
        if (!built) {
            return res.status(400).json({ error: 'invalid entry' });
        }

        const dateStr = getDateString();

        // Write to apps-script specific log file
        appendFileSync(join(LOGS_DIR, `apps-script-${dateStr}.log`), built.readableLine + '\n');

        // Also write to daily log (merged with system logs)
        appendFileSync(join(LOGS_DIR, `${dateStr}.log`), built.readableLine + '\n');

        // Write errors to error log
        if (built.level === 'ERROR') {
            appendFileSync(join(LOGS_DIR, 'errors.log'), built.readableLine + '\n' + JSON.stringify(built.entry, null, 2) + '\n---\n');
        }

        console.log(`[apps-script] ${built.action}: ${oneLine(built.entry.message, 200)}`);

        res.json({ success: true });

    } catch (error) {
        console.error('Failed to log apps-script entry:', error.message);
        res.status(500).json({ error: 'internal error' });
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
        const { logs } = req.body || {};

        if (!logs || !Array.isArray(logs)) {
            return res.status(400).json({ error: 'logs array required' });
        }
        if (logs.length > MAX_BATCH) {
            return res.status(413).json({ error: `at most ${MAX_BATCH} entries per request` });
        }

        const dateStr = getDateString();
        const appsScriptLog = join(LOGS_DIR, `apps-script-${dateStr}.log`);
        const dailyLog = join(LOGS_DIR, `${dateStr}.log`);
        const errorLog = join(LOGS_DIR, 'errors.log');

        let accepted = 0;
        let errorCount = 0;

        for (const raw of logs) {
            const built = buildLogLine(raw);
            if (!built) continue;

            appendFileSync(appsScriptLog, built.readableLine + '\n');
            appendFileSync(dailyLog, built.readableLine + '\n');

            if (built.level === 'ERROR') {
                appendFileSync(errorLog, built.readableLine + '\n---\n');
                errorCount++;
            }
            accepted++;
        }

        console.log(`[apps-script] Received ${accepted} logs (${errorCount} errors)`);

        res.json({ success: true, count: accepted });

    } catch (error) {
        console.error('Failed to batch log apps-script entries:', error.message);
        res.status(500).json({ error: 'internal error' });
    }
});

export default router;
