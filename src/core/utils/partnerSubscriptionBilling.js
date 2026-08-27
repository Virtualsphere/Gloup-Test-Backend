/**
 * Manual partner subscription billing — a flat monthly fee an admin assigns
 * to a partner (after their first 15 free bookings), deducted from their
 * daily invoice payout until fully recovered. Entirely separate from the
 * Razorpay-driven PartnerSubscriptions system.
 *
 * Billing is a fixed monthly schedule anchored to the original activation
 * date (e.g. activated on the 5th -> due the 5th of every month after),
 * not reset by how long debt recovery took. If recovery drags past a due
 * date, another full cycle's fee stacks on top of whatever is still owed.
 */

import { toIstDatePart } from "../schema/formats.js";

const GST_RATE = 18; // fixed, matches "+18% GST" everywhere this is used

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

/** "YYYY-MM-DD" + 1 calendar month -> "YYYY-MM-DD", clamped to a valid day. */
function addOneMonth(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  // JS Date overflow handles day-clamping (e.g. Jan 31 -> Feb 28/29) when
  // constructed with month+1 and the same day-of-month, using UTC to avoid
  // any local-timezone date-shifting on the pure YYYY-MM-DD math.
  const next = new Date(Date.UTC(y, m, d)); // m is already 1-based -> +1 month
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pure function: given a PartnerManualSubscriptions row and "today"
 * (YYYY-MM-DD), returns what's currently owed — accruing one full cycle's
 * fee for every fixed due date that has passed — WITHOUT mutating
 * anything. Used both for read-only preview and as the first step of the
 * write-time commit in markInvoicePayout.
 */
function accrueDue(sub, todayStr) {
  let due = Number(sub.outstanding_due) || 0;
  let nextDue = toDateStr(sub.next_due_date);
  const fee = cycleFee(sub.plan_amount);

  while (nextDue <= todayStr) {
    due = Number((due + fee).toFixed(2));
    nextDue = addOneMonth(nextDue);
  }

  return { due, nextDue };
}

export { GST_RATE, cycleFee, addOneMonth, accrueDue };
