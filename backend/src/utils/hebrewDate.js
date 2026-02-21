/**
 * Hebrew Date Utility
 * 
 * Purpose: Convert Gregorian dates to Hebrew (Jewish) calendar dates.
 * Uses the built-in Intl.DateTimeFormat with Hebrew calendar support.
 * 
 * Operation: Formats dates using the Hebrew calendar locale.
 */

/**
 * Hebrew month names
 */
const HEBREW_MONTHS = [
  'תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר',
  'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול'
];

// Adar II for leap years
const ADAR_II = 'אדר ב׳';
const ADAR_I = 'אדר א׳';

/**
 * Hebrew number representation for days (1-30)
 */
const HEBREW_DAYS = [
  '', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳',
  'י״א', 'י״ב', 'י״ג', 'י״ד', 'ט״ו', 'ט״ז', 'י״ז', 'י״ח', 'י״ט', 'כ׳',
  'כ״א', 'כ״ב', 'כ״ג', 'כ״ד', 'כ״ה', 'כ״ו', 'כ״ז', 'כ״ח', 'כ״ט', 'ל׳'
];

/**
 * Get Hebrew date from a JavaScript Date or date string
 * @param {Date|string} date - The date to convert
 * @param {boolean} includeYear - Whether to include the year (default: false)
 * @returns {string} - Hebrew date string (e.g., "כ״ה בכסלו" or "כ״ה בכסלו תשפ״ו")
 */
export function getHebrewDate(date, includeYear = false) {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      console.error('Invalid date provided to getHebrewDate');
      return '';
    }
    
    // Use Intl.DateTimeFormat with Hebrew calendar
    const hebrewFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: includeYear ? 'numeric' : undefined,
      calendar: 'hebrew',
    });
    
    const parts = hebrewFormatter.formatToParts(dateObj);
    
    let day = '';
    let month = '';
    let year = '';
    
    for (const part of parts) {
      if (part.type === 'day') {
        const dayNum = parseInt(part.value, 10);
        day = HEBREW_DAYS[dayNum] || part.value;
      } else if (part.type === 'month') {
        month = part.value;
      } else if (part.type === 'year') {
        year = part.value;
      }
    }
    
    // Format: "כ״ה בכסלו" or "כ״ה בכסלו תשפ״ו"
    let result = `${day} ב${month}`;
    if (includeYear && year) {
      result += ` ${year}`;
    }
    
    return result;
    
  } catch (error) {
    console.error('Error converting to Hebrew date:', error.message);
    return '';
  }
}

/**
 * Get Hebrew date in short format (day and month only, no prefix)
 * @param {Date|string} date - The date to convert
 * @returns {string} - Short Hebrew date (e.g., "כ״ה כסלו")
 */
export function getHebrewDateShort(date) {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    const hebrewFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      calendar: 'hebrew',
    });
    
    const parts = hebrewFormatter.formatToParts(dateObj);
    
    let day = '';
    let month = '';
    
    for (const part of parts) {
      if (part.type === 'day') {
        const dayNum = parseInt(part.value, 10);
        day = HEBREW_DAYS[dayNum] || part.value;
      } else if (part.type === 'month') {
        month = part.value;
      }
    }
    
    return `${day} ${month}`;
    
  } catch (error) {
    console.error('Error converting to Hebrew date:', error.message);
    return '';
  }
}

/**
 * Get full Hebrew date with weekday
 * @param {Date|string} date - The date to convert  
 * @returns {string} - Full Hebrew date (e.g., "יום רביעי, כ״ה בכסלו תשפ״ו")
 */
export function getFullHebrewDate(date) {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    // Get Hebrew weekday
    const weekdayFormatter = new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
    });
    const weekday = weekdayFormatter.format(dateObj);
    
    // Get Hebrew date
    const hebrewDate = getHebrewDate(dateObj, true);
    
    return `${weekday}, ${hebrewDate}`;
    
  } catch (error) {
    console.error('Error converting to full Hebrew date:', error.message);
    return '';
  }
}

export default {
  getHebrewDate,
  getHebrewDateShort,
  getFullHebrewDate,
};
