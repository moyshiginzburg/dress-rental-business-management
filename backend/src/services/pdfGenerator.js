/**
 * PDF Generator Service
 *
 * Purpose: Generate single-page Hebrew agreement PDFs from HTML/CSS using
 * headless Chrome for proper RTL rendering, font shaping, and layout quality.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { businessConfig } from '../config/index.js';
import { AGREEMENT_TERMS, AGREEMENT_CANCELLATION_POLICY } from '../constants/agreementTerms.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitize(value, fallback = '-') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function formatDateHebrew(dateStr) {
  if (!dateStr) return 'לא צוין';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'לא צוין';
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `${value.toLocaleString('he-IL')} ₪`;
}

function translateItemType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  const map = {
    rental: 'השכרה',
    sewing_for_rental: 'תפירה שנשארת בהשכרה',
    sewing: 'תפירה',
    sale: 'מכירה',
  };
  return map[normalized] || sanitize(type, 'פריט');
}

function resolveChromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadLogoDataUrl() {
  const candidates = [
    process.env.BUSINESS_LOGO_PATH,
    join(__dirname, '..', '..', '..', 'frontend', 'public', 'logo.png'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const imageBuffer = readFileSync(candidate);
      return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch {
      // keep trying other candidates
    }
  }
  return '';
}

function buildAgreementHtml(agreementData) {
  const signedDate = agreementData.signedAt ? new Date(agreementData.signedAt) : new Date();
  const signedTime = Number.isNaN(signedDate.getTime())
    ? ''
    : signedDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const items = Array.isArray(agreementData.orderItems) ? agreementData.orderItems : [];
  const itemRows = items.slice(0, 6).map((item) => {
    const type = translateItemType(item.itemType || item.item_type);
    const wearer = sanitize(item.wearerName || item.wearer_name, 'ללא שם');
    const price = formatCurrency(item.finalPrice || item.final_price);
    return `
      <tr>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(wearer)}</td>
        <td>${escapeHtml(price)}</td>
      </tr>
    `;
  }).join('');

  const safeSignature = agreementData.signatureData && String(agreementData.signatureData).startsWith('data:image')
    ? agreementData.signatureData
    : '';
  const logoDataUrl = loadLogoDataUrl();
  const fullTermsItems = AGREEMENT_TERMS.map((term) => `<li>${escapeHtml(term)}</li>`).join('');
  const cancellationItems = AGREEMENT_CANCELLATION_POLICY.map((term) => `<li>${escapeHtml(term)}</li>`).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; direction: rtl; background: #ffffff; }
      body {
        font-family: "Noto Sans Hebrew", "DejaVu Sans", Arial, sans-serif;
        color: #111827;
        line-height: 1.25;
      }
      .sheet {
        width: 100%;
        min-height: 273mm;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 9mm 9mm 7mm;
      }
      .header {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6mm;
        align-items: center;
        margin-bottom: 4mm;
      }
      .logo-wrap {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        border: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .logo-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .header-main {
        text-align: right;
      }
      .brand {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.2px;
      }
      .title {
        font-size: 15px;
        font-weight: 700;
        margin-top: 1mm;
      }
      .meta {
        font-size: 10.6px;
        color: #4b5563;
        margin-top: 1.3mm;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.4mm;
        margin-top: 2.5mm;
      }
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 9px;
        padding: 2.6mm 3mm;
      }
      .card h3 {
        margin: 0 0 1.6mm;
        font-size: 12.2px;
      }
      .line {
        font-size: 10px;
        margin-bottom: 1.1mm;
      }
      .summary {
        margin-top: 2.4mm;
        border: 1px solid #e5e7eb;
        border-radius: 9px;
        padding: 2.6mm 3mm;
        font-size: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 0.8mm;
      }
      th, td {
        border-bottom: 1px solid #f0f2f5;
        padding: 1.3mm 1mm;
        text-align: right;
        font-size: 9.5px;
      }
      th { font-weight: 700; color: #374151; }
      .terms {
        margin-top: 2.2mm;
        border: 1px solid #e5e7eb;
        border-radius: 9px;
        padding: 2.3mm 2.8mm;
        font-size: 8.8px;
      }
      .terms h3 {
        margin: 0 0 1.2mm;
        font-size: 11.2px;
      }
      .terms-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.2mm;
      }
      .terms-block {
        border: 1px solid #f1f2f4;
        border-radius: 7px;
        padding: 1.7mm 2mm;
        background: #fcfcfd;
      }
      .terms-block h4 {
        margin: 0 0 1mm;
        font-size: 9.4px;
      }
      .terms ol {
        margin: 0;
        padding: 0 3mm 0 0;
      }
      .terms li { margin-bottom: 0.8mm; }
      .signature-wrap {
        margin-top: 2.2mm;
        display: grid;
        grid-template-columns: 1fr 55mm;
        gap: 2.2mm;
        align-items: stretch;
      }
      .declaration {
        border: 1px solid #e5e7eb;
        border-radius: 9px;
        padding: 2.6mm 3mm;
        font-size: 10px;
        display: flex;
        align-items: center;
      }
      .signature-box {
        border: 1px solid #d1d5db;
        border-radius: 9px;
        padding: 1.2mm;
        display: flex;
        flex-direction: column;
      }
      .signature-label {
        font-size: 9px;
        color: #4b5563;
        margin-bottom: 0.5mm;
        text-align: center;
      }
      .signature-image {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .signature-image img {
        max-width: 100%;
        max-height: 30mm;
        object-fit: contain;
      }
      .footer {
        margin-top: 2mm;
        padding-top: 1.5mm;
        border-top: 1px solid #e5e7eb;
        text-align: center;
        font-size: 8.8px;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="header-main">
          <div class="brand">${escapeHtml(sanitize(businessConfig.name, 'ניהול עסק'))}</div>
          <div class="title">הסכם דיגיטלי</div>
          <div class="meta">
            תאריך חתימה: ${escapeHtml(formatDateHebrew(signedDate))}
            ${signedTime ? ` | שעה: ${escapeHtml(signedTime)}` : ''}
          </div>
        </div>
        <div class="logo-wrap">${logoDataUrl ? `<img src="${logoDataUrl}" alt="לוגו העסק" />` : ''}</div>
      </div>

      <div class="grid">
        <section class="card">
          <h3>פרטי לקוחה</h3>
          <div class="line">שם מלא: ${escapeHtml(sanitize(agreementData.customerName))}</div>
          <div class="line">טלפון: ${escapeHtml(sanitize(agreementData.customerPhone))}</div>
          <div class="line">אימייל: ${escapeHtml(sanitize(agreementData.customerEmail, 'לא צוין'))}</div>
        </section>

        <section class="card">
          <h3>פרטי אירוע</h3>
          <div class="line">תאריך אירוע: ${escapeHtml(formatDateHebrew(agreementData.eventDate))}</div>
          <div class="line">סיכום הזמנה: ${escapeHtml(sanitize(agreementData.orderSummary, 'לא צוין'))}</div>
        </section>
      </div>

      <section class="summary">
        <h3 style="margin:0 0 2mm;font-size:14px;">פריטים וסכומים</h3>
        <table>
          <thead>
            <tr>
              <th>סוג</th>
              <th>לובשת</th>
              <th>סכום</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="3">לא הוזנו פריטים</td></tr>'}
          </tbody>
        </table>
      </section>

      <section class="terms">
        <h3>תנאי ההסכם המלאים</h3>
        <div class="terms-grid">
          <div class="terms-block">
            <h4>תנאי השכרה</h4>
            <ol>${fullTermsItems}</ol>
          </div>
          <div class="terms-block">
            <h4>מדיניות ביטול</h4>
            <ol>${cancellationItems}</ol>
          </div>
        </div>
      </section>

      <div class="signature-wrap">
        <div class="declaration">אני מאשרת שקראתי את תנאי ההסכם ומסכימה להם.</div>
        <div class="signature-box">
          <div class="signature-label">חתימה דיגיטלית</div>
          <div class="signature-image">
            ${safeSignature ? `<img src="${safeSignature}" alt="חתימה" />` : '<span>ללא חתימה</span>'}
          </div>
        </div>
      </div>

      <div class="footer">
        ${escapeHtml(sanitize(businessConfig.name, ''))}
        ${businessConfig.phone ? ` | ${escapeHtml(businessConfig.phone)}` : ''}
        ${businessConfig.email ? ` | ${escapeHtml(businessConfig.email)}` : ''}
      </div>
    </div>
  </body>
</html>`;
}

async function generateWithChrome(htmlContent) {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error('Chrome executable not found. Set CHROME_BIN in environment.');
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'agreement-pdf-'));
  const htmlPath = join(tempDir, 'agreement.html');
  const pdfPath = join(tempDir, 'agreement.pdf');

  try {
    writeFileSync(htmlPath, htmlContent, 'utf-8');

    const args = [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=5000',
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ];

    await execFileAsync(chromePath, args, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 });

    if (!existsSync(pdfPath)) {
      throw new Error('Chrome did not create PDF file.');
    }

    return readFileSync(pdfPath);
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

/**
 * Generate rental agreement PDF with embedded signature
 * @param {object} agreementData - Agreement data
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function generateAgreementPdf(agreementData) {
  const html = buildAgreementHtml(agreementData || {});
  return generateWithChrome(html);
}

export default {
  generateAgreementPdf,
};
