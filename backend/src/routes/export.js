/**
 * Data Export Routes
 *
 * Purpose: Export SQLite datasets to CSV with practical business filters.
 * Access: Admin only, because export may include sensitive data.
 */

import { Router } from 'express';
import { all, get } from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'ממתין' },
  { value: 'confirmed', label: 'מאושר' },
  { value: 'in_progress', label: 'בתהליך' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
];

const ORDER_TYPE_OPTIONS = [
  { value: 'rental', label: 'השכרה' },
  { value: 'sewing_for_rental', label: 'תפירה שנשארת בהשכרה' },
  { value: 'sewing', label: 'תפירה' },
  { value: 'sale', label: 'מכירה' },
  { value: 'repair', label: 'תיקון' },
];

const DRESS_STATUS_OPTIONS = [
  { value: 'available', label: 'זמינה' },
  { value: 'sold', label: 'נמכרה' },
  { value: 'retired', label: 'יצאה ממלאי' },
];

const DRESS_INTENDED_USE_OPTIONS = [
  { value: 'rental', label: 'להשכרה' },
  { value: 'sale', label: 'למכירה' },
];

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'income', label: 'הכנסה' },
  { value: 'expense', label: 'הוצאה' },
];

const TRANSACTION_CATEGORY_OPTIONS = [
  { value: 'order', label: 'הזמנה' },
  { value: 'repair', label: 'תיקונים' },
  { value: 'materials', label: 'חומרים' },
  { value: 'overhead', label: 'תקורה' },
  { value: 'tax', label: 'מיסוי' },
  { value: 'equipment', label: 'ציוד' },
  { value: 'salary', label: 'משכורות' },
  { value: 'other', label: 'אחר' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'מזומן' },
  { value: 'bit', label: 'ביט' },
  { value: 'paybox', label: 'פייבוקס' },
  { value: 'credit', label: 'אשראי' },
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'check', label: "צ'ק" },
];

const RENTAL_TYPE_OPTIONS = [
  { value: 'rental', label: 'השכרה' },
  { value: 'sewing_for_rental', label: 'תפירה שנשארת בהשכרה' },
  { value: 'sewing', label: 'תפירה' },
  { value: 'sale', label: 'מכירה' },
  { value: 'repair', label: 'תיקון' },
];

const USER_ROLE_OPTIONS = [
  { value: 'admin', label: 'מנהל' },
  { value: 'user', label: 'משתמש' },
];

const ACTIVE_OPTIONS = [
  { value: '1', label: 'פעיל' },
  { value: '0', label: 'לא פעיל' },
];

function createDateFilters(column, fromLabel = 'מתאריך', toLabel = 'עד תאריך') {
  return [
    {
      key: 'dateFrom',
      label: fromLabel,
      inputType: 'date',
      queryType: 'date_from',
      column,
    },
    {
      key: 'dateTo',
      label: toLabel,
      inputType: 'date',
      queryType: 'date_to',
      column,
    },
  ];
}

const DATASET_CONFIG = {
  customers: {
    table: 'customers',
    label: 'לקוחות',
    description: 'פרטי לקוחות, מקור הגעה וסטטוס פעילות',
    orderBy: 'created_at DESC, id DESC',
    filters: [
      ...createDateFilters('created_at', 'נוצר מתאריך', 'נוצר עד תאריך'),
      {
        key: 'source',
        label: 'מקור הגעה',
        inputType: 'text',
        queryType: 'contains',
        column: 'source',
        placeholder: 'לדוגמה: אינסטגרם',
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['name', 'phone', 'email', 'notes'],
        placeholder: 'שם, טלפון, אימייל...',
      },
    ],
  },
  dresses: {
    table: 'dresses',
    label: 'שמלות',
    description: 'מלאי שמלות, סטטוס וייעוד',
    orderBy: 'updated_at DESC, id DESC',
    filters: [
      ...createDateFilters('updated_at', 'עודכן מתאריך', 'עודכן עד תאריך'),
      {
        key: 'dressStatus',
        label: 'סטטוס שמלה',
        inputType: 'select',
        queryType: 'in',
        column: 'status',
        options: DRESS_STATUS_OPTIONS,
      },
      {
        key: 'dressIntendedUse',
        label: 'ייעוד שמלה',
        inputType: 'select',
        queryType: 'in',
        column: 'intended_use',
        options: DRESS_INTENDED_USE_OPTIONS,
      },
      {
        key: 'dressIsActive',
        label: 'פעילה במלאי',
        inputType: 'select',
        queryType: 'equals_number',
        column: 'is_active',
        options: ACTIVE_OPTIONS,
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['name', 'notes'],
        placeholder: 'שם שמלה או הערה',
      },
    ],
  },
  orders: {
    table: 'orders',
    label: 'הזמנות',
    description: 'הזמנות השכרה, תפירה ומכירה',
    orderBy: 'event_date DESC, created_at DESC, id DESC',
    filters: [
      ...createDateFilters('event_date', 'תאריך אירוע מתאריך', 'תאריך אירוע עד תאריך'),
      {
        key: 'orderStatus',
        label: 'סטטוס הזמנה',
        inputType: 'select',
        queryType: 'in',
        column: 'status',
        options: ORDER_STATUS_OPTIONS,
      },
      {
        key: 'customerId',
        label: 'מזהה לקוחה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'customer_id',
      },
    ],
  },
  order_items: {
    table: 'order_items',
    label: 'פריטי הזמנה',
    description: 'כל הפריטים ברמת שמלה בתוך הזמנות',
    orderBy: 'created_at DESC, id DESC',
    filters: [
      ...createDateFilters('created_at', 'נוצר מתאריך', 'נוצר עד תאריך'),
      {
        key: 'itemType',
        label: 'סוג פריט',
        inputType: 'select',
        queryType: 'in',
        column: 'item_type',
        options: ORDER_TYPE_OPTIONS,
      },
      {
        key: 'orderId',
        label: 'מזהה הזמנה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'order_id',
      },
      {
        key: 'dressId',
        label: 'מזהה שמלה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'dress_id',
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['dress_name', 'wearer_name', 'notes'],
        placeholder: 'שם שמלה/לובשת/הערות',
      },
    ],
  },
  transactions: {
    table: 'transactions',
    label: 'תנועות כספיות',
    description: 'הכנסות והוצאות לפי סוג, קטגוריה ואמצעי תשלום',
    orderBy: 'date DESC, id DESC',
    filters: [
      ...createDateFilters('date', 'תאריך תנועה מתאריך', 'תאריך תנועה עד תאריך'),
      {
        key: 'transactionType',
        label: 'סוג תנועה',
        inputType: 'select',
        queryType: 'in',
        column: 'type',
        options: TRANSACTION_TYPE_OPTIONS,
      },
      {
        key: 'transactionCategory',
        label: 'קטגוריה',
        inputType: 'select',
        queryType: 'in',
        column: 'category',
        options: TRANSACTION_CATEGORY_OPTIONS,
      },
      {
        key: 'paymentMethod',
        label: 'אמצעי תשלום',
        inputType: 'select',
        queryType: 'in',
        column: 'payment_method',
        options: PAYMENT_METHOD_OPTIONS,
      },
      {
        key: 'customerId',
        label: 'מזהה לקוחה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'customer_id',
      },
      {
        key: 'orderId',
        label: 'מזהה הזמנה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'order_id',
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['customer_name', 'supplier', 'product', 'notes'],
        placeholder: 'לקוחה/ספק/מוצר/הערות',
      },
    ],
  },
  dress_history: {
    table: 'dress_history',
    label: 'היסטוריית שמלות',
    description: 'אירועי השכרה/תפירה/מכירה ברמת שמלה',
    orderBy: 'event_date DESC, created_at DESC, id DESC',
    filters: [
      ...createDateFilters('event_date', 'תאריך אירוע מתאריך', 'תאריך אירוע עד תאריך'),
      {
        key: 'rentalType',
        label: 'סוג אירוע',
        inputType: 'select',
        queryType: 'in',
        column: 'rental_type',
        options: RENTAL_TYPE_OPTIONS,
      },
      {
        key: 'customerId',
        label: 'מזהה לקוחה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'customer_id',
      },
      {
        key: 'dressId',
        label: 'מזהה שמלה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'dress_id',
      },
      {
        key: 'orderId',
        label: 'מזהה הזמנה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'order_id',
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['wearer_name', 'customer_name', 'notes'],
        placeholder: 'שם לובשת/לקוחה או הערה',
      },
    ],
  },
  agreements: {
    table: 'agreements',
    label: 'הסכמי השכרה',
    description: 'רשומות חתימה על הסכמי השכרה',
    orderBy: 'agreed_at DESC, id DESC',
    filters: [
      ...createDateFilters('agreed_at', 'תאריך חתימה מתאריך', 'תאריך חתימה עד תאריך'),
      {
        key: 'customerId',
        label: 'מזהה לקוחה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'customer_id',
      },
      {
        key: 'orderId',
        label: 'מזהה הזמנה',
        inputType: 'number',
        queryType: 'equals_number',
        column: 'order_id',
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['customer_name', 'customer_phone', 'customer_email'],
        placeholder: 'שם/טלפון/אימייל',
      },
    ],
  },
  settings: {
    table: 'settings',
    label: 'הגדרות מערכת',
    description: 'מפתחות וערכי קונפיגורציה',
    orderBy: 'updated_at DESC, id DESC',
    filters: [
      ...createDateFilters('updated_at', 'עודכן מתאריך', 'עודכן עד תאריך'),
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['key', 'value', 'description'],
        placeholder: 'מפתח או תיאור',
      },
    ],
  },
  users: {
    table: 'users',
    label: 'משתמשות מערכת',
    description: 'משתמשים, תפקידים וסטטוס חשבון',
    orderBy: 'created_at DESC, id DESC',
    filters: [
      ...createDateFilters('created_at', 'נוצר מתאריך', 'נוצר עד תאריך'),
      {
        key: 'userRole',
        label: 'תפקיד',
        inputType: 'select',
        queryType: 'in',
        column: 'role',
        options: USER_ROLE_OPTIONS,
      },
      {
        key: 'userIsActive',
        label: 'סטטוס משתמשת',
        inputType: 'select',
        queryType: 'equals_number',
        column: 'is_active',
        options: ACTIVE_OPTIONS,
      },
      {
        key: 'search',
        label: 'חיפוש חופשי',
        inputType: 'text',
        queryType: 'search_any',
        columns: ['name', 'email'],
        placeholder: 'שם או אימייל',
      },
    ],
  },
};

function getQueryValue(query, key) {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value;
}

function splitValues(rawValue) {
  return String(rawValue)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeText(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return '';
  }
  return String(rawValue).trim();
}

function parseInteger(rawValue, label) {
  const parsed = Number.parseInt(String(rawValue), 10);
  if (Number.isNaN(parsed)) {
    throw new ApiError(400, `ערך מספרי לא תקין עבור ${label}`);
  }
  return parsed;
}

function parseDate(rawValue, label) {
  const value = normalizeText(rawValue);
  if (!value) {
    return null;
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    throw new ApiError(400, `תאריך לא תקין עבור ${label}. נדרש פורמט YYYY-MM-DD`);
  }

  return value;
}

function parseBoolean(rawValue, label) {
  const value = normalizeText(rawValue).toLowerCase();
  if (!value) {
    return null;
  }

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  throw new ApiError(400, `ערך בוליאני לא תקין עבור ${label}`);
}

function validateAllowedValues(filter, values) {
  if (!filter.options || filter.options.length === 0) {
    return;
  }

  const allowed = new Set(filter.options.map((option) => option.value));
  for (const value of values.map(String)) {
    if (!allowed.has(value)) {
      throw new ApiError(400, `ערך מסנן לא תקין עבור ${filter.label}`);
    }
  }
}

function applyFilter(filter, rawValue, whereClauses, params) {
  const value = normalizeText(rawValue);
  if (!value && filter.queryType !== 'not_null_when_true') {
    return;
  }

  switch (filter.queryType) {
    case 'date_from': {
      const normalizedDate = parseDate(value, filter.label);
      if (!normalizedDate) return;
      whereClauses.push(`date(${filter.column}) >= date(?)`);
      params.push(normalizedDate);
      return;
    }
    case 'date_to': {
      const normalizedDate = parseDate(value, filter.label);
      if (!normalizedDate) return;
      whereClauses.push(`date(${filter.column}) <= date(?)`);
      params.push(normalizedDate);
      return;
    }
    case 'equals_number': {
      const parsed = parseInteger(value, filter.label);
      validateAllowedValues(filter, [parsed]);
      whereClauses.push(`${filter.column} = ?`);
      params.push(parsed);
      return;
    }
    case 'in': {
      const values = splitValues(value);
      if (values.length === 0) return;
      validateAllowedValues(filter, values);
      const placeholders = values.map(() => '?').join(', ');
      whereClauses.push(`${filter.column} IN (${placeholders})`);
      params.push(...values);
      return;
    }
    case 'contains': {
      whereClauses.push(`${filter.column} LIKE ?`);
      params.push(`%${value}%`);
      return;
    }
    case 'search_any': {
      const columns = filter.columns || [];
      if (columns.length === 0) {
        return;
      }
      const pattern = `%${value}%`;
      const sql = columns.map((column) => `${column} LIKE ?`).join(' OR ');
      whereClauses.push(`(${sql})`);
      params.push(...columns.map(() => pattern));
      return;
    }
    case 'not_null_when_true': {
      const parsed = parseBoolean(rawValue, filter.label);
      if (parsed === true) {
        whereClauses.push(`${filter.column} IS NOT NULL`);
      }
      return;
    }
    default:
      return;
  }
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function rowsToCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(',')).join('\n');
  return `\uFEFF${header}${body ? `\n${body}` : ''}`;
}

function buildDatasetMeta(datasetKey, config) {
  const totalRows = get(`SELECT COUNT(*) as count FROM ${config.table}`)?.count || 0;
  return {
    id: datasetKey,
    label: config.label,
    description: config.description,
    totalRows,
    filters: config.filters.map((filter) => ({
      key: filter.key,
      label: filter.label,
      inputType: filter.inputType,
      placeholder: filter.placeholder || null,
      options: filter.options || [],
    })),
  };
}

/**
 * GET /api/export/datasets
 * Return exportable datasets with recommended filters.
 */
router.get('/datasets', (req, res, next) => {
  try {
    const datasets = Object.entries(DATASET_CONFIG).map(([datasetKey, config]) =>
      buildDatasetMeta(datasetKey, config)
    );

    res.json({
      success: true,
      data: {
        datasets,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/export/csv
 * Export a single dataset to CSV.
 */
router.get('/csv', (req, res, next) => {
  try {
    const datasetKey = normalizeText(getQueryValue(req.query, 'dataset'));
    if (!datasetKey) {
      throw new ApiError(400, 'חובה לבחור dataset לייצוא');
    }

    const config = DATASET_CONFIG[datasetKey];
    if (!config) {
      throw new ApiError(400, 'dataset לא תקין לייצוא');
    }

    const whereClauses = [];
    const params = [];

    for (const filter of config.filters) {
      const rawValue = getQueryValue(req.query, filter.key);
      applyFilter(filter, rawValue, whereClauses, params);
    }

    let sql = `SELECT * FROM ${config.table}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    sql += ` ORDER BY ${config.orderBy}`;

    const rows = all(sql, params);
    const columns = all(`PRAGMA table_info(${config.table})`).map((column) => column.name);
    if (columns.length === 0) {
      throw new ApiError(500, `לא נמצאו עמודות לטבלה ${config.table}`);
    }

    const csvContent = rowsToCsv(rows, columns);
    const datePart = new Date().toISOString().slice(0, 10);
    const fileName = `${datasetKey}-${datePart}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

export default router;
