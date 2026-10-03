/**
 * Manual partner subscription billing — a flat monthly fee an admin assigns
 * to a partner once they've used their free bookings (AdminSettings.
 * free_booking_limit, default 15), deducted from their daily invoice payout
 * until fully recovered. Entirely separate from the
 * Razorpay-driven PartnerSubscriptions system.
 *
 * Billing is a fixed monthly schedule anchored to the original activation
 * date (e.g. activated on the 5th -> due the 5th of every month after),
 * not reset by how long debt recovery took. If recovery drags past a due
 * date, another full cycle's fee stacks on top of whatever is still owed.
 */

import { toIstDatePart } from "../schema/formats.js";

const GST_RATE = 18; // fixed, matches "+18% GST" everywhere this is used

// Free paid bookings before a partner needs a subscription. The live value
// is AdminSettings.free_booking_limit (admin-editable); this is only the
// fallback when that row/column doesn't exist yet.
const DEFAULT_FREE_BOOKING_LIMIT = 15;
const MAX_FREE_BOOKING_LIMIT = 100000;

/**
 * Raw `connection.query()` results return MySQL DATE columns as native JS
 * Date objects (not strings) unless the driver is configured otherwise —
 * this codebase isn't. Normalize defensively so accrueDue's string-based
 * comparisons/math never see anything but "YYYY-MM-DD".
 */
function toDateStr(value) {
  if (typeof value === "string") return value.slice(0, 10);
  return toIstDatePart(value);
}

/** Base plan amount -> full amount owed for one billing cycle, incl. GST. */
function cycleFee(planAmount) {
  return Number((Number(planAmount) * (1 + GST_RATE / 100)).toFixed(2));
}

/**
 * "YYYY-MM-DD" + 1 calendar month -> "YYYY-MM-DD". The day is `anchorDay`
 * (the subscription's activation day; defaults to dateStr's own day),
 * clamped to the last day of a shorter month: anchor 31 gives Jan 31 ->
 * Feb 28 -> Mar 31 -> Apr 30, never skipping a month or drifting.
 *
 * (Until 2026-10 this used Date.UTC(y, m, d) overflow, which rolled Jan 31
 * over to Mar 3 - skipping February's fee and moving the salon to the 3rd
 * for good. Rows already moved that way snap back to their anchor day at
 * their next due date; no cycle is charged twice.)
 */
function addOneMonth(dateStr, anchorDay) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  // Day 0 of the month after `month` = last day of `month` (UTC, no TZ drift).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(anchorDay || d, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Day of month due dates are anchored to: the activation day, if known. */
function anchorDayOf(sub) {
  const activated = sub.activated_at ? toDateStr(sub.activated_at) : null;
  return activated ? Number(activated.slice(8, 10)) : null;
}

/**
 * Pure function: given a PartnerManualSubscriptions row and "today"
 * (YYYY-MM-DD), returns what's currently owed — accruing one full cycle's
 * fee for every fixed due date that has passed — WITHOUT mutating
 * anything. Used both for read-only preview and as the first step of the
 * write-time commit in markInvoicePayout. Pass activated_at on `sub` so due
 * dates stay on the activation day (see addOneMonth).
 */
function accrueDue(sub, todayStr) {
  let due = Number(sub.outstanding_due) || 0;
  let nextDue = toDateStr(sub.next_due_date);
  const fee = cycleFee(sub.plan_amount);
  const anchorDay = anchorDayOf(sub);

  while (nextDue <= todayStr) {
    due = Number((due + fee).toFixed(2));
    nextDue = addOneMonth(nextDue, anchorDay);
  }

  return { due, nextDue };
}

export { GST_RATE, DEFAULT_FREE_BOOKING_LIMIT, MAX_FREE_BOOKING_LIMIT, cycleFee, addOneMonth, accrueDue };
