/**
 * Date-range plumbing for the admin dashboard V2 metrics endpoint. The
 * client sends any number of named, inclusive IST calendar-day ranges
 * ({ key, from, to } as YYYY-MM-DD) — one per period it wants to show
 * (the selected period, the one it's compared against, one per chart
 * month...) — and gets the same metrics back for each.
 *
 * Kept free of DB access so it can be unit-tested on its own.
 */

import * as Error from "../errors/ErrorConstant.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGES = 40;
const MAX_KEY_LENGTH = 40;

/** "YYYY-MM-DD" + n days -> "YYYY-MM-DD" (pure calendar math, no TZ drift). */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return next.toISOString().slice(0, 10);
}

/** Real calendar date? (rejects 2026-02-30 etc., which Date would roll over) */
function isValidDate(dateStr) {
  return DATE_RE.test(dateStr) && addDays(dateStr, 0) === dateStr;
}

/**
 * Validates the request's ranges and resolves each one against the
 * dashboard's go-live cutoff (AdminSettings.dashboard_data_start_date).
 *
 * Returns, per range:
 *   key, from, to        — as requested
 *   end                  — day after `to`, for half-open DATETIME comparisons
 *   dataFrom             — `from` clamped up to the cutoff; appointment/store
 *                          metrics only count activity from here
 *   beforeDataStart      — the whole range is before the cutoff, so its
 *                          appointment/store metrics are meaningless (null)
 */
function resolveRanges(ranges, cutoff = null) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw Error.BadRequest("ranges must be a non-empty array");
  }
  if (ranges.length > MAX_RANGES) {
    throw Error.BadRequest(`ranges can have at most ${MAX_RANGES} entries`);
  }

  const seen = new Set();
  return ranges.map((range) => {
    const key = String(range?.key ?? "").trim();
    const from = String(range?.from ?? "").trim();
    const to = String(range?.to ?? "").trim();

    if (!key || key.length > MAX_KEY_LENGTH) {
      throw Error.BadRequest(`each range needs a key of 1-${MAX_KEY_LENGTH} characters`);
    }
    if (seen.has(key)) {
      throw Error.BadRequest(`duplicate range key: ${key}`);
    }
    seen.add(key);
    if (!isValidDate(from) || !isValidDate(to)) {
      throw Error.BadRequest(`range ${key}: from and to must be YYYY-MM-DD`);
    }
    if (from > to) {
      throw Error.BadRequest(`range ${key}: from must not be after to`);
    }

    const beforeDataStart = Boolean(cutoff) && to < cutoff;
    const dataFrom = cutoff && from < cutoff ? cutoff : from;

    return {
      key,
      from,
      to,
      end: addDays(to, 1),
      dataFrom,
      beforeDataStart,
    };
  });
}

/**
 * Builds a derived table of the ranges for use as `FROM (<sql>) r`, with
 * columns k, f (dataFrom), fr (raw from), e (end, exclusive) and d (to,
 * inclusive DATE). Values go through replacements, never string-built.
 */
function rangesTableSql(resolved) {
  const replacements = {};
  const rows = resolved.map((r, i) => {
    replacements[`rk${i}`] = r.key;
    // A range entirely before the cutoff gets an empty window (f = e) so
    // appointment/store aggregates come back as zero rows, not stale data.
    replacements[`rf${i}`] = r.beforeDataStart ? r.end : r.dataFrom;
    replacements[`rr${i}`] = r.from;
    replacements[`re${i}`] = r.end;
    replacements[`rd${i}`] = r.to;
    return `SELECT CAST(:rk${i} AS CHAR(${MAX_KEY_LENGTH})) AS k,
      CAST(:rf${i} AS DATETIME) AS f,
      CAST(:rr${i} AS DATETIME) AS fr,
      CAST(:re${i} AS DATETIME) AS e,
      CAST(:rd${i} AS DATE) AS d`;
  });
  return { sql: rows.join("\nUNION ALL\n"), replacements };
}

export { addDays, isValidDate, resolveRanges, rangesTableSql, MAX_RANGES };
