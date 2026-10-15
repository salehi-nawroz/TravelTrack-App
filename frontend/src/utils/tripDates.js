// Trip dates are Postgres DATEs and stay "YYYY-MM-DD" strings end to end
// (they're also what <input type="date"> reads and writes), so no Date
// object ever goes through UTC and shifts a day. Dates are only built,
// with the local constructor, to format or to count days.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isIsoDate(value) {
  const match = ISO_DATE.exec(value ?? "");
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const todayIso = () => toIsoDate(new Date());

const FULL_DATE = { day: "numeric", month: "short", year: "numeric" };
const SHORT_DATE = { day: "numeric", month: "short" };

export function formatTripDate(value, options = FULL_DATE) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", options).format(parseIsoDate(value));
}

// "Mar 3 – 9, 2025", "Feb 28 – Mar 4, 2025", "Dec 30, 2024 – Jan 2, 2025"
// (the locale's own range format, which drops repeated parts), or
// "Since Mar 3, 2025" for a trip that hasn't ended.
export function formatTripRange(startDate, endDate) {
  if (!endDate) return `Since ${formatTripDate(startDate)}`;
  if (startDate === endDate) return formatTripDate(startDate);

  const format = new Intl.DateTimeFormat("en", FULL_DATE);
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return typeof format.formatRange === "function"
    ? format.formatRange(start, end)
    : `${format.format(start)} – ${format.format(end)}`;
}

// Arrival/departure of one stop, shorter when both are in the same year.
export function formatStayRange(startDate, endDate) {
  const options = startDate.slice(0, 4) === endDate.slice(0, 4) ? SHORT_DATE : FULL_DATE;
  const format = new Intl.DateTimeFormat("en", options);
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return typeof format.formatRange === "function"
    ? format.formatRange(start, end)
    : `${format.format(start)} – ${format.format(end)}`;
}

// Calendar days from start to end (or today, for an active trip), both
// included. Never less than 1.
export function tripLengthDays(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate ?? todayIso());
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

// ISO strings of the same format compare correctly as plain strings.
export const compareIsoDates = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
