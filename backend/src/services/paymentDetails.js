/**
 * Payment details normalization utilities.
 *
 * Keeps payment-reference fields consistent across API, AI extraction,
 * SQL storage, and Apps Script payloads.
 */

const METHOD_SYNONYMS = {
  cash: ['cash', 'מזומן'],
  bit: ['bit', 'ביט'],
  paybox: ['paybox', 'פייבוקס', 'pay box'],
  credit: ['credit', 'card', 'אשראי', 'כרטיס'],
  transfer: ['transfer', 'bank transfer', 'העברה', 'בנקאית'],
  check: ['check', 'cheque', "צ'ק", 'צ׳ק', 'שיק']
};

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function toMethodCode(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();

  for (const [code, synonyms] of Object.entries(METHOD_SYNONYMS)) {
    if (synonyms.some((s) => lower.includes(s.toLowerCase()))) {
      return code;
    }
  }

  return normalized;
}

function normalizeInstallments(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return 1;
  return n;
}

function normalizeLastFourDigits(value) {
  const str = normalizeText(value);
  if (!str) return null;
  const digits = str.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 4) return digits.slice(-4);
  return digits;
}

function toBankDetailsObject(value) {
  if (!value) return null;

  if (typeof value === 'object') {
    const bank = normalizeText(value.bank);
    const branch = normalizeText(value.branch);
    const account = normalizeText(value.account);
    return bank || branch || account ? { bank, branch, account } : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const bank = normalizeText(parsed.bank);
      const branch = normalizeText(parsed.branch);
      const account = normalizeText(parsed.account);
      return bank || branch || account ? { bank, branch, account } : null;
    }
  } catch {
    // Fallback to loose digit parsing below.
  }

  const groups = trimmed.match(/\d+/g) || [];
  if (groups.length === 0) return null;

  return {
    bank: groups[0] || null,
    branch: groups[1] || null,
    account: groups[2] || null
  };
}

function serializeBankDetails(value) {
  const obj = toBankDetailsObject(value);
  return obj ? JSON.stringify(obj) : null;
}

/**
 * Return payment detail fields normalized and filtered by payment method.
 */
export function sanitizePaymentDetails({
  paymentMethod,
  confirmationNumber,
  lastFourDigits,
  checkNumber,
  bankDetails,
  installments
}) {
  const methodCode = toMethodCode(paymentMethod);
  const base = {
    paymentMethod: methodCode,
    confirmationNumber: normalizeText(confirmationNumber),
    lastFourDigits: normalizeLastFourDigits(lastFourDigits),
    checkNumber: normalizeText(checkNumber),
    bankDetails: serializeBankDetails(bankDetails),
    installments: normalizeInstallments(installments)
  };

  switch (methodCode) {
    case 'credit':
      return {
        ...base,
        checkNumber: null,
        bankDetails: null
      };
    case 'bit':
    case 'paybox':
      return {
        ...base,
        lastFourDigits: null,
        checkNumber: null,
        bankDetails: null,
        installments: 1
      };
    case 'transfer':
      return {
        ...base,
        lastFourDigits: null,
        checkNumber: null,
        installments: 1
      };
    case 'check':
      return {
        ...base,
        confirmationNumber: null,
        lastFourDigits: null,
        installments: 1
      };
    case 'cash':
      return {
        ...base,
        confirmationNumber: null,
        lastFourDigits: null,
        checkNumber: null,
        bankDetails: null,
        installments: 1
      };
    default:
      return base;
  }
}

export function normalizeMethodCode(value) {
  return toMethodCode(value);
}
