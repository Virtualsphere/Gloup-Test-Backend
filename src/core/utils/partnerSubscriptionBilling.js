/**
 * Manual partner subscription billing — a flat monthly fee an admin assigns
 * to a partner once they've used their free bookings (AdminSettings.
 * free_booking_limit, default 15), deducted from their daily invoice payout
 * until fully recovered. Entirely separate from the
 * Razorpay-driven PartnerSubscriptions system.
 *
 * Billing cycles (since 2026-10, see resolveCycle):
 *   collecting  a fee has been charged and is deducted from payouts until
 *               outstanding_due reaches 0. Assigning a plan charges the
 *               first fee straight away.
 *   waiting     the fee was fully paid on invoice day D (cycle_start_date).
 *               The salon gets renewal_booking_limit free bookings: the next
 *               fee is charged only once BOTH the renewal date (D + 1 month,
 *               stored in next_due_date) has arrived AND the salon has had
 *               more than that many counted bookings after D. It is charged
 *               from the first booking meeting both, and never stacks - a
 *               slow month is simply not charged.
 * Counted bookings: paid, not cancelled/refunded, by appointment day.
 *
 * (Before 2026-10 a fee accrued on the activation day of every month
 * whatever the bookings - accrueDue below, kept for that migration.)
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
 * LEGACY (monthly-date model, before booking cycles). Given a
 * PartnerManualSubscriptions row and "today" (YYYY-MM-DD), returns what was
 * owed under the old rule - one full cycle's fee for every fixed due date
 * that has passed. Only the booking-cycles migration still uses it, to carry
 * each salon's debt over into the new model.
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

const CYCLE_COLLECTING = "collecting";
const CYCLE_WAITING = "waiting";

const money = (v) => Number((Number(v) || 0).toFixed(2));
const dateOrNull = (value) => (value ? toDateStr(value) : null);

/**
 * Pure: where a subscription's billing cycle stands, WITHOUT mutating it.
 *
 * `bookings` (only read while waiting) are the salon's counted bookings
 * after cycle_start_date up to the day being looked at, ordered by
 * appointment day, slot start, id: [{ id, date: "YYYY-MM-DD" }].
 *
 * Returns { state, due, chargedOn, chargedFromId, newlyCharged, counted,
 * limit, renewalDate }:
 *   state         "collecting" once a fee is owed (incl. one charged just now)
 *   due           everything owed on that day
 *   chargedOn / chargedFromId
 *                 the day the fee was charged and the first booking it may
 *                 be taken from (null id = that whole day; null day = any day)
 *   newlyCharged  the waiting cycle's fee was charged by these bookings
 *   counted       counted bookings in the waiting cycle so far
 */
function resolveCycle(sub, bookings = []) {
  const outstanding = money(sub.outstanding_due);
  const limit = Math.max(0, Number(sub.renewal_booking_limit) || 0);
  const renewalDate = dateOrNull(sub.next_due_date);

  if (sub.cycle_state !== CYCLE_WAITING) {
    return {
      state: CYCLE_COLLECTING,
      due: outstanding,
      chargedOn: dateOrNull(sub.charged_on),
      chargedFromId: sub.charged_from_appointment_id ?? null,
      newlyCharged: false,
      counted: null,
      limit,
      renewalDate,
    };
  }

  // The fee starts at the later of: the booking right after the free ones,
  // and the first booking on/after the renewal date.
  const firstOnRenewal = renewalDate ? bookings.findIndex((b) => b.date >= renewalDate) : 0;
  const index = firstOnRenewal < 0 ? -1 : Math.max(limit, firstOnRenewal);
  if (index < 0 || index >= bookings.length) {
    return {
      state: CYCLE_WAITING,
      due: outstanding,
      chargedOn: null,
      chargedFromId: null,
      newlyCharged: false,
      counted: bookings.length,
      limit,
      renewalDate,
    };
  }

  const trigger = bookings[index];
  return {
    state: CYCLE_COLLECTING,
    due: money(outstanding + cycleFee(sub.plan_amount)),
    chargedOn: trigger.date,
    chargedFromId: trigger.id,
    newlyCharged: true,
    counted: bookings.length,
    limit,
    renewalDate,
  };
}

/**
 * Pure: how much of invoice day `day` the cycle's fee may be taken from.
 * `appointments` are that day's invoice lines per appointment, in invoice
 * order: [{ appointment_id, amount }]. Nothing before chargedOn; on
 * chargedOn only from chargedFromId onward; after it, the whole day.
 */
function deductibleOnDay(cycle, day, appointments) {
  if (!(cycle.due > 0)) return 0;
  const sum = (list) => money(list.reduce((total, a) => total + (Number(a.amount) || 0), 0));
  if (!cycle.chargedOn || day > cycle.chargedOn) return sum(appointments);
  if (day < cycle.chargedOn) return 0;
  const start = appointments.findIndex((a) => Number(a.appointment_id) === Number(cycle.chargedFromId));
  const wholeDay = cycle.chargedFromId === null || cycle.chargedFromId === undefined || start < 0;
  return wholeDay ? sum(appointments) : sum(appointments.slice(start));
}

/**
 * Pure: the subscription columns after `deducted` is taken on invoice day
 * `day`, or null when nothing changes (still waiting, fee not charged).
 * Paying the fee off on `day` starts the next waiting cycle there.
 */
function cycleAfterPayout(cycle, day, deducted) {
  if (cycle.state === CYCLE_WAITING) return null;
  const remaining = money(cycle.due - deducted);
  if (remaining > 0) {
    return {
      cycle_state: CYCLE_COLLECTING,
      outstanding_due: remaining,
      charged_on: cycle.chargedOn,
      charged_from_appointment_id: cycle.chargedFromId,
    };
  }
  return {
    cycle_state: CYCLE_WAITING,
    outstanding_due: 0,
    cycle_start_date: day,
    next_due_date: addOneMonth(day),
    charged_on: null,
    charged_from_appointment_id: null,
  };
}

export {
  GST_RATE,
  DEFAULT_FREE_BOOKING_LIMIT,
  MAX_FREE_BOOKING_LIMIT,
  CYCLE_COLLECTING,
  CYCLE_WAITING,
  cycleFee,
  addOneMonth,
  accrueDue,
  resolveCycle,
  deductibleOnDay,
  cycleAfterPayout,
};
