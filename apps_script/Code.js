/**
 * Business Management Integration Script
 * 
 * Purpose: Process JSON payloads from the main business management system
 * and execute actions in Google services (Calendar, Tasks, Sheets, Drive).
 * Also sends emails to customers on behalf of the business (agreement
 * confirmations, etc.) since the VPS cannot use SMTP directly.
 * 
 * Operation: Web App (doPost) — Receives HTTP POST from the backend instantly.
 * Deploy as Web App: Execute as "Me", Access "Anyone" (no auth needed since
 * the payload is not sensitive and the URL is secret).
 * 
 * Author: [Your Name]
 * Created: 2026-02-03
 * Updated: 2026-02-17 - Removed email-polling; Web App is the sole integration method
 */

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
    // Notification email
    OWNER_EMAIL: 'your-email@gmail.com',

    // Google Drive base folder ID
    DRIVE_BASE_FOLDER_ID: 'YOUR_GOOGLE_DRIVE_FOLDER_ID',

    // Google Task list name
    TASK_LIST_NAME: 'לקוחות',

    // Sheets ID for email list
    EMAIL_LIST_SHEET_ID: '', // TODO: Set the sheet ID

    // Tailscale API URL (from start-server.sh)
    TAILSCALE_API_URL: 'https://your-vps.YOUR_TAILSCALE_DOMAIN.ts.net/api',
};

// Cache for backend URL (refreshed once per execution)
let cachedBackendUrl = null;

// ===========================================
// WEB APP ENDPOINT - Instant integration (no SMTP needed)
// ===========================================

/**
 * doPost - Web App HTTP POST handler.
 * 
 * Purpose: Receive JSON payloads from the backend via HTTPS POST.
 * This replaces the email-based integration and works instantly, without
 * requiring SMTP access (which is blocked on cloud providers like DigitalOcean).
 * 
 * How it works:
 *   1. Backend calls this Web App URL with a JSON body containing { type, data, ... }
 *   2. This function routes to the appropriate handler (same ones used by email)
 *   3. Returns a JSON response with the result
 * 
 * Deploy: Publish > Deploy as web app > Execute as: Me, Access: Anyone
 * 
 * @param {Object} e - The POST event with e.postData.contents containing JSON
 * @returns {ContentService.TextOutput} JSON response
 */
function doPost(e) {
    try {
        let payload;

        if (e.postData && e.postData.contents) {
            payload = JSON.parse(e.postData.contents);
        } else {
            return ContentService.createTextOutput(
                JSON.stringify({ success: false, error: 'No payload received' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        log('INFO', 'doPost', `Received POST: type=${payload.type}`);

        // Check for email sending requests (new capability for VPS)
        if (payload.type === 'send_email') {
            const result = handleSendEmail(payload);
            flushLogs();
            return ContentService.createTextOutput(
                JSON.stringify(result)
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // Route to the appropriate handler
        const result = processPayload(payload);

        flushLogs();

        return ContentService.createTextOutput(
            JSON.stringify(result)
        ).setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        log('ERROR', 'doPost', error.message, { stack: error.stack });
        flushLogs();
        return ContentService.createTextOutput(
            JSON.stringify({ success: false, error: error.message })
        ).setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Route a payload to the appropriate handler based on its type.
 */
function processPayload(payload) {
    if (!payload || !payload.type) {
        return { success: false, error: 'No payload type' };
    }

    switch (payload.type) {
        case 'calendar_wedding':
            return handleWeddingCalendar(payload.data);
        case 'task_wedding':
            return handleWeddingTask(payload.data);
        case 'calendar':
            return handleCalendarEvent(payload);
        case 'task':
            return handleTask(payload);
        case 'sheets':
            return handleSheetsAppend(payload);
        case 'drive':
            return handleDriveUpload(payload, null);
        case 'income_notification':
            return handleIncomeDetailed(payload);
        case 'expense_notification':
            return handleNotificationGeneric(payload, 'expense');
        case 'income_detailed':
            return handleIncomeDetailed(payload);
        case 'order_notification':
            return handleOrderNotification(payload);
        default:
            return { success: false, error: 'Unknown type: ' + payload.type };
    }
}

/**
 * Handle email sending on behalf of the backend.
 * 
 * Purpose: The VPS cannot send emails via SMTP (ports blocked on DigitalOcean).
 * Instead, the backend POSTs to this Web App with type "send_email", and
 * Apps Script sends the email using GmailApp (which works via Google's API).
 * 
 * @param {Object} payload - { type: 'send_email', to, subject, htmlBody, textBody, attachments? }
 */
function handleSendEmail(payload) {
    try {
        const to = payload.to;
        const subject = payload.subject;
        const htmlBody = payload.htmlBody || '';
        const textBody = payload.textBody || 'הודעה ממערכת ניהול העסק';

        if (!to || !subject) {
            return { success: false, error: 'Missing "to" or "subject"' };
        }

        const options = {
            name: 'Your Business Name',
            htmlBody: htmlBody,
        };

        // Handle base64 attachments if present
        if (payload.attachments && Array.isArray(payload.attachments)) {
            options.attachments = payload.attachments.map(att => {
                return Utilities.newBlob(
                    Utilities.base64Decode(att.content),
                    att.contentType || 'application/pdf',
                    att.filename || 'attachment'
                );
            });
        }

        GmailApp.sendEmail(to, subject, textBody, options);

        log('INFO', 'send_email', `Email sent to ${to}: ${subject}`);
        return { success: true, messageId: `gas-${Date.now()}` };

    } catch (error) {
        log('ERROR', 'send_email', `Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function getPaymentMethodLabel(method) {
    const labels = {
        'cash': 'מזומן',
        'bit': 'ביט',
        'paybox': 'פייבוקס',
        'credit': 'אשראי',
        'transfer': 'העברה בנקאית',
        'check': 'צ\'ק'
    };
    return labels[method] || method || 'לא צוין';
}

/**
 * Get the current backend URL.
 * The tunnel URL is now directly configured via TAILSCALE_API_URL.
 */
function getBackendUrl() {
    if (cachedBackendUrl) return cachedBackendUrl;

    let baseUrl = String(CONFIG.TAILSCALE_API_URL || '').trim();
    baseUrl = baseUrl.replace(/\/+$/, '');
    // Normalize to root URL. We append /api/... later.
    if (baseUrl.endsWith('/api')) {
        baseUrl = baseUrl.slice(0, -4);
    }
    cachedBackendUrl = baseUrl;
    console.log('Backend URL configured:', cachedBackendUrl);
    return cachedBackendUrl;
}

// ===========================================
// LOGGING - Send logs to backend for local storage
// ===========================================

const logsBuffer = [];

/**
 * Log an entry (buffered for batch sending)
 */
function log(level, action, message, details = null) {
    const entry = {
        level,
        action,
        message,
        details,
        timestamp: new Date().toISOString()
    };

    console.log(`[${level}] ${action}: ${message}`);
    logsBuffer.push(entry);
}

/**
 * Send buffered logs to backend
 */
function flushLogs() {
    if (logsBuffer.length === 0) return;

    try {
        const backendUrl = getBackendUrl();

        if (!backendUrl) {
            console.error('Cannot send logs - backend URL not available');
            logsBuffer.length = 0;
            return;
        }

        const url = `${backendUrl}/api/apps-script-logs/batch`;
        const options = {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify({ logs: logsBuffer }),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);

        if (response.getResponseCode() === 200) {
            console.log(`Sent ${logsBuffer.length} logs to backend`);
        } else {
            console.error('Failed to send logs:', response.getContentText());
        }
    } catch (error) {
        console.error('Failed to send logs to backend:', error.message);
    }

    // Clear buffer regardless of success
    logsBuffer.length = 0;
}

// (Email polling removed — all integration is via doPost Web App)

function normalizePhone(value) {
    if (!value) return value;
    const raw = String(value).trim();
    if (!raw) return raw;

    const compact = raw.replace(/[\s\-().]/g, '');
    if (compact.startsWith('+972')) {
        const local = compact.slice(4).replace(/\D/g, '');
        return local ? (local.startsWith('0') ? local : `0${local}`) : raw;
    }

    if (compact.startsWith('+')) {
        return `+${compact.slice(1).replace(/\D/g, '')}`;
    }

    const digits = compact.replace(/\D/g, '');
    if (digits.startsWith('972')) {
        const local = digits.slice(3);
        return local ? (local.startsWith('0') ? local : `0${local}`) : digits;
    }

    return digits || raw;
}

/**
 * Get Hebrew label for an item type.
 */
function getItemTypeLabel(type) {
    const labels = {
        rental: 'השכרה',
        sewing_for_rental: 'תפירה שנשארת בהשכרה',
        sewing: 'תפירה',
        sale: 'מכירה'
    };
    return labels[type] || type || 'פריט';
}

// ===========================================
// HANDLER FUNCTIONS
// ===========================================

/**
 * Handle Wedding Calendar Event
 */
function handleWeddingCalendar(data) {
    try {
        const calendar = CalendarApp.getDefaultCalendar();
        const eventDate = new Date(data.eventDate);
        const title = `חתונה ${data.customerName}`; // Exact match to old script: `חתונה ${customerName}`

        // Old script used createAllDayEvent(eventTitle, eventDateObj) without description
        calendar.createAllDayEvent(title, eventDate);
        console.log('Created wedding event:', title);

        return { success: true, type: 'calendar_wedding', title: title };
    } catch (error) {
        console.error('Error creating wedding event:', error);
        return { success: false, type: 'calendar_wedding', error: error.message };
    }
}

/**
 * Handle Wedding Task
 */
function handleWeddingTask(data) {
    try {
        const taskListId = findOrCreateTaskList('לקוחות'); // Explicitly look for 'לקוחות' like old script
        const eventDate = new Date(data.eventDate);

        // Convert to Hebrew date
        const hebrewDate = getHebrewDate(eventDate);

        // Construct title exactly like old script: 
        // const taskTitle = dealDetails ? `${customerName} ${hebrewDate} ${dealDetails}` : `${customerName} ${hebrewDate}`;
        // identifying "dealDetails" as data.orderSummary based on user request "פירוט ההזמנה"

        let title = `${data.customerName} ${hebrewDate}`;
        if (data.orderSummary) {
            title += ` ${data.orderSummary}`;
        }

        const task = {
            title: title,
            due: eventDate.toISOString()
        };

        // Old script: Tasks.Tasks.insert(task, customersList.id);
        Tasks.Tasks.insert(task, taskListId);
        console.log('Created wedding task:', title);

        return { success: true, type: 'task_wedding', title: title };
    } catch (error) {
        console.error('Error creating wedding task:', error);
        return { success: false, type: 'task_wedding', error: error.message };
    }
}

/**
 * Handle generic calendar event creation
 */
function handleCalendarEvent(payload) {
    try {
        const calendar = CalendarApp.getDefaultCalendar();

        // Support direct payload or payload.data
        const data = payload.data || payload;

        const eventDate = new Date(data.date || data.startTime);

        if (data.allDay) {
            calendar.createAllDayEvent(data.title, eventDate);
            console.log('Created all-day event:', data.title);
        } else {
            const endDate = data.endTime ? new Date(data.endTime) : new Date(eventDate.getTime() + 60 * 60 * 1000);
            calendar.createEvent(data.title, eventDate, endDate);
            console.log('Created event:', data.title);
        }

        return { success: true, type: 'calendar', title: data.title };

    } catch (error) {
        console.error('Error creating calendar event:', error);
        return { success: false, type: 'calendar', error: error.message };
    }
}

/**
 * Handle task creation
 */
function handleTask(payload) {
    try {
        // Support direct payload or payload.data
        const data = payload.data || payload;

        // Find or create the tasks list
        let taskListId = findOrCreateTaskList(data.listName || CONFIG.TASK_LIST_NAME);

        // Create the task
        const task = {
            title: data.title,
            due: data.dueDate
        };

        Tasks.Tasks.insert(task, taskListId);
        console.log('Created task:', data.title);

        return { success: true, type: 'task', title: data.title };

    } catch (error) {
        console.error('Error creating task:', error);
        return { success: false, type: 'task', error: error.message };
    }
}

/**
 * Find or create a task list by name
 */
function findOrCreateTaskList(listName) {
    const allLists = Tasks.Tasklists.list();

    if (allLists.items) {
        const existingList = allLists.items.find(list => list.title === listName);
        if (existingList) {
            return existingList.id;
        }
    }

    // Create new list
    const newList = Tasks.Tasklists.insert({ title: listName });
    console.log('Created new task list:', listName);
    return newList.id;
}

/**
 * Handle Google Sheets append
 */
function handleSheetsAppend(payload) {
    try {
        if (!CONFIG.EMAIL_LIST_SHEET_ID) {
            console.log('Sheet ID not configured');
            return { success: false, type: 'sheets', error: 'Sheet ID not configured' };
        }

        const sheet = SpreadsheetApp.openById(CONFIG.EMAIL_LIST_SHEET_ID);
        const targetSheet = sheet.getSheetByName(payload.sheet) || sheet.getActiveSheet();

        targetSheet.appendRow(payload.data);
        console.log('Appended row to sheet:', payload.sheet);

        return { success: true, type: 'sheets', sheet: payload.sheet };

    } catch (error) {
        console.error('Error appending to sheet:', error);
        return { success: false, type: 'sheets', error: error.message };
    }
}

/**
 * Handle Drive file upload
 */
function handleDriveUpload(payload, message) {
    try {
        const baseFolder = DriveApp.getFolderById(CONFIG.DRIVE_BASE_FOLDER_ID);

        // Navigate/create folder path
        const folderPath = payload.folder.split('/');
        let currentFolder = baseFolder;

        for (const folderName of folderPath) {
            currentFolder = findOrCreateFolder(currentFolder, folderName);
        }

        // Decode base64 file
        const fileBlob = Utilities.newBlob(
            Utilities.base64Decode(payload.fileBase64),
            'image/jpeg',
            payload.fileName
        );

        // Create file
        currentFolder.createFile(fileBlob);
        console.log('Uploaded file:', payload.fileName, 'to', payload.folder);

        return { success: true, type: 'drive', fileName: payload.fileName };

    } catch (error) {
        console.error('Error uploading to Drive:', error);
        return { success: false, type: 'drive', error: error.message };
    }
}

/**
 * Find or create a folder inside a parent folder
 */
function findOrCreateFolder(parentFolder, folderName) {
    const folders = parentFolder.getFoldersByName(folderName);

    if (folders.hasNext()) {
        return folders.next();
    }

    console.log('Creating folder:', folderName);
    return parentFolder.createFolder(folderName);
}

/**
 * Extract receipt data using Google Drive OCR (Logic copied from old script)
 */
function extractReceiptData(fileBlob, paymentMethod) {
    let tempFileId = null;
    let tempDocId = null;

    try {
        console.log(`Starting receipt data extraction via Google Drive OCR`);
        console.log(`Payment method: ${paymentMethod}`);

        // Create temporary file in Drive
        const tempFile = DriveApp.createFile(fileBlob);
        tempFileId = tempFile.getId();
        console.log(`Created temporary file with ID: ${tempFileId}`);

        // Convert to Google Doc with OCR using Drive.Files.copy (requires Drive API service enabled)
        let docFile = null;
        try {
            docFile = Drive.Files.copy(
                {
                    title: `temp_ocr_${Date.now()}`,
                    mimeType: 'application/vnd.google-apps.document'
                },
                tempFileId,
                {
                    ocr: true,
                    ocrLanguage: 'he' // Hebrew OCR
                }
            );
        } catch (ocrError) {
            console.error(`OCR failed: ${ocrError.toString()}`);
            throw ocrError;
        }

        tempDocId = docFile.id;
        console.log(`Created OCR document with ID: ${tempDocId}`);

        // Get the document content
        const doc = DocumentApp.openById(tempDocId);
        const fullText = doc.getBody().getText();

        console.log(`Extracted text length: ${fullText.length} characters`);

        let confirmationNumber = null;
        let lastFourDigits = null;

        if (!paymentMethod) {
            return { confirmationNumber, lastFourDigits };
        }

        // Logic from old script
        if (paymentMethod.includes('ביט')) {
            const bitPattern = /\d+(?:-\d+)+/g;
            const matches = fullText.match(bitPattern);
            if (matches) {
                for (const match of matches) {
                    const digitsOnly = match.replace(/-/g, '');
                    if (digitsOnly.length === 13) {
                        confirmationNumber = digitsOnly;
                        console.log(`Found ביט confirmation: ${match} -> ${confirmationNumber}`);
                        break;
                    }
                }
            }
        } else if (paymentMethod.includes('פייבוקס')) {
            const payboxPattern = /[A-Za-z0-9]{19}/g;
            const matches = fullText.match(payboxPattern);
            if (matches && matches.length > 0) {
                confirmationNumber = matches[0].substring(0, 13);
                console.log(`Found פייבוקס confirmation: ${confirmationNumber}`);
            }
        } else if (paymentMethod.includes('אשראי')) {
            // Last 4 digits
            const fourDigitPattern = /(?<!\d-)\b\d{4}\b(?!-\d)/g;
            const fourDigitMatches = fullText.match(fourDigitPattern);
            if (fourDigitMatches && fourDigitMatches.length > 0) {
                lastFourDigits = fourDigitMatches[0];
            }

            // Confirmation number
            const confirmationPattern = /\b\d{1,10}\b/g;
            const confirmationMatches = fullText.match(confirmationPattern);
            if (confirmationMatches) {
                let longestNumber = '';
                for (const match of confirmationMatches) {
                    if (match.length > longestNumber.length && match.length <= 10) {
                        longestNumber = match;
                    }
                }
                if (longestNumber) confirmationNumber = longestNumber;
            }
        } else if (paymentMethod.includes('העברה')) {
            const withDashesPattern = /\d+(?:-\d+)+/g;
            const withDashesMatches = fullText.match(withDashesPattern);
            if (withDashesMatches) {
                for (const match of withDashesMatches) {
                    const digitsOnly = match.replace(/-/g, '');
                    if (digitsOnly.length === 8 || digitsOnly.length === 9) {
                        confirmationNumber = digitsOnly;
                        break;
                    }
                }
            }
            if (!confirmationNumber) {
                const withoutDashesPattern = /\b\d{8,9}\b/g;
                const matches = fullText.match(withoutDashesPattern);
                if (matches) confirmationNumber = matches[0];
            }
        }

        return { confirmationNumber, lastFourDigits };

    } catch (error) {
        console.error(`Error extracting receipt data: ${error.toString()}`);
        return { confirmationNumber: null, lastFourDigits: null, error: error.message };
    } finally {
        // Cleanup
        if (tempDocId) try { DriveApp.getFileById(tempDocId).setTrashed(true); } catch (e) { }
        if (tempFileId) try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (e) { }
    }
}

/**
 * Handle detailed income notification - sent to Business Owner
 */
function handleIncomeDetailed(payload) {
    try {
        const data = payload.data;
        const subject = payload.subject ? payload.subject.replace(/💰/g, '').trim() : `תשלום חדש - ${data.customerName || 'לקוחה'}`;
        const amount = data.amount || 0;
        const customerName = data.customerName || 'לא צוין';
        const phone = normalizePhone(data.customerPhone || 'לא צוין');
        const email = data.customerEmail || 'לא צוין';
        const paymentMethodCode = data.paymentMethod || 'cash';
        const paymentMethod = getPaymentMethodLabel(paymentMethodCode);

        let confirmationNumber = data.confirmationNumber;
        let lastFourDigits = data.lastFourDigits;
        let checkNumber = data.checkNumber;
        let bankDetails = data.bankDetails;
        let installments = data.installments || 1;

        if (bankDetails && typeof bankDetails === 'object') {
            const bank = bankDetails.bank || '';
            const branch = bankDetails.branch || '';
            const account = bankDetails.account || '';
            bankDetails = `בנק: ${bank || '-'}, סניף: ${branch || '-'}, חשבון: ${account || '-'}`;
        } else if (bankDetails && typeof bankDetails === 'string') {
            try {
                const parsed = JSON.parse(bankDetails);
                if (parsed && typeof parsed === 'object') {
                    const bank = parsed.bank || '';
                    const branch = parsed.branch || '';
                    const account = parsed.account || '';
                    bankDetails = `בנק: ${bank || '-'}, סניף: ${branch || '-'}, חשבון: ${account || '-'}`;
                }
            } catch (e) { }
        }

        console.log(`Processing detailed income for ${customerName}`);

        const attachments = [];
        let fileBlob = null;

        // Decode file if present
        if (payload.fileBase64) {
            try {
                const fileName = payload.fileName || 'receipt.jpg';
                fileBlob = Utilities.newBlob(
                    Utilities.base64Decode(payload.fileBase64),
                    getMimeTypeFromFilename(fileName),
                    fileName
                );
                attachments.push(fileBlob);
                console.log(`Attached file: ${fileName}`);

                // Perform legacy OCR only if NO data was extracted by AI and not cash
                if (!confirmationNumber && !lastFourDigits && !checkNumber && !bankDetails && paymentMethodCode !== 'cash') {
                    console.log('No AI data found, attempting legacy OCR...');
                    const ocrResult = extractReceiptData(fileBlob, paymentMethod);
                    if (ocrResult.confirmationNumber) {
                        confirmationNumber = ocrResult.confirmationNumber;
                    }
                    if (ocrResult.lastFourDigits) {
                        lastFourDigits = ocrResult.lastFourDigits;
                    }
                }

            } catch (err) {
                console.error('Error processing attachment:', err.message);
            }
        }

        // Construct HTML body with all new fields
        let htmlBody = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #28a745; text-align: center; border-bottom: 2px solid #28a745; padding-bottom: 10px;">פרטי תשלום חדש</h2>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 40%;">שם הלקוחה:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${customerName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מספר טלפון:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${phone}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">כתובת אימייל:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">סכום ששולם:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 1.2em; color: #28a745; font-weight: bold;">₪${amount.toLocaleString()}</td>
                    </tr>
                    ${installments > 1 ? `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">תשלומים:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${installments}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">אמצעי תשלום:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${paymentMethod}</td>
                    </tr>
                    ${confirmationNumber ? `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מס' אסמכתא:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; background-color: #f9f9f9; font-family: monospace; font-size: 1.1em;">${confirmationNumber}</td>
                    </tr>
                    ` : ''}
                    ${lastFourDigits ? `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">4 ספרות אחרונות:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; background-color: #f9f9f9; font-family: monospace;">${lastFourDigits}</td>
                    </tr>
                    ` : ''}
                    ${checkNumber ? `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מספר צ'ק:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; background-color: #f9f9f9; font-family: monospace;">${checkNumber}</td>
                    </tr>
                    ` : ''}
                    ${bankDetails ? `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">פרטי בנק:</td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee; background-color: #f9f9f9; font-family: monospace;">${bankDetails}</td>
                    </tr>
                    ` : ''}
                </table>
                
                <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 0.9em;">
                    ${attachments.length > 0 ? '<p>קובץ האסמכתא מצורף למייל זה.</p>' : ''}
                    <p style="font-size: 0.8em;">נשלח אוטומטית ממערכת ניהול העסק</p>
                </div>
            </div>
        `;

        GmailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, 'פרטי תשלום חדש', {
            name: 'Your Business Name',
            htmlBody: htmlBody,
            attachments: attachments.length > 0 ? attachments : undefined
        });

        console.log(`Sent detailed income email for ${customerName} to ${CONFIG.OWNER_EMAIL}`);
        return { success: true, type: 'income_detailed' };

    } catch (error) {
        console.error('Error in handleIncomeDetailed:', error);
        return { success: false, type: 'income_detailed', error: error.message };
    }
}

/**
 * Handle order notification - forward to Owner with multiple file support
 */
function handleOrderNotification(payload) {
    try {
        const data = payload.data;
        const customerName = data.customerName || 'לא צוין';
        const customerPhone = normalizePhone(data.customerPhone || 'לא צוין');
        const customerEmail = data.customerEmail || 'לא צוין';
        const eventDate = data.eventDate ? new Date(data.eventDate) : null;
        const orderSummary = data.orderSummary || '';
        const summaryFromItems = Array.isArray(data.dresses)
            ? data.dresses
                .map((d) => `${d.itemTypeLabel || getItemTypeLabel(d.itemType)} ${d.name || 'פריט'}`.trim())
                .join(', ')
            : '';
        const summaryForDisplay = orderSummary || summaryFromItems;
        const totalPrice = Number(data.totalPrice || 0);
        const deposit = Number(data.deposit || 0);
        const remaining = totalPrice - deposit;
        const subject = `הזמנה חדשה: ${customerName}${summaryForDisplay ? ` - ${summaryForDisplay}` : ''}`;

        console.log('Processing order notification');

        const attachments = [];
        const paymentRows = [];

        // Handle deposit files from depositPayments
        if (data.depositPayments && data.depositPayments.length > 0) {
            console.log(`Checking ${data.depositPayments.length} deposit payments for files`);

            data.depositPayments.forEach((payment, index) => {
                const methodLabel = getPaymentMethodLabel(payment.method);
                const rowParts = [
                    `סכום: ₪${Number(payment.amount || 0)}`,
                    `אמצעי: ${methodLabel}`
                ];
                if (payment.confirmationNumber) rowParts.push(`אסמכתא: ${payment.confirmationNumber}`);
                if (payment.lastFourDigits) rowParts.push(`4 ספרות: ${payment.lastFourDigits}`);
                if (payment.checkNumber) rowParts.push(`מס' צ'ק: ${payment.checkNumber}`);
                if (payment.installments && Number(payment.installments) > 1) rowParts.push(`תשלומים: ${payment.installments}`);
                if (payment.bankDetails) {
                    let bankText = '';
                    if (typeof payment.bankDetails === 'string') {
                        try {
                            const parsed = JSON.parse(payment.bankDetails);
                            if (parsed && typeof parsed === 'object') {
                                bankText = `בנק: ${parsed.bank || '-'}, סניף: ${parsed.branch || '-'}, חשבון: ${parsed.account || '-'}`;
                            } else {
                                bankText = payment.bankDetails;
                            }
                        } catch (e) {
                            bankText = payment.bankDetails;
                        }
                    } else if (typeof payment.bankDetails === 'object') {
                        bankText = `בנק: ${payment.bankDetails.bank || '-'}, סניף: ${payment.bankDetails.branch || '-'}, חשבון: ${payment.bankDetails.account || '-'}`;
                    }
                    if (bankText) rowParts.push(`פרטי בנק: ${bankText}`);
                }
                paymentRows.push(`<li style="margin-bottom:8px;">${rowParts.join(' | ')}</li>`);

                if (payment.hasFile && payment.fileBase64) {
                    console.log(`Preparing attachment for payment ${index + 1}`);
                    try {
                        const fileName = payment.fileName || `deposit_${index + 1}.jpg`;
                        // Create blob for attachment
                        const blob = Utilities.newBlob(
                            Utilities.base64Decode(payment.fileBase64),
                            getMimeTypeFromFilename(fileName),
                            fileName
                        );
                        attachments.push(blob);
                    } catch (blobError) {
                        console.error(`Failed to create blob for payment ${index + 1}:`, blobError);
                    }
                }
            });
        }

        const dressesList = Array.isArray(data.dresses) && data.dresses.length > 0
            ? data.dresses.map((d) => {
                const itemType = d.itemTypeLabel || getItemTypeLabel(d.itemType);
                return `<li>${itemType}: ${d.name || 'פריט'} - ₪${Number(d.price || 0)}</li>`;
            }).join('')
            : '<li>לא צוין</li>';

        const eventDateText = eventDate
            ? Utilities.formatDate(eventDate, 'Asia/Jerusalem', 'dd/MM/yyyy')
            : 'לא צוין';

        const htmlBody = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 760px; margin: 0 auto; padding: 20px; text-align: right; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="margin-top:0;">פרטי הזמנה חדשה</h2>
                <table style="width:100%; border-collapse: collapse;">
                    <tr><td style="padding:8px; font-weight:bold; width:35%;">לקוחה:</td><td style="padding:8px;">${customerName}</td></tr>
                    <tr><td style="padding:8px; font-weight:bold;">טלפון:</td><td style="padding:8px;">${customerPhone}</td></tr>
                    <tr><td style="padding:8px; font-weight:bold;">אימייל:</td><td style="padding:8px;">${customerEmail}</td></tr>
                    <tr><td style="padding:8px; font-weight:bold;">תאריך אירוע:</td><td style="padding:8px;">${eventDateText}</td></tr>
                    ${summaryForDisplay ? `<tr><td style="padding:8px; font-weight:bold;">מה נסגר:</td><td style="padding:8px;">${summaryForDisplay}</td></tr>` : ''}
                    <tr><td style="padding:8px; font-weight:bold;">מחיר כולל:</td><td style="padding:8px;">₪${totalPrice}</td></tr>
                    <tr><td style="padding:8px; font-weight:bold;">מקדמה:</td><td style="padding:8px;">₪${deposit}</td></tr>
                    <tr><td style="padding:8px; font-weight:bold;">יתרה:</td><td style="padding:8px;">₪${remaining}</td></tr>
                </table>

                <h3 style="margin-top:18px;">פריטים</h3>
                <ul style="margin:0; padding-right:20px;">${dressesList}</ul>

                <h3 style="margin-top:18px;">פירוט תשלומים</h3>
                <ul style="margin:0; padding-right:20px;">${paymentRows.length > 0 ? paymentRows.join('') : '<li>לא צוין</li>'}</ul>

                ${data.notes ? `<h3 style="margin-top:18px;">הערות</h3><p style="margin:0;">${data.notes}</p>` : ''}
            </div>
        `;

        GmailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, 'פרטי הזמנה חדשה', {
            name: 'Your Business Name',
            replyTo: CONFIG.OWNER_EMAIL,
            htmlBody,
            attachments: attachments.length > 0 ? attachments : undefined
        });

        console.log(`Sent order notification email with ${attachments.length} attachments`);

        // New order only: create calendar event + task
        if (eventDate && customerName && customerName !== 'לא צוין') {
            const summaryForTask = summaryForDisplay;

            const calendarResult = handleWeddingCalendar({
                customerName,
                eventDate: eventDate.toISOString()
            });
            console.log('Wedding calendar result:', JSON.stringify(calendarResult));

            const taskResult = handleWeddingTask({
                customerName,
                eventDate: eventDate.toISOString(),
                orderSummary: summaryForTask
            });
            console.log('Wedding task result:', JSON.stringify(taskResult));
        }

        return { success: true, type: 'order_notification' };

    } catch (error) {
        console.error('Error handling order notification:', error);
        return { success: false, type: 'order_notification', error: error.message };
    }
}

/**
 * Helper to determine MimeType from filename
 */
function getMimeTypeFromFilename(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return MimeType.PDF;
    if (lower.endsWith('.png')) return MimeType.PNG;
    if (lower.endsWith('.gif')) return MimeType.GIF;
    return MimeType.JPEG; // Default
}

/**
 * Generic notification handler
 */
function handleNotificationGeneric(payload, type) {
    try {
        let htmlBody = payload.htmlBody;
        const subject = payload.subject || (type === 'income' ? 'הכנסה חדשה' : 'הזמנה חדשה');

        // Handle file attachment if present
        if (payload.fileBase64) {
            console.log(`Processing file attachment for ${type} notification`);

            if (type === 'income') {
                // As requested: For income, the file is NOT saved to Drive (already sent in detailed email)
                console.log('Income file - skipping Drive upload as requested');
                if (htmlBody) {
                    htmlBody = htmlBody.replace('{{FILE_LINK}}', '');
                }
            } else {
                // Determine folder path and file name for expenses or others
                const date = new Date();
                const year = date.getFullYear();
                let folderPath = `${year}/${type === 'income' ? 'הכנסות' : 'הזמנות'}`;
                let fileName = payload.fileName || 'attachment';

                if (type === 'expense') {
                    // Specific logic for expenses: [Year]/הוצאות/הוצאות מוכרות [Year]
                    folderPath = `${year}/הוצאות/הוצאות מוכרות ${year}`;

                    // Format file name: [yymmdd] [שם החנות/ספק] [סכום] [₪]
                    const data = payload.data || {};
                    const transactionDate = data.transactionDate ? new Date(data.transactionDate) : new Date();
                    const yy = transactionDate.getFullYear().toString().slice(-2);
                    const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
                    const dd = transactionDate.getDate().toString().padStart(2, '0');
                    const datePrefix = `${yy}${mm}${dd}`;

                    const supplier = data.supplier || data.customerName || 'ספק_לא_ידוע';
                    const amount = data.amount || 0;

                    // Get extension from original filename
                    const extMatch = (payload.fileName || '').match(/\.[^.]+$/);
                    const ext = extMatch ? extMatch[0] : '.jpg';

                    fileName = `${datePrefix} ${supplier} ${amount}₪${ext}`;
                    console.log(`Formatted expense filename: ${fileName}`);
                }

                // Upload file
                const file = uploadFileToDrive(payload.fileBase64, fileName, folderPath);
                const fileUrl = file.getUrl();

                console.log('File uploaded to Drive:', fileUrl);

                // Inject link into HTML
                if (htmlBody) {
                    const linkHtml = `
                        <div style="margin: 20px 0; text-align: center;">
                            <a href="${fileUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                📎 צפייה בקובץ בדרייב (${fileName})
                            </a>
                        </div>
                    `;
                    htmlBody = htmlBody.replace('{{FILE_LINK}}', linkHtml);
                }
            }
        } else {
            // Remove placeholder if no file
            if (htmlBody) {
                htmlBody = htmlBody.replace('{{FILE_LINK}}', '');
            }
        }

        // Fallback for body if no HTML (should not happen with new backend logic)
        const bodyText = `New ${type} notification received. check Drive for details if attached.`;

        GmailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, bodyText, {
            name: 'Your Business Name',
            htmlBody: htmlBody
        });

        console.log(`Sent ${type} notification email to process owner`);

        return { success: true, type: `${type}_notification` };

    } catch (error) {
        console.error(`Error sending ${type} notification:`, error);
        return { success: false, type: `${type}_notification`, error: error.message };
    }
}

/**
 * Helper: Upload file to Drive
 */
function uploadFileToDrive(base64Data, fileName, folderPath) {
    const baseFolder = DriveApp.getFolderById(CONFIG.DRIVE_BASE_FOLDER_ID);
    let currentFolder = baseFolder;

    // Navigate/Create folder structure
    if (folderPath) {
        const folders = folderPath.split('/');
        for (const folderName of folders) {
            currentFolder = findOrCreateFolder(currentFolder, folderName);
        }
    }

    // Decode and create file
    const blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        MimeType.JPEG, // Default to JPEG, but Drive auto-detects usually or we can detect from fileName
        fileName
    );

    // Set proper mime type if name has extension
    if (fileName.toLowerCase().endsWith('.pdf')) blob.setContentType(MimeType.PDF);
    else if (fileName.toLowerCase().endsWith('.png')) blob.setContentType(MimeType.PNG);

    return currentFolder.createFile(blob);
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Convert date to Hebrew date format
 */
function getHebrewDate(date) {
    try {
        const dateObj = new Date(date);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;

        const url = `https://www.hebcal.com/converter?cfg=json&date=${formattedDate}&g2h=1`;
        const response = UrlFetchApp.fetch(url);
        const data = JSON.parse(response.getContentText());

        const hebrewNumbers = {
            1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה',
            6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י',
            11: 'יא', 12: 'יב', 13: 'יג', 14: 'יד', 15: 'טו',
            16: 'טז', 17: 'יז', 18: 'יח', 19: 'יט', 20: 'כ',
            21: 'כא', 22: 'כב', 23: 'כג', 24: 'כד', 25: 'כה',
            26: 'כו', 27: 'כז', 28: 'כח', 29: 'כט', 30: 'ל'
        };

        const hebrewMonths = {
            'Tishrei': 'תשרי',
            'Cheshvan': 'חשון',
            'Kislev': 'כסלו',
            'Tevet': 'טבת',
            'Sh\'vat': 'שבט',
            'Adar': 'אדר',
            'Adar I': 'אדר א',
            'Adar II': 'אדר ב',
            'Nisan': 'ניסן',
            'Iyyar': 'אייר',
            'Sivan': 'סיון',
            'Tamuz': 'תמוז',
            'Av': 'אב',
            'Elul': 'אלול'
        };

        const hebrewDay = hebrewNumbers[data.hd] || data.hd;
        const hebrewMonth = hebrewMonths[data.hm] || data.hm;

        return `${hebrewDay} ב${hebrewMonth}`;

    } catch (error) {
        console.error('Error getting Hebrew date:', error);
        return Utilities.formatDate(new Date(date), 'Asia/Jerusalem', 'dd/MM/yyyy');
    }
}

/**
 * Send error notification
 */
function sendErrorNotification(error) {
    try {
        const subject = '⚠️ Business Integration Error';
        const body = `
An error occurred in the business integration script:

Error: ${error.message}
Stack: ${error.stack}
Time: ${new Date()}
    `.trim();

        GmailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, body);

    } catch (e) {
        console.error('Failed to send error notification:', e);
    }
}

// ===========================================
// UTILITY: Test Web App locally
// ===========================================

/**
 * Test function — simulate a doPost call locally in the script editor.
 * Modify the payload as needed and run this function to test handlers.
 */
function testDoPost() {
    const fakeEvent = {
        postData: {
            contents: JSON.stringify({
                type: 'calendar',
                data: { title: 'Test Event', date: new Date().toISOString(), allDay: true }
            })
        }
    };
    const result = doPost(fakeEvent);
    console.log('Test result:', result.getContent());
}
