/**
 * Utility Functions
 * 
 * Purpose: Common utility functions used across the frontend application.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolves a file URL relative to the backend API base URL
 */
export function resolveFileUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith("/")) return null;

  // Prioritize explicit backend URL from environment variables (crucial for Vercel)
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (backendUrl) {
    const cleanedUrl = backendUrl.replace(/\/+$/, "");
    return `${cleanedUrl}${pathOrUrl}`;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api";
  if (/^https?:\/\//i.test(apiBase)) {
    const backendOrigin = apiBase.replace(/\/api\/?$/, "");
    return `${backendOrigin}${pathOrUrl}`;
  }

  return pathOrUrl;
}


/**
 * Format a number as Israeli Shekel currency
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '₪0';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date in Hebrew format
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a date in short format (DD/MM/YYYY)
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('he-IL');
}

/**
 * Format a date as YYYY-MM-DD for input fields
 */
export function formatDateInput(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time in HH:MM format
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format date and time together
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${formatDateShort(d)} ${formatTime(d)}`;
}

/**
 * Get Hebrew day name
 */
export function getHebrewDayName(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('he-IL', { weekday: 'long' });
}

/**
 * Get relative time description (e.g., "היום", "מחר", "בעוד 3 ימים")
 */
export function getRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(d);
  targetDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'היום';
  if (diffDays === 1) return 'מחר';
  if (diffDays === -1) return 'אתמול';
  if (diffDays > 1 && diffDays <= 7) return `בעוד ${diffDays} ימים`;
  if (diffDays < -1 && diffDays >= -7) return `לפני ${Math.abs(diffDays)} ימים`;

  return formatDateShort(d);
}

/**
 * Status labels in Hebrew
 */
export const statusLabels: Record<string, string> = {
  // Order DB statuses (stored values — kept as fallback)
  active: 'פעילה',
  cancelled: 'בוטלה',

  // Computed order display statuses (derived from event_date + balance in the UI)
  open: 'פתוחה',
  completed: 'הושלמה',

  // Dress statuses
  available: 'פנויה',
  sold: 'נמכרה',
  retired: 'הוצאה מהמלאי',
  custom_sewing: 'תפירה אישית',

  // Appointment statuses
  scheduled: 'מתוזמן',
  no_show: 'לא הגיע',
};

/**
 * Get Hebrew label for status
 */
export function getStatusLabel(status: string): string {
  return statusLabels[status] || status;
}

/**
 * Get status color class
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Computed order display statuses
    open: 'badge-info',
    completed: 'badge-success',
    // Raw DB order statuses (fallback — active shown neutral, cancelled red)
    active: 'badge-success',
    cancelled: 'badge-error',
    // Dress statuses
    available: 'badge-success',
    sold: 'badge-default',
    retired: 'badge-default',
    custom_sewing: 'badge-default',
    // Appointment statuses
    scheduled: 'badge-info',
    no_show: 'badge-error',
  };
  return colors[status] || 'badge-default';
}

/**
 * Compute the user-facing order display status from raw order data.
 *
 * DB stores only 'active' | 'cancelled'.  The UI presents 'active' orders as
 * either 'open' (פתוחה) or 'completed' (הושלמה) based on two conditions:
 *   - completed = event_date has passed (or is today) AND balance = 0
 *   - open      = everything else that is not cancelled
 *
 * A credit balance (paid > total) is intentionally treated as open because
 * the balance is not zero.
 */
export function computeOrderDisplayStatus(order: {
  status: string;
  event_date?: string | null;
  total_price: number;
  paid_amount: number;
  total_customer_charge?: number | null;
}): 'open' | 'completed' | 'cancelled' {
  if (order.status === 'cancelled') return 'cancelled';

  const total = (order.total_price || 0) + (order.total_customer_charge ?? 0);
  const balance = total - (order.paid_amount || 0);
  const isBalanceZero = balance === 0;

  let eventDatePassed = false;
  if (order.event_date) {
    // Compare date strings (YYYY-MM-DD) directly — avoids timezone issues.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    // event_date may contain a time component; take only the date part.
    const eventDateStr = order.event_date.slice(0, 10);
    eventDatePassed = eventDateStr <= todayStr;
  }

  if (isBalanceZero && eventDatePassed) return 'completed';
  return 'open';
}

/**
 * Category labels in Hebrew
 */
export const categoryLabels: Record<string, string> = {
  // Income categories
  order: 'הזמנה',
  repair: 'תיקונים',
  other: 'אחר',

  // Expense categories
  materials: 'חומרים',
  overhead: 'תקורה',
  tax: 'מיסוי',
  equipment: 'ציוד',
  salary: 'משכורות',
};

/**
 * Get Hebrew label for category
 */
export function getCategoryLabel(category: string): string {
  return categoryLabels[category] || category;
}

/**
 * Payment method labels
 */
export const paymentMethodLabels: Record<string, string> = {
  cash: 'מזומן',
  credit: 'אשראי',
  bit: 'ביט',
  paybox: 'פייבוקס',
  transfer: 'העברה בנקאית',
  check: 'צ\'ק',
};

/**
 * Get Hebrew label for payment method
 */
export function getPaymentMethodLabel(method: string): string {
  return paymentMethodLabels[method] || method;
}

/**
 * Clean and format phone number for display
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '-';
  const raw = phone.trim();
  const compact = raw.replace(/[\s\-().]/g, '');

  if (compact.startsWith('+972')) {
    const local = compact.slice(4).replace(/\D/g, '');
    if (!local) return raw;
    return local.startsWith('0') ? local : `0${local}`;
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
 * Normalize phone in input fields (immediate UI normalization).
 */
export function normalizePhoneInput(phone: string | null | undefined): string {
  if (!phone) return "";
  const raw = phone.trim();
  if (!raw) return "";

  const compact = raw.replace(/[\s\-().]/g, "");
  if (compact.startsWith("+972")) {
    const local = compact.slice(4).replace(/\D/g, "");
    if (!local) return "";
    return local.startsWith("0") ? local : `0${local}`;
  }
  if (compact.startsWith("+")) {
    return `+${compact.slice(1).replace(/\D/g, "")}`;
  }

  const digits = compact.replace(/\D/g, "");
  if (digits.startsWith("972")) {
    const local = digits.slice(3);
    return local ? (local.startsWith("0") ? local : `0${local}`) : digits;
  }
  return digits || raw;
}

/**
 * Create WhatsApp link
 */
export function createWhatsAppLink(phone: string, message?: string): string {
  let cleanPhone = phone.replace(/\D/g, '');
  // Convert Israeli format to international
  if (cleanPhone.startsWith('05')) {
    cleanPhone = '972' + cleanPhone.slice(1);
  }
  const url = `https://wa.me/${cleanPhone}`;
  if (message) {
    return `${url}?text=${encodeURIComponent(message)}`;
  }
  return url;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
