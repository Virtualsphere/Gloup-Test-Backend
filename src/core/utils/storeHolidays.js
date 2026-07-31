/**
 * Shared helpers for one-off + recurring weekly store holidays.
 * Weekday uses JS convention: 0=Sunday … 6=Saturday.
 */

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toDateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim().slice(0, 10);
  return DATE_ONLY_RE.test(s) ? s : null;
}

export function assertDateOnly(value, fieldName = "date") {
  const d = toDateOnly(value);
  if (!d) {
    const err = new Error(`${fieldName} must be YYYY-MM-DD`);
    err.status = 400;
    throw err;
  }
  return d;
}

/** Inclusive calendar-day span; rejects inverted / oversized ranges. */
export function assertDateRange(from, to, { maxDays = 400 } = {}) {
  const fromD = assertDateOnly(from, "from");
  const toD = assertDateOnly(to, "to");
  if (fromD > toD) {
    const err = new Error("from must be on or before to");
    err.status = 400;
    throw err;
  }
  const [fy, fm, fd] = fromD.split("-").map(Number);
  const [ty, tm, td] = toD.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  const days =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (days > maxDays) {
    const err = new Error(`Date range cannot exceed ${maxDays} days`);
    err.status = 400;
    throw err;
  }
  return { from: fromD, to: toD, days };
}

/** Trim + length-cap optional holiday reason. */
export function normalizeReason(reason, { maxLength = 500 } = {}) {
  if (reason == null) return null;
  const s = String(reason).trim();
  if (!s) return null;
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/**
 * Accept 0-6, "0"-"6", or weekday name (case-insensitive).
 */
export function normalizeWeekday(input) {
  if (input === null || input === undefined || input === "") {
    return null;
  }
  if (typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 6) {
    return input;
  }
  const s = String(input).trim();
  if (/^[0-6]$/.test(s)) return parseInt(s, 10);
  const idx = WEEKDAY_NAMES.findIndex(
    (n) => n.toLowerCase() === s.toLowerCase()
  );
  return idx >= 0 ? idx : null;
}

export function assertWeekday(input) {
  const w = normalizeWeekday(input);
  if (w === null) {
    const err = new Error(
      "weekday must be 0-6 or Sunday…Saturday (0=Sunday)"
    );
    err.status = 400;
    throw err;
  }
  return w;
}

export function weekdayName(weekday) {
  return WEEKDAY_NAMES[weekday] || null;
}

/** JS getDay() for a YYYY-MM-DD string (local parse). */
export function weekdayOfDateOnly(dateOnly) {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Expand weekly weekday rules into concrete dates in [from, to] inclusive.
 */
export function expandWeeklyDates(weekdays, from, to) {
  const fromD = toDateOnly(from);
  const toD = toDateOnly(to);
  if (!fromD || !toD) return [];
  const set = new Set(
    (weekdays || [])
      .map((w) => normalizeWeekday(w?.weekday ?? w))
      .filter((w) => w !== null)
  );
  if (set.size === 0) return [];

  const out = [];
  const [fy, fm, fd] = fromD.split("-").map(Number);
  const [ty, tm, td] = toD.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    if (set.has(cur.getDay())) {
      out.push(toDateOnly(cur));
    }
  }
  return out;
}

/**
 * Merge one-off holiday rows + weekly expansions into sorted unique dates.
 */
export function mergeClosedDates(oneOffRows, weeklyRows, from, to) {
  const dates = new Set();
  for (const row of oneOffRows || []) {
    const d = toDateOnly(row.holiday_date || row.date);
    if (d) dates.add(d);
  }
  for (const d of expandWeeklyDates(weeklyRows || [], from, to)) {
    dates.add(d);
  }
  return [...dates].sort();
}

export function findClosureReason(oneOff, weekly, dateOnly) {
  if (oneOff?.reason) return { type: "one_off", reason: oneOff.reason };
  if (oneOff) return { type: "one_off", reason: null };
  const wd = weekdayOfDateOnly(dateOnly);
  const rule = (weekly || []).find(
    (w) => normalizeWeekday(w.weekday ?? w) === wd
  );
  if (rule) {
    return {
      type: "weekly",
      reason: rule.reason || null,
      weekday: wd,
      weekday_name: weekdayName(wd),
    };
  }
  return null;
}
