/**
 * Phone normalization utilities.
 *
 * Rules:
 * - Remove spaces/separators.
 * - Convert +972 / 972 prefix to local 0 prefix.
 * - Keep other international prefixes (with +) and strip separators.
 */

export function normalizePhoneNumber(value) {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const compact = raw.replace(/[\s\-().]/g, '');
  if (!compact) return null;

  if (compact.startsWith('+')) {
    const plusDigits = `+${compact.slice(1).replace(/\D/g, '')}`;
    if (plusDigits.startsWith('+972')) {
      const local = plusDigits.slice(4);
      return local ? (local.startsWith('0') ? local : `0${local}`) : null;
    }
    return plusDigits;
  }

  const digitsOnly = compact.replace(/\D/g, '');
  if (!digitsOnly) return null;

  if (digitsOnly.startsWith('972')) {
    const local = digitsOnly.slice(3);
    return local ? (local.startsWith('0') ? local : `0${local}`) : digitsOnly;
  }

  return digitsOnly;
}
