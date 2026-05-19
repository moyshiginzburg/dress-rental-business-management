/**
 * Agreement Terms Constants
 *
 * Purpose: Central source-of-truth for all agreement terms displayed in:
 *   - The public agreement signing page (frontend)
 *   - The generated agreement PDF
 *   - The /api/agreements/content/terms API endpoint
 *
 * Operation: Two term sets exist — full rental terms (for orders that contain
 * at least one rental or sewing_for_rental item) and reduced non-rental terms
 * (for orders that only contain sewing or sale items). The helper functions
 * `hasRentalItems()` and `getTermsForOrder()` determine which set to use
 * based on the order's item types.
 *
 * Cancellation policy is identical for all order types.
 */

// ---------------------------------------------------------------------------
// Full rental terms — shown when the order contains at least one
// item of type 'rental' or 'sewing_for_rental'.
// ---------------------------------------------------------------------------
export const AGREEMENT_TERMS = [
  'ביום ההזמנה תידרש מקדמה בשיעור 50% מסכום ההזמנה.',
  'יתרת הסכום תשולם ביום קבלת השמלה. השמלה לא תימסר ללקוחה ללא תשלום מלא.',
  'בעת השכרת שמלת ערב יבוצע פיקדון בגובה סכום ההשכרה באמצעות תפיסת מסגרת בכרטיס אשראי.',
  'המסגרת בכרטיס האשראי תשוחרר לאחר החזרה תקינה של השמלה במועד שנקבע.',
  'במקרה של נזק או גניבה, תחויב הלקוחה בעלות תיקון השמלה, אם ניתן לתקנה, בנוסף לדמי השכירות.',
  'אם השמלה אינה ניתנת לתיקון, תחויב הלקוחה בתשלום השווה לעלות תפירת שמלה דומה בהתאמה אישית.',
  'השמלה תימסר ללקוחה 2 ימי עסקים לפני תאריך האירוע, ותוחזר בתוך 2 ימי עסקים לאחר האירוע.',
  'על הלקוחה להחזיר את השמלה עם הקולב והכיסוי לאחר האירוע. אי החזרת הקולב או הכיסוי תגרור קנס בסך 50₪.',
  'איחור בהחזרת השמלה יגרור קנס בסך 200₪ עבור כל יום איחור.',
];

// ---------------------------------------------------------------------------
// Reduced non-rental terms — shown when all items in the order are
// 'sewing' (custom sewing) or 'sale' only, with no rental component.
// Clauses 3–6, 8–9 (deposit, return, damage, hanger, late fee) are omitted.
// Clause 7 is trimmed to delivery only (no return obligation).
// Wording adapted: "השכרה" → "הזמנה".
// ---------------------------------------------------------------------------
export const AGREEMENT_NON_RENTAL_TERMS = [
  'ביום ההזמנה תידרש מקדמה בשיעור 50% מסכום ההזמנה.',
  'יתרת הסכום תשולם ביום קבלת השמלה. השמלה לא תימסר ללקוחה ללא תשלום מלא.',
  'השמלה תימסר ללקוחה 2 ימי עסקים לפני תאריך האירוע.',
];

// ---------------------------------------------------------------------------
// Cancellation policy — applies to ALL order types equally.
// ---------------------------------------------------------------------------
export const AGREEMENT_CANCELLATION_POLICY = [
  'כל עוד לא התקבל אישור ההזמנה ולא שולמה מקדמה, ניתן לבטל את ההזמנה ללא עלות.',
  'לאחר אישור ההזמנה, ניתן לבטל בתוך 2 ימי עסקים, בתשלום של 25% מסכום ההזמנה (יוחזר חצי מסכום המקדמה).',
  'לאחר 2 ימי עסקים, לא ניתן לבטל את ההזמנה, והלקוחה תידרש לשלם את יתרת הסכום.',
  'לאחר מסירת השמלה ללקוחה, לא ניתן לבטל את ההזמנה או לבצע החזרה.',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RENTAL_ITEM_TYPES = ['rental', 'sewing_for_rental'];

/**
 * Check whether any order items involve rental (rental or sewing_for_rental).
 * Used to determine which agreement terms to display.
 *
 * Defaults to true (full rental terms) when no items are available, so the
 * strictest terms are shown if the order context is unknown.
 *
 * @param {Array} items - Array of order items with `item_type` or `itemType` field
 * @returns {boolean} True if at least one item is rental or sewing_for_rental
 */
export function hasRentalItems(items) {
  if (!Array.isArray(items) || items.length === 0) return true;
  return items.some((item) => {
    const type = String(item.item_type || item.itemType || '').trim().toLowerCase();
    return RENTAL_ITEM_TYPES.includes(type);
  });
}

/**
 * Get the appropriate agreement terms and heading based on order item types.
 *
 * @param {Array} items - Array of order items
 * @returns {{ terms: string[], heading: string, isRental: boolean }}
 */
export function getTermsForOrder(items) {
  const isRental = hasRentalItems(items);
  return {
    terms: isRental ? AGREEMENT_TERMS : AGREEMENT_NON_RENTAL_TERMS,
    heading: 'תנאים',
    isRental,
  };
}
