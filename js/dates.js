// Date helpers. Dates are stored as local 'YYYY-MM-DD' strings; weeks start on Monday.
const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function weekStart(iso) {
  const d = fromISO(iso);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return toISO(d);
}

export function weekDays(startIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

export function isValidISO(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && toISO(fromISO(iso)) === iso;
}

export const fmt = (iso, opts) => fromISO(iso).toLocaleDateString(undefined, opts);
export const weekdayShort = (iso) => fmt(iso, { weekday: 'short' });
export const weekdayLong = (iso) => fmt(iso, { weekday: 'long' });
export const dayMonth = (iso) => fmt(iso, { day: 'numeric', month: 'short' });
export const fullDate = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
