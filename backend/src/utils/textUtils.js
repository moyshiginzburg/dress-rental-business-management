/**
 * Text Utilities
 *
 * Purpose: Keep names and free text consistent in the database and make searches
 * tolerant to spacing and punctuation differences.
 *
 * Operation:
 *   - normalizeTextForSave(): trims the text and collapses any run of whitespace
 *     into one space before it is stored.
 *   - normalizeTextForSearch(): turns every run of characters that is not a Hebrew
 *     letter, an English letter or a digit into the SQL wildcard '%', and wraps the
 *     result in '%...%', for use with LIKE (e.g. "כהן - רחל" matches "כהן רחל").
 */

function normalizeTextForSave(text) {
  if (typeof text !== 'string') return text;
  return text.trim().replace(/\s+/g, ' ');
}

function normalizeTextForSearch(text) {
  if (typeof text !== 'string') return text;
  // Replace any sequence of non-alphanumeric characters (including spaces, punctuation, symbols)
  // excluding Hebrew letters, English letters, and numbers
  // with a wildcard string '%'
  const clean = text.replace(/[^A-Za-z0-9\u0590-\u05FF]+/g, '%');
  
  // Clean off trailing/leading '%' if any, but we will wrap the whole thing in '%' anyway
  const trimmed = clean.replace(/^%+/, '').replace(/%+$/, '');
  
  if (!trimmed) return '%';
  return `%${trimmed}%`;
}

export {
  normalizeTextForSave,
  normalizeTextForSearch
};
