/**
 * Israel Date Utility
 *
 * Purpose: Give the backend business dates in Israel time. The VPS runs in UTC, so
 * `new Date().toISOString()` or SQLite `date('now')` return the UTC day, which is the
 * PREVIOUS Israeli day between 00:00 and 02:00 (winter) / 03:00 (summer). Anything the
 * business sees as a date (transaction dates, file names, "today" in queries) must use
 * these helpers instead.
 *
 * Operation: Intl.DateTimeFormat with timeZone 'Asia/Jerusalem'. The time-zone database
 * behind it knows Israel's daylight saving rules, so the summer/winter clock changes are
 * handled automatically; no fixed +02:00 / +03:00 offset is ever assumed.
 */

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const isoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISRAEL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ISRAEL_TIME_ZONE, timeZoneName: 'longOffset',
});

/** The Israeli calendar date of a moment, as YYYY-MM-DD. */
export function israelDateIso(date = new Date()) {
  return isoDateFormat.format(date);
}

/** Today's date in Israel, as YYYY-MM-DD. */
export function israelTodayIso() {
  return israelDateIso(new Date());
}

/** Israel's UTC offset in minutes at a given moment (180 in summer, 120 in winter). */
export function israelOffsetMinutes(date = new Date()) {
  const name = offsetFormat.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || '';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0; // "GMT" alone = offset 0
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -minutes : minutes;
}

/**
 * The last moment (23:59:59.999 Israel time) of an Israeli calendar day given as YYYY-MM-DD.
 * Returns null for an invalid date string.
 */
export function israelEndOfDay(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  if (!m) return null;
  const wallClockAsUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  // Convert the Israeli wall-clock time to UTC; re-check the offset at the result in case
  // the day is a daylight-saving change day.
  const firstOffset = israelOffsetMinutes(new Date(wallClockAsUtc));
  let utc = wallClockAsUtc - firstOffset * 60000;
  const secondOffset = israelOffsetMinutes(new Date(utc));
  if (secondOffset !== firstOffset) utc = wallClockAsUtc - secondOffset * 60000;
  return new Date(utc);
}
