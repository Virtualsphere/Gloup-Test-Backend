import require from "requirejs";
import * as Error from "../../errors/ErrorConstant.js";
import { ApplicationError } from "../../errors/ApplicationError.js";
import { connection } from "../connection.js";
import * as Models from "../models/index.js";
import bcrypt from "bcrypt";
import { defaultdata } from "../../../../config/config.js";
import { getBookingsDetails, getlanguage, getserviceprovidedfor } from "../../../Admin/controller/adminappcontroller.js";
const { Op, Sequelize, fn, col } = require("sequelize");
var randomize = require('randomatic');
import generatePDF  from "../../utils/generatePDF.js";
import generateInvoicePDF from "../../utils/generateInvoicePDF.js";
import generateMonthlyInvoicePDF from "../../utils/generateMonthlyInvoicePDF.js";
import { partnerDbController } from "./partnerDbController.js";
import { uploadToS3, S3upload, deleteIfExists } from "../../utils/s3/s3Upload.js";
import logger from "../../utils/logger.js";
import { logErrorToDB } from "../../utils/loggerDB.js";
import { syncPlanToRazorpay } from "../../utils/syncRazorpayPlans.js";
import {
    formatDurationFromDecimal,
    normalizeCategoryKey,
} from "../../utils/excelParser.js";
import { buildAppointmentDateTime, toIstDatePart } from "../../schema/formats.js";
import {
  CYCLE_WAITING,
  cycleAfterPayout,
  cycleFee,
  deductibleOnDay,
  DEFAULT_FREE_BOOKING_LIMIT,
  MAX_FREE_BOOKING_LIMIT,
  resolveCycle,
} from "../../utils/partnerSubscriptionBilling.js";
import { addDays, isValidDate, resolveRanges, rangesTableSql } from "../../utils/dashboardRanges.js";
import { haversineKm } from "../../utils/userLocation.js";
import { deriveStoreTypeFromServiceNames } from "../../utils/storeGenderFilter.js";

const ALLOWED_STATUS_TRANSITIONS = {
  booked: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

// ── Bookings list V2 ──
const BOOKING_STATUSES = ["booked", "confirmed", "completed", "cancelled", "refunded", "pending"];
// payment filter -> SQL. "sucssess" is a misspelling the booking flow also
// writes; refunds set payment_status to 'refunded' (updateRefundBookingStatus).
const BOOKING_PAYMENT_FILTERS = {
  paid: "a.payment_status IN ('success', 'sucssess') AND a.status <> 'refunded'",
  unpaid: "(a.payment_status = 'pending' OR a.payment_status IS NULL)",
  failed: "a.payment_status = 'failed'",
  refunded: "(a.status = 'refunded' OR a.payment_status = 'refunded')",
};
const BOOKING_LIST_MAX_LIMIT = 10000;
// What one appointment_items row adds to a partner's invoice - the pricing
// rule in getInvoiceDetailsForPartner(/Monthly): "important" services at the
// full service price, everything else at what the customer was charged.
// Expects aliases ai (appointment_items), ss (StoreServices), cb (Combo).
const INVOICE_ITEM_AMOUNT_SQL = `
  CASE
    WHEN ss.id IS NOT NULL AND ss.important = 1 THEN ss.amount
    WHEN ss.id IS NOT NULL OR cb.id IS NOT NULL THEN COALESCE(ai.service_amount, 0)
    ELSE 0
  END`;
// Which date a bookings date range filters on: the appointment day (V1's
// behaviour, the default) or when the booking was placed.
const bookingListDateBasis = (basis) => {
  if (basis === undefined || basis === null || basis === "" || basis === "appointment") {
    return { dateColumn: "booking_date" };
  }
  if (basis === "order") return { dateColumn: "created_at" };
  throw Error.BadRequest("date_basis must be appointment or order");
};

// ── Admin users V2 ──
const USER_STATUSES = ["active", "inactive", "terminated"];
// Paid = a real booking; the booking flow writes both spellings.
const PAID_PAYMENT_SQL = "('success', 'sucssess')";
// How the account was created, inferred from what the sign-up paths store:
// Apple sign-in sets apple_sub, Google sign-in creates the row with an email
// and no phone, phone OTP sign-up creates it with a phone. A Google user who
// later adds a phone reads as "phone", so this is a best guess, not a record.
const USER_LOGIN_METHOD_SQL = `
  CASE
    WHEN u.apple_sub IS NOT NULL AND u.apple_sub <> '' THEN 'apple'
    WHEN (u.phone IS NULL OR u.phone = '') AND u.email IS NOT NULL AND u.email <> '' THEN 'google'
    ELSE 'phone'
  END`;
// Referral = signed up with someone's invite code (User.used_code).
const USER_SOURCE_SQL = "CASE WHEN u.used_code IS NOT NULL AND u.used_code <> '' THEN 'referral' ELSE 'organic' END";
// A booking counts toward a user's "total bookings" (users pages) when it was
// paid, wasn't cancelled or refunded, and was placed on/after this date -
// earlier bookings are left out of user totals on purpose (business rule).
// `p` is the appointments alias prefix ("a." or "" for an unaliased table).
const USER_BOOKINGS_COUNTED_FROM = "2026-06-11";
const userCountedBookingSql = (p = "") =>
  `${p}status NOT IN ('cancelled', 'refunded') AND ${p}created_at >= '${USER_BOOKINGS_COUNTED_FROM}'`;
// Per-user paid-booking stats / session activity, joined as derived tables.
// total_bookings follows userCountedBookingSql; completed_bookings and
// last_booking_at stay all-time (Reviews V2's customer tag uses them).
const USER_BOOKING_STATS_SQL = `
  SELECT user_id,
    COALESCE(SUM(${userCountedBookingSql()}), 0) AS total_bookings,
    SUM(status = 'completed') AS completed_bookings,
    MAX(created_at) AS last_booking_at
  FROM appointments
  WHERE payment_status IN ${PAID_PAYMENT_SQL}
  GROUP BY user_id`;
// Last active = latest of a session touch and an app-usage session. The
// heartbeat sets UserSession.updated_at to epoch 0 when the app goes to the
// background, so those values are skipped; UserAppSessions.last_seen_at is
// the heartbeat's own record of when the user was last in the app.
const USER_SESSION_STATS_SQL = `
  SELECT x.user_id, MAX(x.seen_at) AS last_active_at
  FROM (
    SELECT user_id, updated_at AS seen_at FROM UserSession
    WHERE user_id IS NOT NULL AND updated_at > '2000-01-01'
    UNION ALL
    SELECT user_id, last_seen_at AS seen_at FROM UserAppSessions
  ) x
  GROUP BY x.user_id`;
const USER_LIST_SORTS = {
  newest: "u.registered_at IS NULL, u.registered_at DESC, u.id DESC",
  last_active: "ss.last_active_at IS NULL, ss.last_active_at DESC, u.id DESC",
  last_booking: "bk.last_booking_at IS NULL, bk.last_booking_at DESC, u.id DESC",
  bookings: "COALESCE(bk.total_bookings, 0) DESC, u.id DESC",
};
const USER_LIST_MAX_LIMIT = 10000;

// ── Reviews V2 (ReviewsRatingsV2 page) ──
// A review links only a customer (user_id) and a salon (store_id) - there is
// no booking / service on it. Hidden = Reviews.status 'inactive'; Reported =
// still active with a pending review_delete_requests row (a partner asked to
// remove it).
const REVIEW_LIST_MAX_LIMIT = 10000;
const REVIEW_REPLY_MAX_LENGTH = 1000;
const REVIEW_BULK_MAX = 500;
const REVIEW_LIST_SORTS = {
  newest: "R.cretaed_at DESC, R.id DESC",
  salon: "S.name ASC, R.cretaed_at DESC, R.id DESC",
  customer: "customer_name ASC, R.cretaed_at DESC, R.id DESC",
  rating: "R.rating DESC, R.cretaed_at DESC, R.id DESC",
};
// Latest pending removal request per review (partners can file duplicates).
const REVIEW_PENDING_REQUEST_SQL = `
  SELECT d.review_id, d.id AS request_id, d.reason AS request_reason
  FROM review_delete_requests d
  JOIN (
    SELECT review_id, MAX(id) AS id
    FROM review_delete_requests
    WHERE status = 'pending'
    GROUP BY review_id
  ) latest ON latest.id = d.id`;
// Customer type from completed paid bookings, on the loyalty_status
// thresholds (0-1 new, 2-9 repeat, 10+ vip). User.loyalty_status itself was
// reset to new_user for tier pricing, so it can't be used here.
const REVIEW_CUSTOMER_TAG_SQL = `
  CASE
    WHEN COALESCE(bk.completed_bookings, 0) >= 10 THEN 'vip'
    WHEN COALESCE(bk.completed_bookings, 0) >= 2 THEN 'repeat'
    ELSE 'new'
  END`;
const REVIEW_CUSTOMER_TAGS = ["new", "repeat", "vip"];

// Positive whole number list from `review_ids` (or a single `review_id`).
const requireReviewIds = (data) => {
  const raw = Array.isArray(data.review_ids) ? data.review_ids : [data.review_id];
  const ids = [...new Set(raw.map(Number))];
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw Error.BadRequest("review_ids must be positive whole numbers");
  }
  if (ids.length > REVIEW_BULK_MAX) {
    throw Error.BadRequest(`at most ${REVIEW_BULK_MAX} reviews at a time`);
  }
  return ids;
};

// ── Manual partner subscriptions V2 (PartnerSubscriptionsV2 page) ──
// Rows are every PartnerManualSubscriptions row plus "pending" salons: past
// the free-booking limit with no subscription row at all. A deactivated
// salon over the limit stays a deactivated row (flagged needs_subscription),
// so no salon is listed twice.
const SUB_LIST_MAX_LIMIT = 10000;
const SUB_STATUSES = ["active", "due", "inactive", "pending"];
// Columns resolveCycle (partnerSubscriptionBilling.js) needs from a
// PartnerManualSubscriptions row.
const SUB_CYCLE_COLUMNS = `plan_amount, status, outstanding_due, next_due_date, activated_at,
  renewal_booking_limit, cycle_state, cycle_start_date, charged_on, charged_from_appointment_id`;
// A booking that counts toward a salon's renewal limit: paid and not
// cancelled/refunded, by appointment day after the cycle started.
// Expects aliases a (appointments) and p (PartnerManualSubscriptions).
const SUB_COUNTED_BOOKING_SQL = `
  a.payment_status IN ${PAID_PAYMENT_SQL}
  AND a.status NOT IN ('cancelled', 'refunded')
  AND DATE(a.booking_date) > p.cycle_start_date`;
// Per waiting salon, its counted bookings up to :today: how many and the
// latest appointment day. The fee is owed once count > renewal limit and
// the latest is on/after the renewal date (the latest booking then always
// meets both - see resolveCycle).
const SUB_CYCLE_STATS_SQL = `
  SELECT p.store_id, COUNT(a.id) AS cycle_bookings, MAX(DATE(a.booking_date)) AS cycle_last_booking
  FROM PartnerManualSubscriptions p
  INNER JOIN appointments a ON a.store_id = p.store_id
    AND ${SUB_COUNTED_BOOKING_SQL}
    AND DATE(a.booking_date) <= :today
  WHERE p.status = 'active' AND p.cycle_state = 'waiting'
  GROUP BY p.store_id`;
// renewal_booking_limit from a request: undefined when not given, else a
// whole number 0..MAX_FREE_BOOKING_LIMIT.
const parseRenewalBookingLimit = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_FREE_BOOKING_LIMIT) {
    throw Error.BadRequest(`renewal_booking_limit must be a whole number between 0 and ${MAX_FREE_BOOKING_LIMIT}`);
  }
  return limit;
};
// The billing-cycle columns a payout can change; snapshotted on each payout
// (InvoicePayouts.subscription_state_before) so Undo restores them exactly.
const SUB_CYCLE_STATE_FIELDS = [
  "cycle_state", "outstanding_due", "next_due_date", "cycle_start_date",
  "charged_on", "charged_from_appointment_id",
];
// A cycle column as stored, with DATE columns as "YYYY-MM-DD".
const subStateValue = (sub, field) => {
  const value = sub[field] ?? null;
  return value !== null && ["next_due_date", "cycle_start_date", "charged_on"].includes(field)
    ? dayString(value)
    : value;
};
// An invoice's lines summed per appointment, in invoice order - the shape
// deductibleOnDay takes: [{ appointment_id, amount }].
const invoiceAppointments = (items) => {
  const byId = new Map();
  for (const item of items) {
    const id = Number(item.appointment_id);
    byId.set(id, (byId.get(id) || 0) + (Number(item.amount) || 0));
  }
  return [...byId].map(([appointment_id, amount]) => ({ appointment_id, amount }));
};
// What the pages are told about a subscription's billing cycle.
const subscriptionCycleView = (cycle) => (cycle ? {
  state: cycle.state, // "collecting" | "waiting"
  renewal_booking_limit: cycle.limit,
  bookings_in_cycle: cycle.counted, // counted bookings so far, while waiting
  renewal_date: cycle.state === CYCLE_WAITING ? cycle.renewalDate : null,
  charged_on: cycle.chargedOn,
  newly_charged: cycle.newlyCharged,
} : null);
// Status: "due" = owes something now - a balance being collected, or a
// waiting cycle whose limit and renewal date have both been reached.
const SUB_STATUS_SQL = `
  CASE
    WHEN x.kind = 'pending' THEN 'pending'
    WHEN x.sub_status <> 'active' THEN 'inactive'
    WHEN x.outstanding_due > 0
      OR (x.cycle_state = 'waiting'
        AND COALESCE(cy.cycle_bookings, 0) > x.renewal_booking_limit
        AND cy.cycle_last_booking >= x.next_due_date) THEN 'due'
    ELSE 'active'
  END`;
const SUB_LIST_SORTS = {
  status: "FIELD(row_status, 'pending', 'due', 'active', 'inactive'), s.name ASC, x.store_id ASC",
  newest: "x.activated_at IS NULL, x.activated_at DESC, x.store_id DESC",
  name: "s.name ASC, x.store_id ASC",
  bookings: "s.total_booking_count DESC, x.store_id DESC",
  next_due: "x.next_due_date IS NULL, x.next_due_date ASC, x.store_id ASC",
};
// Store.logo holds the literal string "null" for some salons.
const cleanLogo = (logo) => (logo && logo !== "null" && logo !== "undefined" ? logo : null);
// "YYYY-MM-DD" from a DATE column, whether the driver returned a string or a Date.
const dayString = (value) => {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.slice(0, 10) : toIstDatePart(value);
};

// ── Invoices & payouts V2 (InvoicePayoutsV2 page) ──
// An invoice is one salon's non-cancelled bookings on one visit day (same
// rule and pricing as getInvoiceDetailsForPartner); it is paid when an
// InvoicePayouts row exists for (store_id, invoice_date). Store.
// payout_frequency only decides when that day's money is DUE:
//   daily   -> the next day
//   weekly  -> the Monday after its Mon-Sun week
//   monthly -> the 1st of the next month
// Unpaid and not due yet = scheduled; due = due 0..GRACE-1 days ago;
// overdue = due GRACE+ days ago.
const PAYOUT_FREQUENCIES = ["daily", "weekly", "monthly"];
const PAYOUT_OVERDUE_GRACE_DAYS = 3;
const PAYOUT_STATUSES = ["scheduled", "due", "overdue", "paid"];
const PAYOUT_LIST_MAX_LIMIT = 10000;
const PAYOUT_BULK_MAX_DAYS = 120;
// Invoice gross per item - important services at full price, everything else
// at what the customer was charged (getInvoiceDetailsForPartner's rule).
const INVOICE_ITEM_GROSS_SQL = `
  CASE
    WHEN ss.id IS NOT NULL AND ss.important = 1 THEN ss.amount
    WHEN ss.id IS NOT NULL OR cb.id IS NOT NULL THEN COALESCE(ai.service_amount, 0)
    ELSE 0
  END`;
// One row per (salon, visit day) between :daysFrom and :daysEnd (exclusive).
const INVOICE_DAYS_SQL = `
  SELECT a.store_id, DATE(a.booking_date) AS invoice_date,
         COUNT(DISTINCT a.id) AS bookings,
         SUM(${INVOICE_ITEM_GROSS_SQL}) AS gross
  FROM appointments a
  INNER JOIN appointment_items ai ON ai.appointment_id = a.id
  LEFT JOIN StoreServices ss ON ai.service_id = ss.id
  LEFT JOIN Combo cb ON ai.combo_id = cb.id
  WHERE a.booking_date >= :daysFrom AND a.booking_date < :daysEnd
    AND a.status != 'cancelled'
  GROUP BY a.store_id, DATE(a.booking_date)`;
// Payout due date for an invoice day `d.invoice_date` of salon `s`.
const INVOICE_DUE_DATE_SQL = `
  CASE s.payout_frequency
    WHEN 'weekly' THEN DATE_ADD(d.invoice_date, INTERVAL (7 - WEEKDAY(d.invoice_date)) DAY)
    WHEN 'monthly' THEN DATE_ADD(LAST_DAY(d.invoice_date), INTERVAL 1 DAY)
    ELSE DATE_ADD(d.invoice_date, INTERVAL 1 DAY)
  END`;
// Every invoice day with its salon, payout row and due date.
const invoiceDayRowsSql = () => `
  SELECT d.store_id, d.invoice_date, d.bookings, d.gross,
         s.payout_frequency AS frequency,
         ${INVOICE_DUE_DATE_SQL} AS due_date,
         ip.id AS payout_id, ip.amount AS payout_amount,
         ip.subscription_deducted, ip.paid_at, ip.marked_by
  FROM (${INVOICE_DAYS_SQL}) d
  INNER JOIN Store s ON s.id = d.store_id
  LEFT JOIN InvoicePayouts ip ON ip.store_id = d.store_id AND ip.invoice_date = d.invoice_date`;
// Status of one invoice day (needs :today, :grace).
const INVOICE_DAY_STATUS_SQL = `
  CASE
    WHEN x.payout_id IS NOT NULL THEN 'paid'
    WHEN x.due_date > :today THEN 'scheduled'
    WHEN DATEDIFF(:today, x.due_date) >= :grace THEN 'overdue'
    ELSE 'due'
  END`;

// ── Monthly report V2 (MonthlyReportV2 page) ──
const REPORT_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTHLY_REPORT_MAX_LIMIT = 10000;
// A booking counts once it's paid; "active" = paid and not cancelled/refunded
// (what the customer was actually served and charged for).
const PAID_BOOKING_SQL = `a.payment_status IN ${PAID_PAYMENT_SQL}`;
// Platform fee the customer paid on appointment `a`, as stored at booking
// time (bookings before the column existed were set to Rs 3).
const PLATFORM_FEE_SQL = "COALESCE(a.platform_fee, 0)";
const ACTIVE_BOOKING_SQL = `${PAID_BOOKING_SQL} AND a.status NOT IN ('cancelled', 'refunded')`;
// Discount Gloup funds on an item - the dashboard / monthly report / analytics
// CAC (0 for important services). List price and important flag come from the
// booking-time snapshot on appointment_items, so later price edits don't
// rewrite past CAC; the live StoreServices / Combo values are only a fallback
// for rows the snapshot couldn't fill. (The invoice page's "Acquisition Cost"
// still uses live prices - see getInvoiceDetailsForPartner.)
const ITEM_CAC_SQL = `
  CASE
    WHEN ss.id IS NOT NULL THEN
      IF(COALESCE(ai.is_important, ss.important) = 1, 0,
        GREATEST(0, COALESCE(ai.list_amount, ss.amount) - COALESCE(ai.service_amount, 0)))
    WHEN cb.id IS NOT NULL THEN
      GREATEST(0, COALESCE(ai.list_amount, cb.amount) - COALESCE(ai.service_amount, 0))
    ELSE 0
  END`;
// What one item adds to GMV (dashboard V2): normal services and combos at
// what the customer was charged (after the service discount, before any
// coupon), "important" services at their original price. Both come from the
// booking-time snapshot - the same numbers as the booking details' service
// lines - with the live StoreServices values only as a fallback. GST and the
// platform fee are never part of it.
const ITEM_GMV_SQL = `
  CASE
    WHEN ai.service_id IS NULL AND ai.combo_id IS NULL THEN 0
    WHEN ai.service_id IS NOT NULL AND COALESCE(ai.is_important, ss.important, 0) = 1
      THEN COALESCE(ai.list_amount, ss.amount, ai.service_amount, 0)
    ELSE COALESCE(ai.service_amount, 0)
  END`;
const MONTHLY_REPORT_SORTS = {
  bookings_desc: "COALESCE(b.total_bookings, 0) DESC, s.name ASC",
  bookings_asc: "COALESCE(b.total_bookings, 0) ASC, s.name ASC",
  paid_in_desc: "COALESCE(g.gross, 0) DESC, s.name ASC",
  paid_in_asc: "COALESCE(g.gross, 0) ASC, s.name ASC",
  rating_desc: "r.average_rating IS NULL, r.average_rating DESC, r.review_count DESC, s.name ASC",
  name_asc: "s.name ASC, base.store_id ASC",
};

// "YYYY-MM" (default: this IST month) -> the month and the one before it,
// each as { month, from, to, end } with `end` exclusive.
const resolveReportMonths = (monthInput) => {
  const raw = monthInput ? String(monthInput).trim() : toIstDatePart(new Date()).slice(0, 7);
  const match = REPORT_MONTH_RE.exec(raw);
  if (!match) {
    throw Error.BadRequest("month must be YYYY-MM");
  }
  const span = (year, month) => {
    const pad = (n) => String(n).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(lastDay)}`;
    return { month: `${year}-${pad(month)}`, from, to, end: addDays(to, 1) };
  };
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    current: span(year, month),
    previous: month === 1 ? span(year - 1, 12) : span(year, month - 1),
  };
};

// Per-salon aggregates for one month (:fromDate inclusive, :toEnd exclusive),
// each grouped by store_id so they can be LEFT JOINed onto a salon list.
const MONTHLY_BOOKINGS_SQL = `
  SELECT a.store_id,
    COUNT(*) AS total_bookings,
    SUM(a.status = 'completed') AS completed,
    SUM(a.status IN ('cancelled', 'refunded')) AS cancelled,
    SUM(a.status NOT IN ('cancelled', 'refunded')) AS active_bookings,
    COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelled', 'refunded')
      THEN ${PLATFORM_FEE_SQL} END), 0) AS platform_fee,
    COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelled', 'refunded')
      THEN ROUND(a.discounted_amount * COALESCE(a.gst, 0) / 100, 2) END), 0) AS gst,
    COUNT(DISTINCT CASE WHEN a.status NOT IN ('cancelled', 'refunded') THEN a.user_id END) AS customers,
    MAX(CASE WHEN a.status NOT IN ('cancelled', 'refunded')
      THEN CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), ' ', COALESCE(TIME_FORMAT(sl.\`from\`, '%H:%i:%s'), '')) END) AS last_booking
  FROM appointments a
  LEFT JOIN Slots sl ON sl.id = a.slot_id
  WHERE ${PAID_BOOKING_SQL} AND a.booking_date >= :fromDate AND a.booking_date < :toEnd
  GROUP BY a.store_id`;
// Invoice value (same pricing and "not cancelled" rule as the invoice page)
// and CAC (paid, not cancelled / refunded - same as the dashboard).
const MONTHLY_ITEMS_SQL = `
  SELECT a.store_id,
    COALESCE(SUM(${INVOICE_ITEM_GROSS_SQL}), 0) AS gross,
    COUNT(DISTINCT a.id) AS orders,
    COALESCE(SUM(CASE WHEN ${ACTIVE_BOOKING_SQL} THEN ${ITEM_CAC_SQL} END), 0) AS cac_spend,
    COUNT(DISTINCT CASE WHEN ${ACTIVE_BOOKING_SQL} THEN a.id END) AS cac_bookings
  FROM appointments a
  INNER JOIN appointment_items ai ON ai.appointment_id = a.id
  LEFT JOIN StoreServices ss ON ai.service_id = ss.id
  LEFT JOIN Combo cb ON ai.combo_id = cb.id
  WHERE a.booking_date >= :fromDate AND a.booking_date < :toEnd AND a.status != 'cancelled'
  GROUP BY a.store_id`;
const MONTHLY_PAYOUTS_SQL = `
  SELECT store_id, COALESCE(SUM(amount), 0) AS payout,
         COALESCE(SUM(subscription_deducted), 0) AS subscription_deducted, COUNT(*) AS payouts
  FROM InvoicePayouts
  WHERE invoice_date >= :fromDate AND invoice_date < :toEnd
  GROUP BY store_id`;
// Every salon with a paid booking or an invoice line in the month.
const MONTHLY_SALONS_SQL = `
  SELECT DISTINCT a.store_id
  FROM appointments a
  WHERE a.booking_date >= :fromDate AND a.booking_date < :toEnd
    AND (${PAID_BOOKING_SQL} OR a.status != 'cancelled')`;

// ── Analytics intelligence V2 (AnalyticsIntelligenceV2 page) ──
// Salon profitability tiers by contribution margin %, and switching-risk
// tiers by the share of a salon's customers whose next booking was elsewhere.
const PROFIT_TIERS = [
  { tier: "High", min: 20 },
  { tier: "Medium", min: 10 },
  { tier: "Low", min: 0 },
];
const SWITCH_RISK_TIERS = [
  { tier: "High", min: 30 },
  { tier: "Medium", min: 20 },
];
// A salon needs this many customers in the window to be ranked for risk.
const SWITCH_RISK_MIN_CUSTOMERS = 2;
const ANALYTICS_MAX_DAYS = 366;
// Uninstalled users: "high value" = this many served bookings, and the
// last-active buckets (days since registration / OTP login / booking).
const UNINSTALLED_HIGH_VALUE_BOOKINGS = 2;
const UNINSTALLED_SEGMENTS = [
  { key: "d7", label: "Active within 7 days", max_days: 7 },
  { key: "d30", label: "Active 8–30 days ago", max_days: 30 },
  { key: "d60", label: "Active 31–60 days ago", max_days: 60 },
  { key: "d60plus", label: "Active 60+ days ago", max_days: Infinity },
];

// ── User analytics V2 (UserAnalyticsV2 page) ──
// App activity comes from UserAppSessions (heartbeat) and in-app actions from
// UserEvents; both start empty on the day they were deployed, so their
// metrics are null for windows before the first row (activity_since /
// events_since). Everything booking-based reads appointments.
const USER_ANALYTICS_PLATFORMS = ["android", "ios", "web", "app"];
// MAU = distinct users active in the 30 days ending on the day.
const USER_ANALYTICS_MAU_DAYS = 30;
// Heatmaps: 4-hour parts of the (IST) day x Mon..Sun.
const USER_ANALYTICS_DAY_PARTS = ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"];
// Retention: share of a cohort still coming back N+ days after joining.
const USER_RETENTION_DAYS = [1, 7, 14, 30, 60, 90];
const USER_RETENTION_MAX_WEEKS = 12;
const SESSION_SECONDS_SQL = "TIMESTAMPDIFF(SECOND, s.started_at, COALESCE(s.ended_at, s.last_seen_at))";
// The customer paid at some point: a refund turns payment_status into
// 'refunded', so funnels must not read a refunded booking as "didn't pay".
const PAYMENT_MADE_SQL = "a.payment_status IN ('success', 'sucssess', 'refunded')";
// Bookings from the go-live cutoff on (AdminSettings.dashboard_data_start_date
// as :cutoff, NULL = all time), so pre-launch test bookings don't count -
// e.g. a test booking must not stop a later real one being a "first booking".
const bookingFloorSql = (alias = "a") => `(:cutoff IS NULL OR ${alias}.created_at >= :cutoff)`;
// Salon area / city are free text ("K.K.Nagar" / "K. K. Nagar", "Chennai" /
// "chennai"): group on letters and digits only, show a title-cased label.
const placeKey = (value) => {
  const key = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key === "null" ? "" : key;
};
const placeLabel = (value) => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text || text.toLowerCase() === "null") return null;
  return text.toLowerCase().replace(/(^|[\s(/.-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
};
// SQL twin of placeKey for a salon's city: `district` is the cleanest field
// ("Chennai" where city reads "Chennai Tamil Nadu"), city the fallback.
const salonCityKeySql = (alias) =>
  `LOWER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(${alias}.district), ''), ${alias}.city, ''), '[^A-Za-z0-9]', ''))`;

// ── Deep user insights V2 (DeepUserInsightsV2 page) ──
// Distance = appointments.distance_km, the straight line from where the
// customer was when booking (userLocation.js) to the salon. Bookings placed
// before location capture have none and are left out of distance numbers.
// Travel time is an estimate: 20 km/h city average = 3 min per km.
const TRAVEL_MINUTES_PER_KM = 3;
const DISTANCE_BUCKETS = [
  { key: "0-2", label: "0 – 2 km", max: 2 },
  { key: "2-5", label: "2 – 5 km", max: 5 },
  { key: "5-10", label: "5 – 10 km", max: 10 },
  { key: "10-20", label: "10 – 20 km", max: 20 },
  { key: "20+", label: "20+ km", max: Infinity },
];
const TRAVEL_TIME_BUCKETS = [
  { key: "0-10", label: "0 – 10 min", max: 10 },
  { key: "10-20", label: "10 – 20 min", max: 20 },
  { key: "20-30", label: "20 – 30 min", max: 30 },
  { key: "30-45", label: "30 – 45 min", max: 45 },
  { key: "45+", label: "45+ min", max: Infinity },
];
const FREQUENCY_BUCKETS = [
  { key: "1", label: "1 Time", max: 1 },
  { key: "2-3", label: "2 - 3 Times", max: 3 },
  { key: "4-6", label: "4 - 6 Times", max: 6 },
  { key: "7+", label: "7+ Times", max: Infinity },
];
// Time preference columns: 2-hour blocks of the slot start (Slots.from).
const TIME_PREFERENCE_START_HOURS = [8, 10, 12, 14, 16, 18, 20, 22];
// KPI thresholds: a long trip, and the "far travelling users" list.
const LONG_TRIP_KM = 10;
const FAR_USER_KM = 20;
// "Why users travel": bookings this far with a closer salon available get
// one inferred reason, the first that matches in this order.
const FAR_BOOKING_KM = 5;
const TRAVEL_REASONS = [
  { key: "regular", label: "Regular at this Salon" },
  { key: "stylist", label: "Preferred Stylist" },
  { key: "price", label: "Better Price / Offers" },
  { key: "rating", label: "Better Salon Rating" },
  { key: "other", label: "Other / No clear reason" },
];
// Rating reason: booked salon vs the average of this many salons nearest
// to the customer.
const NEAREST_SALONS_FOR_RATING = 3;
// Heat map cells: booking origins rounded to 2 decimals (~1.1 km).
const HEATMAP_CELL_DECIMALS = 2;
const HEATMAP_MAX_CELLS = 60;
const SCATTER_MAX_POINTS = 400;
const FAR_USERS_PREVIEW = 5;

// ── Growth dashboard V2 (GrowthDashboardV2 page) ──
// A slot seat is taken by the same rule the app uses for availability
// (userDbController SLOT_OCCUPANCY_SQL): confirmed / completed, booked and
// paid, or a checkout still inside its 5-minute payment hold.
const SLOT_OCCUPIED_SQL = `(
  a.status IN ('confirmed', 'completed')
  OR (a.status = 'booked' AND a.payment_status IN ${PAID_PAYMENT_SQL})
  OR (a.payment_status = 'pending' AND a.created_at >= NOW() - INTERVAL 5 MINUTE)
)`;
const SLOT_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// First-time booker tracker: no activity for this long = churn risk.
const CHURN_RISK_DAYS = 21;
// Lifetime booking-count buckets and the level-to-level conversions.
const BOOKING_FREQUENCY_BUCKETS = [
  { key: "never", label: "Never Booked", min: 0, max: 0 },
  { key: "1", label: "1 Booking", min: 1, max: 1 },
  { key: "2", label: "2 Bookings", min: 2, max: 2 },
  { key: "3-4", label: "3 – 4 Bookings", min: 3, max: 4 },
  { key: "5-9", label: "5 – 9 Bookings", min: 5, max: 9 },
  { key: "10+", label: "10+ Bookings", min: 10, max: Infinity },
];
const BOOKING_LEVELS = [
  { from: 1, to: 2, label: "1st → 2nd Booking" },
  { from: 2, to: 3, label: "2nd → 3rd Booking" },
  { from: 3, to: 5, label: "3rd → 5th Booking" },
  { from: 5, to: 10, label: "5th → 10th Booking" },
];
const DAYS_TO_SECOND_BUCKETS = [
  { key: "0-7", label: "0 – 7 Days", max: 7 },
  { key: "8-15", label: "8 – 15 Days", max: 15 },
  { key: "16-30", label: "16 – 30 Days", max: 30 },
  { key: "31+", label: "31+ Days", max: Infinity },
];
// A salon "unusually empty" today: at least this many seats, this share free.
const EMPTY_SALON_MIN_SEATS = 4;
const EMPTY_SALON_FREE_SHARE = 0.8;
// Average booking value for potential revenue: the salon's last 30 days.
const BOOKING_VALUE_LOOKBACK_DAYS = 30;
const GROWTH_PREVIEW_ROWS = 5;
const GROWTH_LISTS = ["high_intent", "checkout_dropoff", "first_time", "second_booking", "empty_slots", "locations", "days_to_second"];

// ── Booking analytics V2 (Service / Booking Intelligence, Salon Heatmap,
// Salon Category, Partner Details) ──
// A booking counts when it was paid, wasn't cancelled / refunded and is from
// go-live on; it is dated by booking_date (the service day - the Dashboard /
// Monthly Report basis) and timed by its slot (Slots.from).
const PRICE_BANDS = [
  { key: "lt100", label: "Below ₹99", max: 100 },
  { key: "100-199", label: "₹100 – ₹199", max: 200 },
  { key: "200-299", label: "₹200 – ₹299", max: 300 },
  { key: "300-499", label: "₹300 – ₹499", max: 500 },
  { key: "500-999", label: "₹500 – ₹999", max: 1000 },
  { key: "1000+", label: "₹1000+", max: Infinity },
];
const hourName = (h) => `${h % 12 || 12} ${h % 24 < 12 ? "AM" : "PM"}`;
// 12 two-hour slots and the six day bands of the Booking Intelligence page.
const TWO_HOUR_SLOTS = Array.from({ length: 12 }, (_, i) => `${hourName(i * 2)} - ${hourName(i * 2 + 2)}`);
const DAY_BANDS = [
  { key: "night", label: "12 AM - 6 AM", from: 0, to: 6 },
  { key: "morning", label: "6 AM - 10 AM", from: 6, to: 10 },
  { key: "midday", label: "10 AM - 2 PM", from: 10, to: 14 },
  { key: "afternoon", label: "2 PM - 6 PM", from: 14, to: 18 },
  { key: "evening", label: "6 PM - 10 PM", from: 18, to: 22 },
  { key: "late", label: "10 PM - 12 AM", from: 22, to: 24 },
];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Service preferences: a booking this large makes a "high spender".
const HIGH_SPENDER_BOOKING = 1000;
const SALON_TYPES = [
  { key: "men", label: "Men's Salon" },
  { key: "unisex", label: "Unisex Salon" },
  { key: "women", label: "Women's Salon" },
];
const SERVICE_TOP_ROWS = 7;
const PARTNER_PEAK_HOURS = Array.from({ length: 19 }, (_, i) => i + 6); // 6 AM .. 12 AM

// { from, to } (YYYY-MM-DD, inclusive, default the last `defaultDays` days)
// plus `end` (exclusive) and the equal-length previous window.
const resolveAnalyticsWindow = (data = {}, defaultDays = 30) => {
  const today = toIstDatePart(new Date());
  const to = data.to ? String(data.to) : today;
  const from = data.from ? String(data.from) : addDays(to, -(defaultDays - 1));
  if (!isValidDate(from) || !isValidDate(to)) {
    throw Error.BadRequest("from and to must be YYYY-MM-DD");
  }
  if (from > to) {
    throw Error.BadRequest("from must not be after to");
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  if (days > ANALYTICS_MAX_DAYS) {
    throw Error.BadRequest(`the window can be at most ${ANALYTICS_MAX_DAYS} days`);
  }
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -days);
  return {
    from,
    to,
    end: addDays(to, 1),
    days,
    previous: { from: prevFrom, to: prevTo, end: from },
  };
};

const profitTier = (margin, contribution) => {
  if (margin === null) return contribution < 0 ? "Negative" : "Low";
  return PROFIT_TIERS.find((t) => margin >= t.min)?.tier || "Negative";
};
const switchRiskTier = (pct) => SWITCH_RISK_TIERS.find((t) => pct >= t.min)?.tier || "Low";

// Each customer's FIRST served booking in [:fromDate, :toEnd) with the salon
// of their next served booking after it (any time, NULL = none since).
const SWITCH_ANCHORS_SQL = `
  SELECT x.user_id, x.store_id, x.next_store
  FROM (
    SELECT b.user_id, b.store_id, b.next_store,
           ROW_NUMBER() OVER (PARTITION BY b.user_id ORDER BY b.booking_date, b.id) AS window_rank
    FROM (
      SELECT a.id, a.user_id, a.store_id, a.booking_date,
             LEAD(a.store_id) OVER (PARTITION BY a.user_id ORDER BY a.booking_date, a.id) AS next_store
      FROM appointments a
      WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL
    ) b
    WHERE b.booking_date >= :fromDate AND b.booking_date < :toEnd
  ) x
  WHERE x.window_rank = 1`;

// What the customer paid for a booking: charged price + GST (appointments.gst %).
const AMOUNT_PAID_SQL = "a.discounted_amount + ROUND(a.discounted_amount * a.gst / 100, 2)";

const requireUserId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw Error.BadRequest("id must be a positive whole number");
  }
  return id;
};
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
// Store.images is a JSON array string; first image path or null.
const firstImage = (raw) => {
  if (!raw) return null;
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) && list.length ? list[0] : null;
  } catch {
    return null;
  }
};

const INVOICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Invoice day = appointment calendar day (IST). Optional YYYY-MM-DD override. */
function resolveInvoiceDate(dateInput) {
  if (dateInput != null && String(dateInput).trim() !== "") {
    const d = String(dateInput).trim().slice(0, 10);
    if (!INVOICE_DATE_RE.test(d)) {
      throw Error.BadRequest("date must be YYYY-MM-DD");
    }
    return d;
  }
  return toIstDatePart(new Date());
}

const INVOICE_MONTH_RE = /^\d{4}-\d{2}$/;

/** Invoice month = appointment booking_date month (IST). Optional YYYY-MM override; defaults to current month IST. */
function resolveInvoiceMonthRange(monthInput) {
  let year, month;
  if (monthInput != null && String(monthInput).trim() !== "") {
    const m = String(monthInput).trim().slice(0, 7);
    if (!INVOICE_MONTH_RE.test(m)) {
      throw Error.BadRequest("month must be YYYY-MM");
    }
    [year, month] = m.split("-").map(Number);
  } else {
    const todayIst = toIstDatePart(new Date());
    [year, month] = todayIst.split("-").map(Number);
  }
  const pad = (n) => String(n).padStart(2, "0");
  const fromDate = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { month: `${year}-${pad(month)}`, fromDate, toDate };
}

/** Last N calendar months as "YYYY-MM" strings, oldest first, ending this month. */
function buildLastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}



export class adminDbController { }
  adminDbController.scope = "defaultScope";
  adminDbController.Models = Models;
  adminDbController.connection = connection;
  adminDbController.defaults = {};

  // Helper to format time as HH:MM:SS
  function formatTime(date) {
    return date.toTimeString().split(" ")[0];
  }

  // Create Timeslot loop function
  async function createDefaultTimeSlots(storeId) {
  const daysOfWeek = [
    "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday"
  ];

   const SLOT_COUNT = 168;

  // 🔹 Check existing slots
  const existingSlots = await adminDbController.Models.Slots.count({
    where: { store_id: storeId }
  });

  // 🔹 If slots already correct, do nothing
  if (existingSlots === SLOT_COUNT) {
    return { message: "Slots already exist", count: existingSlots };
  }

  // 🔹 If incorrect slots exist → delete
  if (existingSlots > 0) {
    await adminDbController.Models.Slots.destroy({
      where: { store_id: storeId }
    });
  }

  const slots = [];

  for (const day of daysOfWeek) {
    const start = new Date();
    start.setHours(9, 0, 0, 0); // 9:00 AM

    const end = new Date();
    end.setHours(21, 0, 0, 0); // 9:00 PM

    let current = new Date(start);

    while (current < end) {
      const next = new Date(current.getTime() + 30 * 60 * 1000);

      slots.push({
        store_id: storeId,
        from: formatTime(current),
        to: formatTime(next),
        notes: "",
        status: "active",
        day: day  // 👈 week added
      });

      current = next;
    }
  }

  await adminDbController.Models.Slots.bulkCreate(slots);
  return slots;
}




adminDbController.auth = {
  checksession: async (id) => {
    try {
      return await adminDbController.Models.adminSession.findAll({
        where: {
          user_id: id,
          status: "active"
        },
        order: [['created_at', 'DESC']],
        limit: 1
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check session");
    }
  },
  checkuser: async (data) => {
    try {
      return await adminDbController.Models.admin.findOne({
        where: {
          email: data
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check user");
    }
  },
  insertsession: async (token, id, deviceinfo) => {
    try {
      return await adminDbController.Models.adminSession.create({
        token: token,
        user_id: id,
        deviceinfo: deviceinfo,
        status: "active"
      });
    } catch (error) {
      console.log(error)
      throw Error.SomethingWentWrong("Failed to insert session");
    }
  },
  destroysession: async (id) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { id: id } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to destroy session");
    }
  },
  destroysession_1: async (token) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { token: token } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to destroy session");
    }
  },
  findsession: async (token) => {
    try {
      return await adminDbController.Models.adminSession.findOne({
        where: {
          token: token,
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to find session");
    }
  },
  checkUserIdExists: async (user) => {
    try {
      return await adminDbController.Models.admin.findOne({
        where: {
          id: user.id,
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check user ID");
    }
  },
  logout: async (token) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { token: token } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to logout");
    }
  },
  updatePassword: async (id, hashedPassword) => {
    try {
      return await adminDbController.Models.admin.update(
        { password: hashedPassword },
        { where: { id: id } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update password");
    }
  },
  destroyAllSessions: async (userId) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { user_id: userId } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to destroy all sessions");
    }
  }
}


adminDbController.app = {
  getallusers: async (body) => {
    try {
      const where = {};
      if (body?.min_bookings != null && body.min_bookings !== "") {
        where.paid_booking_count = { [Op.gte]: Number(body.min_bookings) };
      }

      return await adminDbController.Models.User.findAll({
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilepic', 'status', 'loyalty_status', 'paid_booking_count', 'gender', 'city', 'registered_at'],
        where,
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users");
    }
  },
  // ── Admin users V2 (UsersV2 / UserDetailsV2 pages) ───────────────────────

  // Paginated user list with every filter in SQL. Adds what the V1 list never
  // returned: gender, city, registered date, sign-up source / login method,
  // last active (latest UserSession activity), last paid booking and the real
  // paid-booking count (User.paid_booking_count was reset to 0 for tier
  // pricing, so it is not a booking count any more).
  getUsersListV2: async (data = {}) => {
    try {
      const where = [];
      const replacements = {};
      const addWhere = (sql, values = {}) => {
        where.push(sql);
        Object.assign(replacements, values);
      };

      const search = String(data.search || "").trim().replace(/^#/, "");
      if (search) {
        const conditions = [
          "CONCAT_WS(' ', u.firstname, u.lastname) LIKE :searchLike",
          "u.email LIKE :searchLike",
          "u.phone LIKE :searchLike",
        ];
        const values = { searchLike: `%${escapeLike(search)}%` };
        if (/^\d+$/.test(search)) {
          conditions.unshift("u.id = :searchId");
          values.searchId = Number(search);
        }
        addWhere(`(${conditions.join(" OR ")})`, values);
      }

      if (data.status) {
        if (!USER_STATUSES.includes(data.status)) {
          throw Error.BadRequest(`status must be one of: ${USER_STATUSES.join(", ")}`);
        }
        addWhere("u.status = :status", { status: data.status });
      }

      if (data.gender) {
        const gender = String(data.gender).toLowerCase();
        if (gender === "male") addWhere("LOWER(u.gender) IN ('male', 'm')");
        else if (gender === "female") addWhere("LOWER(u.gender) IN ('female', 'f')");
        else if (gender === "unknown") addWhere("(u.gender IS NULL OR LOWER(u.gender) NOT IN ('male', 'm', 'female', 'f'))");
        else throw Error.BadRequest("gender must be male, female or unknown");
      }

      if (data.city) {
        addWhere("LOWER(TRIM(u.city)) = LOWER(TRIM(:city))", { city: String(data.city) });
      }

      if (data.source) {
        if (!["referral", "organic"].includes(data.source)) {
          throw Error.BadRequest("source must be referral or organic");
        }
        addWhere(`${USER_SOURCE_SQL} = :source`, { source: data.source });
      }

      if (data.login_method) {
        if (!["apple", "google", "phone"].includes(data.login_method)) {
          throw Error.BadRequest("login_method must be apple, google or phone");
        }
        addWhere(`${USER_LOGIN_METHOD_SQL} = :loginMethod`, { loginMethod: data.login_method });
      }

      if (data.loyalty) {
        addWhere("u.loyalty_status = :loyalty", { loyalty: String(data.loyalty) });
      }

      if (data.booked === "yes" || data.booked === true) addWhere("COALESCE(bk.total_bookings, 0) > 0");
      else if (data.booked === "no" || data.booked === false) addWhere("COALESCE(bk.total_bookings, 0) = 0");
      else if (data.booked !== undefined && data.booked !== null && data.booked !== "") {
        throw Error.BadRequest("booked must be yes or no");
      }

      for (const [field, op] of [["joined_from", ">="], ["joined_to", "<"]]) {
        if (!data[field]) continue;
        if (!isValidDate(String(data[field]))) {
          throw Error.BadRequest(`${field} must be YYYY-MM-DD`);
        }
        const value = field === "joined_to" ? addDays(data[field], 1) : data[field];
        addWhere(`u.registered_at ${op} :${field}`, { [field]: value });
      }

      const sort = USER_LIST_SORTS[data.sort || "newest"];
      if (!sort) {
        throw Error.BadRequest(`sort must be one of: ${Object.keys(USER_LIST_SORTS).join(", ")}`);
      }

      const page = Math.max(1, Number(data.page) || 1);
      const limit = Math.min(Math.max(1, Number(data.limit) || 10), USER_LIST_MAX_LIMIT);
      const fromSql = `
        FROM User u
        LEFT JOIN (${USER_BOOKING_STATS_SQL}) bk ON bk.user_id = u.id
        LEFT JOIN (${USER_SESSION_STATS_SQL}) ss ON ss.user_id = u.id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      `;

      const [rows, totalRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT
            u.id, u.firstname, u.lastname,
            TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name,
            u.email, u.phone, u.gender, u.city, u.status, u.loyalty_status,
            u.profilePic AS profilepic, u.registered_at,
            ${USER_SOURCE_SQL} AS source,
            ${USER_LOGIN_METHOD_SQL} AS login_method,
            ss.last_active_at,
            bk.last_booking_at,
            COALESCE(bk.total_bookings, 0) AS total_bookings,
            COALESCE(bk.completed_bookings, 0) AS completed_bookings
          ${fromSql}
          ORDER BY ${sort}
          LIMIT :limit OFFSET :offset
          `,
          { replacements: { ...replacements, limit, offset: (page - 1) * limit }, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(`SELECT COUNT(*) AS total ${fromSql}`, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      return {
        rows: rows.map((row) => ({
          ...row,
          total_bookings: Number(row.total_bookings) || 0,
          completed_bookings: Number(row.completed_bookings) || 0,
        })),
        total: Number(totalRows[0]?.total) || 0,
        page,
        limit,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUsersListV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch users");
    }
  },

  // KPIs and charts for the users page, all from real columns:
  // registered_at (join date), gender, city, used_code, UserSession, paid
  // appointments. Users with no registered_at (pre-existing accounts with no
  // history to backfill from) are counted in totals but not in any month.
  getUsersSummaryV2: async () => {
    try {
      const today = toIstDatePart(new Date());
      const [year, month] = today.split("-").map(Number);
      const pad = (n) => String(n).padStart(2, "0");
      const monthKey = (y, m) => {
        const d = new Date(Date.UTC(y, m - 1, 1));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
      };
      const thisMonth = monthKey(year, month);
      const lastMonth = monthKey(year, month - 1);
      const monthBefore = monthKey(year, month - 2);
      const dailyFrom = `${monthBefore}-01` < addDays(today, -29) ? `${monthBefore}-01` : addDays(today, -29);
      const yearStart = `${year}-01-01`;
      const run = (sql, replacements = {}) =>
        adminDbController.connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

      const [[totals], [booked], daily, monthly, [beforeYear], cities, [latestActive], [latestBooking]] =
        await Promise.all([
          run(`
            SELECT
              COUNT(*) AS total,
              COALESCE(SUM(u.status = 'active'), 0) AS active,
              COALESCE(SUM(LOWER(u.gender) IN ('male', 'm')), 0) AS male,
              COALESCE(SUM(LOWER(u.gender) IN ('female', 'f')), 0) AS female,
              COALESCE(SUM(${USER_SOURCE_SQL} = 'referral'), 0) AS referral,
              COALESCE(SUM(u.registered_at IS NULL), 0) AS unknown_join_date
            FROM User u
          `),
          run(`SELECT COUNT(DISTINCT user_id) AS booked_users, COUNT(*) AS total_bookings FROM appointments
               WHERE payment_status IN ${PAID_PAYMENT_SQL} AND ${userCountedBookingSql()}`),
          run(
            `SELECT DATE_FORMAT(registered_at, '%Y-%m-%d') AS day, COUNT(*) AS users
             FROM User WHERE registered_at >= :dailyFrom
             GROUP BY DATE_FORMAT(registered_at, '%Y-%m-%d')`,
            { dailyFrom }
          ),
          run(
            `SELECT DATE_FORMAT(registered_at, '%Y-%m') AS month, COUNT(*) AS users
             FROM User WHERE registered_at >= :yearStart
             GROUP BY DATE_FORMAT(registered_at, '%Y-%m')`,
            { yearStart }
          ),
          run(`SELECT COUNT(*) AS users FROM User WHERE registered_at < :yearStart OR registered_at IS NULL`, { yearStart }),
          run(`
            SELECT MIN(TRIM(city)) AS city, COUNT(*) AS users
            FROM User
            WHERE city IS NOT NULL AND TRIM(city) <> ''
            GROUP BY LOWER(TRIM(city))
            ORDER BY users DESC
            LIMIT 20
          `),
          run(`
            SELECT u.id, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name, u.profilePic AS profilepic, s.last_active_at
            FROM (${USER_SESSION_STATS_SQL}) s
            INNER JOIN User u ON u.id = s.user_id
            ORDER BY s.last_active_at DESC
            LIMIT 1
          `),
          run(`
            SELECT a.id AS appointment_id, a.created_at AS last_booking_at,
              u.id, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name, u.profilePic AS profilepic
            FROM appointments a
            INNER JOIN User u ON u.id = a.user_id
            WHERE a.payment_status IN ${PAID_PAYMENT_SQL}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT 1
          `),
        ]);

      const dailyMap = new Map(daily.map((r) => [r.day, Number(r.users) || 0]));
      const series = (from, days) =>
        Array.from({ length: days }, (_, i) => dailyMap.get(addDays(from, i)) || 0);
      const daysIn = (key) => {
        const [y, m] = key.split("-").map(Number);
        return new Date(Date.UTC(y, m, 0)).getUTCDate();
      };
      const sumMonth = (key) => series(`${key}-01`, daysIn(key)).reduce((a, b) => a + b, 0);

      const monthlyMap = new Map(monthly.map((r) => [r.month, Number(r.users) || 0]));
      let running = Number(beforeYear?.users) || 0;
      const growth = Array.from({ length: month }, (_, i) => {
        const key = monthKey(year, i + 1);
        running += monthlyMap.get(key) || 0;
        return { month: key, new_users: monthlyMap.get(key) || 0, total_users: running };
      });

      return {
        date: today,
        total_users: Number(totals?.total) || 0,
        active_users: Number(totals?.active) || 0,
        male_users: Number(totals?.male) || 0,
        female_users: Number(totals?.female) || 0,
        referral_users: Number(totals?.referral) || 0,
        unknown_join_date: Number(totals?.unknown_join_date) || 0,
        booked_users: Number(booked?.booked_users) || 0,
        // Every counted booking (a user with 2 bookings adds 2).
        total_bookings: Number(booked?.total_bookings) || 0,
        new_this_month: sumMonth(thisMonth),
        new_last_month: sumMonth(lastMonth),
        new_month_before: sumMonth(monthBefore),
        daily_signups: {
          last_30_days: series(addDays(today, -29), 30),
          this_month: series(`${thisMonth}-01`, Number(today.slice(8, 10))),
          last_month: series(`${lastMonth}-01`, daysIn(lastMonth)),
        },
        growth,
        top_cities: cities.map((c) => ({ city: c.city, users: Number(c.users) || 0 })),
        latest_active: latestActive || null,
        latest_booking: latestBooking || null,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUsersSummaryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch users summary");
    }
  },

  // Everything the V2 profile needs in one call, for a user of ANY status
  // (the V1 details call only returns active users). Bookings keep their real
  // appointments.status, and carry the list price, what was charged, GST,
  // what was paid and the saving, plus salon, slot time, services and coupon.
  getUserProfileV2: async (data = {}) => {
    try {
      const id = requireUserId(data.id);
      const run = (sql, replacements = {}) =>
        adminDbController.connection.query(sql, { replacements: { id, ...replacements }, type: Sequelize.QueryTypes.SELECT });

      const [[user], [sessions], bookingRows] = await Promise.all([
        run(`
          SELECT u.id, u.firstname, u.lastname, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name,
            u.email, u.phone, u.gender, u.age, u.date_of_birth, u.city, u.country, u.status,
            u.loyalty_status, u.profilePic AS profilepic, u.registered_at, u.wallet,
            u.invited_code, u.used_code,
            ${USER_SOURCE_SQL} AS source,
            ${USER_LOGIN_METHOD_SQL} AS login_method
          FROM User u
          WHERE u.id = :id
          LIMIT 1
        `),
        run(`
          SELECT COUNT(*) AS sessions, MAX(created_at) AS last_login_at, MAX(updated_at) AS last_active_at
          FROM UserSession
          WHERE user_id = :id
        `),
        run(`
          SELECT
            a.id, a.created_at,
            DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS booking_date,
            a.status, a.payment_status, a.is_wallet,
            (${userCountedBookingSql("a.")}) AS counted,
            a.amount AS list_price,
            a.discounted_amount AS amount,
            ROUND(a.discounted_amount * a.gst / 100, 2) AS gst_amount,
            ${AMOUNT_PAID_SQL} AS amount_paid,
            GREATEST(0, a.amount - a.discounted_amount) AS savings,
            cp.code AS coupon_code,
            e.\`from\` AS slot_from, e.\`to\` AS slot_to,
            d.id AS salon_id, d.name AS salon_name, d.images AS salon_images,
            f.area AS salon_area, f.city AS salon_city,
            (
              SELECT GROUP_CONCAT(COALESCE(ss.service_name, cb.combo) ORDER BY si.id SEPARATOR '||')
              FROM appointment_items si
              LEFT JOIN StoreServices ss ON si.service_id = ss.id
              LEFT JOIN Combo cb ON si.combo_id = cb.id
              WHERE si.appointment_id = a.id
            ) AS services,
            (
              SELECT GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR '||')
              FROM appointment_items ci
              LEFT JOIN StoreServices css ON ci.service_id = css.id
              LEFT JOIN Combo ccb ON ci.combo_id = ccb.id
              INNER JOIN Servicecategory sc ON sc.id = COALESCE(css.service_category, ccb.service_category)
              WHERE ci.appointment_id = a.id
            ) AS service_categories
          FROM appointments a
          LEFT JOIN Store d ON a.store_id = d.id
          LEFT JOIN PartnerAddress f ON d.address_id = f.id
          LEFT JOIN Slots e ON a.slot_id = e.id
          LEFT JOIN Coupons cp ON a.is_discounted = 1 AND cp.id = a.discount_id
          WHERE a.user_id = :id
            AND a.payment_status IN ${PAID_PAYMENT_SQL}
          ORDER BY a.booking_date DESC, e.\`from\` DESC, a.id DESC
        `),
      ]);

      if (!user) throw Error.NotFound("User not found");

      let referredBy = null;
      if (user.used_code) {
        const [referrer] = await run(
          `SELECT id, TRIM(CONCAT_WS(' ', firstname, lastname)) AS name FROM User WHERE invited_code = :code AND id <> :id LIMIT 1`,
          { code: user.used_code }
        );
        referredBy = referrer || null;
      }

      const split = (value) => (value ? String(value).split("||").filter(Boolean) : []);
      const money = (v) => Number(Number(v || 0).toFixed(2));
      const today = toIstDatePart(new Date());
      const bookings = bookingRows.map((row) => {
        const { salon_images: images, ...rest } = row;
        return {
          ...rest,
          list_price: money(row.list_price),
          amount: money(row.amount),
          gst_amount: money(row.gst_amount),
          amount_paid: money(row.amount_paid),
          savings: money(row.savings),
          is_wallet: !!row.is_wallet,
          // Counts toward the user's total bookings (userCountedBookingSql).
          counted: !!Number(row.counted),
          salon_image: firstImage(images),
          services: split(row.services),
          service_categories: split(row.service_categories),
          upcoming: ["booked", "confirmed"].includes(row.status) && row.booking_date >= today,
        };
      });

      const count = (fn) => bookings.filter(fn).length;
      const completed = bookings.filter((b) => b.status === "completed");
      const spent = completed.reduce((sum, b) => sum + b.amount_paid, 0);
      const notCancelled = bookings.filter((b) => !["cancelled", "refunded"].includes(b.status));

      return {
        user: {
          ...user,
          wallet: Number(user.wallet) || 0,
          referred_by: referredBy,
          sessions: Number(sessions?.sessions) || 0,
          last_login_at: sessions?.last_login_at || null,
          last_active_at: sessions?.last_active_at || null,
        },
        summary: {
          // Paid, not cancelled/refunded, placed from 2026-06-11; the bookings
          // list below still holds every paid booking.
          total_bookings: count((b) => b.counted),
          upcoming: count((b) => b.upcoming),
          completed: completed.length,
          cancelled: count((b) => b.status === "cancelled"),
          refunded: count((b) => b.status === "refunded"),
          this_month: count((b) => b.booking_date && b.booking_date.slice(0, 7) === today.slice(0, 7)),
          // Paid (charged price + GST) on completed bookings.
          total_spent: money(spent),
          // List price minus charged price, on bookings that weren't cancelled/refunded.
          total_savings: money(notCancelled.reduce((sum, b) => sum + b.savings, 0)),
          avg_order_value: completed.length ? money(spent / completed.length) : null,
          highest_booking: completed.length ? Math.max(...completed.map((b) => b.amount_paid)) : null,
        },
        bookings,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUserProfileV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user profile");
    }
  },

  // Timeline for one user, newest first, merged from every per-user log the
  // platform writes: logins (UserSession), bookings placed / cancelled /
  // refunded / checkouts not completed (appointments), reviews, refund
  // requests, wallet credits/debits (user_transaction_logs), push
  // notifications received (NotificationLogs) and account changes
  // (AccountLogs). In-app actions like searches or salon views are not
  // recorded anywhere, so they can't appear. `communication` is the push
  // history on its own (WhatsApp / SMS aren't logged per user).
  getUserActivityV2: async (data = {}) => {
    try {
      const id = requireUserId(data.id);
      const limit = Math.min(Math.max(1, Number(data.limit) || 50), 200);
      const run = (sql) =>
        adminDbController.connection.query(sql, { replacements: { id, limit }, type: Sequelize.QueryTypes.SELECT });

      const [logins, placed, closed, failed, reviews, refunds, wallet, notifications, account] = await Promise.all([
        run(`SELECT id, created_at AS at FROM UserSession WHERE user_id = :id AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT :limit`),
        run(`
          SELECT a.id, a.created_at AS at, a.discounted_amount AS amount, d.name AS salon_name
          FROM appointments a LEFT JOIN Store d ON d.id = a.store_id
          WHERE a.user_id = :id AND a.payment_status IN ${PAID_PAYMENT_SQL}
          ORDER BY a.created_at DESC LIMIT :limit
        `),
        run(`
          SELECT a.id, a.updated_at AS at, a.status, d.name AS salon_name
          FROM appointments a LEFT JOIN Store d ON d.id = a.store_id
          WHERE a.user_id = :id AND a.status IN ('cancelled', 'refunded')
            AND a.payment_status IN (${PAID_PAYMENT_SQL.slice(1, -1)}, 'refunded')
            AND a.updated_at IS NOT NULL
          ORDER BY a.updated_at DESC LIMIT :limit
        `),
        run(`
          SELECT a.id, a.created_at AS at, d.name AS salon_name
          FROM appointments a LEFT JOIN Store d ON d.id = a.store_id
          WHERE a.user_id = :id AND a.payment_status = 'failed'
          ORDER BY a.created_at DESC LIMIT :limit
        `),
        run(`
          SELECT r.id, r.cretaed_at AS at, r.rating, r.review_description, d.name AS salon_name
          FROM Reviews r LEFT JOIN Store d ON d.id = r.store_id
          WHERE r.user_id = :id AND r.cretaed_at IS NOT NULL
          ORDER BY r.cretaed_at DESC LIMIT :limit
        `),
        run(`
          SELECT id, created_at AS at, appointment_id, reason, status
          FROM refund_requests WHERE user_id = :id AND created_at IS NOT NULL
          ORDER BY created_at DESC LIMIT :limit
        `),
        run(`
          SELECT id, date AS at, type, transaction_amount AS amount, description
          FROM user_transaction_logs WHERE user_id = :id AND date IS NOT NULL
          ORDER BY date DESC LIMIT :limit
        `),
        run(`
          SELECT id, date AS at, title, description
          FROM NotificationLogs WHERE user_id = :id AND date IS NOT NULL
          ORDER BY date DESC LIMIT :limit
        `),
        run(`
          SELECT id, date AS at, action, description
          FROM AccountLogs WHERE user_id = :id AND date IS NOT NULL
          ORDER BY date DESC LIMIT :limit
        `),
      ]);

      const money = (v) => Number(Number(v || 0).toFixed(2));
      const events = [
        ...logins.map((r) => ({ type: "login", at: r.at, title: "Logged in", ref_id: r.id })),
        ...placed.map((r) => ({
          type: "booking",
          at: r.at,
          title: `Booked${r.salon_name ? ` at ${r.salon_name}` : ""}`,
          amount: money(r.amount),
          ref_id: r.id,
        })),
        ...closed.map((r) => ({
          type: r.status === "refunded" ? "refund" : "cancellation",
          at: r.at,
          title: `Booking #${r.id} ${r.status}${r.salon_name ? ` (${r.salon_name})` : ""}`,
          ref_id: r.id,
        })),
        ...failed.map((r) => ({
          type: "checkout_failed",
          at: r.at,
          title: `Checkout not completed${r.salon_name ? ` at ${r.salon_name}` : ""}`,
          ref_id: r.id,
        })),
        ...reviews.map((r) => ({
          type: "review",
          at: r.at,
          title: `Rated ${r.salon_name || "a salon"} ${r.rating ?? "-"}/5`,
          description: r.review_description || null,
          ref_id: r.id,
        })),
        ...refunds.map((r) => ({
          type: "refund_request",
          at: r.at,
          title: `Refund requested for booking #${r.appointment_id} (${r.status || "pending"})`,
          description: r.reason || null,
          ref_id: r.id,
        })),
        ...wallet.map((r) => ({
          type: r.type === "debit" ? "wallet_debit" : "wallet_credit",
          at: r.at,
          title: `Wallet ${r.type === "debit" ? "debited" : "credited"}`,
          amount: money(r.amount),
          description: r.description || null,
          ref_id: r.id,
        })),
        ...notifications.map((r) => ({
          type: "notification",
          at: r.at,
          title: r.title || "Notification",
          description: r.description || null,
          ref_id: r.id,
        })),
        ...account.map((r) => ({
          type: "account",
          at: r.at,
          title: String(r.action || "Account change").replace(/_/g, " ").toLowerCase(),
          description: r.description || null,
          ref_id: r.id,
        })),
      ]
        .filter((e) => e.at)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, limit);

      return {
        events,
        communication: notifications.map((r) => ({
          id: r.id,
          channel: "push",
          at: r.at,
          title: r.title || "Notification",
          description: r.description || null,
        })),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUserActivityV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user activity");
    }
  },

  // Offers tab: coupons the user redeemed on paid bookings (with the booking
  // and date, from appointments.discount_id), any redemptions recorded in
  // UsedCoupons without a matching booking, and wallet credits/debits.
  getUserOffersV2: async (data = {}) => {
    try {
      const id = requireUserId(data.id);
      const run = (sql) =>
        adminDbController.connection.query(sql, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

      const [[user], couponBookings, usedCoupons, walletRows] = await Promise.all([
        run(`SELECT id, wallet FROM User WHERE id = :id LIMIT 1`),
        run(`
          SELECT a.id AS appointment_id, a.created_at AS used_at, a.status,
            GREATEST(0, a.amount - a.discounted_amount) AS booking_savings,
            cp.id AS coupon_id, cp.code, cp.discount_type, cp.discount_value, cp.description
          FROM appointments a
          INNER JOIN Coupons cp ON cp.id = a.discount_id
          WHERE a.user_id = :id AND a.is_discounted = 1
            AND a.payment_status IN ${PAID_PAYMENT_SQL}
          ORDER BY a.created_at DESC
        `),
        run(`
          SELECT uc.coupon_id, cp.code, cp.discount_type, cp.discount_value, COUNT(*) AS times_used
          FROM UsedCoupons uc
          LEFT JOIN Coupons cp ON cp.id = uc.coupon_id
          WHERE uc.user_id = :id
          GROUP BY uc.coupon_id, cp.code, cp.discount_type, cp.discount_value
        `),
        run(`
          SELECT id, date, type, transaction_amount AS amount, description
          FROM user_transaction_logs WHERE user_id = :id
          ORDER BY date DESC
        `),
      ]);

      if (!user) throw Error.NotFound("User not found");

      const money = (v) => Number(Number(v || 0).toFixed(2));
      const wallet = walletRows.map((r) => ({ ...r, amount: money(r.amount) }));
      const total = (type) => money(wallet.filter((w) => w.type === type).reduce((sum, w) => sum + w.amount, 0));
      const bookedCouponIds = new Set(couponBookings.map((c) => c.coupon_id));

      return {
        coupon_bookings: couponBookings.map((c) => ({
          ...c,
          booking_savings: money(c.booking_savings),
          discount_value: c.discount_value === null || c.discount_value === undefined ? null : Number(c.discount_value),
        })),
        // Redemptions with no paid booking attached (e.g. applied, then released).
        other_coupons: usedCoupons
          .filter((c) => !bookedCouponIds.has(c.coupon_id))
          .map((c) => ({ ...c, times_used: Number(c.times_used) || 0 })),
        wallet: {
          balance: Number(user.wallet) || 0,
          total_credited: total("credit"),
          total_debited: total("debit"),
          transactions: wallet,
        },
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUserOffersV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user offers");
    }
  },

  // User row for the admin V1 profile call, regardless of status - the
  // active-only getuserdetails (used by refund approval) left inactive and
  // terminated users' profiles blank.
  getAdminUserById: async (id) => {
    try {
      return await adminDbController.Models.User.findOne({
        where: { id },
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilePic', 'status', 'device_id', 'date_of_birth', 'age', 'gender', 'loyalty_status', 'city', 'registered_at'],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user details");
    }
  },
  getUsersForExcelExport: async () => {
    try {
      return await adminDbController.Models.User.findAll({
        attributes: ["firstname", "lastname", "phone", "gender"],
        where: {
          phone: { [Op.ne]: null },
        },
        order: [["id", "DESC"]],
        raw: true,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users for export");
    }
  },
  getstorebyid: async (id) => {
    try {
      return await adminDbController.Models.Store.findOne({
        where: {
          id: id,
          status: "active"
        },
        attributes: ['id', 'name', 'email', 'phone', 'images', 'status', 'completion_status']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Could Not Get Store")
    }
  },
  getadminnotification: async (body) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.findAll()
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch admin notifications");
    }
  },
  getpayoutlogs: async (body) => {
    try {
      return await adminDbController.Models.WalletLogs.findAll();
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch payout logs");
    }
  },
  getactivesubs: async (data) => {
    try {
      return await adminDbController.Models.StoreSubscription.findOne({
        type: "notification",
        store_id: data.store_id,
        status: "active"
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch notification count");
    }
  },
  getactivesubscriptioncount: async (data, start_date, end_date) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.count({
        where: {
          date: {
            [Op.between]: [start_date, end_date]
          }
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active subscription count");
    }
  },
  deletecategory: async (data) => {
    try {
      return await adminDbController.Models.category.update({
        status: "inactive"
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete category");
    }
  },
  getallcategory: async (body) => {
    try {
      return await adminDbController.Models.category.findAll({
        where: {
          status: "active"
        },
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch categories");
    }
  },
  addcategory: async (data, file) => {
    try {
      return await adminDbController.Models.category.create({
        name: data.name,
        image: file,
        status: "active",
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add category")
    }
  },
  updatecategory: async (data, file) => {
    try {
      return await adminDbController.Models.category.update({
        name: data.name,
        image: file,
        status: data.status || "active",
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update category");
    }
  },
  updateservicecategoryimage: async (category_id, imageKey) => {
    try {
      const result = await adminDbController.Models.Servicecategory.update({
        imageKey: imageKey,
      }, {
        where: { id: category_id }
      });
      return result[0] > 0;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update service category image");
    }
  },
  deletecoupon: async (data) => {
    try {

      return await adminDbController.Models.Coupons.update({
        status: "inactive"
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete coupon");
    }
  },
  getallsubscription: async () => {
    try {
      const res =  await adminDbController.Models.SubscriptionPlans.findAll({
        order: [['id', 'DESC']]
      });
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch subscriptions");
    }
  },
  getallcoupons: async (body) => {
    try {
      return await adminDbController.Models.Coupons.findAll({
        order: [['id', 'DESC']]
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch coupons");
    }
  },
  addcoupons: async (data) => {
    try {
      return await adminDbController.Models.Coupons.create({
        code: data.code,
        discount: data.discount,
        discount_type: data.discount_type,
        start_date: data.start_date,
        end_date: data.end_date,
        usage_limit: data.usage_limit,
        discount_value: data.discount_value,
        status: "active",
        created_at: new Date(),
        description: data.description || null
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add coupons");
    }
  },
  updatecoupons: async (data) => {
    try {
      return await adminDbController.Models.Coupons.update({
        code: data?.code,
        discount: data?.discount,
        discount_type: data?.discount_type,
        start_date: data?.start_date,
        end_date: data?.end_date,
        usage_limit: data?.usage_limit,
        discount_value: data?.discount_value,
        status: data?.status || "active",
        created_at: new Date(),
        description: data?.description || null
      }, {
        where: {
          id: data.id
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add coupons");
    }
  },
  // The client's "go live" date — appointment/store-driven dashboard
  // metrics only count activity on/after this date (NULL = all-time).
  // Deliberately NOT applied to user-status metrics (total users,
  // first-booking users, funnel, segments) — see the migration comment.
  getDashboardSettings: async () => {
    try {
      const row = await adminDbController.Models.AdminSettings.findOne({
        where: { id: 1 },
        raw: true,
      });
      return { dashboard_data_start_date: row?.dashboard_data_start_date || null };
    } catch (error) {
      console.log("🚀 ~ getDashboardSettings error:", error);
      throw Error.SomethingWentWrong("Failed to fetch dashboard settings");
    }
  },
  updateDashboardDataStartDate: async (data) => {
    try {
      await adminDbController.Models.AdminSettings.upsert({
        id: 1,
        dashboard_data_start_date: data.dashboard_data_start_date || null,
        updated_at: new Date(),
      });
      return { dashboard_data_start_date: data.dashboard_data_start_date || null };
    } catch (error) {
      console.log("🚀 ~ updateDashboardDataStartDate error:", error);
      throw Error.SomethingWentWrong("Failed to update dashboard data start date");
    }
  },

  // Free paid bookings a partner gets before they need a manual
  // subscription (AdminSettings.free_booking_limit). Raw SQL on purpose:
  // the column is deliberately not on the AdminSettings model, so the
  // model upsert in updateDashboardDataStartDate can never reset it.
  getFreeBookingLimit: async () => {
    try {
      const rows = await adminDbController.connection.query(
        `SELECT free_booking_limit FROM AdminSettings WHERE id = 1 LIMIT 1`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      const limit = rows[0]?.free_booking_limit;
      return {
        free_booking_limit:
          limit === null || limit === undefined ? DEFAULT_FREE_BOOKING_LIMIT : Number(limit),
      };
    } catch (error) {
      console.log("🚀 ~ getFreeBookingLimit error:", error);
      throw Error.SomethingWentWrong("Failed to fetch free booking limit");
    }
  },
  updateFreeBookingLimit: async (data) => {
    try {
      const raw = data?.free_booking_limit;
      const limit = Number(raw);
      const numeric = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "");
      if (!numeric || !Number.isInteger(limit)) {
        throw Error.BadRequest("free_booking_limit must be a whole number");
      }
      if (limit < 0 || limit > MAX_FREE_BOOKING_LIMIT) {
        throw Error.BadRequest(`free_booking_limit must be between 0 and ${MAX_FREE_BOOKING_LIMIT}`);
      }

      await adminDbController.connection.query(
        `
        INSERT INTO AdminSettings (id, free_booking_limit, updated_at)
        VALUES (1, :limit, NOW())
        ON DUPLICATE KEY UPDATE free_booking_limit = VALUES(free_booking_limit), updated_at = NOW()
        `,
        { replacements: { limit }, type: Sequelize.QueryTypes.INSERT }
      );

      return await adminDbController.app.getFreeBookingLimit();
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ updateFreeBookingLimit error:", error);
      throw Error.SomethingWentWrong("Failed to update free booking limit");
    }
  },

  // ── Dashboard V2 ────────────────────────────────────────────────────────
  //
  // Same metrics for every requested { key, from, to } range (see
  // dashboardRanges.js), so the client can show any period it likes and
  // compare it against any other. One query per metric group — the ranges
  // are a derived table, not a loop.
  //
  // Definitions:
  //   bookings        paid appointments (payment_status success/sucssess —
  //                   same rule as Store.total_booking_count), by booking_date
  //   cancellations   of those, the ones later cancelled or refunded
  //   revenue         Gloup's own revenue = platform_fee_revenue +
  //                   subscription_revenue
  //   platform_fee_revenue  the platform fee customers paid on bookings that
  //                   weren't cancelled/refunded (refunds return the fee), by
  //                   booking_date (appointments.platform_fee)
  //   subscription_revenue  manual subscription fees (incl. 18% GST) actually
  //                   collected, i.e. deducted from payouts, by when the
  //                   payout was marked paid — the subscriptions page's
  //                   "collected"
  //   gmv             value of what customers booked, on paid bookings
  //                   that weren't cancelled/refunded, by booking_date:
  //                   per item, normal services / combos at the charged
  //                   price, "important" services at their original price
  //                   (ITEM_GMV_SQL). No coupons, GST or platform fee.
  //   cac_spend       the discount Gloup funds per booking: list price at
  //                   booking time minus what the customer was charged, 0
  //                   for "important" services (ITEM_CAC_SQL)
  //   checkout_dropoffs  appointments whose payment failed/expired
  //                   (payment_status 'failed'), by created_at
  //   total_users / total_partners / active_subscriptions
  //                   running totals as of the end of the range
  //
  // Appointment/store metrics honour dashboard_data_start_date; user and
  // subscription metrics don't (same policy as getDashboard).
  getDashboardV2Metrics: async (data = {}) => {
    try {
      const { dashboard_data_start_date: cutoff } =
        await adminDbController.app.getDashboardSettings();
      const resolved = resolveRanges(data.ranges, cutoff || null);
      const { sql: rangesSql, replacements } = rangesTableSql(resolved);
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { ...replacements, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });

      const [bookingRows, cacRows, dropoffRows, userRows, partnerRows, subscriptionRows, collectedRows] =
        await Promise.all([
          run(`
            SELECT r.k,
              COUNT(a.id) AS bookings,
              COALESCE(SUM(a.status IN ('cancelled', 'refunded')), 0) AS cancellations,
              COALESCE(SUM(CASE WHEN a.status NOT IN ('cancelled', 'refunded') THEN ${PLATFORM_FEE_SQL} END), 0) AS platform_fee_revenue
            FROM (${rangesSql}) r
            LEFT JOIN appointments a
              ON a.booking_date >= r.f AND a.booking_date < r.e
              -- Paid, including bookings refunded later (payment_status
              -- 'refunded'), so refunds count as bookings and cancellations.
              AND ${PAYMENT_MADE_SQL}
            GROUP BY r.k
          `),
          run(`
            SELECT r.k,
              COUNT(DISTINCT a.id) AS cac_bookings,
              COALESCE(SUM(${ITEM_CAC_SQL}), 0) AS cac_spend,
              COALESCE(SUM(${ITEM_GMV_SQL}), 0) AS gmv
            FROM (${rangesSql}) r
            LEFT JOIN appointments a
              ON a.booking_date >= r.f AND a.booking_date < r.e
              AND a.payment_status IN ('success', 'sucssess')
              AND a.status NOT IN ('cancelled', 'refunded')
            LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
            LEFT JOIN StoreServices ss ON ai.service_id = ss.id
            LEFT JOIN Combo cb ON ai.combo_id = cb.id
            GROUP BY r.k
          `),
          run(`
            SELECT r.k,
              COUNT(a.id) AS checkout_dropoffs,
              COUNT(DISTINCT a.user_id) AS checkout_dropoff_users
            FROM (${rangesSql}) r
            LEFT JOIN appointments a
              ON a.created_at >= r.f AND a.created_at < r.e
              AND a.payment_status = 'failed'
            GROUP BY r.k
          `),
          run(`
            SELECT r.k,
              (SELECT COUNT(*) FROM User u
                WHERE u.status = 'active'
                  AND (u.registered_at IS NULL OR u.registered_at < r.e)) AS total_users,
              (SELECT COUNT(*) FROM User u
                WHERE u.registered_at >= r.fr AND u.registered_at < r.e) AS new_users
            FROM (${rangesSql}) r
          `),
          run(`
            SELECT r.k,
              (SELECT COUNT(*) FROM Store s
                WHERE s.status = 'active' AND s.completion_status = 'completed'
                  AND (:cutoff IS NULL OR s.createdAt >= :cutoff)
                  AND s.createdAt < r.e) AS total_partners,
              (SELECT COUNT(*) FROM Store s
                WHERE s.status = 'active' AND s.completion_status = 'completed'
                  AND s.createdAt >= r.f AND s.createdAt < r.e) AS new_partners
            FROM (${rangesSql}) r
          `, { cutoff: cutoff || null }),
          // A subscription counts as active on day d if it had started by
          // then and either is still active or was deactivated after d.
          // Rows deactivated before deactivated_at existed have no date and
          // are left out of history (see that migration).
          run(`
            SELECT r.k,
              (SELECT COUNT(*) FROM PartnerManualSubscriptions pms
                WHERE pms.activated_at <= r.d
                  AND (pms.status = 'active' OR pms.deactivated_at > r.d)) AS active_subscriptions,
              (SELECT COUNT(*) FROM PartnerManualSubscriptions pms
                WHERE pms.activated_at >= DATE(r.fr) AND pms.activated_at <= r.d) AS new_subscriptions
            FROM (${rangesSql}) r
          `),
          // Subscription fees collected (deducted from payouts), by paid_at -
          // same rule as getManualSubscriptionsSummaryV2's "collected", but
          // from the go-live cutoff like the rest of revenue.
          run(`
            SELECT r.k,
              COALESCE(SUM(ip.subscription_deducted), 0) AS subscription_revenue
            FROM (${rangesSql}) r
            LEFT JOIN InvoicePayouts ip
              ON ip.paid_at >= r.f AND ip.paid_at < r.e AND ip.subscription_deducted > 0
            GROUP BY r.k
          `),
        ]);

      const byKey = (rows) => new Map(rows.map((row) => [row.k, row]));
      const bookings = byKey(bookingRows);
      const cac = byKey(cacRows);
      const dropoffs = byKey(dropoffRows);
      const users = byKey(userRows);
      const partners = byKey(partnerRows);
      const subscriptions = byKey(subscriptionRows);
      const collected = byKey(collectedRows);
      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));

      const result = {};
      resolved.forEach((r) => {
        const b = bookings.get(r.key) || {};
        const c = cac.get(r.key) || {};
        const d = dropoffs.get(r.key) || {};
        const u = users.get(r.key) || {};
        const p = partners.get(r.key) || {};
        const s = subscriptions.get(r.key) || {};
        const sc = collected.get(r.key) || {};
        // Appointment/store metrics for a range wholly before go-live are
        // unknown, not zero.
        const gated = (v) => (r.beforeDataStart ? null : v);
        const cacBookings = num(c.cac_bookings);
        const feeRevenue = money(b.platform_fee_revenue);
        const subscriptionRevenue = money(sc.subscription_revenue);

        result[r.key] = {
          from: r.from,
          to: r.to,
          data_from: r.beforeDataStart ? null : r.dataFrom,
          bookings: gated(num(b.bookings)),
          cancellations: gated(num(b.cancellations)),
          revenue: gated(money(feeRevenue + subscriptionRevenue)),
          platform_fee_revenue: gated(feeRevenue),
          subscription_revenue: gated(subscriptionRevenue),
          gmv: gated(money(c.gmv)),
          cac_spend: gated(money(c.cac_spend)),
          cac_bookings: gated(cacBookings),
          cac_per_booking: gated(cacBookings ? money(num(c.cac_spend) / cacBookings) : null),
          checkout_dropoffs: gated(num(d.checkout_dropoffs)),
          checkout_dropoff_users: gated(num(d.checkout_dropoff_users)),
          total_partners: gated(num(p.total_partners)),
          new_partners: gated(num(p.new_partners)),
          total_users: num(u.total_users),
          new_users: num(u.new_users),
          active_subscriptions: num(s.active_subscriptions),
          new_subscriptions: num(s.new_subscriptions),
        };
      });

      return { dashboard_data_start_date: cutoff || null, ranges: result };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getDashboardV2Metrics error:", error);
      throw Error.SomethingWentWrong("Failed to fetch dashboard metrics");
    }
  },

  // Point-in-time alerts for the dashboard V2 "Alerts & Insights" card.
  //   idle_salons        active salons (older than the window) with no paid
  //                      booking created in the last `idle_days` days
  //   overdue_payouts    past invoice days (store, date) with non-cancelled
  //                      bookings but no InvoicePayouts row. Looks back
  //                      `overdue_days`, never before the first payout ever
  //                      recorded (days before the payout feature existed
  //                      were never meant to be marked) or the go-live
  //                      cutoff. Amount is the invoice gross, before any
  //                      subscription deduction.
  //   subscription_dues  what active manual subscriptions owe right now
  //                      (resolveSubscriptionCycles, as on the invoice page)
  //   checkout_dropoffs  failed/expired payments created today
  getDashboardV2Alerts: async (data = {}) => {
    try {
      const idleDays = Math.min(Math.max(Number(data.idle_days) || 7, 1), 90);
      const overdueDays = Math.min(Math.max(Number(data.overdue_days) || 30, 1), 365);
      const today = toIstDatePart(new Date());
      const idleFrom = addDays(today, -(idleDays - 1));

      const { dashboard_data_start_date: cutoff } =
        await adminDbController.app.getDashboardSettings();
      const [firstPayout] = await adminDbController.connection.query(
        `SELECT MIN(invoice_date) AS first_date FROM InvoicePayouts`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      const firstPayoutDate = firstPayout?.first_date ? toIstDatePart(firstPayout.first_date) : null;
      const overdueFrom = [addDays(today, -overdueDays), cutoff, firstPayoutDate]
        .filter(Boolean)
        .sort()
        .pop();
      const overdueTo = addDays(today, -1);

      const [idleRows, overdueRows, subs, dropoffRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS idle_salons
          FROM Store s
          WHERE s.status = 'active' AND s.completion_status = 'completed'
            AND s.createdAt < :idleFrom
            AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.store_id = s.id
                AND a.payment_status IN ('success', 'sucssess')
                AND a.created_at >= :idleFrom
            )
          `,
          { replacements: { idleFrom }, type: Sequelize.QueryTypes.SELECT }
        ),
        // Invoice gross per (store, day) — same pricing rule as
        // getInvoiceDetailsForPartner: important services at full price,
        // everything else at what the customer was charged.
        overdueFrom > overdueTo
          ? Promise.resolve([])
          : adminDbController.connection.query(
            `
            SELECT a.store_id, DATE(a.booking_date) AS invoice_date,
              SUM(
                CASE
                  WHEN ss.id IS NOT NULL AND ss.important = 1 THEN ss.amount
                  WHEN ss.id IS NOT NULL OR cb.id IS NOT NULL THEN COALESCE(ai.service_amount, 0)
                  ELSE 0
                END
              ) AS amount
            FROM appointments a
            INNER JOIN appointment_items ai ON ai.appointment_id = a.id
            LEFT JOIN StoreServices ss ON ai.service_id = ss.id
            LEFT JOIN Combo cb ON ai.combo_id = cb.id
            LEFT JOIN InvoicePayouts ip
              ON ip.store_id = a.store_id AND ip.invoice_date = DATE(a.booking_date)
            WHERE a.booking_date >= :overdueFrom AND a.booking_date < :today
              AND a.status != 'cancelled'
              AND ip.id IS NULL
            GROUP BY a.store_id, DATE(a.booking_date)
            `,
            { replacements: { overdueFrom, today }, type: Sequelize.QueryTypes.SELECT }
          ),
        adminDbController.connection.query(
          `
          SELECT store_id, ${SUB_CYCLE_COLUMNS}
          FROM PartnerManualSubscriptions
          WHERE status = 'active'
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS users
          FROM appointments
          WHERE payment_status = 'failed' AND created_at >= :today
          `,
          { replacements: { today }, type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const overdueAmount = overdueRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      const cycles = await adminDbController.app.resolveSubscriptionCycles(subs, today);
      const dues = [...cycles.values()].map((cycle) => cycle.due).filter((due) => due > 0);

      return {
        date: today,
        idle_salons: { count: Number(idleRows[0]?.idle_salons) || 0, days: idleDays },
        overdue_payouts: {
          invoices: overdueRows.length,
          partners: new Set(overdueRows.map((row) => row.store_id)).size,
          amount: Number(overdueAmount.toFixed(2)),
          from_date: overdueFrom > overdueTo ? null : overdueFrom,
          to_date: overdueTo,
        },
        subscription_dues: {
          partners: dues.length,
          amount: Number(dues.reduce((sum, due) => sum + due, 0).toFixed(2)),
        },
        checkout_dropoffs: {
          attempts: Number(dropoffRows[0]?.attempts) || 0,
          users: Number(dropoffRows[0]?.users) || 0,
        },
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getDashboardV2Alerts error:", error);
      throw Error.SomethingWentWrong("Failed to fetch dashboard alerts");
    }
  },
  gettotalusers: async () => {
    try {
      return await adminDbController.Models.User.count({
        where: {
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total users");
    }
  },
  getfirstbookingusers: async () => {
    try {
      return await adminDbController.Models.User.count({
        where: {
          status: "active",
          loyalty_status: "first_booking"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch first-booking users");
    }
  },
  // Cumulative funnel: each stage is a strict subset of the one above it,
  // derived from the same paid_booking_count thresholds that drive
  // loyalty_status (0=new_user, 1=first_booking, 2-4=repeat, 5-9=loyal, 10+=vip).
  getCustomerFunnel: async () => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN loyalty_status != 'new_user' THEN 1 ELSE 0 END) AS made_booking,
          SUM(CASE WHEN loyalty_status IN ('repeat','loyal','vip') THEN 1 ELSE 0 END) AS repeat_users,
          SUM(CASE WHEN loyalty_status IN ('loyal','vip') THEN 1 ELSE 0 END) AS loyal_users,
          SUM(CASE WHEN loyalty_status = 'vip' THEN 1 ELSE 0 END) AS vip_users,
          AVG(CASE WHEN paid_booking_count > 0 THEN paid_booking_count END) AS avg_bookings_per_user
        FROM \`User\`
        WHERE status = 'active'
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const row = rows[0] || {};
      const total = Number(row.total || 0);
      const pct = (n) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);

      const stageDefs = [
        { key: "total_users", label: "Total Users", min_bookings: 0, count: total },
        { key: "made_booking", label: "Made a Booking", min_bookings: 1, count: Number(row.made_booking || 0) },
        { key: "repeat_users", label: "Repeat Users", min_bookings: 2, count: Number(row.repeat_users || 0) },
        { key: "loyal_users", label: "Loyal Customers", min_bookings: 5, count: Number(row.loyal_users || 0) },
        { key: "vip_users", label: "VIP Customers", min_bookings: 10, count: Number(row.vip_users || 0) },
      ].map((s) => ({ ...s, percentage: pct(s.count) }));

      return {
        stages: stageDefs,
        avg_bookings_per_user: row.avg_bookings_per_user != null ? Number(Number(row.avg_bookings_per_user).toFixed(1)) : 0,
      };
    } catch (error) {
      console.log("🚀 ~ getCustomerFunnel error:", error);
      throw Error.SomethingWentWrong("Failed to compute customer funnel");
    }
  },
  getAvgDaysBetweenVisits: async ({ dataStartDate } = {}) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT AVG(gap_days) AS avg_days_between_visits FROM (
          SELECT
            user_id,
            DATEDIFF(booking_date, LAG(booking_date) OVER (PARTITION BY user_id ORDER BY booking_date)) AS gap_days
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        ) t
        WHERE gap_days > 0
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );
      const value = rows[0]?.avg_days_between_visits;
      return value != null ? Number(Number(value).toFixed(1)) : 0;
    } catch (error) {
      console.log("🚀 ~ getAvgDaysBetweenVisits error:", error);
      throw Error.SomethingWentWrong("Failed to compute average days between visits");
    }
  },
  getCustomerLifetimeValue: async ({ dataStartDate } = {}) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT AVG(user_total) AS avg_clv FROM (
          SELECT user_id, SUM(amount) AS user_total
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
          GROUP BY user_id
        ) t
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );
      const value = rows[0]?.avg_clv;
      return value != null ? Number(Number(value).toFixed(2)) : 0;
    } catch (error) {
      console.log("🚀 ~ getCustomerLifetimeValue error:", error);
      throw Error.SomethingWentWrong("Failed to compute customer lifetime value");
    }
  },
  getactivebookingstoday: async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return await adminDbController.Models.appointments.count({
        where: {
          booking_date: {
            [Sequelize.Op.gte]: today,
            [Sequelize.Op.lt]: tomorrow
          },
          status: "booked"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active bookings");
    }
  },
  getcancelledrefundedorders: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.appointments.count({
        where: {
          status: {
            [Op.in]: ["cancelled", "refunded"]
          },
          ...(dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch cancelled/refunded orders");
    }
  },
  gettopsaloons: async ({ dataStartDate } = {}) => {
    try {
      let sql = `SELECT S.id, S.name, S.email, S.phone, S.images, COUNT(A.id) AS total_appointments
                   FROM Store S
                   LEFT JOIN appointments A ON S.id = A.store_id AND A.status = 'completed' || 'booked'
                     AND (:dataStartDate IS NULL OR A.booking_date >= :dataStartDate)
                   WHERE S.status = 'active'
                   GROUP BY S.id
                   ORDER BY total_appointments DESC
                   LIMIT 10`;
      return await adminDbController.connection.query(sql, {
        replacements: { dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch top saloons");
    }
  },
  gettopcategory: async () => {
    try {
      let sql = `SELECT C.id as category_name , C.name as category_name ,`;
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch top category");
    }
  },
  getaverageordervalue: async ({ dataStartDate } = {}) => {
    try {
      const dateWhere = dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {};
      const totalSales = await adminDbController.Models.appointments.sum('amount', {
        where: {
          status: "completed",
          ...dateWhere,
        }
      });
      const totalOrders = await adminDbController.Models.appointments.count({
        where: {
          status: "completed",
          ...dateWhere,
        }
      });
      return totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : 0;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch average order value");
    }
  },
  getotalsales: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.appointments.sum('discounted_amount', {
        where: {
          status: "completed",
          ...(dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total sales");
    }
  },
  getotalsalescount: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.appointments.count({
        where: {
          status: "completed",
          ...(dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total sales count");
    }
  },
  gettotalpartner: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.Store.count({
        where: {
          status: "active",
          completion_status: "completed",
          ...(dataStartDate ? { createdAt: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total partners");
    }
  },
  getsalesbycategory: async ({ dataStartDate } = {}) => {
    try {
      let sql = `SELECT c.name as category_name, SUM(a.amount) as total_sales
              FROM category c
              LEFT JOIN Store s ON c.id = s.category_id
              LEFT JOIN appointments a ON s.id = a.store_id
                AND (:dataStartDate IS NULL OR a.booking_date >= :dataStartDate)
              GROUP BY c.name
              ORDER BY total_sales`;
      return await adminDbController.connection.query(sql, {
        replacements: { dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch sales by category");
    }
  },
  getgendersales: async ({ dataStartDate } = {}) => {
    try {
      let sql = `SELECT
         SUM(CASE WHEN u.gender = 'Male' THEN 1 ELSE 0 END) as total_men_count,
         SUM(CASE WHEN u.gender = 'Male' THEN a.discounted_amount ELSE 0 END) as total_men_sales,
         SUM(CASE WHEN u.gender = 'Female' THEN 1 ELSE 0 END) as total_women_count,
         SUM(CASE WHEN u.gender = 'Female' THEN a.discounted_amount ELSE 0 END) as total_women_sales
         FROM appointments a
         JOIN User u ON a.user_id = u.id
         WHERE a.status = 'completed'
           AND (:dataStartDate IS NULL OR a.booking_date >= :dataStartDate)`;
      return await adminDbController.connection.query(sql, {
        replacements: { dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get gender sales");
    }
  },
  getmonthlysales: async ({ year, dataStartDate } = {}) => {
    try {
      let sql = `SELECT DATE_FORMAT(a.booking_date, '%Y-%m') as month, SUM(a.discounted_amount) as total_sales
          FROM appointments a
          WHERE a.status = 'completed'
          AND  YEAR(a.booking_date) = :year
          AND (:dataStartDate IS NULL OR a.booking_date >= :dataStartDate)
          GROUP BY month
          ORDER BY month DESC`;
      return await adminDbController.connection.query(sql, {
        replacements: { year: year, dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      //////console.log("🚀 ~ getmonthlysales:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch monthly sales");
    }
  },

  getActiveUsersNow: async (minutesThreshold = 2) => {
    try {
      const cutoff = new Date(Date.now() - minutesThreshold * 60 * 1000);
      return await adminDbController.Models.UserSession.count({
        where: {
          status: "active",
          updated_at: { [Op.gte]: cutoff },
        },
        col: "user_id",
        distinct: true,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active users");
    }
  },

  getActivePartnersNow: async (minutesThreshold = 2) => {
    try {
      const cutoff = new Date(Date.now() - minutesThreshold * 60 * 1000);
      return await adminDbController.Models.StoreSession.count({
        where: {
          status: "active",
          updated_at: { [Op.gte]: cutoff },
        },
        col: "store_id",
        distinct: true,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active partners");
    }
  },

  getNewSignupsToday: async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const sql = `SELECT
        (SELECT COUNT(*) FROM (
          SELECT user_id
          FROM UserSession
          WHERE user_id IS NOT NULL
          GROUP BY user_id
          HAVING MIN(created_at) >= :todayStart
        ) AS new_user_sessions) AS new_users,
        (SELECT COUNT(*) FROM Store WHERE createdAt >= :todayStart AND status = 'active') AS new_partners`;
      const [result] = await adminDbController.connection.query(sql, {
        replacements: { todayStart },
        type: Sequelize.QueryTypes.SELECT,
      });
      return {
        new_users: parseInt(result.new_users) || 0,
        new_partners: parseInt(result.new_partners) || 0,
      };
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch new signups");
    }
  },

  addwallet: async (id, amount) => {
    try {
      return await adminDbController.Models.User.increment({
        wallet: amount,
      }, {
        where: { id: id }
      })
    } catch (error) {
      //console.log("🚀 ~ addwallet:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to add wallet");
    }
  },
  getPartnerPaymentStatus: async (body = {}) => {
    try {
      const page = Number(body.page) || 1;
      const limit = Number(body.limit) || 10;
      const offset = (page - 1) * limit;

      const statusFilter = ['paid', 'unpaid'].includes(body.status) ? body.status : null;
      const search = body.search ? `%${body.search}%` : null;

      const baseSql = `
        FROM Store s
        LEFT JOIN (
          SELECT ps1.*
          FROM PartnerSubscriptions ps1
          INNER JOIN (
            SELECT salon_id, MAX(created_at) AS max_created
            FROM PartnerSubscriptions
            GROUP BY salon_id
          ) latest
            ON ps1.salon_id = latest.salon_id
            AND ps1.created_at = latest.max_created
        ) latestSub ON latestSub.salon_id = s.id
        LEFT JOIN PartnerSubscriptionPlans psp ON latestSub.plan_id = psp.plan_id
        LEFT JOIN (
          SELECT p1.*
          FROM PartnerSubscriptionsPayments p1
          INNER JOIN (
            SELECT subscription_id, MAX(payment_date) AS max_date
            FROM PartnerSubscriptionsPayments
            GROUP BY subscription_id
          ) latestPay
            ON p1.subscription_id = latestPay.subscription_id
            AND p1.payment_date = latestPay.max_date
        ) lastPay ON lastPay.subscription_id = latestSub.subscription_id
        WHERE s.completion_status = 'completed'
        ${search ? "AND (s.name LIKE :search OR s.email LIKE :search OR s.phone LIKE :search)" : ""}
      `;

      const selectSql = `
        SELECT
          s.id AS store_id,
          s.name AS salon_name,
          s.email,
          s.phone,
          s.is_premium,
          latestSub.subscription_id,
          latestSub.plan_id,
          psp.plan_name,
          psp.price_tag,
          psp.duration_months,
          latestSub.amount_paid,
          latestSub.payment_status AS subscription_payment_status,
          latestSub.is_active AS subscription_is_active,
          latestSub.start_date,
          latestSub.end_date,
          latestSub.current_start,
          latestSub.current_end,
          latestSub.charge_at,
          latestSub.rzp_status,
          lastPay.payment_status AS last_payment_status,
          lastPay.amount AS last_payment_amount,
          lastPay.payment_method AS last_payment_method,
          lastPay.payment_date AS last_payment_date,
          lastPay.transaction_id AS last_transaction_id,
          CASE
            WHEN latestSub.payment_status = 'paid' AND latestSub.is_active = 1 THEN 'paid'
            ELSE 'unpaid'
          END AS paid_status
        ${baseSql}
      `;

      const wrappedSql = `
        SELECT * FROM (${selectSql}) t
        ${statusFilter ? "WHERE t.paid_status = :statusFilter" : ""}
        ORDER BY t.salon_name ASC
        LIMIT :limit OFFSET :offset
      `;

      const countSql = `
        SELECT COUNT(*) AS totalCount FROM (${selectSql}) t
        ${statusFilter ? "WHERE t.paid_status = :statusFilter" : ""}
      `;

      const summarySql = `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN t.paid_status = 'paid' THEN 1 ELSE 0 END) AS paid,
          SUM(CASE WHEN t.paid_status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid
        FROM (${selectSql}) t
      `;

      const replacements = { limit, offset };
      if (search) replacements.search = search;
      if (statusFilter) replacements.statusFilter = statusFilter;

      const [rows, countResult, summaryResult] = await Promise.all([
        adminDbController.connection.query(wrappedSql, { replacements, type: Sequelize.QueryTypes.SELECT }),
        adminDbController.connection.query(countSql, { replacements, type: Sequelize.QueryTypes.SELECT }),
        adminDbController.connection.query(summarySql, { replacements: search ? { search } : {}, type: Sequelize.QueryTypes.SELECT }),
      ]);

      return {
        rows,
        totalCount: countResult?.[0]?.totalCount || 0,
        summary: {
          total: summaryResult?.[0]?.total || 0,
          paid: summaryResult?.[0]?.paid || 0,
          unpaid: summaryResult?.[0]?.unpaid || 0,
        },
      };
    } catch (error) {
      console.log("🚀 ~ getPartnerPaymentStatus DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner payment status");
    }
  },
  addnotificationlogsadmin: async (data) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.create({
        store_id: data?.store_id || null,
        notification_type: data?.notification_type || null,
        sent_to: data?.sent_to || null,
        loyalty_status: data?.loyalty_status || null,
        date: new Date(),
        title: data?.title || null,
        description: data?.description || null,
      })
    } catch (error) {
      console.error("addnotificationlogsadmin error:", error?.parent?.sqlMessage || error.message)
      throw Error.SomethingWentWrong("Failed to add notification logs");
    }
  },
 getnotificationbyid: async (id) => {
  try {

    const notificationId = id.id;

    // 1️⃣ Get main notification
    const notification = await adminDbController.Models.Adminnotificationlogs.findOne({
      where: { id: notificationId }
    });

    if (!notification) return null;

    // 2️⃣ Get Success Count
    const successCount = await adminDbController.Models.SentNotificationDevices.count({
      where: { notification_id: notificationId }
    });

    // 3️⃣ Get Failed Count
    const failedCount = await adminDbController.Models.FailedNotificationTokens.count({
      where: { notification_id: notificationId }
    });

    // 4️⃣ Get Failed Details with user info
      let sql = `SELECT FNT.token, FNT.error_code, FNT.user_id, u.firstname, u.lastname, u.email
      FROM FailedNotificationTokens FNT
      LEFT JOIN User u ON FNT.user_id = u.id
      WHERE FNT.notification_id = :notificationId`;

      const failedDetails = await adminDbController.connection.query(sql, {
        replacements: { notificationId },
        type: Sequelize.QueryTypes.SELECT,
      });


    const formattedFailedDetails = failedDetails.map(item => ({
      token: item.token,
      error_code: item.error_code,
      user_id: item.user_id,
      firstname: item.firstname || null,
      lastname: item.lastname || null,
      email: item.email || null
    }));
    return {
      notification,
      total_sent: successCount + failedCount,
      success_count: successCount,
      failed_count: failedCount,
      failed_details: formattedFailedDetails
    };

  } catch (error) {
    throw Error.SomethingWentWrong("Failed to fetch notification report");
  }
},
  getappointmentbyid: async (id) => {
    try {
      return await adminDbController.Models.appointments.findOne({
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch appointment by ID");
    }
  },
  updaterefundrequest: async (data) => {
    try {
      return await adminDbController.Models.refund_requests.update(
        { status: data.status },
        { where: { id: data.id } }
      )
    } catch (error) {
      //console.log("🚀 ~ updaterefundrequest:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to update refund requests");
    }
  },
  getrefundrequests: async (body) => {
    try {
      return await adminDbController.Models.refund_requests.findOne({
        where: {
          status: "pending",
          id: body.id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund requests");
    }
  },
  getallpartnerdeviceId: async () => {
    try {
      const res = await adminDbController.Models.Store.findAll({
        where: {
          status: "active",
          deviceId: {
            [Op.ne]: null
          }
        },
        attributes: [
          ['deviceId', 'deviceId'],
          ['id', 'partner_id'],
          ['images', 'images']
        ]
      })
      return res;
    } catch (error) {
      //console.log("🚀 ~ getallpartnerdeviceId:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch partners device ID");
    }
  },
saveFailedNotificationTokens: async (failedTokens) => {
  try {

    if (!failedTokens.length) return true;

    await adminDbController.Models.FailedNotificationTokens.bulkCreate(
      failedTokens.map(item => ({
        token: item.token,
        user_id: item.user_id,
        partner_id: item.partner_id,
        notification_id: item.notification_id,
        error_code: item.error,
        created_at: item.date
      }))
    );

    return true;

  } catch (error) {
    console.error("Error saving failed tokens:", error);
    return false;
  }
},
saveSuccessfulNotificationTokens: async (successTokens) => {
  try {

    if (!successTokens.length) return true;

    await adminDbController.Models.SentNotificationDevices.bulkCreate(
      successTokens.map(item => ({
        token: item.token,
        user_id: item.user_id,
        partner_id: item.partner_id,
        notification_id: item.notification_id,
        notification_title: item.title,
        notification_description: item.description,
        created_at: item.date
      }))
    );

    return true;

  } catch (error) {
    console.error("Error saving success tokens:", error);
    return false;
  }
},
  getallusersdeviceId: async (loyaltyStatuses) => {
    try {
      const where = {
        status: "active",
        device_id: {
          [Op.ne]: null
        }
      };

      if (Array.isArray(loyaltyStatuses) && loyaltyStatuses.length > 0) {
        where.loyalty_status = { [Op.in]: loyaltyStatuses };
      }

      const res = await adminDbController.Models.User.findAll({
        where,
        attributes: [
          ['device_id', 'device_id'],
          ['id', 'user_id'],
          ['profilePic', 'profilePic'],
          ['loyalty_status', 'loyalty_status'],
        ]
      })
      return res;

    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users device ID");
    }
  },
  /**
   * Active users for loyalty-targeted broadcasts.
   * Includes users without FCM tokens so in-app logs are still created.
   */
  getUsersByLoyaltyStatus: async (loyaltyStatuses) => {
    try {
      const where = { status: "active" };
      if (Array.isArray(loyaltyStatuses) && loyaltyStatuses.length > 0) {
        where.loyalty_status = { [Op.in]: loyaltyStatuses };
      }
      return await adminDbController.Models.User.findAll({
        where,
        attributes: [
          ["device_id", "device_id"],
          ["id", "user_id"],
          ["profilePic", "profilePic"],
          ["loyalty_status", "loyalty_status"],
        ],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users by loyalty status");
    }
  },
  getLoyaltyStatusCounts: async () => {
    try {
      const rows = await adminDbController.Models.User.findAll({
        attributes: [
          "loyalty_status",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        ],
        where: { status: "active" },
        group: ["loyalty_status"],
        raw: true,
      });
      const tiers = ["new_user", "first_booking", "repeat", "loyal", "vip"];
      const byStatus = Object.fromEntries(tiers.map((t) => [t, 0]));
      for (const row of rows) {
        if (row.loyalty_status in byStatus) {
          byStatus[row.loyalty_status] = Number(row.count) || 0;
        }
      }
      return {
        tiers: byStatus,
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      };
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch loyalty status counts");
    }
  },
  // Dashboard "Customer Segments" donut — reuses getLoyaltyStatusCounts,
  // folds new_user+first_booking into one "New User" bucket (mockup only
  // has 5 labeled slots; a single-booking customer hasn't repeated yet),
  // and adds an "Inactive" bucket from User.status (separate from
  // loyalty_status) so every account is counted exactly once.
  getCustomerSegments: async () => {
    try {
      const { tiers, total: activeTotal } = await adminDbController.app.getLoyaltyStatusCounts();
      const inactiveCount = await adminDbController.Models.User.count({
        where: { status: "inactive" },
      });

      const segmentDefs = [
        { key: "new_user", label: "New User", count: tiers.new_user + tiers.first_booking, color: "#10B981" },
        { key: "repeat_user", label: "Repeat User", count: tiers.repeat, color: "#3B82F6" },
        { key: "loyal_user", label: "Loyal User", count: tiers.loyal, color: "#F59E0B" },
        { key: "vip_user", label: "VIP User", count: tiers.vip, color: "#EF4444" },
        { key: "inactive", label: "Inactive", count: inactiveCount, color: "#9CA3AF" },
      ];

      const grandTotal = activeTotal + inactiveCount;
      const segments = segmentDefs.map((s) => ({
        ...s,
        percentage: grandTotal > 0 ? Number(((s.count / grandTotal) * 100).toFixed(1)) : 0,
      }));

      return { segments, total: grandTotal };
    } catch (error) {
      console.log("🚀 ~ getCustomerSegments error:", error);
      throw Error.SomethingWentWrong("Failed to compute customer segments");
    }
  },
  // % of each month's bookers who had already booked before (repeat rate),
  // last 6 months, zero-filled. Uses ROW_NUMBER() per user ordered by
  // booking_date to determine which bookings are a user's 2nd-or-later.
  getRepeatBookingRateByMonth: async ({ dataStartDate } = {}) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT month, SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END) AS repeat_count, COUNT(*) AS total_count
        FROM (
          SELECT
            user_id,
            DATE_FORMAT(booking_date, '%Y-%m-01') AS month,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY booking_date) AS rn
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        ) t
        WHERE month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
        GROUP BY month
        ORDER BY month
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );

      const byMonth = new Map(
        rows.map((r) => [
          r.month.slice(0, 7),
          r.total_count > 0 ? Number(((r.repeat_count / r.total_count) * 100).toFixed(1)) : 0,
        ])
      );

      return buildLastNMonths(6).map((month) => ({
        month,
        repeat_rate: byMonth.get(month) || 0,
      }));
    } catch (error) {
      console.log("🚀 ~ getRepeatBookingRateByMonth error:", error);
      throw Error.SomethingWentWrong("Failed to compute repeat booking rate by month");
    }
  },
  // 6-month trend series backing the dashboard's sparkline stat cards.
  getDashboardTrends: async ({ dataStartDate } = {}) => {
    try {
      const monthFloor = `DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')`;

      // User has no signup-date column at all (timestamps: false on the
      // model) — there is genuinely no way to compute "new signups per
      // month". Using distinct active bookers per month instead (real data,
      // from appointments.booking_date) rather than fabricating a trend.
      const usersRows = await adminDbController.connection.query(
        `
        SELECT DATE_FORMAT(booking_date, '%Y-%m') AS month, COUNT(DISTINCT user_id) AS value
        FROM appointments
        WHERE status = 'completed' AND booking_date >= ${monthFloor}
          AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        GROUP BY month
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );

      const bookingRows = await adminDbController.connection.query(
        `
        SELECT
          month,
          SUM(CASE WHEN rn = 1 THEN 1 ELSE 0 END) AS first_time_value,
          SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END) AS repeat_value,
          COUNT(*) AS bookings_value
        FROM (
          SELECT
            user_id,
            DATE_FORMAT(booking_date, '%Y-%m') AS month,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY booking_date) AS rn
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        ) t
        WHERE month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m')
        GROUP BY month
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );

      const usersByMonth = new Map(usersRows.map((r) => [r.month, Number(r.value) || 0]));
      const firstTimeByMonth = new Map(bookingRows.map((r) => [r.month, Number(r.first_time_value) || 0]));
      const repeatByMonth = new Map(bookingRows.map((r) => [r.month, Number(r.repeat_value) || 0]));
      const bookingsByMonth = new Map(bookingRows.map((r) => [r.month, Number(r.bookings_value) || 0]));

      const months = buildLastNMonths(6);
      const seriesFrom = (map) => months.map((month) => ({ month, value: map.get(month) || 0 }));

      return {
        users_by_month: seriesFrom(usersByMonth),
        first_time_by_month: seriesFrom(firstTimeByMonth),
        repeat_by_month: seriesFrom(repeatByMonth),
        bookings_by_month: seriesFrom(bookingsByMonth),
      };
    } catch (error) {
      console.log("🚀 ~ getDashboardTrends error:", error);
      throw Error.SomethingWentWrong("Failed to compute dashboard trends");
    }
  },
  getUserByIdForNotification: async (userId) => {
    try {
      return await adminDbController.Models.User.findOne({
        where: { id: userId },
        attributes: ["id", "device_id", "firstname", "lastname", "status"],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user");
    }
  },
  getStoreByIdForNotification: async (storeId) => {
    try {
      return await adminDbController.Models.Store.findOne({
        where: { id: storeId },
        attributes: ["id", "deviceId", "name", "status"],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch partner");
    }
  },
  deletereview: async (data, id) => {
    try {
      return await adminDbController.Models.Reviews.update({
        status: "inactive",
      }, {
        where: { id: data.review_id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete review");
    }
  },
  updatereviewdeleterequest: async (data) => {
    try {
      return await adminDbController.Models.review_delete_requests.update(
        { status: data.status },
        { where: { id: data.id } },
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update review delete request");
    }
  },
  getreviewrequest: async (body) => {
    try {
      let sql = `SELECT S.name as store_name, S.email as store_email, u.firstname as user_firstname, u.lastname as user_lastname, R.review_description, R.rating, RD.* FROM review_delete_requests RD
         JOIN Reviews R ON RD.review_id = R.id
         JOIN User u ON R.user_id = u.id
         JOIN Store S ON R.store_id = S.id
         WHERE RD.status = 'pending'
         ORDER BY RD.id DESC`;
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      //console.log("🚀 ~ getreviewrequest:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch review requests");
    }
  },
  getallreviews: async (body = {}) => {
    try {
      const { store_id, status } = body;
      const replacements = {};
      let reviewWhere = "WHERE 1=1";
      let summaryWhere = "WHERE 1=1";

      if (store_id) {
        reviewWhere += " AND R.store_id = :store_id";
        summaryWhere += " AND R.store_id = :store_id";
        replacements.store_id = store_id;
      }

      if (status && status !== "all") {
        reviewWhere += " AND R.status = :status";
        summaryWhere += " AND R.status = :status";
        replacements.status = status;
      }

      const reviewsSql = `
        SELECT
          R.id AS review_id,
          R.rating,
          R.review_description,
          R.status AS review_status,
          R.cretaed_at,
          R.updated_at,
          R.store_id,
          S.name AS store_name,
          S.email AS store_email,
          S.phone AS store_phone,
          U.id AS user_id,
          U.firstname AS user_firstname,
          U.lastname AS user_lastname,
          U.phone AS user_phone,
          U.email AS user_email
        FROM Reviews R
        INNER JOIN Store S ON R.store_id = S.id
        INNER JOIN User U ON R.user_id = U.id
        ${reviewWhere}
        ORDER BY R.cretaed_at DESC
        LIMIT 1000
      `;

      const summarySql = `
        SELECT
          R.store_id,
          S.name AS store_name,
          S.email AS store_email,
          S.phone AS store_phone,
          ROUND(AVG(R.rating), 2) AS average_rating,
          COUNT(R.id) AS review_count
        FROM Reviews R
        INNER JOIN Store S ON R.store_id = S.id
        ${summaryWhere}
        GROUP BY R.store_id, S.name, S.email, S.phone
        ORDER BY average_rating DESC, review_count DESC
      `;

      const [reviews, salonSummaries] = await Promise.all([
        adminDbController.connection.query(reviewsSql, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
        adminDbController.connection.query(summarySql, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      return { reviews, salonSummaries };
    } catch (error) {
      console.log("🚀 ~ getallreviews error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salon reviews");
    }
  },

  // ── Reviews V2 (ReviewsRatingsV2 page) ───────────────────────────────────

  // Paginated reviews with every filter in SQL, plus what V1 never returned:
  // salon status / logo, customer type (from completed bookings), the
  // pending removal request and the admin reply.
  getReviewsListV2: async (data = {}) => {
    try {
      const where = [];
      const replacements = {};
      const addWhere = (sql, values = {}) => {
        where.push(sql);
        Object.assign(replacements, values);
      };

      const search = String(data.search || "").trim().replace(/^#/, "");
      if (search) {
        const conditions = [
          "S.name LIKE :searchLike",
          "S.email LIKE :searchLike",
          "S.phone LIKE :searchLike",
          "CONCAT_WS(' ', U.firstname, U.lastname) LIKE :searchLike",
          "U.email LIKE :searchLike",
          "U.phone LIKE :searchLike",
          "R.review_description LIKE :searchLike",
        ];
        const values = { searchLike: `%${escapeLike(search)}%` };
        if (/^\d+$/.test(search)) {
          conditions.unshift("R.id = :searchId");
          values.searchId = Number(search);
        }
        addWhere(`(${conditions.join(" OR ")})`, values);
      }

      if (data.store_id) {
        const storeId = Number(data.store_id);
        if (!Number.isInteger(storeId) || storeId <= 0) {
          throw Error.BadRequest("store_id must be a positive whole number");
        }
        addWhere("R.store_id = :storeId", { storeId });
      }

      if (data.rating) {
        const rating = Number(data.rating);
        if (![1, 2, 3, 4, 5].includes(rating)) {
          throw Error.BadRequest("rating must be 1-5");
        }
        addWhere("R.rating = :rating", { rating });
      }

      if (data.status) {
        const statusSql = {
          active: "R.status = 'active' AND dr.review_id IS NULL",
          reported: "R.status = 'active' AND dr.review_id IS NOT NULL",
          hidden: "R.status = 'inactive'",
        }[data.status];
        if (!statusSql) {
          throw Error.BadRequest("status must be active, reported or hidden");
        }
        addWhere(`(${statusSql})`);
      }

      // "pending" = still visible and nobody has replied yet.
      if (data.response) {
        const responseSql = {
          responded: "RR.id IS NOT NULL",
          pending: "R.status = 'active' AND RR.id IS NULL",
        }[data.response];
        if (!responseSql) {
          throw Error.BadRequest("response must be responded or pending");
        }
        addWhere(`(${responseSql})`);
      }

      if (data.customer_tag) {
        if (!REVIEW_CUSTOMER_TAGS.includes(data.customer_tag)) {
          throw Error.BadRequest(`customer_tag must be one of: ${REVIEW_CUSTOMER_TAGS.join(", ")}`);
        }
        addWhere(`${REVIEW_CUSTOMER_TAG_SQL} = :customerTag`, { customerTag: data.customer_tag });
      }

      // Inclusive IST calendar days on the review's creation time.
      for (const [field, op] of [["from", ">="], ["to", "<"]]) {
        if (!data[field]) continue;
        if (!isValidDate(String(data[field]))) {
          throw Error.BadRequest(`${field} must be YYYY-MM-DD`);
        }
        const value = field === "to" ? addDays(data[field], 1) : data[field];
        addWhere(`R.cretaed_at ${op} :${field}`, { [field]: value });
      }

      const sort = REVIEW_LIST_SORTS[data.sort || "newest"];
      if (!sort) {
        throw Error.BadRequest(`sort must be one of: ${Object.keys(REVIEW_LIST_SORTS).join(", ")}`);
      }

      const page = Math.max(1, Number(data.page) || 1);
      const limit = Math.min(Math.max(1, Number(data.limit) || 10), REVIEW_LIST_MAX_LIMIT);
      const fromSql = `
        FROM Reviews R
        INNER JOIN Store S ON S.id = R.store_id
        INNER JOIN User U ON U.id = R.user_id
        LEFT JOIN (${USER_BOOKING_STATS_SQL}) bk ON bk.user_id = R.user_id
        LEFT JOIN (${REVIEW_PENDING_REQUEST_SQL}) dr ON dr.review_id = R.id
        LEFT JOIN review_replies RR ON RR.review_id = R.id
        LEFT JOIN \`admin\` A ON A.id = RR.replied_by
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      `;

      const [rows, totalRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT
            R.id AS review_id, R.rating, R.review_description,
            R.status AS review_status, R.cretaed_at AS created_at, R.updated_at,
            R.store_id, S.name AS store_name, S.email AS store_email,
            S.phone AS store_phone, S.status AS store_status, S.logo AS store_logo,
            R.user_id, TRIM(CONCAT_WS(' ', U.firstname, U.lastname)) AS customer_name,
            U.phone AS user_phone, U.email AS user_email,
            COALESCE(bk.completed_bookings, 0) AS completed_bookings,
            ${REVIEW_CUSTOMER_TAG_SQL} AS customer_tag,
            dr.request_id, dr.request_reason,
            RR.reply, RR.updated_at AS replied_at, A.name AS replied_by_name
          ${fromSql}
          ORDER BY ${sort}
          LIMIT :limit OFFSET :offset
          `,
          { replacements: { ...replacements, limit, offset: (page - 1) * limit }, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(`SELECT COUNT(*) AS total ${fromSql}`, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      return {
        rows: rows.map((row) => ({
          ...row,
          rating: row.rating === null ? null : Number(row.rating),
          completed_bookings: Number(row.completed_bookings) || 0,
        })),
        total: Number(totalRows[0]?.total) || 0,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getReviewsListV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch reviews");
    }
  },

  // KPIs for the reviews page. The client sends named inclusive IST ranges
  // ({ key, from, to }) - the selected period, the two 30-day windows the
  // deltas compare, one per sparkline week and chart month - and gets the
  // same counts back for each. `focus` names the range Top Salons uses.
  // Also returns the all-time queue sizes (tab badges) and the salons that
  // have reviews (filter dropdown).
  getReviewsSummaryV2: async (data = {}) => {
    try {
      const resolved = resolveRanges(data.ranges);
      const focus = resolved.find((r) => r.key === String(data.focus ?? resolved[0].key));
      if (!focus) {
        throw Error.BadRequest("focus must be the key of one of the ranges");
      }
      const { sql: rangesSql, replacements } = rangesTableSql(resolved);

      // Same INNER JOINs as the list, so totals and the list always agree.
      const reviewsSql = `
        SELECT R.id, R.status, R.rating, R.store_id, R.cretaed_at
        FROM Reviews R
        INNER JOIN Store S ON S.id = R.store_id
        INNER JOIN User U ON U.id = R.user_id`;
      const pendingSql =
        "SELECT DISTINCT review_id FROM review_delete_requests WHERE status = 'pending'";

      const [metricRows, topSalons, queueRows, salons] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT
            rg.k AS range_key,
            COUNT(rv.id) AS all_reviews,
            SUM(rv.status = 'active') AS total,
            AVG(CASE WHEN rv.status = 'active' AND rv.rating BETWEEN 1 AND 5 THEN rv.rating END) AS avg_rating,
            SUM(rv.status = 'active' AND rv.rating = 5) AS stars_5,
            SUM(rv.status = 'active' AND rv.rating = 4) AS stars_4,
            SUM(rv.status = 'active' AND rv.rating = 3) AS stars_3,
            SUM(rv.status = 'active' AND rv.rating = 2) AS stars_2,
            SUM(rv.status = 'active' AND rv.rating = 1) AS stars_1,
            COUNT(DISTINCT CASE WHEN rv.status = 'active' THEN rv.store_id END) AS salons,
            SUM(rv.status = 'inactive') AS hidden,
            SUM(rv.status = 'active' AND dr.review_id IS NOT NULL) AS reported,
            SUM(rv.status = 'active' AND RR.id IS NOT NULL) AS responded
          FROM (${rangesSql}) rg
          LEFT JOIN (${reviewsSql}) rv ON rv.cretaed_at >= rg.f AND rv.cretaed_at < rg.e
          LEFT JOIN (${pendingSql}) dr ON dr.review_id = rv.id
          LEFT JOIN review_replies RR ON RR.review_id = rv.id
          GROUP BY rg.k
          `,
          { replacements, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT
            R.store_id, S.name AS store_name, S.status AS store_status, S.logo AS store_logo,
            COUNT(*) AS review_count,
            ROUND(AVG(CASE WHEN R.rating BETWEEN 1 AND 5 THEN R.rating END), 2) AS average_rating
          FROM Reviews R
          INNER JOIN Store S ON S.id = R.store_id
          INNER JOIN User U ON U.id = R.user_id
          WHERE R.status = 'active' AND R.cretaed_at >= :topFrom AND R.cretaed_at < :topEnd
          GROUP BY R.store_id, S.name, S.status, S.logo
          ORDER BY review_count DESC, average_rating DESC
          LIMIT 5
          `,
          {
            replacements: { topFrom: focus.from, topEnd: focus.end },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
        adminDbController.connection.query(
          `
          SELECT
            SUM(rv.status = 'active' AND dr.review_id IS NOT NULL) AS reported_pending,
            SUM(rv.status = 'active' AND RR.id IS NULL) AS awaiting_response
          FROM (${reviewsSql}) rv
          LEFT JOIN (${pendingSql}) dr ON dr.review_id = rv.id
          LEFT JOIN review_replies RR ON RR.review_id = rv.id
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT DISTINCT S.id, S.name
          FROM Reviews R
          INNER JOIN Store S ON S.id = R.store_id
          INNER JOIN User U ON U.id = R.user_id
          ORDER BY S.name
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const num = (value) => Number(value) || 0;
      const ranges = {};
      for (const row of metricRows) {
        const stars = {
          5: num(row.stars_5),
          4: num(row.stars_4),
          3: num(row.stars_3),
          2: num(row.stars_2),
          1: num(row.stars_1),
        };
        ranges[row.range_key] = {
          all_reviews: num(row.all_reviews),
          total: num(row.total),
          avg_rating: row.avg_rating === null ? null : Number(row.avg_rating),
          stars,
          positive: stars[5] + stars[4],
          neutral: stars[3],
          negative: stars[2] + stars[1],
          salons: num(row.salons),
          hidden: num(row.hidden),
          reported: num(row.reported),
          responded: num(row.responded),
        };
      }

      return {
        ranges,
        top_salons: topSalons.map((row) => ({
          ...row,
          review_count: num(row.review_count),
          average_rating: row.average_rating === null ? null : Number(row.average_rating),
        })),
        queues: {
          reported_pending: num(queueRows[0]?.reported_pending),
          awaiting_response: num(queueRows[0]?.awaiting_response),
        },
        salons,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getReviewsSummaryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch reviews summary");
    }
  },

  // Hide (status inactive) or restore (active) one or many reviews. Hiding
  // also resolves any pending removal request for that review as approved -
  // the removal it asked for has happened. A review isn't restored if the
  // customer has since posted another active review for the same salon (the
  // apps allow one per customer per salon); those come back in `skipped`.
  updateReviewStatusV2: async (data = {}) => {
    try {
      const ids = requireReviewIds(data);
      if (!["active", "inactive"].includes(data.status)) {
        throw Error.BadRequest("status must be active or inactive");
      }
      const status = data.status;

      const reviews = await adminDbController.Models.Reviews.findAll({
        where: { id: ids },
        attributes: ["id", "user_id", "store_id", "status"],
        raw: true,
      });
      const found = new Set(reviews.map((r) => r.id));
      const notFound = ids.filter((id) => !found.has(id));
      const unchanged = reviews.filter((r) => r.status === status).map((r) => r.id);
      let targets = reviews.filter((r) => r.status !== status);
      const skipped = [];

      if (status === "active" && targets.length) {
        const active = await adminDbController.Models.Reviews.findAll({
          where: {
            status: "active",
            user_id: [...new Set(targets.map((r) => r.user_id))],
            store_id: [...new Set(targets.map((r) => r.store_id))],
          },
          attributes: ["user_id", "store_id"],
          raw: true,
        });
        const taken = new Set(active.map((r) => `${r.user_id}:${r.store_id}`));
        targets = targets.filter((r) => {
          const pair = `${r.user_id}:${r.store_id}`;
          if (taken.has(pair)) {
            skipped.push({
              review_id: r.id,
              reason: "The customer already has an active review for this salon",
            });
            return false;
          }
          taken.add(pair);
          return true;
        });
      }

      const targetIds = targets.map((r) => r.id);
      if (targetIds.length) {
        await adminDbController.connection.transaction(async (transaction) => {
          await adminDbController.Models.Reviews.update(
            { status },
            { where: { id: targetIds }, transaction }
          );
          if (status === "inactive") {
            await adminDbController.Models.review_delete_requests.update(
              { status: "approved" },
              { where: { review_id: targetIds, status: "pending" }, transaction }
            );
          }
        });
      }

      return { updated: targetIds, unchanged, skipped, not_found: notFound };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ updateReviewStatusV2 error:", error);
      throw Error.SomethingWentWrong("Failed to update reviews");
    }
  },

  // Adds the admin reply to a review, or replaces it if there already is one.
  replyReviewV2: async (data = {}, adminId = null) => {
    try {
      const [reviewId] = requireReviewIds({ review_id: data.review_id });
      const reply = String(data.reply ?? "").trim();
      if (!reply) {
        throw Error.BadRequest("reply is required");
      }
      if (reply.length > REVIEW_REPLY_MAX_LENGTH) {
        throw Error.BadRequest(`reply can be at most ${REVIEW_REPLY_MAX_LENGTH} characters`);
      }

      const review = await adminDbController.Models.Reviews.findOne({
        where: { id: reviewId },
        attributes: ["id"],
        raw: true,
      });
      if (!review) {
        throw Error.NotFound("Review");
      }

      const now = new Date();
      const existing = await adminDbController.Models.review_replies.findOne({
        where: { review_id: reviewId },
      });
      if (existing) {
        await existing.update({ reply, replied_by: adminId, updated_at: now });
      } else {
        await adminDbController.Models.review_replies.create({
          review_id: reviewId,
          reply,
          replied_by: adminId,
          created_at: now,
          updated_at: now,
        });
      }

      return { review_id: reviewId, reply, replied_at: now };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ replyReviewV2 error:", error);
      throw Error.SomethingWentWrong("Failed to save reply");
    }
  },

  deleteReviewReplyV2: async (data = {}) => {
    try {
      const [reviewId] = requireReviewIds({ review_id: data.review_id });
      const deleted = await adminDbController.Models.review_replies.destroy({
        where: { review_id: reviewId },
      });
      if (!deleted) {
        throw Error.NotFound("Reply");
      }
      return { review_id: reviewId };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ deleteReviewReplyV2 error:", error);
      throw Error.SomethingWentWrong("Failed to delete reply");
    }
  },
  getrefundrequest: async (body) => {
    try {
      let sql = `SELECT r.*, a.razorpay_id, a.payment.id , a.amount as discounted_amount, u.firstname as user_firstname, u.lastname as user_lastname, u.phone as user_phone, s.name as store_name, s.email as store_email, s.phone as store_phone FROM refund_request r JOIN s ON a.store_id = s.id JOIN User u ON a.user_id = u.id WHERE r.status = 'pending' ORDER BY r.created_at DESC`;

      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund request");
    }
  },
  deletebanner: async (data) => {
    try {
      return await adminDbController.Models.Banner.update({
        status: "inactive",
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete banner");
    }
  },
  // Rejecting a refund request also cancels the booking — but the "booking
  // cancelled" WhatsApp message is deferred 10 minutes (cancel_notify_at)
  // instead of sent here, giving an admin a window to fix a mis-click.
  // See CronHelper.scheduleCancelledBookingNotify, which re-checks the row
  // is still 'rejected' before actually sending.
  updaterequest: async (data) => {
    try {
      const updates = { status: data.status };
      if (data.status === "rejected") {
        updates.cancel_notify_at = Sequelize.literal("DATE_ADD(NOW(), INTERVAL 10 MINUTE)");
      }
      return await adminDbController.Models.refund_requests.update(updates, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update request");
    }
  },

  // Rejected requests whose 10-minute delay has elapsed and haven't been
  // notified yet. Requiring status = 'rejected' here is what makes an
  // "undo" (anything that moves the row off 'rejected' in the meantime)
  // silently cancel the pending send — there's nothing left to match.
  getDueCancelBookingNotifications: async () => {
    try {
      return await adminDbController.connection.query(
        `
        SELECT id, appointment_id
        FROM refund_requests
        WHERE status = 'rejected'
          AND cancel_notify_at IS NOT NULL
          AND cancel_notify_at <= NOW()
          AND cancel_notified_at IS NULL
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch due cancel-booking notifications");
    }
  },

  markCancelNotificationSent: async (id) => {
    try {
      return await adminDbController.Models.refund_requests.update(
        { cancel_notified_at: Sequelize.literal("NOW()") },
        { where: { id } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to mark cancel notification sent");
    }
  },
  getbanners: async (body) => {
    try {
      const sql = `
      SELECT 
        b.*,
        s.name AS store_name,
        s.email AS store_email,
        s.phone AS store_phone
      FROM Banner b
      LEFT JOIN Store s 
        ON b.store_id = s.id
      WHERE b.status = 'active'
      ORDER BY b.date DESC
    `;
      const banners = await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
      return banners;
    } catch (error) {
      console.log("🚀 ~ getbanners error:", error);
      throw Error.SomethingWentWrong("Failed to fetch banners");
    }
  },

  addbanner: async (data, file) => {
    console.log("🚀 ~ data:", data)
    try {
      return await adminDbController.Models.Banner.create({
        store_id: data?.store_id || null,
        image: file,
        status: "active",
        date: new Date(),
        type: data?.type,
        place: data?.place,
        issub: data?.issub || false
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to add banner");
    }
  },
  getBookings: async (data) => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      return await adminDbController.Models.appointments.findAll({
        where: {
          status: 'booked',
          booking_date: {
            [Op.between]: [startOfDay, endOfDay]
          }
        },
        raw: true
      });
    } catch (error) {
      console.log("🚀 ~ getBookings DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch bookings");
    }
  },
  getCancelledOrders: async (data) => {
    try {
      return await adminDbController.Models.appointments.findAll({
        where: {
          status: 'cancelled',
        },
        raw: true,
      })
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to get cancelled orders")
    }
  },
  // booking_datetime here and in getBookingsDetailsByOrderDate/ById is the
  // appointment day + the booked slot's start: booking_date itself is
  // date-only and reads as 05:30 IST.
  getBookingsDetails: async (data) => {
  try {
    const page = Number(data.page) || 1;
    const limit = Number(data.limit) || 10;
    const offset = (page - 1) * limit;
    
    const dateFilter = (data.fromDate && data.toDate) ? `AND DATE(a.created_at) BETWEEN :fromDate AND :toDate` : '';
    const statusFilter = data.status ? `AND a.status = :status` : '';

    const query = `
      SELECT DISTINCT
        a.id,
        a.created_at,
        a.booking_date,
        c.firstname AS user_name,
        d.name AS salon_name,
        a.status,
        a.payment_status,
        CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), IFNULL(CONCAT(' ', TIME_FORMAT(e.\`from\`, '%H:%i')), '')) AS booking_datetime,
        a.amount AS service_amount,
        a.discounted_amount AS discount_amount,
        (a.amount - a.discounted_amount) AS subtotal,
        (a.discounted_amount) + ROUND(((a.discounted_amount) * a.gst / 100), 2) AS payable_amount,
        DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date
      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
      LEFT JOIN Slots e ON a.slot_id = e.id
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT :limit OFFSET :offset
    `;

    const replacements = {
      limit,
      offset
    };
    if (data.fromDate && data.toDate) {
      replacements.fromDate = data.fromDate;
      replacements.toDate = data.toDate;
    }
    if (data.status) {
      replacements.status = data.status;
    }

    const rows = await adminDbController.connection.query(query, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    const totalQuery = `
      SELECT COUNT(DISTINCT a.id) AS totalCount
      FROM appointments a
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
    `;

    const totalResult = await adminDbController.connection.query(totalQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    return {
      rows: rows || [],
      totalCount: totalResult?.[0]?.totalCount || 0,
    };
  } catch (error) {
    console.log("🚀 ~ getBookingsDetails DB error:", error);
    throw Error.SomethingWentWrong("Failed to fetch booking details");
  }
},
// Same as getBookingsDetails, but filters by appointment/order date (a.booking_date) instead of created_at
getBookingsDetailsByOrderDate: async (data) => {
  try {
    const page = Number(data.page) || 1;
    const limit = Number(data.limit) || 10;
    const offset = (page - 1) * limit;

    const dateFilter = (data.fromDate && data.toDate) ? `AND DATE(a.booking_date) BETWEEN :fromDate AND :toDate` : '';
    const statusFilter = data.status ? `AND a.status = :status` : '';

    const query = `
      SELECT DISTINCT
        a.id,
        a.created_at,
        a.booking_date,
        c.firstname AS user_name,
        d.name AS salon_name,
        a.status,
        a.payment_status,
        CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), IFNULL(CONCAT(' ', TIME_FORMAT(e.\`from\`, '%H:%i')), '')) AS booking_datetime,
        a.amount AS service_amount,
        a.discounted_amount AS discount_amount,
        (a.amount - a.discounted_amount) AS subtotal,
        (a.discounted_amount) + ROUND(((a.discounted_amount) * a.gst / 100), 2) AS payable_amount,
        DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date
      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
      LEFT JOIN Slots e ON a.slot_id = e.id
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
      ORDER BY a.booking_date DESC, a.id DESC
      LIMIT :limit OFFSET :offset
    `;

    const replacements = {
      limit,
      offset
    };
    if (data.fromDate && data.toDate) {
      replacements.fromDate = data.fromDate;
      replacements.toDate = data.toDate;
    }
    if (data.status) {
      replacements.status = data.status;
    }

    const rows = await adminDbController.connection.query(query, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    const totalQuery = `
      SELECT COUNT(DISTINCT a.id) AS totalCount
      FROM appointments a
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
    `;

    const totalResult = await adminDbController.connection.query(totalQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    return {
      rows: rows || [],
      totalCount: totalResult?.[0]?.totalCount || 0,
    };
  } catch (error) {
    console.log("🚀 ~ getBookingsDetailsByOrderDate DB error:", error);
    throw Error.SomethingWentWrong("Failed to fetch booking details by order date");
  }
},
// ── Bookings list V2 (admin "Bookings by Order Date" V2 page) ─────────────
//
// Same rows as getBookingsDetailsByOrderDate (V1 keeps using that one,
// untouched), plus what the V2 table shows: customer phone, salon area/city,
// slot time, service names and their service categories ("booking type").
// Search, payment and booking-type filters run in SQL so they work across
// every page, not just the one loaded.
//
// Joins mirror the partner app: slot time via appointments.slot_id -> Slots
// (getTodayBookingsByStoreId), services via appointment_items -> StoreServices
// / Combo (getservicebyappoinment), category via service_category ->
// Servicecategory. User/Store are LEFT JOINed so the total matches V1's
// count of every appointment in the range.
getBookingsListV2: async (data = {}) => {
  try {
    const where = [];
    const replacements = {};
    const addWhere = (sql, values = {}) => {
      where.push(sql);
      Object.assign(replacements, values);
    };

    const { dateColumn } = bookingListDateBasis(data.date_basis);
    if (data.fromDate || data.toDate) {
      if (!isValidDate(String(data.fromDate || "")) || !isValidDate(String(data.toDate || ""))) {
        throw Error.BadRequest("fromDate and toDate must be YYYY-MM-DD");
      }
      if (data.fromDate > data.toDate) {
        throw Error.BadRequest("fromDate must not be after toDate");
      }
      addWhere(`a.${dateColumn} >= :fromDate AND a.${dateColumn} < :toDateEnd`, {
        fromDate: data.fromDate,
        toDateEnd: addDays(data.toDate, 1),
      });
    }

    if (data.status) {
      if (!BOOKING_STATUSES.includes(data.status)) {
        throw Error.BadRequest(`status must be one of: ${BOOKING_STATUSES.join(", ")}`);
      }
      addWhere("a.status = :status", { status: data.status });
    }

    if (data.payment) {
      const paymentSql = BOOKING_PAYMENT_FILTERS[data.payment];
      if (!paymentSql) {
        throw Error.BadRequest(`payment must be one of: ${Object.keys(BOOKING_PAYMENT_FILTERS).join(", ")}`);
      }
      addWhere(paymentSql);
    }

    if (data.service_category_id !== undefined && data.service_category_id !== null && data.service_category_id !== "") {
      const categoryId = Number(data.service_category_id);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        throw Error.BadRequest("service_category_id must be a positive whole number");
      }
      addWhere(
        `EXISTS (
          SELECT 1 FROM appointment_items fi
          LEFT JOIN StoreServices fss ON fi.service_id = fss.id
          LEFT JOIN Combo fcb ON fi.combo_id = fcb.id
          WHERE fi.appointment_id = a.id
            AND COALESCE(fss.service_category, fcb.service_category) = :categoryId
        )`,
        { categoryId }
      );
    }

    const search = String(data.search || "").trim().replace(/^#/, "");
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const conditions = [
        "CONCAT_WS(' ', c.firstname, c.lastname) LIKE :searchLike",
        "c.phone LIKE :searchLike",
        "c.email LIKE :searchLike",
        "d.name LIKE :searchLike",
      ];
      const searchValues = { searchLike: like };
      if (/^\d+$/.test(search)) {
        conditions.unshift("a.id = :searchId");
        searchValues.searchId = Number(search);
      }
      addWhere(`(${conditions.join(" OR ")})`, searchValues);
    }

    const page = Math.max(1, Number(data.page) || 1);
    const limit = Math.min(Math.max(1, Number(data.limit) || 10), BOOKING_LIST_MAX_LIMIT);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromSql = `
      FROM appointments a
      LEFT JOIN User c ON a.user_id = c.id
      LEFT JOIN Store d ON a.store_id = d.id
      LEFT JOIN PartnerAddress f ON d.address_id = f.id
      LEFT JOIN Slots e ON a.slot_id = e.id
      ${whereSql}
    `;

    const [rows, totalRows] = await Promise.all([
      adminDbController.connection.query(
        `
        SELECT
          a.id,
          a.created_at,
          DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS booking_date,
          a.status,
          a.payment_status,
          a.amount,
          a.discounted_amount,
          ROUND(a.discounted_amount * a.gst / 100, 2) AS gst_amount,
          a.discounted_amount + ROUND(a.discounted_amount * a.gst / 100, 2) AS payable_amount,
          c.id AS user_id,
          TRIM(CONCAT_WS(' ', c.firstname, c.lastname)) AS user_name,
          c.phone AS user_phone,
          d.id AS salon_id,
          d.name AS salon_name,
          f.area AS salon_area,
          f.city AS salon_city,
          e.\`from\` AS slot_from,
          e.\`to\` AS slot_to,
          (
            SELECT GROUP_CONCAT(COALESCE(ss.service_name, cb.combo) ORDER BY si.id SEPARATOR '||')
            FROM appointment_items si
            LEFT JOIN StoreServices ss ON si.service_id = ss.id
            LEFT JOIN Combo cb ON si.combo_id = cb.id
            WHERE si.appointment_id = a.id
          ) AS services,
          (
            SELECT GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR '||')
            FROM appointment_items ci
            LEFT JOIN StoreServices css ON ci.service_id = css.id
            LEFT JOIN Combo ccb ON ci.combo_id = ccb.id
            INNER JOIN Servicecategory sc ON sc.id = COALESCE(css.service_category, ccb.service_category)
            WHERE ci.appointment_id = a.id
          ) AS service_categories
        ${fromSql}
        ORDER BY a.${dateColumn} DESC, a.id DESC
        LIMIT :limit OFFSET :offset
        `,
        {
          replacements: { ...replacements, limit, offset: (page - 1) * limit },
          type: Sequelize.QueryTypes.SELECT,
        }
      ),
      adminDbController.connection.query(
        `SELECT COUNT(*) AS total ${fromSql}`,
        { replacements, type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    const split = (value) => (value ? String(value).split("||").filter(Boolean) : []);
    return {
      rows: rows.map((row) => ({
        ...row,
        amount: Number(row.amount) || 0,
        discounted_amount: Number(row.discounted_amount) || 0,
        gst_amount: Number(row.gst_amount) || 0,
        payable_amount: Number(row.payable_amount) || 0,
        services: split(row.services),
        service_categories: split(row.service_categories),
      })),
      total: Number(totalRows[0]?.total) || 0,
      page,
      limit,
    };
  } catch (error) {
    if (error.status) throw error;
    console.log("🚀 ~ getBookingsListV2 error:", error);
    throw Error.SomethingWentWrong("Failed to fetch bookings");
  }
},

// Salons ranked by revenue for a date range (bookings page "Top Performing
// Salon"). Same definitions as the dashboard V2: bookings = paid
// appointments, revenue = discounted_amount of completed ones.
getTopSalonsByDateRange: async (data = {}) => {
  try {
    if (!isValidDate(String(data.fromDate || "")) || !isValidDate(String(data.toDate || ""))) {
      throw Error.BadRequest("fromDate and toDate must be YYYY-MM-DD");
    }
    if (data.fromDate > data.toDate) {
      throw Error.BadRequest("fromDate must not be after toDate");
    }
    const { dateColumn } = bookingListDateBasis(data.date_basis);
    const limit = Math.min(Math.max(1, Number(data.limit) || 1), 20);

    const rows = await adminDbController.connection.query(
      `
      SELECT
        d.id AS salon_id,
        d.name AS salon_name,
        f.area AS salon_area,
        f.city AS salon_city,
        COUNT(a.id) AS bookings,
        COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.discounted_amount END), 0) AS revenue
      FROM appointments a
      INNER JOIN Store d ON a.store_id = d.id
      LEFT JOIN PartnerAddress f ON d.address_id = f.id
      WHERE a.${dateColumn} >= :fromDate AND a.${dateColumn} < :toDateEnd
        AND a.payment_status IN ('success', 'sucssess')
      GROUP BY d.id, d.name, f.area, f.city
      ORDER BY revenue DESC, bookings DESC, d.id ASC
      LIMIT :limit
      `,
      {
        replacements: { fromDate: data.fromDate, toDateEnd: addDays(data.toDate, 1), limit },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    return rows.map((row) => ({
      ...row,
      bookings: Number(row.bookings) || 0,
      revenue: Number(Number(row.revenue || 0).toFixed(2)),
    }));
  } catch (error) {
    if (error.status) throw error;
    console.log("🚀 ~ getTopSalonsByDateRange error:", error);
    throw Error.SomethingWentWrong("Failed to fetch top salons");
  }
},
// Revenue + booking-hour summary for the bookings V2 page.
//   revenue            invoice rule (getInvoiceDetailsForPartner /
//                      ...Monthly): every non-cancelled appointment in the
//                      range, each item priced at the full service price if
//                      the service is "important", otherwise at what was
//                      charged (appointment_items.service_amount); items with
//                      no service/combo are skipped; no GST. Summed over all
//                      salons it equals the sum of their invoices.
//   invoiced_bookings  appointments that contributed to revenue
//   avg_order_value    revenue / invoiced_bookings
//   today              the same revenue rule for appointments dated today
//   booking_hours      24 counts: paid bookings in the range by the hour
//                      they were placed (created_at, stored in IST)
getBookingsSummaryV2: async (data = {}) => {
  try {
    if (!isValidDate(String(data.fromDate || "")) || !isValidDate(String(data.toDate || ""))) {
      throw Error.BadRequest("fromDate and toDate must be YYYY-MM-DD");
    }
    if (data.fromDate > data.toDate) {
      throw Error.BadRequest("fromDate must not be after toDate");
    }
    const { dateColumn } = bookingListDateBasis(data.date_basis);
    const today = toIstDatePart(new Date());

    const revenueFor = (column, from, to) =>
      adminDbController.connection.query(
        `
        SELECT
          COUNT(DISTINCT a.id) AS invoiced_bookings,
          COALESCE(SUM(${INVOICE_ITEM_AMOUNT_SQL}), 0) AS revenue
        FROM appointments a
        INNER JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ai.service_id = ss.id
        LEFT JOIN Combo cb ON ai.combo_id = cb.id
        WHERE a.${column} >= :fromDate AND a.${column} < :toDateEnd
          AND a.status <> 'cancelled'
          AND (ss.id IS NOT NULL OR cb.id IS NOT NULL)
        `,
        {
          replacements: { fromDate: from, toDateEnd: addDays(to, 1) },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

    const [[range], [todayRow], hourRows] = await Promise.all([
      revenueFor(dateColumn, data.fromDate, data.toDate),
      // Invoices are per appointment day, so "today" is always by booking_date.
      revenueFor("booking_date", today, today),
      adminDbController.connection.query(
        `
        SELECT HOUR(a.created_at) AS hour, COUNT(*) AS bookings
        FROM appointments a
        WHERE a.${dateColumn} >= :fromDate AND a.${dateColumn} < :toDateEnd
          AND a.payment_status IN ('success', 'sucssess')
          AND a.created_at IS NOT NULL
        GROUP BY HOUR(a.created_at)
        `,
        {
          replacements: { fromDate: data.fromDate, toDateEnd: addDays(data.toDate, 1) },
          type: Sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const money = (v) => Number(Number(v || 0).toFixed(2));
    const summarize = (row) => {
      const revenue = money(row?.revenue);
      const invoiced = Number(row?.invoiced_bookings) || 0;
      return {
        revenue,
        invoiced_bookings: invoiced,
        avg_order_value: invoiced ? money(revenue / invoiced) : null,
      };
    };

    const bookingHours = Array(24).fill(0);
    hourRows.forEach((row) => {
      const hour = Number(row.hour);
      if (hour >= 0 && hour < 24) bookingHours[hour] = Number(row.bookings) || 0;
    });

    return {
      from: data.fromDate,
      to: data.toDate,
      ...summarize(range),
      today: { date: today, ...summarize(todayRow) },
      booking_hours: bookingHours,
    };
  } catch (error) {
    if (error.status) throw error;
    console.log("🚀 ~ getBookingsSummaryV2 error:", error);
    throw Error.SomethingWentWrong("Failed to fetch bookings summary");
  }
},

getBookingsDetailsById: async (data) => {
  try {
    const query = `
      SELECT
          a.id,
          COALESCE(c.firstname, '') AS user_name,
          COALESCE(c.phone, '') AS contact_number,
          COALESCE(c.email, '') AS email,
          d.name AS salon_name,
          CONCAT(f.area,' | ',f.city,' | ',f.district) AS salon_address,
          d.phone AS salon_phone,
          d.email AS salon_mail,
          a.status,
          CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), IFNULL(CONCAT(' ', TIME_FORMAT(e.\`from\`, '%H:%i')), '')) AS booking_datetime,
          CONCAT(e.from,'-',e.to) AS slot_timing,
          a.gst,
          DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date,
          a.razorpay_id,
          a.payment_status,
          a.payment_id,
          a.amount AS booking_amount,
          a.discounted_amount AS booking_subtotal,
          a.platform_fee AS booking_platform_fee,

          ai.id AS appointment_item_id,
          ai.service_amount AS item_charged,
          ai.service_id,
          COALESCE(ss.service_name, 'Deleted service') AS service_name,
          ai.combo_id,
          COALESCE(cb.combo, 'Deleted combo') AS combo_name,
          COALESCE(ai.list_amount, ss.amount, cb.amount, ai.service_amount) AS item_list_price

      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
      INNER JOIN Slots e ON a.slot_id = e.id
      INNER JOIN PartnerAddress f ON d.address_id = f.id
      LEFT JOIN appointment_items ai ON a.id = ai.appointment_id
      LEFT JOIN StoreServices ss ON ai.service_id = ss.id
      LEFT JOIN Combo cb ON ai.combo_id = cb.id
      WHERE a.id = :id
      ORDER BY ai.id
    `;

    const rows = await adminDbController.connection.query(query, {
      replacements: { id: data.id },
      type: Sequelize.QueryTypes.SELECT,
    });

    if (!rows.length) return null;

    const booking = {
      id: rows[0].id,
      user_name: rows[0].user_name,
      contact_number: rows[0].contact_number,
      email: rows[0].email,
      salon_name: rows[0].salon_name,
      salon_address: rows[0].salon_address,
      salon_phone: rows[0].salon_phone,
      salon_mail: rows[0].salon_mail,
      status: rows[0].status,
      booking_datetime: rows[0].booking_datetime,
      slot_timing: rows[0].slot_timing,
      order_date: rows[0].order_date,
      razorpay_id: rows[0].razorpay_id,
      payment_status: rows[0].payment_status,
      payment_id: rows[0].payment_id,
      appointment_items: [],
    };

    // Billing comes only from what the booking stored, never from the
    // service's current prices (those change later and would rewrite old
    // bookings):
    //   items_total      sum of what each item was charged (pre-coupon)
    //   coupon_discount  items_total - appointments.discounted_amount
    //   taxable_amount   appointments.discounted_amount (after coupon)
    //   gst_amount       taxable_amount x appointments.gst % (always 5)
    //   platform_fee     appointments.platform_fee
    //   payable_amount   appointments.amount - what Razorpay charged
    const money = (v) => Number((Number(v) || 0).toFixed(2));
    let itemsTotal = 0;

    rows.forEach((row) => {
      if (!row.service_id && !row.combo_id) return;
      const listPrice = money(row.item_list_price);
      const charged = money(row.item_charged);
      itemsTotal += charged;

      booking.appointment_items.push({
        appointment_item_id: row.appointment_item_id,
        service_id: row.service_id || null,
        combo_id: row.service_id ? null : row.combo_id,
        service_name: row.service_id ? row.service_name : row.combo_name,
        list_amount: listPrice,
        item_discount: money(Math.max(0, listPrice - charged)),
        charged_amount: charged,
      });
    });

    const gstRate = Number(rows[0].gst) > 0 ? Number(rows[0].gst) : 5;
    const taxable = money(rows[0].booking_subtotal);

    booking.items_total = money(itemsTotal);
    booking.coupon_discount = money(Math.max(0, itemsTotal - taxable));
    booking.taxable_amount = taxable;
    booking.gst_rate = gstRate;
    booking.gst_amount = money((taxable * gstRate) / 100);
    booking.platform_fee = money(rows[0].booking_platform_fee);
    booking.payable_amount = money(rows[0].booking_amount);

    return booking;
  } catch (error) {
    console.log("getBookingsDetailsById DB error:", error);
    throw Error.SomethingWentWrong(
      "Failed to fetch booking details by ID"
    );
  }
},
updateBookingStatus: async ({ body }) => {
  try {
    const { id, status } = body;

    if (!id || !status) {
      throw Error.BadRequest("Booking ID and status are required");
    }

    // 🔹 Fetch current booking
    const booking = await adminDbController.Models.appointments.findOne({
      where: { id },
    });

    if (!booking) {
      throw Error.NotFound("Booking not found");
    }

    const currentStatus = booking.status;

    // 🔒 Validate transition
    if (
      !ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(status)
    ) {
      throw Error.BadRequest(
        `Cannot change status from ${currentStatus} to ${status}`
      );
    }

    // 🔹 Update status
    await adminDbController.app.updatebookingDBStatus(id, status);

    return `Booking ${status} successfully`;
  } catch (error) {
    console.log("🚀 updatebookingstatus error:", error);
    throw error;
  }
},
updatebookingDBStatus: async (id, status) => {
  try {
    const [affectedRows] =
      await adminDbController.Models.appointments.update(
        { status },
        { where: { id } }
      );

    return affectedRows > 0;
  } catch (error) {
    console.log("updateBookingStatus DB error:", error);
    throw Error.SomethingWentWrong("Failed to update booking status");
  }
},

  getTopPerformingSalon: async () => {
    try {
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [
          'store_id',
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalRevenue']
        ],
        group: ['store_id'],
        order: [[Sequelize.literal('totalRevenue'), 'DESC']],
        raw: true
      });

      return result || {};
    } catch (error) {
      console.log("🚀 ~ getTopPerformingSalon DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch top performing salon");
    }
  },
  getFilterReport: async (data) => {
    try {
      const { filterType, fromDate, toDate } = data;
      let whereCondition = {};

      const now = new Date();

      switch (filterType) {
        case 'day': {
          const start = new Date(now.setHours(0, 0, 0, 0));
          const end = new Date(now.setHours(23, 59, 59, 999));
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        case 'date': {
          if (!fromDate || !toDate) throw new Error('fromDate and toDate are required for this filter');
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        case 'week': {
          const start = new Date();
          start.setDate(start.getDate() - 7);
          whereCondition.booking_date = { [Op.gte]: start };
          break;
        }
        case 'month': {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        case 'quarter': {
          const start = new Date();
          start.setMonth(start.getMonth() - 6);
          whereCondition.booking_date = { [Op.gte]: start };
          break;
        }
        case 'year': {
          const start = new Date(now.getFullYear(), 0, 1);
          const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        default:
          break;
      }
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalRevenue']
        ],
        where: whereCondition,
        raw: true
      });
      return { totalRevenue: result.totalRevenue || 0 };
    } catch (error) {
      console.log("🚀 ~ getRevenueReport DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch revenue report");
    }
  },
  getMonthlyReport: async (data) => {
    const { filterType } = data;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    if (filterType === "monthlyRevenue") {
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [[fn("SUM", col("amount")), "totalRevenue"]],
        where: {
          // status: "booked",
          booking_date: { [Op.between]: [startOfMonth, endOfMonth] }
        },
        raw: true
      });
      return { totalRevenue: result?.totalRevenue || 0 };
    }
    if (filterType === "monthlyAppointments") {
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [[fn("COUNT", col("id")), "totalAppointments"]],
        where: {
          // status: "booked",
          booking_date: { [Op.between]: [startOfMonth, endOfMonth] }
        },
        raw: true
      });
      return { totalAppointments: result?.totalAppointments || 0 };
    }
    return { totalRevenue: 0, totalAppointments: 0 };
  },
  // Booking count per month for a given year, optionally scoped to one salon
  getMonthlyBookingsReport: async (data) => {
    try {
      const year = Number(data.year) || new Date().getFullYear();
      const storeFilter = data.store_id ? `AND a.store_id = :store_id` : '';

      const sql = `
        SELECT DATE_FORMAT(a.booking_date, '%Y-%m') as month, COUNT(a.id) as total_bookings
        FROM appointments a
        WHERE YEAR(a.booking_date) = :year
        ${storeFilter}
        GROUP BY month
        ORDER BY month ASC
      `;

      const replacements = { year };
      if (data.store_id) replacements.store_id = data.store_id;

      const rows = await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      const countByMonth = {};
      rows.forEach((r) => { countByMonth[r.month] = Number(r.total_bookings); });

      const report = [];
      for (let m = 1; m <= 12; m++) {
        const month = `${year}-${String(m).padStart(2, "0")}`;
        report.push({ month, total_bookings: countByMonth[month] || 0 });
      }
      return report;
    } catch (error) {
      console.log("🚀 ~ getMonthlyBookingsReport error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly bookings report");
    }
  },
  // Paginated list of bookings within a date range, with user + salon details, for reporting/export
  getBookingsByDateRange: async (data) => {
    try {
      const page = Number(data.page) || 1;
      const limit = Number(data.limit) || 10;
      const offset = (page - 1) * limit;

      const storeFilter = data.store_id ? `AND a.store_id = :store_id` : '';
      const statusFilter = data.status ? `AND a.status = :status` : '';

      const replacements = {
        fromDate: data.fromDate,
        toDate: data.toDate,
        limit,
        offset,
      };
      if (data.store_id) replacements.store_id = data.store_id;
      if (data.status) replacements.status = data.status;

      const query = `
        SELECT
          a.id,
          a.created_at AS booking_date,
          a.booking_date AS appointment_date,
          a.status,
          a.payment_status,
          CASE WHEN a.payment_status IN ('success', 'sucssess') THEN 'paid' ELSE 'unpaid' END AS paid_status,
          a.amount,
          a.discounted_amount,
          c.id AS user_id,
          c.firstname AS user_firstname,
          c.lastname AS user_lastname,
          c.phone AS user_phone,
          c.email AS user_email,
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          CONCAT_WS(', ', f.area, f.city, f.district) AS partner_address
        FROM appointments a
        INNER JOIN User c ON a.user_id = c.id
        INNER JOIN Store d ON a.store_id = d.id
        LEFT JOIN PartnerAddress f ON d.address_id = f.id
        WHERE DATE(a.created_at) BETWEEN :fromDate AND :toDate
        ${storeFilter}
        ${statusFilter}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT :limit OFFSET :offset
      `;

      const rows = await adminDbController.connection.query(query, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      const totalQuery = `
        SELECT COUNT(DISTINCT a.id) AS totalCount
        FROM appointments a
        INNER JOIN User c ON a.user_id = c.id
        INNER JOIN Store d ON a.store_id = d.id
        WHERE DATE(a.created_at) BETWEEN :fromDate AND :toDate
        ${storeFilter}
        ${statusFilter}
      `;

      const totalResult = await adminDbController.connection.query(totalQuery, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      return {
        rows: rows || [],
        totalCount: totalResult?.[0]?.totalCount || 0,
      };
    } catch (error) {
      console.log("🚀 ~ getBookingsByDateRange error:", error);
      throw Error.SomethingWentWrong("Failed to fetch bookings by date range");
    }
  },
  // Total booking count for the current month, optionally scoped to one salon
  getCurrentMonthBookingsCount: async (data) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const where = {
        created_at: { [Op.between]: [startOfMonth, endOfMonth] },
      };
      if (data.store_id) where.store_id = data.store_id;

      const total = await adminDbController.Models.appointments.count({ where });

      return {
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        total_bookings: total || 0,
      };
    } catch (error) {
      console.log("🚀 ~ getCurrentMonthBookingsCount error:", error);
      throw Error.SomethingWentWrong("Failed to fetch current month bookings count");
    }
  },
  getFilteredStores: async (body) => {
    try {
      let sql = `
      SELECT 
        s.id,
        s.name,
        s.store_type,
        s.email,
        s.phone,
        s.images,
        s.description,
        c.name AS category_name
      FROM Store s
      LEFT JOIN category c
        ON FIND_IN_SET(c.id, s.category_id)
      WHERE 1=1
    `;
      const replacements = {};
      if (body.salon) {
        sql += ` AND s.name LIKE :salon`;
        replacements.salon = `%${body.salon}%`;
      }
      if (body.category) {
        sql += ` AND c.name LIKE :category`;
        replacements.category = `%${body.category}%`;
      }
      sql += ` ORDER BY s.name ASC`;
      return await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      console.log("🚀 ~ getFilteredStores error:", error);
      throw Error.SomethingWentWrong("Failed to fetch filtered stores");
    }
  },
  getCategoryRevenue: async (body) => {
    const { category, month, year } = body;

    if (!category) {
      throw Error.SomethingWentWrong("category is required");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetYear = year || currentYear;
    const targetMonth = month || currentMonth;

    const sql = `
    SELECT 
      c.name AS category_name,
      COALESCE(SUM(a.amount), 0) AS total_revenue
    FROM appointments a
    INNER JOIN Store s
      ON a.store_id = s.id
    INNER JOIN category c
      ON FIND_IN_SET(c.id, s.category_id)
    WHERE 
      a.amount IS NOT NULL
      AND c.name LIKE :categoryPattern
      AND YEAR(a.booking_date) = :targetYear
      AND MONTH(a.booking_date) = :targetMonth
    GROUP BY 
      c.id, c.name
  `;
    const result = await connection.query(sql, {
      replacements: {
        categoryPattern: `%${category}%`,
        targetYear,
        targetMonth,
      },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result.length ? result : [];
  },

  searchStores: async (body) => {
    try {
      const { search, status } = body;
      let sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa
        ON pa.store_id = s.id
      WHERE 1=1
    `;
      const replacements = {};
      if (status) {
        sql += ` AND s.status = :status`;
        replacements.status = status;
      }
      if (search) {
        sql += ` AND (
        s.name LIKE :search
        OR s.email LIKE :search
        OR pa.city LIKE :search
      )`;
        replacements.search = `%${search}%`;
      }
      sql += ` ORDER BY s.id DESC`;
      const result = await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ searchStores error:", error);
      throw Error.SomethingWentWrong("Failed to search stores");
    }
  },
  getStoresByStatus: async (body) => {
    try {
      const { status } = body;
      if (!status || !['active', 'inactive'].includes(status)) {
        throw Error.SomethingWentWrong("Please provide a valid status: 'active' or 'inactive'");
      }
      const sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa
        ON pa.store_id = s.id
      WHERE s.status = :status
      ORDER BY s.id DESC
    `;
      const result = await adminDbController.connection.query(sql, {
        replacements: { status },
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ getStoresByStatus error:", error);
      throw Error.SomethingWentWrong("Failed to fetch stores by status");
    }
  },
  getSalons: async (params) => {
    try {
      let sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa
        ON pa.store_id = s.id
      WHERE 1=1
    `;
      const replacements = {};
      if (params?.id) {
        sql += ` AND s.id = :id`;
        replacements.id = params.id;
      }
      sql += ` ORDER BY s.id DESC`;
      const result = await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ getSalons error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salons");
    }
  },
  getRevenueCategory: async (body) => {
    try {
      const { category } = body;
      const sql = `
            SELECT
                c.name AS category_name,
                COUNT(a.id) AS appointment_count,
                SUM(a.amount) AS total_revenue
            FROM
                appointments a
            JOIN
                Store s ON a.store_id = s.id
            JOIN
                category c ON CAST(s.category_id AS UNSIGNED) = c.id
            ${category ? 'WHERE c.name = :category' : ''} 
            ${category ? '' : 'WHERE a.amount IS NOT NULL'}
            GROUP BY
                c.name
            ORDER BY
                total_revenue DESC
        `;
      const replacements = {};
      if (category) {
        replacements.category = category;
      }
      const result = await connection.query(sql, {
        replacements: replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ getCategoryMetrics_Debug error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category metrics (Debug)");
    }
  },
  getRevenueCategoryGrowth: async (body = {}) => {
    try {
      const { category } = body;

      const now = new Date();
      const currentYear = now.getFullYear();
      const lastYear = currentYear - 1;

      const sql = `
      SELECT
        c.name AS category_name,
        SUM(CASE WHEN YEAR(a.booking_date) = :currentYear THEN a.amount ELSE 0 END) AS current_year_revenue,
        SUM(CASE WHEN YEAR(a.booking_date) = :lastYear THEN a.amount ELSE 0 END) AS last_year_revenue,
        ROUND(
          (SUM(CASE WHEN YEAR(a.booking_date) = :currentYear THEN a.amount ELSE 0 END)
          /
          NULLIF(SUM(CASE WHEN YEAR(a.booking_date) IN (:currentYear, :lastYear) THEN a.amount ELSE 0 END), 0)
          ) * 100, 2
        ) AS growth_percentage
      FROM appointments a
      JOIN Store s ON a.store_id = s.id
      JOIN category c ON CAST(s.category_id AS UNSIGNED) = c.id
      ${category ? 'WHERE c.name = :category' : 'WHERE a.amount IS NOT NULL'}
      GROUP BY c.name
      ORDER BY growth_percentage DESC
    `;

      const replacements = { currentYear, lastYear };
      if (category) replacements.category = category;

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      return result.length ? result : [];
    } catch (error) {
      console.log("🚀 ~ getRevenueCategoryGrowth error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category revenue growth");
    }
  },
  updateMultipleStoreStatuses: async (storeIds, newStatus) => {
    try {
      const result = await adminDbController.Models.Store.update(
        {
          status: newStatus
        },
        {
          where: {
            id: {
              [Sequelize.Op.in]: storeIds
            }
          }
        }
      );
      return result;
    } catch (error) {
      console.log("🚀 ~ update Multiple Store Statuses error:", error);
      throw error;
    }
  },
  getAdvancedSearch: async (body) => {
    try {
      const { phone, email, salon_name } = body;

      const sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.phone,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa ON pa.store_id = s.id
      WHERE 
        (
          (:phone IS NOT NULL AND s.phone LIKE :phone)
          OR (:email IS NOT NULL AND s.email LIKE :email)
          OR (:salon_name IS NOT NULL AND s.name LIKE :salon_name)
        )
      ORDER BY s.id DESC
    `;

      const result = await adminDbController.connection.query(sql, {
        replacements: {
          phone: phone ? `%${phone}%` : null,
          email: email ? `%${email}%` : null,
          salon_name: salon_name ? `%${salon_name}%` : null,
        },
        type: Sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.log("🚀 ~ advancedSearchStores error:", error);
      throw Error.SomethingWentWrong("Failed to perform advanced search");
    }
  },
  updateSalon: async (data, images, docs) => {
    try {
      return await adminDbController.Models.Store.update({
        name: data.name,
        store_type: data.store_type,
        website: data.website,
        team_size: data.team_size,
        email: data.email,
        income: data.income,
        bank_account_holder: data.bank_account_holder,
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        description: data.description,
        phone: data.phone,
        status: data.status,
        images: images ? JSON.stringify(images) : data.images,
        docs: docs ? JSON.stringify(docs) : data.docs,
      }, {
        where: { id: data.id },
      });
    } catch (error) {
      console.log("🚀 ~ updateStoreDetails error:", error);
      throw Error.SomethingWentWrong("Failed to update store details");
    }
  },
  getCustomers: async (body) => {
    const { month, year } = body;
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const sql = `
    WITH current_month_customers AS (
      SELECT DISTINCT user_id
      FROM appointments
      WHERE 
        MONTH(booking_date) = :month
        AND YEAR(booking_date) = :year
        AND user_id IS NOT NULL
    ),
    new_customers AS (
      SELECT cm.user_id
      FROM current_month_customers cm
      WHERE NOT EXISTS (
        SELECT 1 
        FROM appointments a
        WHERE 
          a.user_id = cm.user_id
          AND (
            YEAR(a.booking_date) < :year OR
            (YEAR(a.booking_date) = :year AND MONTH(a.booking_date) < :month)
          )
      )
    )
    SELECT
      (SELECT COUNT(*) FROM new_customers) AS new_customers_count,
      (SELECT COUNT(*) FROM current_month_customers) - (SELECT COUNT(*) FROM new_customers) AS returning_customers_count,
      ROUND(
        (CAST((SELECT COUNT(*) FROM new_customers) AS DECIMAL(10,2)) / NULLIF((SELECT COUNT(*) FROM current_month_customers), 0)) * 100,
        2
      ) AS new_customers_percentage,
      ROUND(
        (CAST(((SELECT COUNT(*) FROM current_month_customers) - (SELECT COUNT(*) FROM new_customers)) AS DECIMAL(10,2)) / NULLIF((SELECT COUNT(*) FROM current_month_customers), 0)) * 100,
        2
      ) AS returning_customers_percentage
  `;

    const [result] = await adminDbController.connection.query(sql, {
      replacements: { month: targetMonth, year: targetYear },
      type: Sequelize.QueryTypes.SELECT,
    });

    return `
New Customers: ${result.new_customers_percentage || 0}%, Returning Customers: ${result.returning_customers_percentage || 0}%
  `.trim();
  },

  getStore: async (body) => {
    try {
      const { fromDate, toDate } = body;

      if (!fromDate || !toDate) {
        throw Error.SomethingWentWrong("Please provide both fromDate and toDate in 'YYYY-MM-DD' format");
      }

      const sql = `
            SELECT DISTINCT
                s.id,
                s.name AS salon_name,
                s.email,
                s.status,
                s.createdAt,
                pa.city,
                pa.state,
                pa.district,
                pa.area,
                pa.zipcode
            FROM Store s
            LEFT JOIN PartnerAddress pa
                ON pa.store_id = s.id
            WHERE DATE(s.createdAt) BETWEEN :fromDate AND :toDate
            ORDER BY s.createdAt DESC
        `;

      const result = await adminDbController.connection.query(sql, {
        replacements: { fromDate, toDate },
        type: Sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.log("🚀 ~ getStoresByDateRange error:", error);
      throw Error.SomethingWentWrong("Failed to fetch stores by date range");
    }
  },

  getactivesubscription: async (data, store_id) => {
    try {
      return await adminDbController.Models.StoreSubscription.findOne({
        where: {
          status: "active",
          store_id: data.store_id,
          type: "banner"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active subscriptions");
    }
  },
  checkbannerquantity: async (body, start_date, end_date) => {
    try {
      let sql = `SELECT COUNT(b.id) as total_banner 
              FROM Banner b 
              WHERE b.store_id = :store_id 
              AND b.status = 'active' 
              AND b.date <= :end_date 
              AND b.date >= :start_date`;

      return await adminDbController.connection.query(sql, {
        replacements: {
          store_id: body.id,
          start_date: start_date,
          end_date: end_date
        },
        type: Sequelize.QueryTypes.SELECT
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check banner quantity");
    }
  },
  checkbannerquantity: async (body, start_date, end_date) => {
    try {
      let sql = `SELECT COUNT(b.id) as total_banner 
              FROM Banner b 
              WHERE b.store_id = :store_id 
              AND b.status = 'active' 
              AND b.date <= :end_date 
              AND b.date >= :start_date`;

      return await adminDbController.connection.query(sql, {
        replacements: {
          store_id: body.id,
          start_date: start_date,
          end_date: end_date
        },
        type: Sequelize.QueryTypes.SELECT
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check banner quantity");
    }
  },
  updatewallet: async (body, remainig_balance) => {
    try {
      return await adminDbController.Models.Store.update({
        wallet_remaining: remainig_balance,
      }, {
        where: { id: body.store_id }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update wallet");
    }
  },
  getwallet: async (id) => {
    try {
      return await adminDbController.Models.Store.findOne({
        where: {
          id: id,
          status: "active"
        },
        attributes: ['wallet_remaining']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch wallet details");

    }
  },
  addpayouts: async (body, remainig_balance, wallet) => {
    try {
      return await adminDbController.Models.WalletLogs.create({
        date: new Date(),
        amount_added: body.amount,
        balance_before: wallet,
        balance_after: remainig_balance,
        user_id: body.store_id,
        payment_sucssess: 'sucssess',
        updated_at: new Date(),
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add payouts");
    }
  },
  updatepartner: async (body) => {
    try {
      return await adminDbController.Models.Store.update({
        status: body.status,
      }, {
        where: { id: body.id }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update user");
    }
  },
  updateMultiplePartner: async (partnerIds, newStatus) => {
    try {
      const result = await adminDbController.Models.Store.update({
        completion_status: newStatus
      },
        {
          where: {
            id: {
              [Sequelize.Op.in]: partnerIds
            }
          }
        });
      return result;
    } catch (error) {
      console.log("🚀 ~ update Multiple Partner Statuses error:", error);
      throw error;
    }
  },
  deletePartner: async (body) => {
    try {
      return await adminDbController.Models.Store.update({
        status: "terminated",
      }, {
        where: { id: body.id }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete user");
    }
  },
  createService: async (data) => {
    console.log("Create Service AdminDB: ", data);

    try {

      // Convert to integer
      const priorityValue = Number(data.priority || 0);

      // Validate duplicate priority for same store
      if (priorityValue > 0) {

        const existingPriority =
        await adminDbController.Models.StoreServices.findOne({
          where: {
            store_id: data.store_id,
            service_category: Number(data.category),
            service_for: data.service_for,
            priority: priorityValue,
          },
        });

        if (existingPriority) {
          throw Error.BadRequest(
            `Priority number ${priorityValue} is already assigned to another service`
          );
        }
      }

      const store = await adminDbController.Models.StoreServices.create({
        service_name: data.service_name,
        store_id: Number(data.store_id),
        amount: Number(data.amount),
        discounted_amount: Number(data.discounted_amount),
        fake_price: data.fake_price != null && data.fake_price !== "" ? Number(data.fake_price) : null,
        duration: data.duration,
        status: data.status,

        // directly save integer
        priority: priorityValue,

        service_category: Number(data.category),
        service_for: data.service_for,
        tier_discounts: data.tier_discounts ?? null,
      });

      console.log("store: ", store);

      return { success: true, store };

    } catch (error) {

      console.log("❌ createservice error:", error);

      // Re-throw existing custom errors
      if (
        error?.name === "ApplicationError" ||
        error?.type ||
        error?.code
      ) {
        throw error;
      }

      // Unknown errors only
      throw Error.SomethingWentWrong(
        error?.message || "Failed to create service"
      );
    }
  },
  bulkCreateServices: async (rows, storeId) => {
    const created = [];
    const skipped = [];

    const categories = await adminDbController.Models.Servicecategory.findAll({
      where: { status: "active" },
      attributes: ["id", "name"],
      raw: true,
    });
    const categoryMap = new Map(categories.map((c) => [normalizeCategoryKey(c.name), c.id]));
    const genderMap = { male: "male", female: "female", unisex: "unisex" };

    for (const row of rows) {
      const missing = [];

      if (!row.service_name) missing.push("service name");
      if (!row.category_raw) missing.push("service category");
      if (row.duration_raw === null || row.duration_raw === undefined || row.duration_raw === "") missing.push("duration");
      if (!row.gender_raw) missing.push("gender");
      if (row.amount === null || row.amount === undefined || row.amount === "") missing.push("original price");
      if (row.discounted_amount === null || row.discounted_amount === undefined || row.discounted_amount === "") missing.push("offer price");
      if (row.priority === null || row.priority === undefined || row.priority === "") missing.push("priority");
      if (!row.status) missing.push("status");

      if (missing.length > 0) {
        skipped.push({
          row: row.rowNumber,
          service_name: row.service_name || "(blank)",
          reason: `Missing required field(s): ${missing.join(", ")}`,
        });
        continue;
      }

      const categoryId = categoryMap.get(normalizeCategoryKey(row.category_raw));
      const duration = formatDurationFromDecimal(row.duration_raw);
      const serviceFor = genderMap[row.gender_raw.toLowerCase()];
      const priorityValue = Number(row.priority);
      const statusValue = row.status.toLowerCase();

      if (!categoryId) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Unknown category "${row.category_raw}"` });
        continue;
      }
      if (!duration) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Invalid duration "${row.duration_raw}"` });
        continue;
      }
      if (!serviceFor) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Invalid gender "${row.gender_raw}" — must be Male, Female, or Unisex` });
        continue;
      }
      if (isNaN(Number(row.amount))) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: "Original price must be a number" });
        continue;
      }
      if (isNaN(Number(row.discounted_amount))) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: "Offer price must be a number" });
        continue;
      }
      if (isNaN(priorityValue)) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: "Priority must be a number" });
        continue;
      }
      if (!["active", "inactive"].includes(statusValue)) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Invalid status "${row.status}" — must be active or inactive` });
        continue;
      }

      if (priorityValue > 0) {
        const existingPriority = await adminDbController.Models.StoreServices.findOne({
          where: {
            store_id: storeId,
            service_category: categoryId,
            service_for: serviceFor,
            priority: priorityValue,
          },
        });
        if (existingPriority) {
          skipped.push({
            row: row.rowNumber,
            service_name: row.service_name,
            reason: `Priority ${priorityValue} already used for this category/gender`,
          });
          continue;
        }
      }

      try {
        const service = await adminDbController.Models.StoreServices.create({
          service_name: row.service_name,
          store_id: Number(storeId),
          amount: Number(row.amount),
          discounted_amount: Number(row.discounted_amount),
          duration,
          status: statusValue,
          priority: priorityValue,
          service_category: categoryId,
          service_for: serviceFor,
        });
        created.push(service);
      } catch (error) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: error.message });
      }
    }

    return { created, skipped };
  },
  editService: async (data) => {
    console.log('Edit Service AdminDB: ', data);

    try {
      const store = await adminDbController.Models.StoreServices.update({
        service_name: data.service_name,
        store_id: data.store_id,
        amount: data.amount,
        discounted_amount: data.discounted_amount,
        fake_price: data.fake_price != null && data.fake_price !== "" ? Number(data.fake_price) : null,
        duration: data.duration,
        status: data.status,
        service_category: data.category,
        priority: data.priority,
        service_for: data.service_for,
        tier_discounts: data.tier_discounts ?? null,
      }, {
        where: { id: data.id }
      });

      console.log('store: ', store)

      return { success: true, store }
    } catch (error) {
      console.log("❌ editservice error:", error);
      throw Error.SomethingWentWrong("Failed to edit service");
    }
  },
  updateServiceImportant: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("Service ID is required");
      }

      await adminDbController.Models.StoreServices.update(
        { important: !!data.important },
        { where: { id: data.id } }
      );

      return { id: data.id, important: !!data.important };
    } catch (error) {
      console.log("❌ updateServiceImportant error:", error);
      throw Error.SomethingWentWrong("Failed to update service importance");
    }
  },
  updateServiceAmount: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("Service ID is required");
      }
      if (data.amount === undefined || data.amount === null || data.amount === "" || isNaN(Number(data.amount))) {
        throw Error.BadRequest("A valid amount is required");
      }

      const amount = Number(data.amount);

      await adminDbController.Models.StoreServices.update(
        { amount },
        { where: { id: data.id } }
      );

      return { id: data.id, amount };
    } catch (error) {
      if (error.status) throw error;
      console.log("❌ updateServiceAmount error:", error);
      throw Error.SomethingWentWrong("Failed to update service amount");
    }
  },
 getServiceCategoryList: async () => {
  try {
    const categories = await partnerDbController.Models.Servicecategory.findAll({
      where: { status: "active" },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
      raw: true, // ✅ returns plain JSON
    });

    return categories;
  } catch (error) {
    console.log("🚀 getServiceCategoryList error:", error);
    throw new Error("Failed to fetch service categories");
  }
},
  // Time-limited, category-wide discount that overrides tier/default pricing
  // while active — see servicePricing.js getActiveCategoryDiscountsMap for
  // the checkout-side logic that actually applies this. Stored as one row
  // per campaign in CategoryDiscounts, so "current"/"upcoming"/"history"
  // are all just different views of the same rows.
  getCategoryDiscountOverview: async () => {
    try {
      const categories = await adminDbController.Models.Servicecategory.findAll({
        attributes: ["id", "name", "status"],
        order: [["name", "ASC"]],
        raw: true,
      });

      const allDiscounts = await adminDbController.Models.CategoryDiscounts.findAll({
        attributes: ["id", "category_id", "discount_percent", "starts_at", "ends_at"],
        raw: true,
      });

      const now = new Date();
      return categories.map((cat) => {
        const rows = allDiscounts.filter((d) => d.category_id === cat.id);
        const active =
          rows.find((d) => new Date(d.starts_at) <= now && new Date(d.ends_at) >= now) || null;
        const upcoming_count = rows.filter((d) => new Date(d.starts_at) > now).length;
        const past_count = rows.filter(
          (d) => new Date(d.ends_at) < now && d.id !== active?.id
        ).length;

        return {
          ...cat,
          is_active: !!active,
          active_discount: active,
          upcoming_count,
          past_count,
        };
      });
    } catch (error) {
      console.log("🚀 ~ getCategoryDiscountOverview error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category discount overview");
    }
  },
  getCategoryDiscountHistory: async (data) => {
    try {
      if (!data.category_id) {
        throw Error.BadRequest("category_id is required");
      }

      const rows = await adminDbController.Models.CategoryDiscounts.findAll({
        where: { category_id: data.category_id },
        order: [["starts_at", "DESC"]],
        raw: true,
      });

      const now = new Date();
      return rows.map((r) => ({
        ...r,
        state:
          new Date(r.starts_at) <= now && new Date(r.ends_at) >= now
            ? "active"
            : new Date(r.starts_at) > now
              ? "upcoming"
              : "expired",
      }));
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getCategoryDiscountHistory error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category discount history");
    }
  },
  addCategoryDiscount: async (data) => {
    try {
      if (!data.category_id) {
        throw Error.BadRequest("category_id is required");
      }
      const percent = Number(data.discount_percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw Error.BadRequest("discount_percent must be between 1 and 100");
      }
      if (!data.ends_at) {
        throw Error.BadRequest("ends_at is required");
      }

      const category = await adminDbController.Models.Servicecategory.findByPk(data.category_id);
      if (!category) {
        throw Error.NotFound("Category not found");
      }

      const startsAt = data.starts_at ? new Date(data.starts_at) : new Date();
      const endsAt = new Date(data.ends_at);
      if (isNaN(endsAt.getTime()) || (data.starts_at && isNaN(startsAt.getTime()))) {
        throw Error.BadRequest("Invalid date/time");
      }
      if (endsAt <= startsAt) {
        throw Error.BadRequest("ends_at must be after starts_at");
      }

      // Overlap check: reject if any existing window for this category
      // intersects the requested one (back-to-back windows are allowed).
      const conflicts = await adminDbController.Models.CategoryDiscounts.findAll({
        where: {
          category_id: data.category_id,
          starts_at: { [Op.lt]: endsAt },
          ends_at: { [Op.gt]: startsAt },
        },
        raw: true,
      });
      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        throw Error.BadRequest(
          `Conflicts with an existing ${Number(conflict.discount_percent)}% discount running ` +
          `${new Date(conflict.starts_at).toLocaleString()} to ${new Date(conflict.ends_at).toLocaleString()}`
        );
      }

      const created = await adminDbController.Models.CategoryDiscounts.create({
        category_id: data.category_id,
        discount_percent: percent,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by: data.created_by ?? null,
        created_at: new Date(),
      });

      return created.get({ plain: true });
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ addCategoryDiscount error:", error);
      throw Error.SomethingWentWrong("Failed to add category discount");
    }
  },
  endCategoryDiscountNow: async (data) => {
    try {
      if (!data.category_id) {
        throw Error.BadRequest("category_id is required");
      }

      const now = new Date();
      const [affected] = await adminDbController.Models.CategoryDiscounts.update(
        { ends_at: now },
        {
          where: {
            category_id: data.category_id,
            starts_at: { [Op.lte]: now },
            ends_at: { [Op.gte]: now },
          },
        }
      );
      if (affected === 0) {
        throw Error.NotFound("No active discount found for this category");
      }

      return { category_id: data.category_id, ended_at: now };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ endCategoryDiscountNow error:", error);
      throw Error.SomethingWentWrong("Failed to end category discount");
    }
  },
  cancelScheduledCategoryDiscount: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("id is required");
      }

      const row = await adminDbController.Models.CategoryDiscounts.findByPk(data.id);
      if (!row) {
        throw Error.NotFound("Discount not found");
      }
      if (new Date(row.starts_at) <= new Date()) {
        throw Error.BadRequest(
          "Only a not-yet-started discount can be cancelled — use 'end now' for one that's currently running"
        );
      }

      await row.destroy();
      return { id: data.id };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ cancelScheduledCategoryDiscount error:", error);
      throw Error.SomethingWentWrong("Failed to cancel scheduled category discount");
    }
  },
  createpartner: async (data, images, docs) => {
    const transaction = await adminDbController.connection.transaction();

    let uploadedFiles = []; // 🔥 track for rollback

    try {

      // -------------------------------
      // 1️⃣ DUPLICATE CHECK
      // -------------------------------
      const existing = await adminDbController.connection.query(
        `SELECT s.id
       FROM Store s
       LEFT JOIN PartnerAddress pa ON pa.store_id = s.id
       WHERE s.email = :email
       AND s.phone = :phone
       AND s.name = :name
       AND pa.area = :area
       LIMIT 1`,
        {
          replacements: {
            email: data.email,
            phone: data.phone,
            name: data.name,
            area: data.area
          },
          type: Sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      if (existing.length > 0) {
        throw new Error("Partner already exists with matching data");
      }

      // -------------------------------
      // 2️⃣ HASH PASSWORD
      // -------------------------------
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // -------------------------------
      // 3️⃣ CREATE STORE (NO FILES)
      // -------------------------------
      const store = await adminDbController.Models.Store.create({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        phone: data.phone,
        store_type: data.store_type,
        website: data.website || '',
        team_size: data.team_size || '',
        income: data.income || '',
        phone: data.phone,
        category_id: data.category_id,
        completion_status: data.completion_status || "pending",
        status: data.status || "active",
        bank_account_holder: data.bank_account_holder,
        account_number: data.account_number || null,
        ifsc_code: data.ifsc_code || null,
        address_id: 0,
        wallet_remaining: 0,
        description: data.description || null,
        deviceId: data.deviceId,
        whatsapp_number: data.whatsapp_number || data.phone || null,
        otp: null,
        otpExpiration: null,
        apple_sub: null
      }, { transaction });

      const storeId = store.id;
      const baseFolder = `store/${storeId}`;

      // -------------------------------
      // 4️⃣ CREATE ADDRESS
      // -------------------------------
      const address = await adminDbController.Models.PartnerAddress.create({
        store_id: storeId,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        district: data.district,
        area: data.area,
        zipcode: data.zipcode,
        landmark: data.landmark || null,
        area: data.area,
        city: data.city,
        state: data.state,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        location: {
          type: "Point",
          coordinates: [
              Number(data.longitude),
              Number(data.latitude)
            ]
          },
        radius: data.radius ? Number(data.radius) : null,
        status: data.status || "active",
      }, { transaction });

      await store.update({ address_id: address.id }, { transaction });

      // -------------------------------
      // 5️⃣ UPLOAD FILES (AFTER STORE CREATED)
      // -------------------------------

      // 📸 Images
      let uploadedImages = [];
      if (images?.length) {
        for (const file of images) {
          const res = await uploadToS3(file, `${baseFolder}/images`);
          uploadedImages.push("/" + res.key);
          uploadedFiles.push("/" + res.key); // track
        }
      }

      // 📄 Docs
      let uploadedDocs = [];
      if (docs?.length) {
        for (const file of docs) {
          const res = await uploadToS3(file, `${baseFolder}/docs`);
          uploadedDocs.push("/" + res.key);
          uploadedFiles.push("/" + res.key);
        }
      }

      // 🖼 Logo
      let uploadedLogo = null;
      if (data.logo) {
        const res = await uploadToS3(data.logo, `${baseFolder}/logo`);
        uploadedLogo = "/" + res.key;
        uploadedFiles.push("/" + res.key);
      }

      // -------------------------------
      // 6️⃣ UPDATE STORE WITH FILES
      // -------------------------------
      await store.update({
        images: JSON.stringify(uploadedImages),
        docs: JSON.stringify(uploadedDocs),
        logo: uploadedLogo,
        services_provided_for: data.servicesProvidedFor,
        languages: data.languages,
        is_premium: data.isPremium
      }, { transaction });

      // -------------------------------
      // 7️⃣ TIMESLOTS + LANGUAGES
      // -------------------------------
      await createDefaultTimeSlots(storeId);

      if (data.languages?.length) {
        await adminDbController.Models.StoreLanguages.bulkCreate(
          data.languages.map(lang => ({
            store_id: storeId,
            language_id: lang
          })),
          { transaction }
        );
      }

      // -------------------------------
      // 8️⃣ COMMIT
      // -------------------------------
      await transaction.commit();

      return { success: true, store };

    } catch (error) {

      await transaction.rollback();

      // 🔥 S3 cleanup
      if (uploadedFiles.length > 0) {
        await Promise.all(uploadedFiles.map(file => deleteIfExists(file)));
      }

      // 🧾 FILE + CONSOLE
      logger.error(`createpartner error: ${error.message}`, {
        stack: error.stack,
        code: error.code,
        parent: error?.parent?.sqlMessage,
      });

      // 🧾 DATABASE
      await logErrorToDB({
        module: "Partner",
        functionName: "createpartner",
        error,
        requestData: {
          name: data?.name,
          email: data?.email,
          phone: data?.phone
        }
      });

      throw Error.SomethingWentWrong("Failed to create partner");
    }
  },

editpartner: async (data, images, docs) => {
  console.log("EditpartnerDBcontr:", data);

  const transaction = await adminDbController.connection.transaction();

  try {

    const storeId = data.id;
    const baseFolder = `store/${storeId}`;

     // ---------- IMAGE UPLOAD TO S3 ----------
    let oldImages = [];

    if (typeof data.oldimages === "string") {
      try {
        oldImages = JSON.parse(data.oldimages);
      } catch {
        oldImages = data.oldimages.split(",").filter(Boolean);
      }
    } else {
      oldImages = data.oldimages || [];
    }

    const newImages = images || [];

    const imagesValue = [...oldImages, ...newImages];

    let newImageFileName = [];
    let uploadedFiles = [];

    if (imagesValue && imagesValue.length > 0) {
      for (const file of imagesValue) {
        const url = await uploadToS3(file, `${baseFolder}/images`);
        newImageFileName.push("/" + url.key);
        uploadedFiles.push("/" + url.key);
      }
    }

    const removedImages = oldImages.filter(
      img => !imagesValue.includes(img)
    );

    await Promise.all(removedImages.map(file => deleteIfExists(file)));

    // ---------- DOC UPLOAD TO S3 ----------
    let oldDocs = [];

    if (typeof data.oldDocs === "string") {
      try {
        oldDocs = JSON.parse(data.oldDocs);
      } catch {
        oldDocs = data.oldDocs.split(",").filter(Boolean);
      }
    } else {
      oldDocs = data.oldDocs || [];
    }
    
    const newDocs = docs || [];
    const docsValue = [...oldDocs, ...newDocs];

    let newDocFileName = [];

    if (docsValue && docsValue.length > 0) {
      for (const file of docsValue) {
        const url = await uploadToS3(file, `${baseFolder}/docs`);
        newDocFileName.push("/" + url.key);
      }
    }

    // ---------- LOGO UPLOAD ----------
    let newLogoFileName = data.oldLogo || null;

    if (data.removeLogo) {
      newLogoFileName = null;
    } else if (data.logo) {
      // if new logo file uploaded
      const logoUrl = await uploadToS3(data.logo, `${baseFolder}/logo`);
      newLogoFileName = "/" + logoUrl.key;
    }

    // ---------- STORE UPDATE ----------
    // Do not pass store_type: undefined — that can wipe the column and break user-app gender.
    const storeUpdate = {
        name: data.name,
        website: data.website,
        team_size: data.team_size,
        email: data.email,
        income: data.income,
        bank_account_holder: data.bank_account_holder,
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        description: data.description,
        phone: data.phone,
        category_id: data.category_id,
        completion_status: data.completion_status,
        status: data.status,
        whatsapp_number: data.whatsapp_number,
        images: JSON.stringify(newImageFileName),
        docs: JSON.stringify(newDocFileName),
        logo: newLogoFileName,
        services_provided_for: data.servicesProvidedFor,
        languages: data.languages,
        is_premium: data.isPremium,
    };
    if (data.store_type != null && String(data.store_type).trim() !== "") {
      storeUpdate.store_type = String(data.store_type).trim();
    }

    const st = await adminDbController.Models.Store.update(
      storeUpdate,
      {
        where: { id: data.id },
        transaction
      }
    );

    console.log("store done:", st);

    // ---------- ADDRESS UPDATE ----------
    const addressData = {
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      state: data.state || null,
      district: data.district || null,
      city: data.city || null,
      area: data.area || null,
      zipcode: data.zipcode || null,
      landmark: data.landmark || null,
      radius: data.radius || null,
      status: data.status || 'active'
    };
    if (data.latitude && data.longitude) {
      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        addressData.latitude = lat;
        addressData.longitude = lng;
        addressData.location = {
          type: "Point",
          coordinates: [lng, lat]
        };
        console.log("🚀 ~ Location set:", addressData.location);
      } else {
        console.log("⚠️ ~ Invalid latitude/longitude values:", { lat, lng });
      }
    } else {
      console.log("⚠️ ~ Latitude/Longitude not provided or null");
      addressData.latitude = null;
      addressData.longitude = null;
      addressData.location = null;
    }
    const existingAddress = await adminDbController.Models.PartnerAddress.findOne({
      where: { store_id: storeId },
      transaction
    });

    console.log("🚀 ~ Existing address found:", !!existingAddress);

    if (existingAddress) {
      // UPDATE if record exists
      console.log("🚀 ~ Updating existing address record...");
      const ad = await adminDbController.Models.PartnerAddress.update(
        addressData,
        {
          where: { store_id: storeId },
          transaction
        }
      );
      console.log("🚀 ~ Address update result:", ad);
    } else {
      // CREATE if record doesn't exist
      console.log("🚀 ~ Creating new address record...");
      const newAddress = await adminDbController.Models.PartnerAddress.create(
        {
          store_id: storeId,
          ...addressData
        },
        { transaction }
      );
      console.log("🚀 ~ Address created:", newAddress?.id);
    }

    // ---------- LANGUAGE UPDATE ----------
    const ln = data.languages || [];

    await adminDbController.Models.StoreLanguages.destroy({
      where: { store_id: data.id },
      transaction
    });

    if (ln.length > 0) {
      const now = new Date();
      const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));

      const languageRecords = ln.map((lang) => ({
        store_id: data.id,
        language_id: lang,
        CREATED_AT: istTime
      }));

      await adminDbController.Models.StoreLanguages.bulkCreate(
        languageRecords,
        { transaction }
      );
    }

    console.log("languages done:", ln);

    // ---------- COMMIT ----------
    await transaction.commit();

    return true;

  } catch (error) {

  await transaction.rollback();

  // ❌ rollback uploaded S3 files
  if (uploadedFiles.length > 0) {
    await Promise.all(uploadedFiles.map(file => deleteIfExists(file)));
  }

  // 🧾 FILE LOG
  logger.error(`editpartner error: ${error.message}`, {
    stack: error.stack
  });

  // 🧾 DB LOG
  await logErrorToDB({
    module: "Partner",
    functionName: "editpartner",
    error,
    requestData: {
      id: data?.id,
      name: data?.name
    }
  });

  throw Error.SomethingWentWrong("Failed to update partner");
}
},

getservices: async (body) => {
  try {

    const whereCondition = {
      status: "active",
      store_id: body.id
    };

    // ✅ Apply category filter only if provided
    if (body.category_id && body.category_id !== "all") {
      whereCondition.service_category = body.category_id;
    }

    const services = await adminDbController.Models.StoreServices.findAll({
      where: whereCondition,
      order: [['discounted_amount', 'ASC']]
    });

    console.log("Fetched services:", services);
    return services;

  } catch (error) {
    throw Error.SomethingWentWrong("Failed to fetch services");
  }
},

deleteservice: async (body) => {
    try {
        // Validate service_id exists
        if (!body.service_id) {
            throw new Error("Service ID is required");
        }

        // Find the service first to verify it exists
        const service = await adminDbController.Models.StoreServices.findOne({
            where: {
                id: body.service_id
            }
        });

        if (!service) {
            throw new Error("Service not found or already deleted");
        }

        // Delete the service
        const deletedRows = await adminDbController.Models.StoreServices.destroy({
            where: {
                id: body.service_id
            }
        });

        console.log("Deleted service:", service);
        return service;  // Return the deleted service data

    } catch (error) {
        throw Error.SomethingWentWrong("Failed to delete service");
    }
},

getlanguages: async (body) => {
    try {
      let sql = `SELECT l.name FROM StoreLanguages sl JOIN Languages l ON sl.language_id = l.id WHERE sl.store_id = :store_id`;
      const result = await adminDbController.connection.query(sql, {
        replacements: { store_id: body },
        type: Sequelize.QueryTypes.SELECT,
      });
      return result.map(r => r.name);
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch languages");
    }
},

getserviceprovidedfor: async (body) => {
    try {
      let sql = `SELECT spf.name
                FROM Store s
                JOIN StoreServicesProvidedFor spf
                ON JSON_CONTAINS(s.services_provided_for, CAST(spf.id AS JSON))
                WHERE s.id = :store_id`;
      const result = await adminDbController.connection.query(sql, {
        replacements: { store_id: body },
        type: Sequelize.QueryTypes.SELECT,
      });
      return result.map(r => r.name);
    }
      catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch services provided for");
    }
},

getallcombos: async (body) => {
    try {
      return await adminDbController.Models.Combo.findAll({
        where: {
          status: "active",
          store_id: body.id
        },
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch combos");
    }
  },
  getrefundrequests: async (body) => {
    try {
      let sql = `SELECT  r.*, a.razorpay_id ,a.discounted_amount as total , u.firstname as user_firstname, u.lastname as user_lastname, u.phone as user_phone ,  s.name as store_name, s.email as store_email, s.phone as store_phone
        FROM refund_requests r
        JOIN appointments a ON a.id = r.appointment_id
        JOIN User u ON a.user_id = u.id
        JOIN Store s ON a.store_id = s.id
        WHERE r.status = 'pending' 
        ORDER BY r.created_at DESC`;
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund requests");
    }
  },
  getrefundrequestbyid: async (body) => {
    try {
      return await adminDbController.Models.refund_requests.findOne({
        where: {
          id: body.id,
          status: "pending"
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund request by ID");
    }
  },
updateRefundBookingStatus: async ({ body, user }) => {
  try {
    const booking =
      await adminDbController.Models.appointments.findOne({
        where: { id: body.id },
      });

    if (!booking) {
      throw Error.NotFound("Booking not found");
    }

    // 🔒 Rule 1: Only completed bookings can be refunded
    if (booking.status !== "completed") {
      throw Error.BadRequest(
        "Only completed bookings can be refunded"
      );
    }

    // 🔒 Rule 2: Payment must be successful
    if (booking.payment_status !== "success") {
      throw Error.BadRequest(
        "Payment not completed, refund not allowed"
      );
    }

    // 🔹 TODO: Razorpay refund integration here
    // await razorpay.payments.refund(booking.payment_id);

    // 🔹 Update booking
    await adminDbController.Models.appointments.update(
      {
        status: "refunded",
        payment_status: "refunded",
        refunded_at: new Date(),
        refunded_by: user?.id || null,
      },
      { where: { id: body.id } }
    );

    return "Refund processed successfully";
  } catch (error) {
    console.log("refundBooking DB error:", error);
    throw error;
  }
},

  getproffesionalbyid: async (id) => {
    try {
      return await adminDbController.Models.Stylist.findAll({
        where: {
          store_id: id,
          status: "active"
        },
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch professional by ID");
    }
  },
  addsubscription: async (data, id) => {
    try {
      return await adminDbController.Models.SubscriptionPlans.create({
        type: data.type,
        days: data.days,
        price: data.price,
        status: "active",
        created_at: new Date(),
      });

    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add subscription");
    }
  },
  upadteuser: async (data) => {
    try {
      const user = await adminDbController.Models.User.update({
        status: data.status,
      }, { where: { id: data.id } });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update user");
    }
  },
  // Users with no gender on file, ranked by how confidently their booking
  // history (gendered services booked + gendered salons visited) suggests
  // one. Only "real" bookings count (completed + actually paid), and only
  // users with at least one gendered signal are returned — no signal means
  // nothing to infer, so they're excluded rather than shown at a
  // meaningless 50/50.
  getUsersGenderProbability: async () => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT
          u.id AS user_id,
          u.firstname,
          u.lastname,
          u.email,
          u.phone,
          SUM(CASE WHEN ss.service_for = 'male' THEN 1 ELSE 0 END) AS male_service_count,
          SUM(CASE WHEN ss.service_for = 'female' THEN 1 ELSE 0 END) AS female_service_count,
          SUM(CASE WHEN (
            LOWER(TRIM(st.store_type)) NOT IN ('unisex', 'unisex salon')
            AND (
              LOWER(TRIM(st.store_type)) REGEXP '^male( only)?$'
              OR (
                LOWER(TRIM(st.store_type)) REGEXP 'men|gents|mens'
                AND LOWER(TRIM(st.store_type)) NOT REGEXP 'women|female|ladies'
              )
            )
          ) THEN 1 ELSE 0 END) AS male_salon_count,
          SUM(CASE WHEN (
            LOWER(TRIM(st.store_type)) NOT IN ('unisex', 'unisex salon')
            AND (
              LOWER(TRIM(st.store_type)) REGEXP '^female( only)?$'
              OR LOWER(TRIM(st.store_type)) REGEXP 'women|ladies|womens|woman'
              OR (
                (LOWER(TRIM(st.store_type)) LIKE '%beauty parlour%' OR LOWER(TRIM(st.store_type)) LIKE '%beauty parlor%')
                AND LOWER(TRIM(st.store_type)) NOT REGEXP 'men|gents|male'
              )
            )
          ) THEN 1 ELSE 0 END) AS female_salon_count
        FROM User u
        INNER JOIN appointments a
          ON a.user_id = u.id
          AND a.status = 'completed'
          AND a.payment_status IN ('success', 'sucssess')
        LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ss.id = ai.service_id
        LEFT JOIN Store st ON st.id = a.store_id
        WHERE (u.gender IS NULL OR u.gender = '')
        GROUP BY u.id, u.firstname, u.lastname, u.email, u.phone
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const results = rows
        .map((row) => {
          const maleScore = Number(row.male_service_count || 0) + Number(row.male_salon_count || 0);
          const femaleScore = Number(row.female_service_count || 0) + Number(row.female_salon_count || 0);
          const totalSignal = maleScore + femaleScore;

          if (totalSignal === 0) return null;

          const probabilityMale = Math.round((maleScore / totalSignal) * 100);

          return {
            user_id: row.user_id,
            firstname: row.firstname,
            lastname: row.lastname,
            email: row.email,
            phone: row.phone,
            male_service_count: Number(row.male_service_count || 0),
            female_service_count: Number(row.female_service_count || 0),
            male_salon_count: Number(row.male_salon_count || 0),
            female_salon_count: Number(row.female_salon_count || 0),
            male_score: maleScore,
            female_score: femaleScore,
            probability_male: probabilityMale,
            probability_female: 100 - probabilityMale,
            suggested_gender:
              maleScore === femaleScore ? null : maleScore > femaleScore ? "male" : "female",
          };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.probability_male - 50) - Math.abs(a.probability_male - 50));

      return results;
    } catch (error) {
      console.log("🚀 ~ getUsersGenderProbability error:", error);
      throw Error.SomethingWentWrong("Failed to compute gender probability");
    }
  },
  updateUserGender: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("User ID is required");
      }
      if (!["male", "female"].includes(data.gender)) {
        throw Error.BadRequest("gender must be male or female");
      }

      await adminDbController.Models.User.update(
        { gender: data.gender },
        { where: { id: data.id } }
      );

      return { id: data.id, gender: data.gender };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ updateUserGender error:", error);
      throw Error.SomethingWentWrong("Failed to update user gender");
    }
  },
  // getallpartner: async (data) => {
  //   try {
  //     const stores = await adminDbController.Models.Store.findAll({
  //       attributes: [
  //         'id', 'name', 'email', 'phone', 'images',
  //         'status', 'completion_status', 'createdAt'
  //       ],
  //       order: [['id', 'DESC']],
  //       raw: true
  //     });

  //     if (!stores || stores.length === 0) return [];
  //     const storeIds = stores.map((s) => s.id);
  //     const owners = await adminDbController.Models.OwnerProfile.findAll({
  //       where: { store_id: storeIds },
  //       attributes: [
  //         'store_id', 'name', 'email', 'phone',
  //         'profile_pic', 'country', 'country_code', 'Dob'
  //       ],
  //       raw: true
  //     });
  //     const appointments = await adminDbController.Models.appointments.findAll({
  //       attributes: [
  //         'store_id',
  //         [fn('COUNT', col('id')), 'TotalAppointment']
  //       ],
  //       where: { store_id: storeIds },
  //       group: ['store_id'],
  //       raw: true
  //     });

  //     const ownerMap = {};
  //     owners.forEach((o) => { ownerMap[o.store_id] = o; });
  //     const appointmentMap = {};
  //     appointments.forEach((a) => { appointmentMap[a.store_id] = parseInt(a.TotalAppointment) || 0; });

  //     const result = stores.map((store) => ({
  //       ...store,
  //       ownerDetails: ownerMap[store.id] || null,
  //       TotalAppointment: appointmentMap[store.id] || 0
  //     }));
  //     return result;

  //   } catch (error) {
  //     console.log("🚀 ~ getallpartner DB error:", error);
  //     throw Error.SomethingWentWrong("Failed to fetch partners");
  //   }
  // },

  getverifypartnerlist: async (data) => {
    try {
      let sql = `SELECT s.id, s.name, s.store_type,s.email, s.phone, s.images, s.status, s.completion_status, s.createdAt,
                  pa.city, pa.state, pa.district, pa.area, pa.zipcode
                FROM Store s
                LEFT JOIN PartnerAddress pa ON pa.store_id = s.id
                WHERE s.completion_status = 'pending' and s.status= 'active'
                ORDER BY s.createdAt DESC`;  
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      console.log("🚀 ~ getverifypartnerlist DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch verify partner list");
    }     
  },

verifypartnerdetails: async (data) => {
    try {
      return await adminDbController.Models.Store.update({
        completion_status: data.completion_status,
      }, {
        where: {
          id: data.id,
          completion_status: "pending"
        },
      });
    }
    catch (error) {
      console.log("🚀 ~ verifypartnerdetails DB error:", error);
      throw Error.SomethingWentWrong("Failed to verify partner details");
    } 
  },


  getallpartner: async (data) => {
    try {
      const stores = await adminDbController.Models.Store.findAll({
        where: {
          completion_status: 'completed'
        },
        attributes: [
          'id', 'name', 'email', 'phone', 'images',
          'status', 'completion_status', 'createdAt',
          'category_id', 'address_id'
        ],
        order: [['id', 'DESC']],
        raw: true
      });
      if (!stores.length) return [];
      const storeIds = stores.map(s => Number(s.id));
      const categoryIds = [...new Set(stores.map(s => s.category_id).filter(Boolean))];
      const owners = await adminDbController.Models.OwnerProfile.findAll({
        where: { store_id: storeIds },
        attributes: [
          'store_id', 'name', 'email', 'phone',
          'profile_pic', 'country', 'country_code', 'Dob'
        ],
        raw: true
      });
      const appointments = await adminDbController.Models.appointments.findAll({
        attributes: [
          'store_id',
          [fn('COUNT', col('id')), 'TotalAppointment'],
          [fn('SUM', col('amount')), 'totalRevenue']
        ],
        where: {
          store_id: { [Op.in]: storeIds },
          // status: { [Op.in]: ['completed', 'Completed'] }
        },
        group: ['store_id'],
        raw: true
      });
      const categories = await adminDbController.Models.category.findAll({
        where: { id: categoryIds },
        attributes: ['id', 'name'],
        raw: true
      });
      const addresses = await adminDbController.Models.PartnerAddress.findAll({
        where: { store_id: storeIds },
        attributes: ['store_id', 'city', 'addressLine1'],
        raw: true
      });
      const ownerMap = Object.fromEntries(owners.map(o => [o.store_id, o]));
      const appointmentMap = Object.fromEntries(
        appointments.map(a => [a.store_id, parseInt(a.TotalAppointment) || 0])
      );
      const revenueMap = Object.fromEntries(
        appointments.map(a => [a.store_id, parseFloat(a.totalRevenue) || 0])
      );
      const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
      const addressMap = Object.fromEntries(
        addresses.map(a => [
          a.store_id,
          { city: a.city || null, addressLine1: a.addressLine1 || null }
        ])
      );
      const result = stores.map(store => ({
        ...store,
        ownerDetails: ownerMap[store.id] || null,
        TotalAppointment: appointmentMap[store.id] || 0,
        totalRevenue: revenueMap[store.id] || 0,
        categoryName: categoryMap[store.category_id] || null,
        location: addressMap[store.id] || { city: null, addressLine1: null }
      }));
      return result;
    } catch (error) {
      console.log("🚀 ~ getallpartner DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partners");
    }
  },

  getuserdetails: async (id) => {
    try {
      const res = await adminDbController.Models.User.findOne({
                  where: {
                    id: id,
                    status: "active"
                  },
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilePic', 'status', 'device_id','date_of_birth','age','gender','loyalty_status']
      });
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user details");
    }
  },
  // What the user actually paid (charged price + GST) on completed, paid
  // bookings. The old filter `status: "booked" || "completed"` evaluated to
  // just "booked" and summed list prices of bookings not yet delivered.
  gettotalspent: async (id) => {
    try {
      const [row] = await adminDbController.connection.query(
        `
        SELECT COALESCE(SUM(${AMOUNT_PAID_SQL}), 0) AS spent
        FROM appointments a
        WHERE a.user_id = :id
          AND a.status = 'completed'
          AND a.payment_status IN ${PAID_PAYMENT_SQL}
        `,
        { replacements: { id }, type: Sequelize.QueryTypes.SELECT }
      );
      return Number(Number(row?.spent || 0).toFixed(2));
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total spent");
    }
  },
  getlogs: async (id) => {
    try {
      return await adminDbController.Models.WalletLogs.findAll({
        where: {
          user_id: id,
        },
        order: [['updated_at', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch logs");
    }
  },
  updatesubscription: async (data) => {
    try {
      return await adminDbController.Models.SubscriptionPlans.update({
        type: data?.type,
        days: data?.days,
        price: data?.price,
        status: data?.status,
        updated_at: new Date(),
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update subscription");
    }
  },

  generateBookingPDF: async (bookingId) => {
    try {
      const booking = await adminDbController.app.getBookingsDetailsById({
        id: bookingId,
      });
      if (!booking) {
        throw Error.SomethingWentWrong("Booking not found");
      }
      const pdfBuffer = await generatePDF(booking);
      return pdfBuffer;
    } catch (error) {
      console.log("🚀 ~ generateBookingPDF error:", error);
      throw Error.SomethingWentWrong("Failed to generate booking PDF");
    } 
  },

  createDefaultTimeSlot: async (storeId) => {
    try {
       const result = await createDefaultTimeSlots(storeId);
       return result;
    } catch (error) {
      console.log("🚀 ~ createDefaultTimeSlots error:", error);
      throw Error.SomethingWentWrong("Failed to create default time slots");
    }
  },

  blockAndUnblockSlot: async (storeId, slotId, status, date, reason = null) => {

  const transaction = await partnerDbController.connection.transaction();

  try {

    const existingBlock =
      await partnerDbController.Models.SlotBlockedDates.findOne({
        where: {
          slot_id: slotId,
          store_id: storeId,
          blocked_date: date,
        },
        transaction,
      });

    // ========================
    // BLOCK SLOT
    // ========================
    if (status === "block") {

      if (existingBlock) {
        throw Error.InternalError("Slot already blocked for this date");
      }

      // Check booking exists
      const bookingExists = await partnerDbController.connection.query(
        `SELECT 1
         FROM appointments
         WHERE slot_id = :slotId
         AND store_id = :storeId
         AND booking_date = :date
         AND status NOT IN ('cancelled','completed')
         LIMIT 1`,
        {
          replacements: { slotId, storeId, date },
          type: partnerDbController.connection.QueryTypes.SELECT,
          transaction,
        }
      );

      if (bookingExists.length > 0) {
        throw Error.InternalError(
          "Slot already booked for this date. Cannot block."
        );
      }

      const block =
        await partnerDbController.Models.SlotBlockedDates.create(
          {
            slot_id: slotId,
            store_id: storeId,
            blocked_date: date,
            reason,
          },
          { transaction }
        );

      await transaction.commit();
      return block;
    }

    // ========================
    // UNBLOCK SLOT
    // ========================
    if (status === "unblock") {

      if (!existingBlock) {
        throw Error.InternalError("Slot is not blocked for this date");
      }

      await existingBlock.destroy({ transaction });

      await transaction.commit();

      return { message: "Slot unblocked successfully" };
    }

    throw Error.InternalError("Invalid slot action");

  } catch (error) {

    await transaction.rollback();

    console.log("🚀 blockAndUnblockSlot error:", error);

    if (error && error.type && error.code) {
      throw error;
    }

    throw Error.SomethingWentWrong("Failed to update time slot status");
  }
  },

  getBlockedSlots: async (storeId, date) => {
    try {
      const blockedSlots = await partnerDbController.Models.SlotBlockedDates.findAll({
        where: {
          store_id: storeId,
          blocked_date: date,
        },
        attributes: ['slot_id', 'reason'],
      });
      return blockedSlots;
    } catch (error) {
      console.log("🚀 getBlockedSlots error:", error);
      throw Error.SomethingWentWrong("Failed to fetch blocked slots");
    }
  },

  getlanguagelist: async () => {
    try {
      const languages = await partnerDbController.Models.Languages.findAll({
        where: { status: "active" },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
        raw: true
      });

      return languages || [];
    } catch (error) {
      console.error("🚀 getlanguagelist error:", error);
      throw new Error("Failed to fetch languages");
    }
  },

  getserviceprovidedforlist: async () => {
    try {
      const servicesProvidedFor = await partnerDbController.Models.ServicesProvidedFor.findAll({
        where: { status: "active" },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
        raw: true
      });
      return servicesProvidedFor || [];
    } catch (error) {
      console.error("🚀 getserviceprovidedforlist error:", error);
      throw new Error("Failed to fetch service options");
    }
  },
  getallpartnersubscription: async () => {
  try {
    const plans = await adminDbController.Models.PartnerSubscriptionPlans.findAll({
      where: { is_active: 1 },
      order: [['sort_order', 'ASC']],
      include: [
        {
          model: adminDbController.Models.PartnerSubscriptionPlanfeatureMapping,
          as: "featuresMapping",   // ✅ MUST MATCH ASSOCIATION
          include: [
            {
              model: adminDbController.Models.PartnerSubscriptionPlanfeatures,
              as: "featureDetails",        // ✅ MUST MATCH ASSOCIATION
              attributes: ["feature_name"]
            }
          ]
        }
      ]
    });

    return plans;
  } catch (error) {
    console.log("🚀 getallpartnersubscription error:", error);
    throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
  }
  },
  getpartnersubscriptionbyid: async (id) => {
    try {
      return await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: id.id },
        include: [
          {
            model: adminDbController.Models.PartnerSubscriptionPlanfeatureMapping,
            as: "featuresMapping",

            include: [
              {
                model: adminDbController.Models.PartnerSubscriptionPlanfeatures,
                as: "featureDetails",
                attributes: ["feature_name"],
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.log("🚀 getpartnersubscriptionbyid error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscription");
    }
  },
  addpartnersubscription: async (data) => {
    const t = await connection.transaction();
    try {

      const lastPlan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        order: [["sort_order", "DESC"]],
        attributes: ["sort_order"],
        lock: true,          // 🔥 prevents race condition
        transaction: t
      });

      const nextSortOrder = lastPlan ?.sort_order? lastPlan.sort_order + 1 : 1;

      const basePrice = data.discount_price ?? data.price;
      const plan = await adminDbController.Models.PartnerSubscriptionPlans.create({
        plan_name: data.plan_name,
        price: data.price,
        original_price: data.original_price ?? data.price,
        discount_price: basePrice,
        price_tag: data.price_tag ?? "month",
        duration_months: data.duration_months,
        booking_limit: data.booking_limit,
        is_unlimited: data.is_unlimited,
        description: data.description ?? data.plan_description ?? null,
        sort_order: nextSortOrder,
        is_active: 1
      }, { transaction: t });

      // Insert feature mapping
      if (data.features && data.features.length > 0) {
        const featureMappings = data.features.map(f => ({
          plan_id: plan.plan_id,
          feature_id: f
        }));

        await adminDbController.Models.PartnerSubscriptionPlanfeatureMapping.bulkCreate(featureMappings, { transaction: t });
      }

      await t.commit();

      // Sync to Razorpay after commit so a Razorpay outage does not roll back the plan.
      // create-recurring will also auto-heal if razorpay_plan_id is still null.
      try {
        await syncPlanToRazorpay(plan.toJSON ? plan.toJSON() : plan);
      } catch (syncError) {
        console.error(
          "[addpartnersubscription] Razorpay plan sync failed (plan saved locally):",
          syncError?.message || syncError
        );
      }

      return plan;

    } catch (error) {
      await t.rollback();
      console.log("🚀 addpartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to create subscription plan");
    }
  },
  updatepartnersubscription: async (data) => {
    const t = await connection.transaction();
    try {

      // 1. Check plan exists
      const plan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: data.id }
      });

      if (!plan) throw new Error("Plan not found");

      // 2. Update plan (Razorpay plans are immutable — only sync if never linked)
      const updatePayload = {
        plan_name: data.plan_name,
        price: data.price,
        duration_months: data.duration_months,
        booking_limit: data.booking_limit,
        is_unlimited: data.is_unlimited,
        sort_order: plan.sort_order,
        is_active: true
      };
      if (data.original_price != null) updatePayload.original_price = data.original_price;
      if (data.discount_price != null) updatePayload.discount_price = data.discount_price;
      if (data.price_tag != null) updatePayload.price_tag = data.price_tag;
      if (data.description != null || data.plan_description != null) {
        updatePayload.description = data.description ?? data.plan_description;
      }

      await adminDbController.Models.PartnerSubscriptionPlans.update(updatePayload, {
        where: { plan_id: data.id },
        transaction: t
      });

      // 3. Update features (IMPORTANT)
      if (data.features) {

        // delete old mappings
        await adminDbController.Models.PartnerSubscriptionPlanfeatureMapping.destroy({
          where: { plan_id: data.id },
          transaction: t
        });

        // insert new mappings
        const featureMappings = data.features.map(f => ({
          plan_id: data.id,
          feature_id: f
        }));

        await adminDbController.Models.PartnerSubscriptionPlanfeatureMapping.bulkCreate(featureMappings, {
          transaction: t
        });
      }

      await t.commit();

      if (!plan.razorpay_plan_id) {
        try {
          const fresh =
            await adminDbController.Models.PartnerSubscriptionPlans.findByPk(
              data.id
            );
          await syncPlanToRazorpay(fresh?.toJSON ? fresh.toJSON() : fresh);
        } catch (syncError) {
          console.error(
            "[updatepartnersubscription] Razorpay plan sync failed:",
            syncError?.message || syncError
          );
        }
      }

      return { message: "Plan updated successfully" };

    } catch (error) {
      await t.rollback();
      console.log("🚀 updatepartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to update subscription plan");    }
  },
  deletepartnersubscription: async (id) => {
    try {

      const plan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: id }
      });

      if (!plan) throw new Error("Plan not found");

      await adminDbController.Models.PartnerSubscriptionPlans.update({
        is_active: 0
      }, {
        where: { plan_id: id }
      });

      return { message: "Plan deactivated successfully" };

    } catch (error) {
      console.log("🚀 deletepartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to delete subscription plan");
    }
  },
  getallpartnersubscriptionfeatures: async () => {
  try {
    const Featureplans = await adminDbController.Models.PartnerSubscriptionPlanfeatures.findAll();
    return Featureplans;
  } catch (error) {
    console.log("🚀 getallpartnersubscription error:", error);
    throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
  }
  },
  createSubscription: async (data) => {
    const t = await connection.transaction();
    try {

      const plan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: data.plan_id }
      });

      if (!plan) throw new Error("Invalid Plan");

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + plan.duration_months);

      const subscription = await adminDbController.Models.PartnerSubscriptions.create({
        salon_id: data.salon_id,
        plan_id: data.plan_id,
        start_date: startDate,
        end_date: endDate,
        amount_paid: plan.price,
        payment_status: 'pending'
      }, { transaction: t });

      // Payment entry
      await adminDbController.Models.PartnerSubscriptionsPayments.create({
        subscription_id: subscription.subscription_id,
        salon_id: data.salon_id,
        amount: plan.price,
        payment_method: data.payment_method,
        payment_status: 'pending'
      }, { transaction: t });

      await t.commit();

      return subscription;

    } catch (error) {
      await t.rollback();
      console.log("🚀 createSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to create subscription");
    }
  },

  // ── Partner Invoice (daily booking summary per salon) ──────────────────

  /**
   * Partners with at least one appointment on the invoice day.
   * Day = appointment booking_date (salon visit day), Asia/Kolkata calendar.
   * Optional data.date (YYYY-MM-DD); defaults to today IST.
   */
  getInvoicePartnersToday: async (data = {}) => {
    try {
      const invoiceDate = resolveInvoiceDate(data?.date);

      let statusFilter = null;
      if (data?.status != null && String(data.status).trim() !== "") {
        statusFilter = String(data.status).trim();
        if (!["completed", "pending"].includes(statusFilter)) {
          throw Error.BadRequest("status must be completed or pending");
        }
      }

      const rows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          d.whatsapp_number AS partner_whatsapp,
          COUNT(DISTINCT a.id) AS booking_count,
          ip.id AS payout_id,
          ip.amount AS payout_amount,
          ip.marked_by AS payout_marked_by,
          ip.paid_at AS payout_paid_at
        FROM appointments a
        INNER JOIN Store d ON a.store_id = d.id
        LEFT JOIN InvoicePayouts ip ON ip.store_id = d.id AND ip.invoice_date = :invoiceDate
        WHERE DATE(a.booking_date) = :invoiceDate
          AND a.status != 'cancelled'
        GROUP BY d.id, d.name, d.phone, d.email, d.whatsapp_number, ip.id, ip.amount, ip.marked_by, ip.paid_at
        ${statusFilter === "completed" ? "HAVING ip.id IS NOT NULL" : ""}
        ${statusFilter === "pending" ? "HAVING ip.id IS NULL" : ""}
        ORDER BY d.name ASC
        `,
        {
          replacements: { invoiceDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      const totalBookings = rows.reduce(
        (sum, row) => sum + Number(row.booking_count || 0),
        0
      );

      return {
        date: invoiceDate,
        total_bookings: totalBookings,
        total_partners: rows.length,
        partners: rows.map((row) => ({
          partner_id: row.partner_id,
          partner_name: row.partner_name,
          partner_phone: row.partner_phone,
          partner_email: row.partner_email,
          partner_whatsapp: row.partner_whatsapp,
          booking_count: Number(row.booking_count || 0),
          payout_status: row.payout_id ? "completed" : "pending",
          payout_amount: row.payout_id ? Number(row.payout_amount || 0) : null,
          payout_marked_by: row.payout_marked_by ?? null,
          payout_paid_at: row.payout_paid_at ?? null,
        })),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoicePartnersToday error:", error);
      throw Error.SomethingWentWrong("Failed to fetch today's invoice partners");
    }
  },

  // Line-item breakdown for one partner's appointments on the invoice day
  // (booking_date). Priced by "important" flag: important → full amount,
  // otherwise discounted when present.
  getInvoiceDetailsForPartner: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const invoiceDate = resolveInvoiceDate(data?.date);

      const storeRows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          d.whatsapp_number AS partner_whatsapp,
          f.addressLine1, f.addressLine2, f.area, f.city, f.district, f.state, f.zipcode
        FROM Store d
        LEFT JOIN PartnerAddress f ON d.address_id = f.id
        WHERE d.id = :partnerId
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      if (!storeRows.length) {
        throw Error.NotFound("Partner not found");
      }

      const itemRows = await adminDbController.connection.query(
        `
        SELECT
          a.id AS appointment_id,
          a.booking_date AS appointment_date,
          a.created_at AS order_time,
          e.\`from\` AS slot_from,
          a.status,
          a.payment_status,
          ai.service_amount AS charged_amount,
          ss.id AS service_id,
          ss.service_name,
          ss.amount AS service_amount,
          ss.important AS service_important,
          cb.id AS combo_id,
          cb.combo AS combo_name,
          cb.amount AS combo_amount
        FROM appointments a
        INNER JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ai.service_id = ss.id
        LEFT JOIN Combo cb ON ai.combo_id = cb.id
        LEFT JOIN Slots e ON a.slot_id = e.id
        WHERE a.store_id = :partnerId
          AND DATE(a.booking_date) = :invoiceDate
          AND a.status != 'cancelled'
        ORDER BY a.booking_date ASC, e.\`from\` ASC, a.id ASC
        `,
        {
          replacements: {
            partnerId: data.partner_id,
            invoiceDate,
          },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      let total = 0;
      let totalDiscount = 0;
      const items = itemRows
        .map((row) => {
          let serviceName;
          let baseAmount;
          let important = false;

          if (row.service_id) {
            serviceName = row.service_name;
            important = !!row.service_important;
            baseAmount = Number(row.service_amount) || 0;
          } else if (row.combo_id) {
            serviceName = row.combo_name;
            baseAmount = Number(row.combo_amount) || 0;
          } else {
            return null;
          }

          // The amount actually billed for this booking — already reflects
          // whichever flat/tiered discount applied at the time it was
          // booked (see appointment_items.service_amount / resolveDiscountedAmount).
          // We do NOT recompute this from the service's current pricing,
          // since that would ignore tiers and drift if prices changed since.
          // Important services are always shown at full price, no discount.
          const amount = important ? baseAmount : (Number(row.charged_amount) || 0);
          const discountApplied = Math.max(0, Number((baseAmount - amount).toFixed(2)));

          total += amount;
          totalDiscount += discountApplied;

          return {
            appointment_id: row.appointment_id,
            // booking_date is date-only (it reads as 05:30 IST), so the real
            // appointment time is the booked slot's start - same as the
            // partner app. null when the booking has no slot.
            booking_time: row.slot_from
              ? buildAppointmentDateTime(row.appointment_date, row.slot_from)
              : null,
            appointment_date: row.appointment_date,
            order_time: row.order_time,
            status: row.status,
            payment_status: row.payment_status,
            service_name: serviceName,
            important,
            base_amount: Number(baseAmount.toFixed(2)),
            discount_applied: discountApplied,
            amount: Number(amount.toFixed(2)),
          };
        })
        .filter(Boolean);

      const store = storeRows[0];

      const payoutRows = await adminDbController.connection.query(
        `
        SELECT id, amount, marked_by, paid_at, subscription_deducted
        FROM InvoicePayouts
        WHERE store_id = :partnerId AND invoice_date = :invoiceDate
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id, invoiceDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const payout = payoutRows[0];

      // Read-only preview of what a manual subscription deduction WOULD be
      // if this day's payout were marked paid right now. Nothing is
      // mutated here — markInvoicePayout commits the same calculation.
      //
      // totalDue is everything owed on this day (the fee being collected,
      // or one just charged by this cycle's bookings - see resolveCycle);
      // only the part of this day's invoice the fee may come from
      // (deductibleOnDay) can be deducted, the rest is remainingDebt.
      const grossAmount = Number(total.toFixed(2));
      let totalDue = 0;
      let deductionToday = 0;
      let subscriptionPlanAmount = null;
      let subscriptionGstAmount = null;
      let subscriptionCycle = null;
      const sub = await adminDbController.app.getActiveManualSubscription(data.partner_id);
      if (sub) {
        const cycle = (await adminDbController.app.resolveSubscriptionCycles([sub], invoiceDate)).get(sub.store_id);
        totalDue = cycle.due;
        deductionToday = Number(
          Math.min(totalDue, deductibleOnDay(cycle, invoiceDate, invoiceAppointments(items))).toFixed(2)
        );
        subscriptionCycle = subscriptionCycleView(cycle);
        // One cycle's fee (plan + GST), for display next to the deduction.
        subscriptionPlanAmount = Number(sub.plan_amount);
        subscriptionGstAmount = Number(
          (cycleFee(sub.plan_amount) - subscriptionPlanAmount).toFixed(2)
        );
      }
      const remainingDebt = Number((totalDue - deductionToday).toFixed(2));

      return {
        partner: {
          id: store.partner_id,
          name: store.partner_name,
          phone: store.partner_phone,
          whatsapp_number: store.partner_whatsapp,
          email: store.partner_email,
          address: [store.addressLine1, store.addressLine2, store.area, store.city, store.district]
            .filter(Boolean)
            .join(", "),
          state: store.state,
          zipcode: store.zipcode,
        },
        date: invoiceDate,
        items,
        total_bookings: items.length,
        total_amount: grossAmount,
        total_discount: Number(totalDiscount.toFixed(2)),
        subscription_total_due: Number(totalDue.toFixed(2)),
        subscription_deduction_today: deductionToday,
        subscription_remaining_debt: remainingDebt,
        subscription_plan_amount: subscriptionPlanAmount,
        subscription_gst_amount: subscriptionGstAmount,
        subscription_cycle: subscriptionCycle,
        net_payout_preview: Number((grossAmount - deductionToday).toFixed(2)),
        payout_status: payout ? "completed" : "pending",
        payout_amount: payout ? Number(payout.amount || 0) : null,
        payout_marked_by: payout?.marked_by ?? null,
        payout_paid_at: payout?.paid_at ?? null,
        payout_subscription_deducted: payout ? Number(payout.subscription_deducted || 0) : null,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoiceDetailsForPartner error:", error);
      throw Error.SomethingWentWrong("Failed to fetch invoice details");
    }
  },

  // Active PartnerManualSubscriptions row for a partner, or null. Entirely
  // separate from the Razorpay-driven PartnerSubscriptions system.
  getActiveManualSubscription: async (storeId) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT id, store_id, ${SUB_CYCLE_COLUMNS}
        FROM PartnerManualSubscriptions
        WHERE store_id = :storeId AND status = 'active'
        LIMIT 1
        `,
        {
          replacements: { storeId },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      return rows[0] || null;
    } catch (error) {
      console.log("🚀 ~ getActiveManualSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscription");
    }
  },

  // Counted bookings (SUB_COUNTED_BOOKING_SQL) of the given salons' WAITING
  // cycles, up to `day`, in invoice order: store_id -> [{ id, date }].
  getSubscriptionCycleBookings: async (storeIds, day) => {
    const map = new Map();
    if (!storeIds.length) return map;
    const rows = await adminDbController.connection.query(
      `
      SELECT a.store_id, a.id, DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS day
      FROM appointments a
      INNER JOIN PartnerManualSubscriptions p ON p.store_id = a.store_id
      LEFT JOIN Slots sl ON sl.id = a.slot_id
      WHERE p.store_id IN (:storeIds) AND p.cycle_state = 'waiting'
        AND ${SUB_COUNTED_BOOKING_SQL}
        AND DATE(a.booking_date) <= :day
      ORDER BY a.store_id, a.booking_date ASC, sl.\`from\` ASC, a.id ASC
      `,
      { replacements: { storeIds, day }, type: Sequelize.QueryTypes.SELECT }
    );
    for (const row of rows) {
      if (!map.has(row.store_id)) map.set(row.store_id, []);
      map.get(row.store_id).push({ id: row.id, date: row.day });
    }
    return map;
  },

  // Where each active subscription's billing cycle stands on `day`
  // (resolveCycle): store_id -> cycle. One bookings query for all of them.
  resolveSubscriptionCycles: async (subs, day) => {
    const active = subs.filter((sub) => sub.status === undefined || sub.status === "active");
    const waitingIds = active.filter((sub) => sub.cycle_state === CYCLE_WAITING).map((sub) => sub.store_id);
    const bookings = await adminDbController.app.getSubscriptionCycleBookings(waitingIds, day);
    return new Map(active.map((sub) => [sub.store_id, resolveCycle(sub, bookings.get(sub.store_id) || [])]));
  },

  // Mark a partner's daily invoice as paid out. Idempotent upsert keyed on
  // (store_id, invoice_date); snapshots the current invoice total as the
  // paid amount for audit purposes. If the partner has an active manual
  // subscription, this is also where the monthly fee is actually deducted
  // (getInvoiceDetailsForPartner only ever previews it, never commits it).
  markInvoicePayout: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const invoiceDate = resolveInvoiceDate(data?.date);

      const invoice = await adminDbController.app.getInvoiceDetailsForPartner({
        partner_id: data.partner_id,
        date: invoiceDate,
      });

      if (!invoice.total_bookings) {
        throw Error.BadRequest("No bookings found for this partner on this date");
      }

      let payoutAmount = invoice.total_amount;
      let subscriptionDeducted = 0;
      let outstandingBefore = null;
      let nextDueBefore = null;
      let stateBefore = null;

      // Same calculation as the preview in getInvoiceDetailsForPartner, then
      // the cycle moves on (cycleAfterPayout): still collecting, or paid off
      // on this invoice day and waiting for the next renewal.
      const sub = await adminDbController.app.getActiveManualSubscription(data.partner_id);
      if (sub) {
        outstandingBefore = Number(sub.outstanding_due) || 0;
        nextDueBefore = sub.next_due_date;
        stateBefore = JSON.stringify(Object.fromEntries(
          SUB_CYCLE_STATE_FIELDS.map((field) => [field, subStateValue(sub, field)])
        ));

        const cycle = (await adminDbController.app.resolveSubscriptionCycles([sub], invoiceDate)).get(sub.store_id);
        const deductible = deductibleOnDay(cycle, invoiceDate, invoiceAppointments(invoice.items));
        subscriptionDeducted = Number(Math.min(cycle.due, deductible).toFixed(2));
        payoutAmount = Number((invoice.total_amount - subscriptionDeducted).toFixed(2));

        const next = cycleAfterPayout(cycle, invoiceDate, subscriptionDeducted);
        if (next) {
          await adminDbController.app.setSubscriptionCycleState(sub.id, next);
        }
      }

      await adminDbController.connection.query(
        `
        INSERT INTO InvoicePayouts
          (store_id, invoice_date, amount, marked_by, paid_at, subscription_deducted,
           subscription_outstanding_before, subscription_next_due_before, subscription_state_before)
        VALUES
          (:partnerId, :invoiceDate, :amount, :markedBy, NOW(), :subscriptionDeducted,
           :outstandingBefore, :nextDueBefore, :stateBefore)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          marked_by = VALUES(marked_by),
          paid_at = NOW(),
          subscription_deducted = VALUES(subscription_deducted),
          subscription_outstanding_before = VALUES(subscription_outstanding_before),
          subscription_next_due_before = VALUES(subscription_next_due_before),
          subscription_state_before = VALUES(subscription_state_before)
        `,
        {
          replacements: {
            partnerId: data.partner_id,
            invoiceDate,
            amount: payoutAmount,
            markedBy: data.marked_by ?? null,
            subscriptionDeducted,
            outstandingBefore,
            nextDueBefore,
            stateBefore,
          },
          type: Sequelize.QueryTypes.INSERT,
        }
      );

      return await adminDbController.app.getInvoiceDetailsForPartner({
        partner_id: data.partner_id,
        date: invoiceDate,
      });
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ markInvoicePayout error:", error);
      throw Error.SomethingWentWrong("Failed to mark invoice as paid");
    }
  },

  // Writes a subscription's billing-cycle columns (only the SUB_CYCLE_STATE_FIELDS
  // present in `state`).
  setSubscriptionCycleState: async (subscriptionId, state) => {
    const fields = SUB_CYCLE_STATE_FIELDS.filter((field) => field in state);
    if (!fields.length) return;
    await adminDbController.connection.query(
      `UPDATE PartnerManualSubscriptions SET ${fields.map((f) => `${f} = :${f}`).join(", ")} WHERE id = :id`,
      { replacements: { ...state, id: subscriptionId }, type: Sequelize.QueryTypes.UPDATE }
    );
  },

  // Revert a payout (admin mis-click). Deleting a non-existent row is a
  // no-op, so this is safe to call idempotently. If the partner has a
  // subscription, puts its billing cycle back exactly as it was before this
  // payout (subscription_state_before) — correct as long as this is undoing
  // the most recent subscription-affecting payout for that partner (the
  // normal "oops, undo my last click" use case this button serves).
  // Payouts marked before booking cycles existed have no snapshot; for those
  // the deducted amount is simply owed again.
  undoInvoicePayout: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const invoiceDate = resolveInvoiceDate(data?.date);

      const existingRows = await adminDbController.connection.query(
        `
        SELECT subscription_deducted, subscription_state_before
        FROM InvoicePayouts
        WHERE store_id = :partnerId AND invoice_date = :invoiceDate
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id, invoiceDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const existing = existingRows[0];
      const subRows = existing
        ? await adminDbController.connection.query(
          `SELECT id FROM PartnerManualSubscriptions WHERE store_id = :partnerId LIMIT 1`,
          { replacements: { partnerId: data.partner_id }, type: Sequelize.QueryTypes.SELECT }
        )
        : [];

      if (subRows[0] && existing.subscription_state_before) {
        await adminDbController.app.setSubscriptionCycleState(
          subRows[0].id,
          JSON.parse(existing.subscription_state_before)
        );
      } else if (subRows[0] && Number(existing.subscription_deducted) > 0) {
        await adminDbController.connection.query(
          `UPDATE PartnerManualSubscriptions
           SET outstanding_due = outstanding_due + :deducted, cycle_state = 'collecting'
           WHERE id = :id`,
          {
            replacements: { deducted: Number(existing.subscription_deducted), id: subRows[0].id },
            type: Sequelize.QueryTypes.UPDATE,
          }
        );
      }

      await adminDbController.connection.query(
        `DELETE FROM InvoicePayouts WHERE store_id = :partnerId AND invoice_date = :invoiceDate`,
        {
          replacements: { partnerId: data.partner_id, invoiceDate },
          type: Sequelize.QueryTypes.DELETE,
        }
      );

      return await adminDbController.app.getInvoiceDetailsForPartner({
        partner_id: data.partner_id,
        date: invoiceDate,
      });
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ undoInvoicePayout error:", error);
      throw Error.SomethingWentWrong("Failed to undo invoice payout");
    }
  },

  // ── Partner Manual Subscriptions (free bookings -> flat monthly fee) ──
  // Entirely separate from the Razorpay-driven PartnerSubscriptions system.

  // Partners who have used up their free bookings (admin-set
  // free_booking_limit, default 15) with no active manual subscription
  // yet — the "needs subscription" list on the admin page.
  getPartnersNeedingManualSubscription: async () => {
    try {
      const { free_booking_limit: limit } = await adminDbController.app.getFreeBookingLimit();
      return await adminDbController.connection.query(
        `
        SELECT d.id AS partner_id, d.name AS partner_name, d.phone AS partner_phone,
               d.email AS partner_email, d.total_booking_count
        FROM Store d
        WHERE d.total_booking_count >= :limit
          AND NOT EXISTS (
            SELECT 1 FROM PartnerManualSubscriptions pms
            WHERE pms.store_id = d.id AND pms.status = 'active'
          )
        ORDER BY d.total_booking_count DESC
        `,
        { replacements: { limit }, type: Sequelize.QueryTypes.SELECT }
      );
    } catch (error) {
      console.log("🚀 ~ getPartnersNeedingManualSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partners needing subscription");
    }
  },

  getAllManualPartnerSubscriptions: async () => {
    try {
      return await adminDbController.connection.query(
        `
        SELECT pms.id, pms.store_id, d.name AS partner_name, d.phone AS partner_phone,
               pms.plan_amount, pms.status, pms.outstanding_due, pms.next_due_date, pms.activated_at,
               pms.renewal_booking_limit, pms.cycle_state, pms.cycle_start_date
        FROM PartnerManualSubscriptions pms
        INNER JOIN Store d ON d.id = pms.store_id
        ORDER BY pms.status ASC, pms.activated_at DESC
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );
    } catch (error) {
      console.log("🚀 ~ getAllManualPartnerSubscriptions error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
    }
  },

  // Creates (or reactivates / renews) a partner's manual subscription. The
  // first fee is charged immediately: it is added to outstanding_due and
  // deducted from invoice days from today on, then the booking cycles take
  // over (partnerSubscriptionBilling.js). Reactivating keeps outstanding_due:
  // whatever the partner still owed is carried over on top of the new fee.
  // renewal_booking_limit (free bookings per cycle) defaults to the salon's
  // current one, else the free_booking_limit setting.
  assignManualPartnerSubscription: async (data) => {
    try {
      if (!data.store_id) throw Error.BadRequest("store_id is required");
      const planAmount = Number(data.plan_amount);
      if (!planAmount || planAmount <= 0) {
        throw Error.BadRequest("plan_amount must be a positive number");
      }
      let renewalLimit = parseRenewalBookingLimit(data.renewal_booking_limit);
      if (renewalLimit === undefined) {
        const [existing] = await adminDbController.connection.query(
          `SELECT renewal_booking_limit FROM PartnerManualSubscriptions WHERE store_id = :storeId LIMIT 1`,
          { replacements: { storeId: data.store_id }, type: Sequelize.QueryTypes.SELECT }
        );
        renewalLimit = existing
          ? Number(existing.renewal_booking_limit)
          : (await adminDbController.app.getFreeBookingLimit()).free_booking_limit;
      }

      const today = toIstDatePart(new Date());
      const fee = cycleFee(planAmount);

      await adminDbController.connection.query(
        `
        INSERT INTO PartnerManualSubscriptions
          (store_id, plan_amount, status, outstanding_due, next_due_date, activated_at, deactivated_at,
           renewal_booking_limit, cycle_state, cycle_start_date, charged_on, charged_from_appointment_id)
        VALUES
          (:storeId, :planAmount, 'active', :fee, :today, :today, NULL,
           :renewalLimit, 'collecting', NULL, :today, NULL)
        ON DUPLICATE KEY UPDATE
          plan_amount = VALUES(plan_amount),
          status = 'active',
          outstanding_due = outstanding_due + VALUES(outstanding_due),
          next_due_date = VALUES(next_due_date),
          activated_at = VALUES(activated_at),
          deactivated_at = NULL,
          renewal_booking_limit = VALUES(renewal_booking_limit),
          cycle_state = 'collecting',
          cycle_start_date = NULL,
          charged_on = VALUES(charged_on),
          charged_from_appointment_id = NULL
        `,
        {
          replacements: { storeId: data.store_id, planAmount, fee, today, renewalLimit },
          type: Sequelize.QueryTypes.INSERT,
        }
      );

      return await adminDbController.app.getActiveManualSubscription(data.store_id);
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ assignManualPartnerSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to assign partner subscription");
    }
  },

  // Updates the plan amount and/or the renewal booking limit (free bookings
  // per cycle). A new plan amount applies to the next fee charged, not to
  // one already being collected; a new limit applies to the current cycle.
  updateManualPartnerSubscription: async (data) => {
    try {
      if (!data.store_id) throw Error.BadRequest("store_id is required");
      const updates = {};
      if (data.plan_amount !== undefined && data.plan_amount !== null && data.plan_amount !== "") {
        const planAmount = Number(data.plan_amount);
        if (!planAmount || planAmount <= 0) {
          throw Error.BadRequest("plan_amount must be a positive number");
        }
        updates.plan_amount = planAmount;
      }
      const renewalLimit = parseRenewalBookingLimit(data.renewal_booking_limit);
      if (renewalLimit !== undefined) updates.renewal_booking_limit = renewalLimit;
      if (!Object.keys(updates).length) {
        throw Error.BadRequest("plan_amount or renewal_booking_limit is required");
      }

      const existing = await adminDbController.app.getActiveManualSubscription(data.store_id);
      if (!existing) {
        throw Error.NotFound("No active subscription found for this partner");
      }

      await adminDbController.connection.query(
        `UPDATE PartnerManualSubscriptions
         SET ${Object.keys(updates).map((field) => `${field} = :${field}`).join(", ")}
         WHERE store_id = :storeId`,
        {
          replacements: { ...updates, storeId: data.store_id },
          type: Sequelize.QueryTypes.UPDATE,
        }
      );

      return await adminDbController.app.getActiveManualSubscription(data.store_id);
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ updateManualPartnerSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to update partner subscription");
    }
  },

  deactivateManualPartnerSubscription: async (data) => {
    try {
      if (!data.store_id) throw Error.BadRequest("store_id is required");

      // deactivated_at is what lets the dashboard count this subscription
      // as active for the months before today. Only stamped on the
      // active -> inactive transition so a repeat click keeps the real date.
      await adminDbController.connection.query(
        `UPDATE PartnerManualSubscriptions
         SET deactivated_at = IF(status = 'active', :today, deactivated_at), status = 'inactive'
         WHERE store_id = :storeId`,
        {
          replacements: { storeId: data.store_id, today: toIstDatePart(new Date()) },
          type: Sequelize.QueryTypes.UPDATE,
        }
      );

      return { store_id: data.store_id, status: "inactive" };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ deactivateManualPartnerSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to deactivate partner subscription");
    }
  },

  // ── Manual partner subscriptions V2 (PartnerSubscriptionsV2 page) ───────

  // Paginated subscriptions + pending salons, every filter in SQL. Adds what
  // the V1 list never returned: email, city, logo, lifetime bookings, what
  // the salon owes today (resolveSubscriptionCycles), its billing cycle
  // (free bookings used / renewal date while waiting), and how much has
  // been collected from payouts.
  getManualSubscriptionsListV2: async (data = {}) => {
    try {
      const today = toIstDatePart(new Date());
      const { free_booking_limit: limit } = await adminDbController.app.getFreeBookingLimit();
      const where = [];
      const replacements = { today, limit };
      const addWhere = (sql, values = {}) => {
        where.push(sql);
        Object.assign(replacements, values);
      };

      const search = String(data.search || "").trim().replace(/^#/, "");
      if (search) {
        const conditions = [
          "s.name LIKE :searchLike",
          "s.phone LIKE :searchLike",
          "s.email LIKE :searchLike",
        ];
        const values = { searchLike: `%${escapeLike(search)}%` };
        if (/^\d+$/.test(search)) {
          conditions.unshift("x.store_id = :searchId");
          values.searchId = Number(search);
        }
        addWhere(`(${conditions.join(" OR ")})`, values);
      }

      if (data.status) {
        if (!SUB_STATUSES.includes(data.status)) {
          throw Error.BadRequest(`status must be one of: ${SUB_STATUSES.join(", ")}`);
        }
        addWhere(`${SUB_STATUS_SQL} = :status`, { status: data.status });
      }

      if (data.plan_amount !== undefined && data.plan_amount !== null && data.plan_amount !== "") {
        const planAmount = Number(data.plan_amount);
        if (!(planAmount > 0)) {
          throw Error.BadRequest("plan_amount must be a positive number");
        }
        addWhere("x.plan_amount = :planAmount", { planAmount });
      }

      if (data.city) {
        addWhere("LOWER(TRIM(pa.city)) = LOWER(TRIM(:city))", { city: String(data.city) });
      }

      // Active subscriptions that owe now, or whose free bookings are used up
      // and whose renewal date falls within N days.
      if (data.due_within !== undefined && data.due_within !== null && data.due_within !== "") {
        const days = Number(data.due_within);
        if (!Number.isInteger(days) || days < 0 || days > 366) {
          throw Error.BadRequest("due_within must be a whole number of days (0-366)");
        }
        addWhere(
          `(x.sub_status = 'active' AND (${SUB_STATUS_SQL} = 'due'
            OR (x.cycle_state = 'waiting'
              AND COALESCE(cy.cycle_bookings, 0) >= x.renewal_booking_limit
              AND x.next_due_date <= :dueBy)))`,
          { dueBy: addDays(today, days) }
        );
      }

      const sort = SUB_LIST_SORTS[data.sort || "status"];
      if (!sort) {
        throw Error.BadRequest(`sort must be one of: ${Object.keys(SUB_LIST_SORTS).join(", ")}`);
      }

      const page = Math.max(1, Number(data.page) || 1);
      const pageSize = Math.min(Math.max(1, Number(data.limit) || 10), SUB_LIST_MAX_LIMIT);
      const fromSql = `
        FROM (
          SELECT 'subscription' AS kind, pms.id AS subscription_id, pms.store_id,
                 pms.plan_amount, pms.status AS sub_status, pms.outstanding_due,
                 pms.next_due_date, pms.activated_at, pms.deactivated_at,
                 pms.renewal_booking_limit, pms.cycle_state, pms.cycle_start_date,
                 pms.charged_on, pms.charged_from_appointment_id
          FROM PartnerManualSubscriptions pms
          UNION ALL
          SELECT 'pending', NULL, st.id, NULL, NULL, NULL, NULL, NULL, NULL,
                 NULL, NULL, NULL, NULL, NULL
          FROM Store st
          WHERE st.total_booking_count >= :limit
            AND NOT EXISTS (SELECT 1 FROM PartnerManualSubscriptions p WHERE p.store_id = st.id)
        ) x
        INNER JOIN Store s ON s.id = x.store_id
        LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
        LEFT JOIN (${SUB_CYCLE_STATS_SQL}) cy ON cy.store_id = x.store_id
        LEFT JOIN (
          SELECT store_id,
                 SUM(subscription_deducted) AS collected_total,
                 MAX(CASE WHEN subscription_deducted > 0 THEN invoice_date END) AS last_deducted_on
          FROM InvoicePayouts
          GROUP BY store_id
        ) ip ON ip.store_id = x.store_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      `;

      const [rows, totalRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT
            x.kind, x.subscription_id, x.store_id,
            s.name AS partner_name, s.phone AS partner_phone, s.email AS partner_email,
            s.logo AS partner_logo, s.status AS store_status, pa.city,
            s.total_booking_count,
            x.plan_amount, x.sub_status, x.outstanding_due, x.next_due_date,
            x.activated_at, x.deactivated_at,
            x.renewal_booking_limit, x.cycle_state, x.cycle_start_date,
            x.charged_on, x.charged_from_appointment_id,
            COALESCE(ip.collected_total, 0) AS collected_total, ip.last_deducted_on,
            ${SUB_STATUS_SQL} AS row_status
          ${fromSql}
          ORDER BY ${sort}
          LIMIT :pageSize OFFSET :offset
          `,
          {
            replacements: { ...replacements, pageSize, offset: (page - 1) * pageSize },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
        adminDbController.connection.query(`SELECT COUNT(*) AS total ${fromSql}`, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      const cycles = await adminDbController.app.resolveSubscriptionCycles(
        rows.filter((row) => row.sub_status === "active").map((row) => ({ ...row, status: row.sub_status })),
        today
      );

      return {
        rows: rows.map((row) => {
          const cycle = row.sub_status === "active" ? cycles.get(row.store_id) : null;
          const bookings = Number(row.total_booking_count) || 0;
          return {
            kind: row.kind,
            subscription_id: row.subscription_id,
            store_id: row.store_id,
            partner_name: row.partner_name,
            partner_phone: row.partner_phone,
            partner_email: row.partner_email,
            partner_logo: cleanLogo(row.partner_logo),
            store_status: row.store_status,
            city: row.city ? String(row.city).trim() : null,
            total_booking_count: bookings,
            status: row.row_status,
            plan_amount: row.plan_amount === null ? null : Number(row.plan_amount),
            cycle_fee: row.plan_amount === null ? null : cycleFee(row.plan_amount),
            // Balance as stored (only moves when a payout is marked paid).
            stored_outstanding: row.outstanding_due === null ? null : Number(row.outstanding_due),
            owed_now: cycle ? cycle.due : 0,
            // Renewal date of a waiting cycle (the next fee needs this date
            // AND the renewal booking limit); null while a fee is owed.
            next_due_date: cycle && cycle.state === CYCLE_WAITING ? cycle.renewalDate : null,
            renewal_booking_limit: row.renewal_booking_limit === null ? null : Number(row.renewal_booking_limit),
            cycle: subscriptionCycleView(cycle),
            activated_at: dayString(row.activated_at),
            deactivated_at: dayString(row.deactivated_at),
            collected_total: Number(Number(row.collected_total).toFixed(2)),
            last_deducted_on: dayString(row.last_deducted_on),
            // A deactivated salon still over the free-booking limit.
            needs_subscription: row.row_status === "inactive" && bookings >= limit,
          };
        }),
        total: Number(totalRows[0]?.total) || 0,
        page,
        limit: pageSize,
        today,
        free_booking_limit: limit,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getManualSubscriptionsListV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
    }
  },

  // KPIs and panels for the subscriptions page.
  //   ranges[]  per named IST range: collected (sum of subscription fees
  //             deducted from payouts, by when the payout was marked paid),
  //             deductions and paying partners
  //   focus     which range "top partners by bookings" uses
  // Point-in-time (today): status counts, owed-now total, due within 7 days,
  // plan mix of live subscriptions, plus the filter options.
  getManualSubscriptionsSummaryV2: async (data = {}) => {
    try {
      const resolved = resolveRanges(data.ranges);
      const focus = resolved.find((r) => r.key === String(data.focus ?? resolved[0].key));
      if (!focus) {
        throw Error.BadRequest("focus must be the key of one of the ranges");
      }
      const { sql: rangesSql, replacements } = rangesTableSql(resolved);
      const today = toIstDatePart(new Date());
      const { free_booking_limit: limit } = await adminDbController.app.getFreeBookingLimit();

      const [collectedRows, subs, pendingRows, topRows, cityRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT r.k AS range_key,
            COALESCE(SUM(ip.subscription_deducted), 0) AS collected,
            COUNT(ip.id) AS deductions,
            COUNT(DISTINCT ip.store_id) AS partners
          FROM (${rangesSql}) r
          LEFT JOIN InvoicePayouts ip
            ON ip.paid_at >= r.f AND ip.paid_at < r.e AND ip.subscription_deducted > 0
          GROUP BY r.k
          `,
          { replacements, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT pms.store_id, ${SUB_CYCLE_COLUMNS.replace(/(\w+)/g, "pms.$1")}, s.total_booking_count
          FROM PartnerManualSubscriptions pms
          INNER JOIN Store s ON s.id = pms.store_id
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS pending
          FROM Store st
          WHERE st.total_booking_count >= :limit
            AND NOT EXISTS (SELECT 1 FROM PartnerManualSubscriptions p WHERE p.store_id = st.id)
          `,
          { replacements: { limit }, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT a.store_id, s.name AS partner_name, s.logo AS partner_logo,
                 COUNT(*) AS bookings
          FROM appointments a
          INNER JOIN PartnerManualSubscriptions pms
            ON pms.store_id = a.store_id AND pms.status = 'active'
          INNER JOIN Store s ON s.id = a.store_id
          WHERE a.payment_status IN ${PAID_PAYMENT_SQL}
            AND a.status NOT IN ('cancelled', 'refunded')
            AND a.booking_date >= :topFrom AND a.booking_date < :topEnd
          GROUP BY a.store_id, s.name, s.logo
          ORDER BY bookings DESC, s.name ASC
          LIMIT 5
          `,
          {
            replacements: { topFrom: focus.from, topEnd: focus.end },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
        adminDbController.connection.query(
          `
          SELECT DISTINCT TRIM(pa.city) AS city
          FROM Store s
          INNER JOIN PartnerAddress pa ON pa.id = s.address_id
          WHERE (s.id IN (SELECT store_id FROM PartnerManualSubscriptions) OR s.total_booking_count >= :limit)
            AND pa.city IS NOT NULL AND TRIM(pa.city) <> ''
          ORDER BY city
          `,
          { replacements: { limit }, type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const num = (v) => Number(v) || 0;
      const ranges = {};
      for (const row of collectedRows) {
        ranges[row.range_key] = {
          collected: Number(num(row.collected).toFixed(2)),
          deductions: num(row.deductions),
          partners: num(row.partners),
        };
      }

      const dueBy = addDays(today, 7);
      const counts = { active: 0, due: 0, inactive: 0, pending: num(pendingRows[0]?.pending) };
      const plans = new Map();
      // Status counts per plan amount, for the overview's plan filter.
      const byPlan = {};
      const bump = (amount, key) => {
        byPlan[amount] = byPlan[amount] || { active: 0, due: 0, inactive: 0 };
        byPlan[amount][key] += 1;
      };
      let owedNow = 0;
      let owingPartners = 0;
      let dueSoon = 0;
      let needsSubscription = 0;
      const cycles = await adminDbController.app.resolveSubscriptionCycles(subs, today);
      for (const sub of subs) {
        const amount = Number(sub.plan_amount);
        if (sub.status !== "active") {
          counts.inactive += 1;
          bump(amount, "inactive");
          if (num(sub.total_booking_count) >= limit) needsSubscription += 1;
          continue;
        }
        const cycle = cycles.get(sub.store_id);
        const due = cycle.due;
        // Due soon: owes now, or free bookings used up with the renewal
        // date within 7 days.
        const renewsSoon = cycle.state === CYCLE_WAITING
          && cycle.counted >= cycle.limit
          && Boolean(cycle.renewalDate) && cycle.renewalDate <= dueBy;
        if (due > 0) {
          counts.due += 1;
          bump(amount, "due");
          owedNow += due;
          owingPartners += 1;
        } else {
          counts.active += 1;
          bump(amount, "active");
        }
        if (due > 0 || renewsSoon) dueSoon += 1;
        plans.set(amount, (plans.get(amount) || 0) + 1);
      }

      return {
        today,
        free_booking_limit: limit,
        ranges,
        counts,
        counts_by_plan: byPlan,
        live_subscriptions: counts.active + counts.due,
        deactivated_needing_subscription: needsSubscription,
        owed_now: Number(owedNow.toFixed(2)),
        owing_partners: owingPartners,
        due_within_7_days: dueSoon,
        plan_distribution: [...plans.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([plan_amount, count]) => ({ plan_amount, cycle_fee: cycleFee(plan_amount), count })),
        top_partners: topRows.map((row) => ({
          store_id: row.store_id,
          partner_name: row.partner_name,
          partner_logo: cleanLogo(row.partner_logo),
          bookings: num(row.bookings),
        })),
        plan_amounts: [...new Set(subs.map((sub) => Number(sub.plan_amount)))].sort((a, b) => a - b),
        cities: cityRows.map((row) => row.city),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getManualSubscriptionsSummaryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscriptions summary");
    }
  },

  // One salon's subscription fee deductions - one row per daily invoice
  // payout that recovered something - newest first, plus the subscription
  // itself with what it owes today.
  getManualSubscriptionHistoryV2: async (data = {}) => {
    try {
      const storeId = Number(data.store_id);
      if (!Number.isInteger(storeId) || storeId <= 0) {
        throw Error.BadRequest("store_id must be a positive whole number");
      }
      const page = Math.max(1, Number(data.page) || 1);
      const pageSize = Math.min(Math.max(1, Number(data.limit) || 20), 500);
      const today = toIstDatePart(new Date());

      const [subRows, rows, totals] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT pms.id, pms.store_id, ${SUB_CYCLE_COLUMNS.replace(/(\w+)/g, "pms.$1")},
                 pms.deactivated_at, s.name AS partner_name
          FROM PartnerManualSubscriptions pms
          INNER JOIN Store s ON s.id = pms.store_id
          WHERE pms.store_id = :storeId
          LIMIT 1
          `,
          { replacements: { storeId }, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT invoice_date, paid_at, marked_by, amount AS payout_amount,
                 subscription_deducted, subscription_outstanding_before, subscription_next_due_before
          FROM InvoicePayouts
          WHERE store_id = :storeId AND subscription_deducted > 0
          ORDER BY invoice_date DESC, id DESC
          LIMIT :pageSize OFFSET :offset
          `,
          {
            replacements: { storeId, pageSize, offset: (page - 1) * pageSize },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS deductions, COALESCE(SUM(subscription_deducted), 0) AS collected
          FROM InvoicePayouts
          WHERE store_id = :storeId AND subscription_deducted > 0
          `,
          { replacements: { storeId }, type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const sub = subRows[0];
      if (!sub) {
        throw Error.NotFound("Subscription");
      }
      const cycle = sub.status === "active"
        ? (await adminDbController.app.resolveSubscriptionCycles([sub], today)).get(sub.store_id)
        : null;

      return {
        subscription: {
          id: sub.id,
          store_id: sub.store_id,
          partner_name: sub.partner_name,
          status: sub.status,
          plan_amount: Number(sub.plan_amount),
          cycle_fee: cycleFee(sub.plan_amount),
          stored_outstanding: Number(sub.outstanding_due),
          owed_now: cycle ? cycle.due : 0,
          next_due_date: cycle && cycle.state === CYCLE_WAITING ? cycle.renewalDate : null,
          renewal_booking_limit: Number(sub.renewal_booking_limit),
          cycle: subscriptionCycleView(cycle),
          activated_at: dayString(sub.activated_at),
          deactivated_at: dayString(sub.deactivated_at),
        },
        deductions: rows.map((row) => {
          const deducted = Number(row.subscription_deducted);
          const payout = Number(row.payout_amount);
          return {
            invoice_date: dayString(row.invoice_date),
            paid_at: row.paid_at,
            marked_by: row.marked_by,
            invoice_total: Number((payout + deducted).toFixed(2)),
            deducted,
            payout_amount: payout,
            outstanding_before: row.subscription_outstanding_before === null
              ? null
              : Number(row.subscription_outstanding_before),
            next_due_before: dayString(row.subscription_next_due_before),
          };
        }),
        total: Number(totals[0]?.deductions) || 0,
        collected_total: Number(Number(totals[0]?.collected || 0).toFixed(2)),
        page,
        limit: pageSize,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getManualSubscriptionHistoryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch subscription history");
    }
  },

  // ── Invoices & payouts V2 (InvoicePayoutsV2 page) ───────────────────────

  // First invoice day whose payout is tracked: the later of the dashboard
  // go-live cutoff and the first payout ever recorded - days before payouts
  // existed were never meant to be marked (same rule as the dashboard's
  // overdue alert). With neither, the last 30 days.
  getPayoutTrackingStart: async () => {
    const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
    const [first] = await adminDbController.connection.query(
      `SELECT MIN(invoice_date) AS first_date FROM InvoicePayouts`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const candidates = [dayString(cutoff), dayString(first?.first_date)].filter(Boolean).sort();
    return candidates.length ? candidates.pop() : addDays(toIstDatePart(new Date()), -29);
  },

  // Optional from / to (YYYY-MM-DD) clamped to [tracking start, today].
  resolvePayoutWindow: async (data = {}) => {
    const today = toIstDatePart(new Date());
    const start = await adminDbController.app.getPayoutTrackingStart();
    for (const field of ["from", "to"]) {
      if (data[field] && !isValidDate(String(data[field]))) {
        throw Error.BadRequest(`${field} must be YYYY-MM-DD`);
      }
    }
    const from = data.from && data.from > start ? String(data.from) : start;
    const to = data.to && data.to < today ? String(data.to) : today;
    return { today, start, from, to };
  },

  // What each salon's active subscription owes today (store_id -> amount):
  // the fee being collected, or one this cycle's bookings have just charged.
  getSubscriptionOwedByStore: async (storeIds = null) => {
    if (Array.isArray(storeIds) && storeIds.length === 0) return new Map();
    const today = toIstDatePart(new Date());
    const subs = await adminDbController.connection.query(
      `
      SELECT store_id, ${SUB_CYCLE_COLUMNS}
      FROM PartnerManualSubscriptions
      WHERE status = 'active' ${storeIds ? "AND store_id IN (:storeIds)" : ""}
      `,
      { replacements: { storeIds }, type: Sequelize.QueryTypes.SELECT }
    );
    const cycles = await adminDbController.app.resolveSubscriptionCycles(subs, today);
    return new Map([...cycles].map(([storeId, cycle]) => [storeId, cycle.due]));
  },

  // Paginated payout queue, one row per salon with invoices in the window:
  // invoices, gross, paid / unpaid / due / overdue amounts, oldest unpaid day,
  // next payout date, days overdue, last payout, and an estimated payout net
  // of what its subscription will deduct. Filters: search, frequency, status
  // (scheduled | due | overdue | paid), from / to (invoice days), sort.
  getInvoicePayoutPartnersV2: async (data = {}) => {
    try {
      const { today, start, from, to } = await adminDbController.app.resolvePayoutWindow(data);
      const page = Math.max(1, Number(data.page) || 1);
      const pageSize = Math.min(Math.max(1, Number(data.limit) || 10), PAYOUT_LIST_MAX_LIMIT);
      const empty = { rows: [], total: 0, page, limit: pageSize, today, tracking_start: start, from, to };
      if (from > to) return empty;

      const where = [];
      const replacements = {
        daysFrom: from,
        daysEnd: addDays(to, 1),
        today,
        grace: PAYOUT_OVERDUE_GRACE_DAYS,
      };
      const addWhere = (sql, values = {}) => {
        where.push(sql);
        Object.assign(replacements, values);
      };

      const search = String(data.search || "").trim().replace(/^#/, "");
      if (search) {
        const conditions = ["s.name LIKE :searchLike", "s.phone LIKE :searchLike", "s.email LIKE :searchLike"];
        const values = { searchLike: `%${escapeLike(search)}%` };
        if (/^\d+$/.test(search)) {
          conditions.unshift("g.store_id = :searchId");
          values.searchId = Number(search);
        }
        addWhere(`(${conditions.join(" OR ")})`, values);
      }
      if (data.frequency) {
        if (!PAYOUT_FREQUENCIES.includes(data.frequency)) {
          throw Error.BadRequest(`frequency must be one of: ${PAYOUT_FREQUENCIES.join(", ")}`);
        }
        addWhere("s.payout_frequency = :frequency", { frequency: data.frequency });
      }

      const statusSql = `
        CASE
          WHEN g.unpaid_invoices = 0 THEN 'paid'
          WHEN g.max_days_past_due >= :grace THEN 'overdue'
          WHEN g.max_days_past_due >= 0 THEN 'due'
          ELSE 'scheduled'
        END`;
      if (data.status) {
        if (!PAYOUT_STATUSES.includes(data.status)) {
          throw Error.BadRequest(`status must be one of: ${PAYOUT_STATUSES.join(", ")}`);
        }
        addWhere(`${statusSql} = :status`, { status: data.status });
      }

      const sorts = {
        urgency: "FIELD(payout_status, 'overdue', 'due', 'scheduled', 'paid'), g.max_days_past_due DESC, g.unpaid_gross DESC, s.name ASC",
        next_payout: "g.next_payout_date IS NULL, g.next_payout_date ASC, s.name ASC",
        amount: "g.unpaid_gross DESC, s.name ASC",
        name: "s.name ASC, g.store_id ASC",
        last_payout: "lp.last_paid_at IS NULL, lp.last_paid_at DESC, s.name ASC",
      };
      const sort = sorts[data.sort || "urgency"];
      if (!sort) {
        throw Error.BadRequest(`sort must be one of: ${Object.keys(sorts).join(", ")}`);
      }

      const fromSql = `
        FROM (
          SELECT x.store_id,
            COUNT(*) AS invoices,
            SUM(x.bookings) AS bookings,
            SUM(x.gross) AS gross,
            SUM(x.payout_id IS NOT NULL) AS paid_invoices,
            COALESCE(SUM(CASE WHEN x.payout_id IS NOT NULL THEN x.payout_amount END), 0) AS paid_amount,
            COALESCE(SUM(CASE WHEN x.payout_id IS NOT NULL THEN x.subscription_deducted END), 0) AS subscription_deducted,
            SUM(x.payout_id IS NULL) AS unpaid_invoices,
            COALESCE(SUM(CASE WHEN x.payout_id IS NULL THEN x.gross END), 0) AS unpaid_gross,
            SUM(x.payout_id IS NULL AND x.due_date <= :today) AS due_invoices,
            COALESCE(SUM(CASE WHEN x.payout_id IS NULL AND x.due_date <= :today THEN x.gross END), 0) AS due_gross,
            COALESCE(SUM(CASE WHEN x.payout_id IS NULL AND DATEDIFF(:today, x.due_date) >= :grace THEN x.gross END), 0) AS overdue_gross,
            MIN(CASE WHEN x.payout_id IS NULL THEN x.invoice_date END) AS oldest_unpaid_day,
            MIN(CASE WHEN x.payout_id IS NULL THEN x.due_date END) AS next_payout_date,
            MAX(CASE WHEN x.payout_id IS NULL THEN DATEDIFF(:today, x.due_date) END) AS max_days_past_due
          FROM (${invoiceDayRowsSql()}) x
          GROUP BY x.store_id
        ) g
        INNER JOIN Store s ON s.id = g.store_id
        LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
        LEFT JOIN (
          SELECT store_id, MAX(paid_at) AS last_paid_at, MAX(invoice_date) AS last_paid_invoice_date
          FROM InvoicePayouts
          GROUP BY store_id
        ) lp ON lp.store_id = g.store_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      `;

      const [rows, totalRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT g.*, s.name AS partner_name, s.phone AS partner_phone, s.email AS partner_email,
                 s.logo AS partner_logo, s.payout_frequency AS frequency, pa.city,
                 lp.last_paid_at, lp.last_paid_invoice_date,
                 ${statusSql} AS payout_status
          ${fromSql}
          ORDER BY ${sort}
          LIMIT :pageSize OFFSET :offset
          `,
          {
            replacements: { ...replacements, pageSize, offset: (page - 1) * pageSize },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
        adminDbController.connection.query(`SELECT COUNT(*) AS total ${fromSql}`, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      const owed = await adminDbController.app.getSubscriptionOwedByStore(rows.map((r) => r.store_id));
      const money = (v) => Number((Number(v) || 0).toFixed(2));
      // A payout deducts what the subscription owes, capped at the invoices paid.
      const net = (gross, owedNow) => money(gross - Math.min(owedNow, gross));

      return {
        rows: rows.map((r) => {
          const owedNow = owed.get(r.store_id) || 0;
          const daysPastDue = r.max_days_past_due === null ? null : Number(r.max_days_past_due);
          return {
            store_id: r.store_id,
            partner_name: r.partner_name,
            partner_phone: r.partner_phone,
            partner_email: r.partner_email,
            partner_logo: cleanLogo(r.partner_logo),
            city: r.city ? String(r.city).trim() : null,
            frequency: r.frequency,
            status: r.payout_status,
            invoices: Number(r.invoices) || 0,
            bookings: Number(r.bookings) || 0,
            gross: money(r.gross),
            paid_invoices: Number(r.paid_invoices) || 0,
            paid_amount: money(r.paid_amount),
            subscription_deducted: money(r.subscription_deducted),
            unpaid_invoices: Number(r.unpaid_invoices) || 0,
            unpaid_gross: money(r.unpaid_gross),
            due_invoices: Number(r.due_invoices) || 0,
            due_gross: money(r.due_gross),
            overdue_gross: money(r.overdue_gross),
            subscription_owed_now: owedNow,
            estimated_payout: net(Number(r.unpaid_gross) || 0, owedNow),
            estimated_due_payout: net(Number(r.due_gross) || 0, owedNow),
            oldest_unpaid_day: dayString(r.oldest_unpaid_day),
            next_payout_date: dayString(r.next_payout_date),
            // Days since the oldest unpaid invoice fell due; negative = not due yet.
            days_past_due: daysPastDue,
            last_paid_at: r.last_paid_at,
            last_paid_invoice_date: dayString(r.last_paid_invoice_date),
          };
        }),
        total: Number(totalRows[0]?.total) || 0,
        page,
        limit: pageSize,
        today,
        tracking_start: start,
        from,
        to,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getInvoicePayoutPartnersV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch payout partners");
    }
  },

  // KPIs and panels for the invoices & payouts page.
  //   ranges[]  per named range of invoice days: invoices, bookings, gross
  //             (what customers paid), paid / pending / overdue counts and
  //             amounts. Unpaid days before the tracking start are counted
  //             as invoices but never as pending or overdue.
  //   totals    all tracked unpaid money right now, by status and by payout
  //             frequency (with the estimated net after subscriptions), and
  //             everything ever paid out.
  getInvoicePayoutsSummaryV2: async (data = {}) => {
    try {
      const resolved = resolveRanges(data.ranges);
      const today = toIstDatePart(new Date());
      const start = await adminDbController.app.getPayoutTrackingStart();
      const spanFrom = [start, ...resolved.map((r) => r.from)].sort()[0];

      const [dayRows, allTime, frequencyRows] = await Promise.all([
        adminDbController.connection.query(invoiceDayRowsSql(), {
          replacements: { daysFrom: spanFrom, daysEnd: addDays(today, 1) },
          type: Sequelize.QueryTypes.SELECT,
        }),
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS payouts, COALESCE(SUM(amount), 0) AS paid_out,
                 COALESCE(SUM(subscription_deducted), 0) AS subscription_deducted
          FROM InvoicePayouts
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT payout_frequency AS frequency, COUNT(*) AS partners
          FROM Store
          WHERE status = 'active'
          GROUP BY payout_frequency
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const money = (v) => Number((Number(v) || 0).toFixed(2));
      const days = dayRows.map((row) => {
        const invoiceDate = dayString(row.invoice_date);
        const dueDate = dayString(row.due_date);
        let status = "paid";
        if (!row.payout_id) {
          if (invoiceDate < start) status = "untracked";
          else if (dueDate > today) status = "scheduled";
          else if (Math.round((Date.parse(today) - Date.parse(dueDate)) / 864e5) >= PAYOUT_OVERDUE_GRACE_DAYS) status = "overdue";
          else status = "due";
        }
        return {
          store_id: row.store_id,
          frequency: row.frequency,
          invoice_date: invoiceDate,
          gross: Number(row.gross) || 0,
          bookings: Number(row.bookings) || 0,
          payout_amount: Number(row.payout_amount) || 0,
          status,
        };
      });

      const ranges = {};
      for (const r of resolved) {
        const inRange = days.filter((d) => d.invoice_date >= r.from && d.invoice_date <= r.to);
        const sum = (list, key) => money(list.reduce((acc, d) => acc + d[key], 0));
        const by = (status) => inRange.filter((d) => d.status === status);
        const pending = inRange.filter((d) => d.status === "scheduled" || d.status === "due");
        ranges[r.key] = {
          invoices: inRange.length,
          partners: new Set(inRange.map((d) => d.store_id)).size,
          bookings: inRange.reduce((acc, d) => acc + d.bookings, 0),
          gross: sum(inRange, "gross"),
          paid_invoices: by("paid").length,
          paid_amount: sum(by("paid"), "payout_amount"),
          pending_invoices: pending.length,
          pending_gross: sum(pending, "gross"),
          overdue_invoices: by("overdue").length,
          overdue_gross: sum(by("overdue"), "gross"),
        };
      }

      // Everything unpaid and tracked, right now.
      const unpaid = days.filter((d) => ["scheduled", "due", "overdue"].includes(d.status));
      const owed = await adminDbController.app.getSubscriptionOwedByStore([...new Set(unpaid.map((d) => d.store_id))]);
      const byFrequency = Object.fromEntries(
        PAYOUT_FREQUENCIES.map((f) => [f, { partners: 0, partners_with_unpaid: 0, unpaid_gross: 0, estimated_payout: 0 }])
      );
      for (const row of frequencyRows) {
        if (byFrequency[row.frequency]) byFrequency[row.frequency].partners = Number(row.partners) || 0;
      }
      const unpaidByStore = new Map();
      for (const d of unpaid) {
        const entry = unpaidByStore.get(d.store_id) || { frequency: d.frequency, gross: 0 };
        entry.gross += d.gross;
        unpaidByStore.set(d.store_id, entry);
      }
      for (const [storeId, entry] of unpaidByStore) {
        const bucket = byFrequency[entry.frequency];
        if (!bucket) continue;
        const owedNow = owed.get(storeId) || 0;
        bucket.partners_with_unpaid += 1;
        bucket.unpaid_gross += entry.gross;
        bucket.estimated_payout += entry.gross - Math.min(owedNow, entry.gross);
      }
      for (const bucket of Object.values(byFrequency)) {
        bucket.unpaid_gross = money(bucket.unpaid_gross);
        bucket.estimated_payout = money(bucket.estimated_payout);
      }
      const total = (status) => money(days.filter((d) => d.status === status).reduce((acc, d) => acc + d.gross, 0));
      const count = (status) => days.filter((d) => d.status === status).length;

      return {
        today,
        tracking_start: start,
        overdue_grace_days: PAYOUT_OVERDUE_GRACE_DAYS,
        ranges,
        totals: {
          paid_out_all_time: money(allTime[0]?.paid_out),
          payouts_all_time: Number(allTime[0]?.payouts) || 0,
          subscription_deducted_all_time: money(allTime[0]?.subscription_deducted),
          unpaid_gross: money(unpaid.reduce((acc, d) => acc + d.gross, 0)),
          unpaid_invoices: unpaid.length,
          scheduled_gross: total("scheduled"),
          due_gross: total("due"),
          overdue_gross: total("overdue"),
          overdue_invoices: count("overdue"),
          overdue_partners: new Set(days.filter((d) => d.status === "overdue").map((d) => d.store_id)).size,
        },
        by_frequency: byFrequency,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getInvoicePayoutsSummaryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch invoices summary");
    }
  },

  // One salon's invoice days (newest first) with payout status, amounts and
  // due dates, plus what its subscription owes today.
  getPartnerInvoiceDaysV2: async (data = {}) => {
    try {
      const storeId = Number(data.store_id);
      if (!Number.isInteger(storeId) || storeId <= 0) {
        throw Error.BadRequest("store_id must be a positive whole number");
      }
      const { today, start, from, to } = await adminDbController.app.resolvePayoutWindow(data);

      const [store] = await adminDbController.connection.query(
        `
        SELECT s.id, s.name, s.phone, s.email, s.logo, s.payout_frequency AS frequency, pa.city
        FROM Store s
        LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
        WHERE s.id = :storeId
        `,
        { replacements: { storeId }, type: Sequelize.QueryTypes.SELECT }
      );
      if (!store) {
        throw Error.NotFound("Partner");
      }

      const rows = from > to
        ? []
        : await adminDbController.connection.query(
          `
          SELECT x.*, ${INVOICE_DAY_STATUS_SQL} AS status, DATEDIFF(:today, x.due_date) AS days_past_due
          FROM (${invoiceDayRowsSql()}) x
          WHERE x.store_id = :storeId
          ORDER BY x.invoice_date DESC
          LIMIT 400
          `,
          {
            replacements: {
              daysFrom: from,
              daysEnd: addDays(to, 1),
              today,
              grace: PAYOUT_OVERDUE_GRACE_DAYS,
              storeId,
            },
            type: Sequelize.QueryTypes.SELECT,
          }
        );
      const owed = await adminDbController.app.getSubscriptionOwedByStore([storeId]);

      return {
        partner: {
          store_id: store.id,
          partner_name: store.name,
          partner_phone: store.phone,
          partner_email: store.email,
          partner_logo: cleanLogo(store.logo),
          city: store.city ? String(store.city).trim() : null,
          frequency: store.frequency,
          subscription_owed_now: owed.get(storeId) || 0,
        },
        days: rows.map((r) => ({
          invoice_date: dayString(r.invoice_date),
          due_date: dayString(r.due_date),
          status: r.status,
          days_past_due: Number(r.days_past_due),
          bookings: Number(r.bookings) || 0,
          gross: Number((Number(r.gross) || 0).toFixed(2)),
          payout_amount: r.payout_id ? Number(r.payout_amount) : null,
          subscription_deducted: r.payout_id ? Number(r.subscription_deducted) : null,
          paid_at: r.paid_at,
          marked_by: r.marked_by,
        })),
        today,
        tracking_start: start,
        from,
        to,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getPartnerInvoiceDaysV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner invoices");
    }
  },

  // Sets how often one or many salons are paid out.
  setPartnerPayoutFrequencyV2: async (data = {}) => {
    try {
      const raw = Array.isArray(data.store_ids) ? data.store_ids : [data.store_id];
      const storeIds = [...new Set(raw.map(Number))];
      if (!storeIds.length || storeIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw Error.BadRequest("store_ids must be positive whole numbers");
      }
      if (storeIds.length > 1000) {
        throw Error.BadRequest("at most 1000 partners at a time");
      }
      if (!PAYOUT_FREQUENCIES.includes(data.frequency)) {
        throw Error.BadRequest(`frequency must be one of: ${PAYOUT_FREQUENCIES.join(", ")}`);
      }
      const [, meta] = await adminDbController.connection.query(
        `UPDATE Store SET payout_frequency = :frequency WHERE id IN (:storeIds)`,
        { replacements: { frequency: data.frequency, storeIds } }
      );
      return { frequency: data.frequency, store_ids: storeIds, updated: meta?.affectedRows ?? null };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ setPartnerPayoutFrequencyV2 error:", error);
      throw Error.SomethingWentWrong("Failed to update payout frequency");
    }
  },

  // "Pay Now": marks a salon's unpaid invoice days paid, oldest first, each
  // through the existing markInvoicePayout - so subscription fees are
  // deducted day by day exactly as on the invoice page, and every day stays
  // individually undoable there. only_due (default true) skips days whose
  // payout isn't due yet. Stops at the first failure.
  payPartnerInvoicesV2: async (data = {}, adminId = null) => {
    try {
      const storeId = Number(data.store_id);
      if (!Number.isInteger(storeId) || storeId <= 0) {
        throw Error.BadRequest("store_id must be a positive whole number");
      }
      const onlyDue = data.only_due !== false;
      const { today, from, to } = await adminDbController.app.resolvePayoutWindow(data);
      if (from > to) return { paid: [], failed: null, remaining: 0 };

      const unpaid = await adminDbController.connection.query(
        `
        SELECT x.invoice_date, x.due_date
        FROM (${invoiceDayRowsSql()}) x
        WHERE x.store_id = :storeId AND x.payout_id IS NULL
          ${onlyDue ? "AND x.due_date <= :today" : ""}
        ORDER BY x.invoice_date ASC
        `,
        {
          replacements: { daysFrom: from, daysEnd: addDays(to, 1), storeId, today },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      if (unpaid.length > PAYOUT_BULK_MAX_DAYS) {
        throw Error.BadRequest(
          `${unpaid.length} unpaid days - pay at most ${PAYOUT_BULK_MAX_DAYS} at a time (narrow from / to)`
        );
      }

      const paid = [];
      let failed = null;
      for (const row of unpaid) {
        const date = dayString(row.invoice_date);
        try {
          const invoice = await adminDbController.app.markInvoicePayout({
            partner_id: storeId,
            date,
            marked_by: adminId,
          });
          paid.push({
            invoice_date: date,
            invoice_total: invoice.total_amount,
            subscription_deducted: invoice.payout_subscription_deducted,
            payout_amount: invoice.payout_amount,
          });
        } catch (error) {
          failed = { invoice_date: date, message: error?.message || "Failed to mark invoice as paid" };
          break;
        }
      }

      const sum = (key) => Number(paid.reduce((acc, p) => acc + (Number(p[key]) || 0), 0).toFixed(2));
      return {
        paid,
        failed,
        remaining: unpaid.length - paid.length,
        total_paid_out: sum("payout_amount"),
        total_deducted: sum("subscription_deducted"),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ payPartnerInvoicesV2 error:", error);
      throw Error.SomethingWentWrong("Failed to pay partner invoices");
    }
  },

  // ── Monthly report V2 (MonthlyReportV2 page) ────────────────────────────

  // Totals for one month span ({ from, end }) across every salon.
  getMonthlyReportTotals: async (span) => {
    const replacements = { fromDate: span.from, toEnd: span.end };
    const run = (sql, extra = {}) =>
      adminDbController.connection.query(sql, {
        replacements: { ...replacements, ...extra },
        type: Sequelize.QueryTypes.SELECT,
      });
    const [[bookings], [items], [payouts], [partners], [customers]] = await Promise.all([
      run(`
        SELECT COALESCE(SUM(total_bookings), 0) AS total_bookings, COALESCE(SUM(completed), 0) AS completed,
               COALESCE(SUM(cancelled), 0) AS cancelled, COALESCE(SUM(active_bookings), 0) AS active_bookings,
               COALESCE(SUM(gst), 0) AS gst, COALESCE(SUM(platform_fee), 0) AS platform_fee
        FROM (${MONTHLY_BOOKINGS_SQL}) b`),
      run(`
        SELECT COALESCE(SUM(gross), 0) AS gross, COALESCE(SUM(orders), 0) AS orders,
               COALESCE(SUM(cac_spend), 0) AS cac_spend, COALESCE(SUM(cac_bookings), 0) AS cac_bookings
        FROM (${MONTHLY_ITEMS_SQL}) g`),
      run(`
        SELECT COALESCE(SUM(payout), 0) AS payout, COALESCE(SUM(subscription_deducted), 0) AS subscription_deducted
        FROM (${MONTHLY_PAYOUTS_SQL}) p`),
      run(`SELECT COUNT(*) AS partners FROM (${MONTHLY_SALONS_SQL}) base`),
      // New = their first ever paid, served booking falls in this month.
      run(`
        SELECT COUNT(*) AS customers, COALESCE(SUM(f.first_booking >= :fromDate), 0) AS new_customers
        FROM (
          SELECT DISTINCT a.user_id FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL} AND a.booking_date >= :fromDate AND a.booking_date < :toEnd
        ) m
        INNER JOIN (
          SELECT a.user_id, MIN(a.booking_date) AS first_booking FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL}
          GROUP BY a.user_id
        ) f ON f.user_id = m.user_id`),
    ]);

    const num = (v) => Number(v) || 0;
    const money = (v) => Number(num(v).toFixed(2));
    const active = num(bookings.active_bookings);
    const partnerCount = num(partners.partners);
    const customerCount = num(customers.customers);
    const newCustomers = num(customers.new_customers);
    const cacBookings = num(items.cac_bookings);
    return {
      month: span.month,
      from: span.from,
      to: span.to,
      partners: partnerCount,
      total_bookings: num(bookings.total_bookings),
      completed: num(bookings.completed),
      cancelled: num(bookings.cancelled),
      active_bookings: active,
      avg_bookings_per_partner: partnerCount ? Number((num(bookings.total_bookings) / partnerCount).toFixed(2)) : null,
      gross: money(items.gross),
      orders: num(items.orders),
      gst: money(bookings.gst),
      platform_fee_total: money(bookings.platform_fee),
      payout: money(payouts.payout),
      subscription_deducted: money(payouts.subscription_deducted),
      cac_spend: money(items.cac_spend),
      cac_per_booking: cacBookings ? money(num(items.cac_spend) / cacBookings) : null,
      customers: customerCount,
      new_customers: newCustomers,
      repeat_customers: customerCount - newCustomers,
      returning_rate: customerCount ? Number((((customerCount - newCustomers) / customerCount) * 100).toFixed(1)) : null,
    };
  },

  // The month's totals next to the month before's, and the cities with bookings (for the filter).
  getMonthlyReportSummaryV2: async (data = {}) => {
    try {
      const { current, previous } = resolveReportMonths(data.month);
      const [cur, prev, cityRows] = await Promise.all([
        adminDbController.app.getMonthlyReportTotals(current),
        adminDbController.app.getMonthlyReportTotals(previous),
        adminDbController.connection.query(
          `
          SELECT DISTINCT TRIM(pa.city) AS city
          FROM (${MONTHLY_SALONS_SQL}) base
          INNER JOIN Store s ON s.id = base.store_id
          INNER JOIN PartnerAddress pa ON pa.id = s.address_id
          WHERE pa.city IS NOT NULL AND TRIM(pa.city) <> ''
          ORDER BY city
          `,
          {
            replacements: { fromDate: current.from, toEnd: current.end },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
      ]);
      return {
        month: current.month,
        current: cur,
        previous: prev,
        cities: cityRows.map((row) => row.city),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getMonthlyReportSummaryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly report summary");
    }
  },

  // One row per salon with activity in the month: bookings (total /
  // completed / cancelled), invoice value, payout, subscription deducted,
  // platform fee (stored per booking, served bookings), GST, CAC, average order
  // value, rating, last booking. Filters: search, city; sorts per the page.
  getMonthlyReportSalonsV2: async (data = {}) => {
    try {
      const { current } = resolveReportMonths(data.month);
      const where = [];
      const replacements = { fromDate: current.from, toEnd: current.end };
      const addWhere = (sql, values = {}) => {
        where.push(sql);
        Object.assign(replacements, values);
      };

      const search = String(data.search || "").trim().replace(/^#/, "");
      if (search) {
        const conditions = ["s.name LIKE :searchLike", "s.phone LIKE :searchLike", "s.email LIKE :searchLike"];
        const values = { searchLike: `%${escapeLike(search)}%` };
        if (/^\d+$/.test(search)) {
          conditions.unshift("base.store_id = :searchId");
          values.searchId = Number(search);
        }
        addWhere(`(${conditions.join(" OR ")})`, values);
      }
      if (data.city) {
        addWhere("LOWER(TRIM(pa.city)) = LOWER(TRIM(:city))", { city: String(data.city) });
      }
      const sort = MONTHLY_REPORT_SORTS[data.sort || "bookings_desc"];
      if (!sort) {
        throw Error.BadRequest(`sort must be one of: ${Object.keys(MONTHLY_REPORT_SORTS).join(", ")}`);
      }
      const page = Math.max(1, Number(data.page) || 1);
      const pageSize = Math.min(Math.max(1, Number(data.limit) || 10), MONTHLY_REPORT_MAX_LIMIT);

      // LEFT JOIN Store: bookings of since-deleted salons still count in the
      // month's money, so they stay listed (as "Deleted salon #id") and the
      // rows always add up to getMonthlyReportSummaryV2.
      const fromSql = `
        FROM (${MONTHLY_SALONS_SQL}) base
        LEFT JOIN Store s ON s.id = base.store_id
        LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
        LEFT JOIN (${MONTHLY_BOOKINGS_SQL}) b ON b.store_id = base.store_id
        LEFT JOIN (${MONTHLY_ITEMS_SQL}) g ON g.store_id = base.store_id
        LEFT JOIN (${MONTHLY_PAYOUTS_SQL}) p ON p.store_id = base.store_id
        LEFT JOIN (
          SELECT store_id, ROUND(AVG(rating), 1) AS average_rating, COUNT(*) AS review_count
          FROM Reviews
          WHERE status = 'active' AND rating BETWEEN 1 AND 5
          GROUP BY store_id
        ) r ON r.store_id = base.store_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      `;

      const [rows, totalRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT base.store_id, s.id AS existing_store_id, s.name, s.store_type, s.phone, s.email, s.logo,
                 s.status AS store_status,
                 pa.area, pa.city, pa.state,
                 b.total_bookings, b.completed, b.cancelled, b.active_bookings, b.gst, b.platform_fee, b.customers, b.last_booking,
                 g.gross, g.orders, g.cac_spend, g.cac_bookings,
                 p.payout, p.subscription_deducted, p.payouts,
                 r.average_rating, r.review_count
          ${fromSql}
          ORDER BY ${sort}
          LIMIT :pageSize OFFSET :offset
          `,
          {
            replacements: { ...replacements, pageSize, offset: (page - 1) * pageSize },
            type: Sequelize.QueryTypes.SELECT,
          }
        ),
        adminDbController.connection.query(`SELECT COUNT(*) AS total ${fromSql}`, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      return {
        rows: rows.map((r) => {
          const total = num(r.total_bookings);
          const active = num(r.active_bookings);
          const orders = num(r.orders);
          const cacBookings = num(r.cac_bookings);
          const [lastDay, lastTime] = String(r.last_booking || "").split(" ");
          return {
            store_id: r.store_id,
            partner_name: r.existing_store_id === null ? `Deleted salon #${r.store_id}` : r.name,
            salon_deleted: r.existing_store_id === null,
            store_type: r.store_type || null,
            partner_phone: r.phone,
            partner_email: r.email,
            partner_logo: cleanLogo(r.logo),
            store_status: r.store_status,
            area: r.area ? String(r.area).trim() : null,
            city: r.city ? String(r.city).trim() : null,
            state: r.state ? String(r.state).trim() : null,
            total_bookings: total,
            completed: num(r.completed),
            completed_pct: pct(num(r.completed), total),
            cancelled: num(r.cancelled),
            cancelled_pct: pct(num(r.cancelled), total),
            active_bookings: active,
            customers: num(r.customers),
            gross: money(r.gross),
            orders,
            payout: money(r.payout),
            payouts: num(r.payouts),
            subscription_deducted: money(r.subscription_deducted),
            platform_fee: money(r.platform_fee),
            gst: money(r.gst),
            cac_spend: money(r.cac_spend),
            cac_per_booking: cacBookings ? money(num(r.cac_spend) / cacBookings) : null,
            avg_order_value: orders ? money(num(r.gross) / orders) : null,
            average_rating: r.average_rating === null ? null : Number(r.average_rating),
            review_count: num(r.review_count),
            // Visit day + booked slot start, IST - same as the invoice page.
            last_booking_at: lastDay ? (lastTime ? `${lastDay}T${lastTime}+05:30` : lastDay) : null,
          };
        }),
        total: Number(totalRows[0]?.total) || 0,
        page,
        limit: pageSize,
        month: current.month,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getMonthlyReportSalonsV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly report");
    }
  },

  // ── Analytics intelligence V2 (AnalyticsIntelligenceV2 page) ────────────
  // Every card takes { from, to } (YYYY-MM-DD, IST, inclusive) and also
  // returns the equal-length window just before it for the Compare toggle.

  // Per-salon profitability for one window ({ from, end }). Same money as
  // the monthly report: GMV = invoice value, GloUp revenue = platform fees
  // paid on served bookings + subscription fees deducted from payouts, contribution =
  // revenue - CAC (Gloup-funded discounts), margin = contribution / GMV.
  getAnalyticsProfitRows: async (span) => {
    const rows = await adminDbController.connection.query(
      `
      SELECT base.store_id, s.id AS existing_store_id, s.name, s.logo, pa.area, pa.city,
             b.active_bookings, b.platform_fee, g.gross, g.cac_spend, p.subscription_deducted
      FROM (${MONTHLY_SALONS_SQL}) base
      LEFT JOIN Store s ON s.id = base.store_id
      LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
      LEFT JOIN (${MONTHLY_BOOKINGS_SQL}) b ON b.store_id = base.store_id
      LEFT JOIN (${MONTHLY_ITEMS_SQL}) g ON g.store_id = base.store_id
      LEFT JOIN (${MONTHLY_PAYOUTS_SQL}) p ON p.store_id = base.store_id
      `,
      {
        replacements: { fromDate: span.from, toEnd: span.end },
        type: Sequelize.QueryTypes.SELECT,
      }
    );
    const num = (v) => Number(v) || 0;
    const money = (v) => Number(num(v).toFixed(2));
    return rows.map((r) => {
      const bookings = num(r.active_bookings);
      const gmv = money(r.gross);
      const feeRevenue = money(r.platform_fee);
      const subscription = money(r.subscription_deducted);
      const revenue = money(feeRevenue + subscription);
      const cac = money(r.cac_spend);
      const contribution = money(revenue - cac);
      const margin = gmv > 0 ? Number(((contribution / gmv) * 100).toFixed(1)) : null;
      return {
        store_id: r.store_id,
        salon_name: r.existing_store_id === null ? `Deleted salon #${r.store_id}` : r.name,
        salon_deleted: r.existing_store_id === null,
        salon_logo: cleanLogo(r.logo),
        area: r.area ? String(r.area).trim() : null,
        city: r.city ? String(r.city).trim() : null,
        bookings,
        gmv,
        platform_fee_revenue: feeRevenue,
        subscription_revenue: subscription,
        revenue,
        cac_spend: cac,
        contribution,
        margin_pct: margin,
        tier: profitTier(margin, contribution),
      };
    });
  },

  getAnalyticsProfitabilityV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const [rows, prevRows] = await Promise.all([
        adminDbController.app.getAnalyticsProfitRows(win),
        adminDbController.app.getAnalyticsProfitRows(win.previous),
      ]);
      // Sales = served bookings, grouped by their salon's tier.
      const stats = (list) => {
        const sum = (pred) => list.filter(pred).reduce((total, r) => total + r.bookings, 0);
        const money = (key) => Number(list.reduce((total, r) => total + r[key], 0).toFixed(2));
        return {
          total_sales: sum(() => true),
          profitable_sales: sum((r) => r.tier === "High" || r.tier === "Medium"),
          low_sales: sum((r) => r.tier === "Low"),
          negative_sales: sum((r) => r.tier === "Negative"),
          gmv: money("gmv"),
          revenue: money("revenue"),
          cac_spend: money("cac_spend"),
          contribution: money("contribution"),
        };
      };
      rows.sort((a, b) => b.contribution - a.contribution || b.bookings - a.bookings);
      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        tiers: PROFIT_TIERS,
        stats: stats(rows),
        previous_stats: stats(prevRows),
        rows,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getAnalyticsProfitabilityV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch profitability analytics");
    }
  },

  // Switching for one window: per salon, the customers whose first served
  // booking in the window was there, split by where their NEXT served booking
  // (any time after) went - same salon / another salon / none yet.
  getAnalyticsSwitchRows: async (span) => {
    const replacements = { fromDate: span.from, toEnd: span.end };
    const [bySalon, switchedTo] = await Promise.all([
      adminDbController.connection.query(
        `
        SELECT anc.store_id, COUNT(*) AS customers,
               SUM(anc.next_store = anc.store_id) AS stayed,
               SUM(anc.next_store <> anc.store_id) AS switched,
               SUM(anc.next_store IS NULL) AS no_return
        FROM (${SWITCH_ANCHORS_SQL}) anc
        GROUP BY anc.store_id
        `,
        { replacements, type: Sequelize.QueryTypes.SELECT }
      ),
      adminDbController.connection.query(
        `
        SELECT anc.next_store AS store_id, COUNT(*) AS customers
        FROM (${SWITCH_ANCHORS_SQL}) anc
        WHERE anc.next_store <> anc.store_id
        GROUP BY anc.next_store
        `,
        { replacements, type: Sequelize.QueryTypes.SELECT }
      ),
    ]);
    const num = (v) => Number(v) || 0;
    return {
      bySalon: bySalon.map((r) => ({
        store_id: r.store_id,
        customers: num(r.customers),
        stayed: num(r.stayed),
        switched: num(r.switched),
        no_return: num(r.no_return),
      })),
      switchedTo: switchedTo.map((r) => ({ store_id: r.store_id, customers: num(r.customers) })),
    };
  },

  getAnalyticsSwitchingV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 90);
      const [cur, prev] = await Promise.all([
        adminDbController.app.getAnalyticsSwitchRows(win),
        adminDbController.app.getAnalyticsSwitchRows(win.previous),
      ]);
      const totals = (list) => ({
        customers: list.reduce((t, r) => t + r.customers, 0),
        stayed: list.reduce((t, r) => t + r.stayed, 0),
        switched: list.reduce((t, r) => t + r.switched, 0),
        no_return: list.reduce((t, r) => t + r.no_return, 0),
      });
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);

      const ids = [...new Set([...cur.bySalon, ...cur.switchedTo].map((r) => r.store_id))];
      const stores = ids.length
        ? await adminDbController.connection.query(`SELECT id, name, logo FROM Store WHERE id IN (:ids)`, {
            replacements: { ids },
            type: Sequelize.QueryTypes.SELECT,
          })
        : [];
      const storeById = new Map(stores.map((s) => [Number(s.id), s]));
      const salon = (id) => {
        const s = storeById.get(Number(id));
        return {
          store_id: id,
          salon_name: s ? s.name : `Deleted salon #${id}`,
          salon_deleted: !s,
          salon_logo: s ? cleanLogo(s.logo) : null,
        };
      };

      const prevById = new Map(prev.bySalon.map((r) => [Number(r.store_id), r]));
      const risk = cur.bySalon
        .filter((r) => r.customers >= SWITCH_RISK_MIN_CUSTOMERS)
        .map((r) => {
          const switchingPct = pct(r.switched, r.customers);
          const before = prevById.get(Number(r.store_id));
          const prevPct = before && before.customers >= SWITCH_RISK_MIN_CUSTOMERS ? pct(before.switched, before.customers) : null;
          return {
            ...salon(r.store_id),
            ...r,
            switching_pct: switchingPct,
            previous_switching_pct: prevPct,
            // Percentage points vs the previous window.
            trend_pts: prevPct === null ? null : Number((switchingPct - prevPct).toFixed(1)),
            risk: switchRiskTier(switchingPct),
          };
        })
        .sort((a, b) => b.switching_pct - a.switching_pct || b.customers - a.customers);

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        stats: totals(cur.bySalon),
        previous_stats: totals(prev.bySalon),
        switched_to: cur.switchedTo
          .sort((a, b) => b.customers - a.customers)
          .slice(0, 10)
          .map((r) => ({ ...salon(r.store_id), customers: r.customers })),
        risk_tiers: SWITCH_RISK_TIERS,
        risk_min_customers: SWITCH_RISK_MIN_CUSTOMERS,
        risk,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getAnalyticsSwitchingV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch switching analytics");
    }
  },

  // Customer gravity per salon: customers served in the window, repeat
  // customers (2+ served bookings at that salon up to the window's end) and
  // retention (previous window's customers who came back in this window).
  // Where customers live / travel distance are not stored, so not returned.
  getAnalyticsGravityV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const replacements = { fromDate: win.from, toEnd: win.end, prevFrom: win.previous.from };
      const servedSql = `${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL`;
      const pairsSql = (fromKey) => `
        SELECT DISTINCT a.store_id, a.user_id FROM appointments a
        WHERE ${servedSql} AND a.booking_date >= :${fromKey} AND a.booking_date < :${fromKey === "fromDate" ? "toEnd" : "fromDate"}`;
      const [rows, [overall]] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT base.store_id, s.id AS existing_store_id, s.name, s.logo, pa.area, pa.city,
                 COALESCE(cur.customers, 0) AS customers, COALESCE(cur.bookings, 0) AS bookings,
                 COALESCE(rep.repeat_customers, 0) AS repeat_customers,
                 COALESCE(ret.prev_customers, 0) AS prev_customers, COALESCE(ret.retained, 0) AS retained
          FROM (
            SELECT DISTINCT a.store_id FROM appointments a
            WHERE ${servedSql} AND a.booking_date >= :prevFrom AND a.booking_date < :toEnd
          ) base
          LEFT JOIN Store s ON s.id = base.store_id
          LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
          LEFT JOIN (
            SELECT a.store_id, COUNT(DISTINCT a.user_id) AS customers, COUNT(*) AS bookings
            FROM appointments a
            WHERE ${servedSql} AND a.booking_date >= :fromDate AND a.booking_date < :toEnd
            GROUP BY a.store_id
          ) cur ON cur.store_id = base.store_id
          LEFT JOIN (
            SELECT w.store_id, COUNT(*) AS repeat_customers
            FROM (${pairsSql("fromDate")}) w
            INNER JOIN (
              SELECT a.store_id, a.user_id FROM appointments a
              WHERE ${servedSql} AND a.booking_date < :toEnd
              GROUP BY a.store_id, a.user_id HAVING COUNT(*) >= 2
            ) h ON h.store_id = w.store_id AND h.user_id = w.user_id
            GROUP BY w.store_id
          ) rep ON rep.store_id = base.store_id
          LEFT JOIN (
            SELECT p.store_id, COUNT(*) AS prev_customers, SUM(c.user_id IS NOT NULL) AS retained
            FROM (${pairsSql("prevFrom")}) p
            LEFT JOIN (${pairsSql("fromDate")}) c ON c.store_id = p.store_id AND c.user_id = p.user_id
            GROUP BY p.store_id
          ) ret ON ret.store_id = base.store_id
          ORDER BY customers DESC, repeat_customers DESC, base.store_id ASC
          `,
          { replacements, type: Sequelize.QueryTypes.SELECT }
        ),
        // Platform-wide: same three numbers counted per customer, any salon.
        adminDbController.connection.query(
          `
          SELECT
            (SELECT COUNT(DISTINCT a.user_id) FROM appointments a
              WHERE ${servedSql} AND a.booking_date >= :fromDate AND a.booking_date < :toEnd) AS customers,
            (SELECT COUNT(*) FROM (
              SELECT a.user_id FROM appointments a
              WHERE ${servedSql} AND a.booking_date < :toEnd
                AND a.user_id IN (SELECT a2.user_id FROM appointments a2
                  WHERE ${servedSql.replace(/\ba\./g, "a2.")} AND a2.booking_date >= :fromDate AND a2.booking_date < :toEnd)
              GROUP BY a.user_id HAVING COUNT(*) >= 2) r) AS repeat_customers,
            (SELECT COUNT(DISTINCT a.user_id) FROM appointments a
              WHERE ${servedSql} AND a.booking_date >= :prevFrom AND a.booking_date < :fromDate) AS prev_customers,
            (SELECT COUNT(DISTINCT a.user_id) FROM appointments a
              WHERE ${servedSql} AND a.booking_date >= :prevFrom AND a.booking_date < :fromDate
                AND a.user_id IN (SELECT a2.user_id FROM appointments a2
                  WHERE ${servedSql.replace(/\ba\./g, "a2.")} AND a2.booking_date >= :fromDate AND a2.booking_date < :toEnd)) AS retained
          `,
          { replacements, type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const num = (v) => Number(v) || 0;
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const shape = (r) => ({
        customers: num(r.customers),
        repeat_customers: num(r.repeat_customers),
        repeat_pct: pct(num(r.repeat_customers), num(r.customers)),
        previous_customers: num(r.prev_customers),
        retained_customers: num(r.retained),
        retention_pct: pct(num(r.retained), num(r.prev_customers)),
      });
      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        overall: shape(overall),
        salons: rows.map((r) => ({
          store_id: r.store_id,
          salon_name: r.existing_store_id === null ? `Deleted salon #${r.store_id}` : r.name,
          salon_deleted: r.existing_store_id === null,
          salon_logo: cleanLogo(r.logo),
          area: r.area ? String(r.area).trim() : null,
          city: r.city ? String(r.city).trim() : null,
          bookings: num(r.bookings),
          ...shape(r),
        })),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getAnalyticsGravityV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch gravity analytics");
    }
  },

  // Users whose app is most likely uninstalled: FCM answered
  // registration-token-not-registered for their push token and they haven't
  // registered a working one since (their stored token is gone or is that
  // same dead token). Only known once a push was attempted. detected_at =
  // the first failure for that dead token; the window filters on it.
  getUninstalledUsers: async (win) => {
    const tokenRows = await adminDbController.connection.query(
      `
      SELECT f.user_id, f.token, MIN(f.created_at) AS first_at, MAX(f.created_at) AS last_at
      FROM FailedNotificationTokens f
      WHERE f.user_id IS NOT NULL AND f.error_code LIKE '%registration-token-not-registered%'
      GROUP BY f.user_id, f.token
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const failedByUser = new Map();
    for (const row of tokenRows) {
      const list = failedByUser.get(Number(row.user_id)) || [];
      list.push(row);
      failedByUser.set(Number(row.user_id), list);
    }
    const userIds = [...failedByUser.keys()];
    if (!userIds.length) return [];

    const [users, bookings, logins] = await Promise.all([
      adminDbController.connection.query(
        `SELECT u.id, u.firstname, u.lastname, u.phone, u.email, u.gender, u.device_id, u.status, u.registered_at, u.loyalty_status
         FROM User u WHERE u.id IN (:userIds) AND u.status <> 'terminated'`,
        { replacements: { userIds }, type: Sequelize.QueryTypes.SELECT }
      ),
      adminDbController.connection.query(
        `SELECT a.user_id, SUM(${ACTIVE_BOOKING_SQL}) AS served_bookings, MAX(a.created_at) AS last_booking_at
         FROM appointments a WHERE a.user_id IN (:userIds) GROUP BY a.user_id`,
        { replacements: { userIds }, type: Sequelize.QueryTypes.SELECT }
      ),
      adminDbController.connection.query(
        `SELECT o.userId AS user_id, MAX(o.createdAt) AS last_login_at
         FROM OtpLogs o WHERE o.userId IN (:userIds) AND (o.userType = 'user' OR o.userType IS NULL)
         GROUP BY o.userId`,
        { replacements: { userIds }, type: Sequelize.QueryTypes.SELECT }
      ),
    ]);
    const bookingsById = new Map(bookings.map((r) => [Number(r.user_id), r]));
    const loginsById = new Map(logins.map((r) => [Number(r.user_id), r]));
    // device_id is a JSON array (or a bare token); the last one is current.
    const currentToken = (raw) => {
      if (!raw) return null;
      const text = String(raw).trim();
      if (!text || text === "null") return null;
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const tokens = parsed.map((t) => String(t).trim()).filter(Boolean);
          return tokens.length ? tokens[tokens.length - 1] : null;
        }
        return typeof parsed === "string" && parsed.trim() ? parsed.trim() : null;
      } catch {
        return text;
      }
    };
    const toMs = (v) => (v ? new Date(v).getTime() : null);
    const fromMs = Date.parse(`${win.from}T00:00:00+05:30`);
    const endMs = Date.parse(`${win.end}T00:00:00+05:30`);

    const result = [];
    for (const user of users) {
      const failed = failedByUser.get(Number(user.id)) || [];
      const token = currentToken(user.device_id);
      let dead;
      if (token) {
        dead = failed.find((f) => f.token === token);
        if (!dead) continue; // registered a new, working token since
      } else {
        dead = failed.reduce((latest, f) => (!latest || toMs(f.last_at) > toMs(latest.last_at) ? f : latest), null);
      }
      const detectedMs = toMs(dead.first_at);
      if (win.from && (detectedMs < fromMs || detectedMs >= endMs)) continue;

      const booking = bookingsById.get(Number(user.id));
      const login = loginsById.get(Number(user.id));
      const activity = [toMs(user.registered_at), toMs(login?.last_login_at), toMs(booking?.last_booking_at)].filter(Boolean);
      const lastActiveMs = activity.length ? Math.max(...activity) : null;
      const phone = user.phone ? String(user.phone) : null;
      result.push({
        user_id: user.id,
        name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim() || null,
        phone,
        email: user.email || null,
        gender: user.gender && String(user.gender).toLowerCase() !== "null" ? String(user.gender).trim() : null,
        loyalty_status: user.loyalty_status,
        served_bookings: Number(booking?.served_bookings) || 0,
        detected_at: new Date(detectedMs).toISOString(),
        last_active_at: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
        // A 10-digit Indian mobile: reachable by SMS / WhatsApp.
        reachable: Boolean(phone && /^[6-9]\d{9}$/.test(phone)),
        high_value: (Number(booking?.served_bookings) || 0) >= UNINSTALLED_HIGH_VALUE_BOOKINGS,
      });
    }
    return result;
  },

  getAnalyticsUninstalledV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const [users, prevUsers] = await Promise.all([
        adminDbController.app.getUninstalledUsers(win),
        adminDbController.app.getUninstalledUsers(win.previous),
      ]);
      const now = Date.now();
      const segmentOf = (u) => {
        if (!u.last_active_at) return "unknown";
        const days = (now - new Date(u.last_active_at).getTime()) / 864e5;
        return UNINSTALLED_SEGMENTS.find((s) => days <= s.max_days)?.key || "unknown";
      };
      const stats = (list) => ({
        uninstalled: list.length,
        reachable: list.filter((u) => u.reachable).length,
        high_value: list.filter((u) => u.high_value).length,
        high_value_reachable: list.filter((u) => u.high_value && u.reachable).length,
      });
      const counts = {};
      for (const u of users) counts[segmentOf(u)] = (counts[segmentOf(u)] || 0) + 1;

      if (data.include_users) {
        return {
          from: win.from,
          to: win.to,
          users: users
            .map((u) => ({ ...u, segment: segmentOf(u) }))
            .sort((a, b) => b.served_bookings - a.served_bookings || String(b.detected_at).localeCompare(String(a.detected_at))),
        };
      }
      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        stats: stats(users),
        previous_stats: stats(prevUsers),
        segments: [...UNINSTALLED_SEGMENTS, { key: "unknown", label: "No activity recorded" }].map((s) => ({
          key: s.key,
          label: s.label,
          users: counts[s.key] || 0,
        })),
        high_value_min_bookings: UNINSTALLED_HIGH_VALUE_BOOKINGS,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getAnalyticsUninstalledV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch uninstalled users");
    }
  },

  // ── User analytics V2 ──
  // city = salon city (district, else city - see salonCityKeySql): narrows
  // booking stages and salon views. platform = app platform: narrows app
  // activity, sessions and logins. `cutoff` (the go-live date) rides along
  // in the replacements for bookingFloorSql.
  getUserAnalyticsFilters: (data = {}, cutoff = null) => {
    const city = data.city ? String(data.city).trim() : "";
    const cityKey = placeKey(city);
    const requested = String(data.platform || "").trim().toLowerCase();
    const platform = USER_ANALYTICS_PLATFORMS.includes(requested) ? requested : null;
    return {
      city: cityKey ? placeLabel(city) : null,
      platform,
      cityJoin: (alias) =>
        cityKey ? `LEFT JOIN Store cs ON cs.id = ${alias}.store_id LEFT JOIN PartnerAddress cpa ON cpa.id = cs.address_id` : "",
      cityWhere: cityKey ? `AND ${salonCityKeySql("cpa")} = :cityKey` : "",
      platformWhere: (alias) => (platform ? `AND ${alias}.platform = :platform` : ""),
      replacements: { cityKey, platform, cutoff: cutoff || null },
    };
  },

  // Cities that have live salons, for the city filters: grouped by
  // placeKey, labelled with the most common spelling (title-cased).
  getSalonCities: async () => {
    const rows = await adminDbController.connection.query(
      `
      SELECT COALESCE(NULLIF(TRIM(pa.district), ''), pa.city) AS city, COUNT(*) AS salons
      FROM Store s INNER JOIN PartnerAddress pa ON pa.id = s.address_id
      WHERE s.status = 'active' AND s.completion_status = 'completed'
      GROUP BY COALESCE(NULLIF(TRIM(pa.district), ''), pa.city)
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const byKey = new Map();
    for (const row of rows) {
      const key = placeKey(row.city);
      const label = placeLabel(row.city);
      if (!key || !label) continue;
      const entry = byKey.get(key) || { label, salons: 0, best: 0 };
      entry.salons += Number(row.salons) || 0;
      if ((Number(row.salons) || 0) > entry.best) {
        entry.best = Number(row.salons) || 0;
        entry.label = label;
      }
      byKey.set(key, entry);
    }
    return [...byKey.values()].map((e) => e.label).sort((a, b) => a.localeCompare(b));
  },

  // Distinct users with app activity per IST day, fromDate .. end
  // (exclusive). A session counts on the day it started and the day it was
  // last seen. Returns Map(day -> [user_id]).
  getUserActiveDays: async (fromDate, end, f) => {
    const pf = f.platformWhere("s");
    const rows = await adminDbController.connection.query(
      `
      SELECT DISTINCT x.user_id, x.d FROM (
        SELECT s.user_id, DATE_FORMAT(s.started_at, '%Y-%m-%d') AS d FROM UserAppSessions s
        WHERE s.started_at < :end AND s.last_seen_at >= :fromDate ${pf}
        UNION ALL
        SELECT s.user_id, DATE_FORMAT(s.last_seen_at, '%Y-%m-%d') AS d FROM UserAppSessions s
        WHERE s.started_at < :end AND s.last_seen_at >= :fromDate ${pf}
      ) x
      WHERE x.d >= :fromDate AND x.d < :end
      `,
      { replacements: { ...f.replacements, fromDate, end }, type: Sequelize.QueryTypes.SELECT }
    );
    const byDay = new Map();
    for (const row of rows) {
      const list = byDay.get(row.d) || [];
      list.push(Number(row.user_id));
      byDay.set(row.d, list);
    }
    return byDay;
  },

  // Every per-window number the page compares with the previous window
  // (everything except app activity, which comes from getUserActiveDays).
  getUserAnalyticsWindowStats: async (win, f, today) => {
    const replacements = { ...f.replacements, from: win.from, end: win.end, today };
    const run = (sql) =>
      adminDbController.connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
    const created = (alias) => `${alias}.created_at >= :from AND ${alias}.created_at < :end`;
    // Bookings in the window, from the go-live cutoff on.
    const booked = (alias) => `${created(alias)} AND ${bookingFloorSql(alias)}`;
    const [[signups], [logins], [sessions], [views], [coupons], [bookings], [first], [customers], uninstalled] =
      await Promise.all([
        run(`SELECT COUNT(*) AS c FROM User u WHERE u.registered_at >= :from AND u.registered_at < :end`),
        run(`
          SELECT COUNT(*) AS logins, COUNT(DISTINCT s.user_id) AS users FROM UserSession s
          WHERE s.user_id IS NOT NULL AND ${created("s")} ${f.platformWhere("s")}`),
        run(`
          SELECT COUNT(*) AS sessions, AVG(${SESSION_SECONDS_SQL}) AS avg_seconds FROM UserAppSessions s
          WHERE s.started_at >= :from AND s.started_at < :end ${f.platformWhere("s")}`),
        // Viewers who then started no checkout at all in the window.
        run(`
          SELECT COUNT(*) AS views, COUNT(DISTINCT e.user_id) AS viewers,
            COUNT(DISTINCT CASE WHEN ap.user_id IS NULL THEN e.user_id END) AS no_checkout
          FROM UserEvents e ${f.cityJoin("e")}
          LEFT JOIN (
            SELECT DISTINCT a.user_id FROM appointments a WHERE a.user_id IS NOT NULL AND ${booked("a")}
          ) ap ON ap.user_id = e.user_id
          WHERE e.event = 'salon_view' AND ${created("e")} ${f.cityWhere}`),
        // Applied a coupon in the app, or placed a booking with one.
        run(`
          SELECT COUNT(DISTINCT x.user_id) AS users FROM (
            SELECT e.user_id FROM UserEvents e WHERE e.event = 'coupon_apply' AND ${created("e")}
            UNION
            SELECT a.user_id FROM appointments a ${f.cityJoin("a")}
            WHERE a.user_id IS NOT NULL AND a.discount_id IS NOT NULL AND a.discount_id <> 0
              AND ${booked("a")} ${f.cityWhere}
          ) x`),
        // Checkout = an appointment row, created (payment pending) before the
        // customer pays. Paid includes bookings refunded later. "Due" = paid
        // bookings whose date has passed.
        run(`
          SELECT COUNT(DISTINCT a.user_id) AS checkout_users,
            COUNT(DISTINCT CASE WHEN ${PAYMENT_MADE_SQL} THEN a.user_id END) AS paid_users,
            COALESCE(SUM(${PAYMENT_MADE_SQL} AND a.booking_date < :today), 0) AS paid_due,
            COALESCE(SUM(${PAYMENT_MADE_SQL} AND a.booking_date < :today AND a.status <> 'completed'), 0) AS paid_not_completed
          FROM appointments a ${f.cityJoin("a")}
          WHERE a.user_id IS NOT NULL AND ${booked("a")} ${f.cityWhere}`),
        // Customers whose first served booking since go-live was placed in
        // the window.
        run(`
          SELECT COUNT(*) AS first_bookings, COALESCE(SUM(a.status = 'completed'), 0) AS first_completed
          FROM (
            SELECT a.user_id, MIN(a.id) AS first_id FROM appointments a
            WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
            GROUP BY a.user_id
          ) fb
          INNER JOIN appointments a ON a.id = fb.first_id ${f.cityJoin("a")}
          WHERE ${created("a")} ${f.cityWhere}`),
        // Booking customers in the window; "new" = their first served booking
        // since go-live is in it.
        run(`
          SELECT COUNT(*) AS customers, COALESCE(SUM(fb.first_at >= :from), 0) AS new_customers
          FROM (
            SELECT DISTINCT a.user_id FROM appointments a ${f.cityJoin("a")}
            WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${booked("a")} ${f.cityWhere}
          ) c
          INNER JOIN (
            SELECT a.user_id, MIN(a.created_at) AS first_at FROM appointments a
            WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
            GROUP BY a.user_id
          ) fb ON fb.user_id = c.user_id`),
        adminDbController.app.getUninstalledUsers(win),
      ]);
    const num = (v) => Number(v) || 0;
    return {
      signups: num(signups?.c),
      logins: num(logins?.logins),
      login_users: num(logins?.users),
      sessions: num(sessions?.sessions),
      avg_session_seconds: num(sessions?.sessions) ? Math.round(num(sessions.avg_seconds)) : null,
      salon_views: num(views?.views),
      salon_viewers: num(views?.viewers),
      viewers_no_checkout: num(views?.no_checkout),
      coupon_users: num(coupons?.users),
      checkout_users: num(bookings?.checkout_users),
      paid_users: num(bookings?.paid_users),
      paid_due: num(bookings?.paid_due),
      paid_not_completed: num(bookings?.paid_not_completed),
      first_bookings: num(first?.first_bookings),
      first_completed: num(first?.first_completed),
      customers: num(customers?.customers),
      new_customers: num(customers?.new_customers),
      uninstalled,
    };
  },

  getUserAnalyticsOverviewV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 7);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const today = toIstDatePart(new Date());
      const pairsFrom = addDays(win.previous.from, -(USER_ANALYTICS_MAU_DAYS - 1));
      const replacements = { ...f.replacements, from: win.from, end: win.end };
      const run = (sql) =>
        adminDbController.connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
      const pf = f.platformWhere("s");

      const [
        [since],
        cur,
        prev,
        byDay,
        signupRows,
        loginRows,
        firstRows,
        sessionRows,
        heatRows,
        platformRows,
        [tokens],
        cities,
      ] = await Promise.all([
        // Logins are dated by UserSession.created_at, which older sessions
        // don't have - logins_since is the first one that does.
        run(`
          SELECT (SELECT DATE_FORMAT(MIN(started_at), '%Y-%m-%d') FROM UserAppSessions) AS activity_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserEvents) AS events_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserSession WHERE user_id IS NOT NULL) AS logins_since`),
        adminDbController.app.getUserAnalyticsWindowStats(win, f, today),
        adminDbController.app.getUserAnalyticsWindowStats(win.previous, f, today),
        adminDbController.app.getUserActiveDays(pairsFrom, win.end, f),
        run(`
          SELECT DATE_FORMAT(u.registered_at, '%Y-%m-%d') AS d, COUNT(*) AS c FROM User u
          WHERE u.registered_at >= :from AND u.registered_at < :end GROUP BY d`),
        run(`
          SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS d, COUNT(*) AS c FROM UserSession s
          WHERE s.user_id IS NOT NULL AND s.created_at >= :from AND s.created_at < :end ${pf} GROUP BY d`),
        run(`
          SELECT DATE_FORMAT(a.created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
          FROM (
            SELECT a.user_id, MIN(a.id) AS first_id FROM appointments a
            WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
            GROUP BY a.user_id
          ) fb
          INNER JOIN appointments a ON a.id = fb.first_id ${f.cityJoin("a")}
          WHERE a.created_at >= :from AND a.created_at < :end ${f.cityWhere} GROUP BY d`),
        run(`
          SELECT DATE_FORMAT(s.started_at, '%Y-%m-%d') AS d, AVG(${SESSION_SECONDS_SQL}) AS avg_seconds
          FROM UserAppSessions s
          WHERE s.started_at >= :from AND s.started_at < :end ${pf} GROUP BY d`),
        // WEEKDAY(): 0 = Monday.
        run(`
          SELECT WEEKDAY(s.started_at) AS wd, FLOOR(HOUR(s.started_at) / 4) AS part,
            COUNT(DISTINCT s.user_id) AS users, AVG(${SESSION_SECONDS_SQL}) AS avg_seconds
          FROM UserAppSessions s
          WHERE s.started_at >= :from AND s.started_at < :end ${pf} GROUP BY wd, part`),
        // Each active user once, on the platform of their latest session.
        run(`
          SELECT x.platform, COUNT(*) AS users FROM (
            SELECT s.user_id,
              SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(s.platform, 'unknown') ORDER BY s.last_seen_at DESC), ',', 1) AS platform
            FROM UserAppSessions s
            WHERE s.started_at < :end AND s.last_seen_at >= :from
            GROUP BY s.user_id
          ) x GROUP BY x.platform`),
        // Uninstall-rate base: users with a push token on file.
        run(`
          SELECT COUNT(*) AS c FROM User u
          WHERE u.status <> 'terminated' AND u.device_id IS NOT NULL AND TRIM(u.device_id) NOT IN ('', 'null', '[]')`),
        adminDbController.app.getSalonCities(),
      ]);

      const num = (v) => Number(v) || 0;
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const activitySince = since?.activity_since || null;
      const loginsSince = since?.logins_since || null;
      const hasLogins = (w) => Boolean(loginsSince && loginsSince <= w.to);
      const eventsSince = since?.events_since || null;
      const hasActivity = (w) => Boolean(activitySince && activitySince <= w.to);
      const hasEvents = (w) => Boolean(eventsSince && eventsSince <= w.to);
      const tokenBase = num(tokens?.c);
      const uninstallRate = (n) => (tokenBase ? Number(((n / tokenBase) * 100).toFixed(2)) : null);

      // DAU and rolling MAU per day, sliding a 30-day window over byDay.
      const daily = new Map();
      const seen = new Map();
      let distinct = 0;
      const step = (id, delta) => {
        const n = (seen.get(id) || 0) + delta;
        if (n > 0) seen.set(id, n);
        else seen.delete(id);
        if (delta > 0 && n === 1) distinct += 1;
        if (delta < 0 && n === 0) distinct -= 1;
      };
      // WAU: the same slide over 7 days.
      const seen7 = new Map();
      let distinct7 = 0;
      const step7 = (id, delta) => {
        const n = (seen7.get(id) || 0) + delta;
        if (n > 0) seen7.set(id, n);
        else seen7.delete(id);
        if (delta > 0 && n === 1) distinct7 += 1;
        if (delta < 0 && n === 0) distinct7 -= 1;
      };
      for (let d = pairsFrom; d < win.end; d = addDays(d, 1)) {
        for (const id of byDay.get(d) || []) {
          step(id, 1);
          step7(id, 1);
        }
        for (const id of byDay.get(addDays(d, -USER_ANALYTICS_MAU_DAYS)) || []) step(id, -1);
        for (const id of byDay.get(addDays(d, -7)) || []) step7(id, -1);
        daily.set(d, { dau: (byDay.get(d) || []).length, wau: distinct7, mau: distinct });
      }
      const tracked = (d) => Boolean(activitySince && d >= activitySince && d <= today);

      // Unique users, average DAU (over tracked days only) and MAU on the
      // window's last tracked day.
      const activityOf = (w) => {
        if (!hasActivity(w)) return { unique_users: null, dau: null, mau: null, partial: false };
        const start = activitySince > w.from ? activitySince : w.from;
        const last = w.to < today ? w.to : today;
        const users = new Set();
        let sum = 0;
        let days = 0;
        for (let d = start; d <= last; d = addDays(d, 1)) {
          const ids = byDay.get(d) || [];
          ids.forEach((id) => users.add(id));
          sum += ids.length;
          days += 1;
        }
        return {
          unique_users: users.size,
          dau: days ? Number((sum / days).toFixed(1)) : null,
          mau: daily.get(last)?.mau ?? null,
          partial: activitySince > w.from,
        };
      };

      const metricsOf = (w, s) => {
        const act = activityOf(w);
        const events = hasEvents(w);
        return {
          signups: s.signups,
          // Unknown (not 0) for windows before sessions carried a date.
          logins: hasLogins(w) ? s.logins : null,
          login_users: hasLogins(w) ? s.login_users : null,
          logins_partial: Boolean(loginsSince && loginsSince > w.from),
          unique_users: act.unique_users,
          dau: act.dau,
          mau: act.mau,
          activity_partial: act.partial,
          sessions: hasActivity(w) ? s.sessions : null,
          avg_session_seconds: hasActivity(w) ? s.avg_session_seconds : null,
          salon_views: events ? s.salon_views : null,
          salon_viewers: events ? s.salon_viewers : null,
          coupon_users: s.coupon_users,
          checkout_users: s.checkout_users,
          paid_users: s.paid_users,
          first_bookings: s.first_bookings,
          first_completed: s.first_completed,
          uninstalls: s.uninstalled.length,
          uninstall_rate: uninstallRate(s.uninstalled.length),
        };
      };
      const metrics = metricsOf(win, cur);
      const previousMetrics = metricsOf(win.previous, prev);

      const byDate = (rows, key = "c") => new Map(rows.map((r) => [r.d, r[key]]));
      const signupsByDay = byDate(signupRows);
      const loginsByDay = byDate(loginRows);
      const firstByDay = byDate(firstRows);
      const sessionByDay = byDate(sessionRows, "avg_seconds");
      const uninstallsByDay = new Map();
      for (const u of cur.uninstalled) {
        const d = toIstDatePart(new Date(u.detected_at));
        uninstallsByDay.set(d, (uninstallsByDay.get(d) || 0) + 1);
      }
      const series = [];
      for (let d = win.from; d <= win.to; d = addDays(d, 1)) {
        const avg = sessionByDay.get(d);
        series.push({
          day: d,
          signups: num(signupsByDay.get(d)),
          logins: num(loginsByDay.get(d)),
          first_bookings: num(firstByDay.get(d)),
          dau: tracked(d) ? daily.get(d)?.dau ?? 0 : null,
          wau: tracked(d) ? daily.get(d)?.wau ?? 0 : null,
          mau: tracked(d) ? daily.get(d)?.mau ?? 0 : null,
          avg_session_seconds: avg === undefined || avg === null ? null : Math.round(num(avg)),
          uninstalls: uninstallsByDay.get(d) || 0,
          uninstall_rate: uninstallRate(uninstallsByDay.get(d) || 0),
        });
      }

      const heat = (fill) => USER_ANALYTICS_DAY_PARTS.map(() => Array(7).fill(fill));
      const heatUsers = heat(0);
      const heatSeconds = heat(null);
      for (const r of heatRows) {
        const part = num(r.part);
        const wd = num(r.wd);
        if (!heatUsers[part] || wd > 6) continue;
        heatUsers[part][wd] = num(r.users);
        heatSeconds[part][wd] = Math.round(num(r.avg_seconds));
      }

      const activityBase = metrics.unique_users;
      const action = (key, label, users) => ({ key, label, users, pct: users === null ? null : pct(users, activityBase) });
      const dropOff = (key, label, note, dropped, of) => ({
        key,
        label,
        note,
        dropped,
        of,
        pct: of === null || dropped === null ? null : pct(dropped, of),
      });
      const events = hasEvents(win);

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        filters: { city: f.city, platform: f.platform },
        activity_since: activitySince,
        events_since: eventsSince,
        logins_since: loginsSince,
        data_start_date: cutoff || null,
        metrics,
        previous_metrics: previousMetrics,
        series,
        funnel: [
          { key: "signups", label: "Sign-ups", users: metrics.signups },
          { key: "logins", label: "Logins", users: metrics.login_users },
          { key: "salon_views", label: "Salon Views", users: metrics.salon_viewers },
          { key: "checkout_started", label: "Checkout Started", users: metrics.checkout_users },
          { key: "first_booking", label: "1st Booking", users: metrics.first_bookings },
          { key: "first_completed", label: "Completed Booking", users: metrics.first_completed },
        ],
        platforms: hasActivity(win)
          ? platformRows
              .map((r) => ({ key: r.platform, users: num(r.users) }))
              .sort((a, b) => b.users - a.users)
          : null,
        new_vs_returning: {
          customers: cur.customers,
          new: cur.new_customers,
          returning: cur.customers - cur.new_customers,
        },
        uninstall: { base: tokenBase },
        heatmap: hasActivity(win)
          ? { day_parts: USER_ANALYTICS_DAY_PARTS, users: heatUsers, avg_seconds: heatSeconds }
          : null,
        top_actions: [
          action("salon_view", "View Salon Details", metrics.salon_viewers),
          action("apply_coupon", "Apply Coupon", metrics.coupon_users),
          action("start_checkout", "Start Checkout", metrics.checkout_users),
          action("make_payment", "Make Payment", metrics.paid_users),
        ],
        drop_offs: [
          dropOff(
            "after_salon_details",
            "After Salon Details",
            "didn't start checkout",
            events ? cur.viewers_no_checkout : null,
            events ? cur.salon_viewers : null
          ),
          dropOff(
            "during_checkout",
            "During Checkout",
            "payment failed/exit",
            cur.checkout_users - cur.paid_users,
            cur.checkout_users
          ),
          dropOff("after_payment", "After Payment", "booking not completed", cur.paid_not_completed, cur.paid_due),
        ],
        cities,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getUserAnalyticsOverviewV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user analytics");
    }
  },

  // Weekly cohorts (7-day blocks ending on `to`) and the share of each still
  // coming back N+ days after joining. signup: joined = registered_at, came
  // back = app activity or any booking placed. first_booking: joined = first
  // served booking, came back = another served booking. A cell is null until
  // every member of the cohort has had N days.
  getUserRetentionV2: async (data = {}) => {
    try {
      const mode = data.mode === "first_booking" ? "first_booking" : "signup";
      const today = toIstDatePart(new Date());
      let to = data.to ? String(data.to) : today;
      if (!isValidDate(to)) throw Error.BadRequest("to must be YYYY-MM-DD");
      if (to > today) to = today;
      const weeks = Math.min(Math.max(Number(data.weeks) || 5, 1), USER_RETENTION_MAX_WEEKS);
      // Optional custom columns, e.g. [7, 14, 28, 56] for Week 1 / 2 / 4 / 8.
      const requestedDays = Array.isArray(data.days)
        ? [...new Set(data.days.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 365))].sort((a, b) => a - b).slice(0, 8)
        : [];
      const retentionDays = requestedDays.length ? requestedDays : USER_RETENTION_DAYS;
      const firstFrom = addDays(to, -(7 * weeks - 1));
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const replacements = { firstFrom, end: addDays(to, 1), cutoff: cutoff || null };

      const [rows, [since]] = await Promise.all([
        mode === "signup"
          ? adminDbController.connection.query(
              `
              SELECT u.id AS user_id, DATE_FORMAT(u.registered_at, '%Y-%m-%d') AS d0,
                GREATEST(
                  COALESCE((SELECT DATE_FORMAT(MAX(s.last_seen_at), '%Y-%m-%d') FROM UserAppSessions s WHERE s.user_id = u.id), ''),
                  COALESCE((SELECT DATE_FORMAT(MAX(a.created_at), '%Y-%m-%d') FROM appointments a WHERE a.user_id = u.id), '')
                ) AS last_d
              FROM User u
              WHERE u.registered_at >= :firstFrom AND u.registered_at < :end
              `,
              { replacements, type: Sequelize.QueryTypes.SELECT }
            )
          : adminDbController.connection.query(
              `
              SELECT a.user_id, DATE_FORMAT(MIN(a.created_at), '%Y-%m-%d') AS d0,
                DATE_FORMAT(MAX(a.created_at), '%Y-%m-%d') AS last_d
              FROM appointments a
              WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
              GROUP BY a.user_id
              HAVING MIN(a.created_at) >= :firstFrom AND MIN(a.created_at) < :end
              `,
              { replacements, type: Sequelize.QueryTypes.SELECT }
            ),
        adminDbController.connection.query(
          `SELECT DATE_FORMAT(MIN(started_at), '%Y-%m-%d') AS activity_since FROM UserAppSessions`,
          { type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const cohorts = Array.from({ length: weeks }, (_, i) => {
        const cohortTo = addDays(to, -7 * i);
        const cohortFrom = addDays(cohortTo, -6);
        const members = rows.filter((r) => r.d0 >= cohortFrom && r.d0 <= cohortTo);
        return {
          from: cohortFrom,
          to: cohortTo,
          users: members.length,
          retention: retentionDays.map((n) => {
            if (addDays(cohortTo, n) > today || !members.length) return null;
            const back = members.filter((r) => r.last_d && r.last_d >= addDays(r.d0, n)).length;
            return Number(((back / members.length) * 100).toFixed(1));
          }),
        };
      });

      return {
        mode,
        to,
        days: retentionDays,
        activity_since: since?.activity_since || null,
        cohorts,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getUserRetentionV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user retention");
    }
  },

  // ── Deep user insights V2 ──
  // Served bookings placed in the window (city = salon city), one row each.
  getDeepInsightBookings: async (win, f) =>
    adminDbController.connection.query(
      `
      SELECT a.id, a.user_id, a.store_id, a.profesional_id, a.discount_id, a.created_at,
        a.distance_km, a.user_lat, a.user_lng,
        ${AMOUNT_PAID_SQL} AS paid,
        HOUR(sl.\`from\`) AS slot_hour
      FROM appointments a
      LEFT JOIN Slots sl ON sl.id = a.slot_id
      ${f.cityJoin("a")}
      WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
        AND a.created_at >= :from AND a.created_at < :end ${f.cityWhere}
      `,
      { replacements: { ...f.replacements, from: win.from, end: win.end }, type: Sequelize.QueryTypes.SELECT }
    ),

  // Repeat users (30D), the Analytics Intelligence gravity rule: of the
  // customers served in the 30 days ending `to`, the share with 2+ served
  // bookings up to then - counting bookings from go-live on.
  getRepeatUsers30d: async (to, f) => {
    const [row] = await adminDbController.connection.query(
      `
      SELECT COUNT(*) AS customers, COALESCE(SUM(h.n >= 2), 0) AS repeaters
      FROM (
        SELECT DISTINCT a.user_id FROM appointments a ${f.cityJoin("a")}
        WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
          AND a.booking_date >= :from30 AND a.booking_date < :end ${f.cityWhere}
      ) c
      INNER JOIN (
        SELECT a.user_id, COUNT(*) AS n FROM appointments a
        WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${bookingFloorSql("a")}
          AND a.booking_date < :end
        GROUP BY a.user_id
      ) h ON h.user_id = c.user_id
      `,
      {
        replacements: { ...f.replacements, from30: addDays(to, -29), end: addDays(to, 1) },
        type: Sequelize.QueryTypes.SELECT,
      }
    );
    const customers = Number(row?.customers) || 0;
    return customers ? Number(((Number(row.repeaters) / customers) * 100).toFixed(1)) : null;
  },

  getDeepUserInsightsV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 7);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { ...f.replacements, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });

      const [rows, prevRows, repeat, prevRepeat, [since], salonRows, cities] = await Promise.all([
        adminDbController.app.getDeepInsightBookings(win, f),
        adminDbController.app.getDeepInsightBookings(win.previous, f),
        adminDbController.app.getRepeatUsers30d(win.to, f),
        adminDbController.app.getRepeatUsers30d(win.previous.to, f),
        run(`SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') AS location_since FROM UserLocations`),
        // Every salon with coordinates; `live` ones are the alternatives a
        // customer could have picked instead.
        run(`
          SELECT s.id, pa.area, pa.latitude, pa.longitude, r.rating,
            (s.status = 'active' AND s.completion_status = 'completed') AS live
          FROM Store s
          INNER JOIN PartnerAddress pa ON pa.id = s.address_id
          LEFT JOIN (
            SELECT store_id, AVG(rating) AS rating FROM Reviews
            WHERE status = 'active' AND rating BETWEEN 1 AND 5
            GROUP BY store_id
          ) r ON r.store_id = s.id`),
        adminDbController.app.getSalonCities(),
      ]);

      const num = (v) => Number(v) || 0;
      const round = (v, digits = 1) => (v === null ? null : Number(v.toFixed(digits)));
      const avg = (list) => (list.length ? list.reduce((t, v) => t + v, 0) / list.length : null);
      const distanceOf = (r) => (r.distance_km === null || r.distance_km === undefined ? null : Number(r.distance_km));
      const bucketIndex = (buckets, v) => buckets.findIndex((b) => v < b.max);
      const countIndex = (buckets, n) => buckets.findIndex((b) => n <= b.max);
      const grid = (cols) => DISTANCE_BUCKETS.map(() => Array(cols).fill(0));

      const salons = salonRows
        .map((s) => ({
          id: Number(s.id),
          area: placeLabel(s.area),
          lat: Number(s.latitude),
          lng: Number(s.longitude),
          rating: s.rating === null ? null : Number(s.rating),
          live: Boolean(Number(s.live)),
        }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat || s.lng));
      const salonById = new Map(salons.map((s) => [s.id, s]));
      const liveSalons = salons.filter((s) => s.live);
      const nearestArea = (lat, lng) => {
        let best = null;
        for (const s of salons) {
          const d = haversineKm(lat, lng, s.lat, s.lng);
          if (s.area && (!best || d < best.d)) best = { d, area: s.area };
        }
        return best?.area || null;
      };

      const kpisOf = (list, repeatPct) => {
        const located = list.map(distanceOf).filter((d) => d !== null);
        const avgKm = avg(located);
        return {
          total_users: new Set(list.map((r) => r.user_id)).size,
          bookings_total: list.length,
          bookings_with_distance: located.length,
          avg_distance_km: round(avgKm),
          max_distance_km: located.length ? round(Math.max(...located)) : null,
          avg_travel_min: avgKm === null ? null : round(avgKm * TRAVEL_MINUTES_PER_KM),
          users_over_10km: located.length
            ? new Set(list.filter((r) => distanceOf(r) >= LONG_TRIP_KM).map((r) => r.user_id)).size
            : null,
          bookings_over_10km_pct: located.length
            ? round((located.filter((d) => d >= LONG_TRIP_KM).length / located.length) * 100)
            : null,
          repeat_users_30d_pct: repeatPct,
        };
      };

      // Per customer: bookings and spend in the window, average distance
      // over the bookings that have one (the "By Users" basis).
      const byUser = new Map();
      for (const r of rows) {
        const u = byUser.get(r.user_id) || { user_id: r.user_id, bookings: 0, spent: 0, distances: [], paid: [] };
        u.bookings += 1;
        u.spent += num(r.paid);
        const d = distanceOf(r);
        if (d !== null) {
          u.distances.push(d);
          u.paid.push(num(r.paid));
        }
        byUser.set(r.user_id, u);
      }
      const users = [...byUser.values()].map((u) => ({ ...u, avg_km: avg(u.distances) }));
      const locatedUsers = users.filter((u) => u.avg_km !== null);
      const located = rows.filter((r) => distanceOf(r) !== null);

      const distanceBuckets = DISTANCE_BUCKETS.map((b, i) => ({
        key: b.key,
        label: b.label,
        bookings: located.filter((r) => bucketIndex(DISTANCE_BUCKETS, distanceOf(r)) === i).length,
        users: locatedUsers.filter((u) => bucketIndex(DISTANCE_BUCKETS, u.avg_km) === i).length,
      }));
      const travelTimeBuckets = TRAVEL_TIME_BUCKETS.map((b, i) => ({
        key: b.key,
        label: b.label,
        bookings: located.filter((r) => bucketIndex(TRAVEL_TIME_BUCKETS, distanceOf(r) * TRAVEL_MINUTES_PER_KM) === i)
          .length,
        users: locatedUsers.filter((u) => bucketIndex(TRAVEL_TIME_BUCKETS, u.avg_km * TRAVEL_MINUTES_PER_KM) === i).length,
      }));

      // Distance vs booking value, with a least-squares trend line.
      const trendOf = (points) => {
        if (points.length < 2) return null;
        const mx = avg(points.map((p) => p.x));
        const my = avg(points.map((p) => p.y));
        const sxx = points.reduce((t, p) => t + (p.x - mx) ** 2, 0);
        if (!sxx) return null;
        const slope = points.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx;
        return { slope: round(slope, 2), intercept: round(my - slope * mx, 2) };
      };
      const sample = (points) => {
        if (points.length <= SCATTER_MAX_POINTS) return points;
        const stride = points.length / SCATTER_MAX_POINTS;
        return Array.from({ length: SCATTER_MAX_POINTS }, (_, i) => points[Math.floor(i * stride)]);
      };
      const bookingPoints = located.map((r) => ({ x: round(distanceOf(r)), y: round(num(r.paid), 2) }));
      const userPoints = locatedUsers.map((u) => ({ x: round(u.avg_km), y: round(avg(u.paid), 2) }));

      // Heat map: where customers booked from, or - until bookings carry a
      // location - where the booked salons are, by area.
      const cells = new Map();
      const addCell = (key, lat, lng, area, userId) => {
        const c = cells.get(key) || { lat, lng, area, bookings: 0, users: new Set() };
        c.bookings += 1;
        c.users.add(userId);
        cells.set(key, c);
      };
      const originRows = located.filter((r) => r.user_lat !== null && r.user_lng !== null);
      const heatBasis = originRows.length ? "user" : "salon";
      if (heatBasis === "user") {
        for (const r of originRows) {
          const lat = Number(Number(r.user_lat).toFixed(HEATMAP_CELL_DECIMALS));
          const lng = Number(Number(r.user_lng).toFixed(HEATMAP_CELL_DECIMALS));
          addCell(`${lat},${lng}`, lat, lng, null, r.user_id);
        }
      } else {
        for (const r of rows) {
          const s = salonById.get(Number(r.store_id));
          if (!s) continue;
          const key = placeKey(s.area) || `salon-${s.id}`;
          if (!cells.has(key)) {
            addCell(key, s.lat, s.lng, s.area, r.user_id);
          } else {
            const c = cells.get(key);
            // Centre the area's hotspot on its salons, weighted by bookings.
            c.lat = (c.lat * c.bookings + s.lat) / (c.bookings + 1);
            c.lng = (c.lng * c.bookings + s.lng) / (c.bookings + 1);
            addCell(key, c.lat, c.lng, c.area, r.user_id);
          }
        }
      }
      const heatTotal = [...cells.values()].reduce((t, c) => t + c.bookings, 0);
      const heatCells = [...cells.values()]
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, HEATMAP_MAX_CELLS)
        .map((c) => ({
          lat: round(c.lat, 4),
          lng: round(c.lng, 4),
          area: c.area || nearestArea(c.lat, c.lng),
          bookings: c.bookings,
          users: c.users.size,
        }));

      // Why users travel: far bookings with a closer live salon available.
      const far = originRows.filter((r) => {
        const d = distanceOf(r);
        if (d < FAR_BOOKING_KM) return false;
        return liveSalons.some(
          (s) => s.id !== Number(r.store_id) && haversineKm(r.user_lat, r.user_lng, s.lat, s.lng) < d
        );
      });
      const farUserIds = [...new Set(far.map((r) => r.user_id))];
      const farIds = far.map((r) => r.id);
      const [history, discountedItems] = await Promise.all([
        farUserIds.length
          ? run(
              `SELECT a.id, a.user_id, a.store_id, a.profesional_id, a.created_at FROM appointments a
               WHERE ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")} AND a.user_id IN (:farUserIds)`,
              { farUserIds }
            )
          : [],
        farIds.length
          ? run(
              `SELECT ai.appointment_id FROM appointment_items ai
               WHERE ai.appointment_id IN (:farIds)
                 AND COALESCE(ai.list_amount, 0) > COALESCE(ai.service_amount, 0)
               GROUP BY ai.appointment_id`,
              { farIds }
            )
          : [],
      ]);
      const discountedSet = new Set(discountedItems.map((r) => Number(r.appointment_id)));
      const historyByUser = new Map();
      for (const h of history) {
        const list = historyByUser.get(h.user_id) || [];
        list.push(h);
        historyByUser.set(h.user_id, list);
      }
      const reasonCounts = Object.fromEntries(TRAVEL_REASONS.map((r) => [r.key, 0]));
      for (const r of far) {
        const before = (historyByUser.get(r.user_id) || []).filter(
          (h) => h.id !== r.id && new Date(h.created_at) < new Date(r.created_at)
        );
        const booked = salonById.get(Number(r.store_id));
        const nearestRated = liveSalons
          .filter((s) => s.id !== Number(r.store_id) && s.rating !== null)
          .map((s) => ({ rating: s.rating, d: haversineKm(r.user_lat, r.user_lng, s.lat, s.lng) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, NEAREST_SALONS_FOR_RATING);
        const nearbyRating = avg(nearestRated.map((s) => s.rating));
        let reason = "other";
        if (before.some((h) => Number(h.store_id) === Number(r.store_id))) reason = "regular";
        else if (r.profesional_id && before.some((h) => Number(h.profesional_id) === Number(r.profesional_id))) reason = "stylist";
        else if (num(r.discount_id) > 0 || discountedSet.has(Number(r.id))) reason = "price";
        else if (booked?.rating !== null && booked?.rating !== undefined && nearbyRating !== null && booked.rating > nearbyRating) reason = "rating";
        reasonCounts[reason] += 1;
      }

      // Far travelling users (average distance 20+ km).
      const farUsersAll = locatedUsers
        .filter((u) => u.avg_km >= FAR_USER_KM)
        .sort((a, b) => b.avg_km - a.avg_km);
      const nameIds = (data.include_far_users ? farUsersAll : farUsersAll.slice(0, FAR_USERS_PREVIEW)).map((u) => u.user_id);
      const names = nameIds.length
        ? await run(`SELECT id, firstname, lastname, phone FROM User WHERE id IN (:nameIds)`, { nameIds })
        : [];
      const nameById = new Map(names.map((n) => [Number(n.id), n]));
      const farUserRow = (u) => {
        const n = nameById.get(Number(u.user_id));
        return {
          user_id: u.user_id,
          name: n ? [n.firstname, n.lastname].filter(Boolean).join(" ").trim() || null : null,
          phone: n?.phone ? String(n.phone) : null,
          avg_distance_km: round(u.avg_km),
          avg_travel_min: round(u.avg_km * TRAVEL_MINUTES_PER_KM),
          bookings: u.bookings,
          spent: round(u.spent, 2),
        };
      };
      if (data.include_far_users) {
        return { from: win.from, to: win.to, far_users: farUsersAll.map(farUserRow) };
      }

      // Frequency, time preference and new vs returning, by distance bucket.
      const frequencyUsers = grid(FREQUENCY_BUCKETS.length);
      const frequencyBookings = grid(FREQUENCY_BUCKETS.length);
      for (const u of locatedUsers) {
        const r = bucketIndex(DISTANCE_BUCKETS, u.avg_km);
        const c = countIndex(FREQUENCY_BUCKETS, u.bookings);
        frequencyUsers[r][c] += 1;
        frequencyBookings[r][c] += u.bookings;
      }
      const timeBookings = grid(TIME_PREFERENCE_START_HOURS.length);
      const timeUserSets = DISTANCE_BUCKETS.map(() => TIME_PREFERENCE_START_HOURS.map(() => new Set()));
      for (const r of located) {
        if (r.slot_hour === null || r.slot_hour === undefined) continue;
        const row = bucketIndex(DISTANCE_BUCKETS, distanceOf(r));
        const col = Math.min(
          TIME_PREFERENCE_START_HOURS.length - 1,
          Math.max(0, Math.floor((Number(r.slot_hour) - TIME_PREFERENCE_START_HOURS[0]) / 2))
        );
        timeBookings[row][col] += 1;
        timeUserSets[row][col].add(r.user_id);
      }
      const locatedIds = locatedUsers.map((u) => u.user_id);
      const firsts = locatedIds.length
        ? await run(
            `SELECT a.user_id, MIN(a.created_at) AS first_at FROM appointments a
             WHERE ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")} AND a.user_id IN (:locatedIds) GROUP BY a.user_id`,
            { locatedIds }
          )
        : [];
      const firstById = new Map(firsts.map((r) => [r.user_id, new Date(r.first_at).getTime()]));
      const windowStartMs = Date.parse(`${win.from}T00:00:00+05:30`);
      const newVsReturning = DISTANCE_BUCKETS.map((b) => ({ key: b.key, label: b.label, new: 0, returning: 0 }));
      for (const u of locatedUsers) {
        const row = newVsReturning[bucketIndex(DISTANCE_BUCKETS, u.avg_km)];
        if ((firstById.get(u.user_id) || 0) >= windowStartMs) row.new += 1;
        else row.returning += 1;
      }

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        filters: { city: f.city },
        location_since: since?.location_since || null,
        travel_minutes_per_km: TRAVEL_MINUTES_PER_KM,
        kpis: kpisOf(rows, repeat),
        previous_kpis: kpisOf(prevRows, prevRepeat),
        heatmap: { basis: heatBasis, total_bookings: heatTotal, cells: heatCells },
        distance_buckets: distanceBuckets,
        travel_time_buckets: travelTimeBuckets,
        scatter: {
          bookings: { points: sample(bookingPoints), total: bookingPoints.length, trend: trendOf(bookingPoints) },
          users: { points: sample(userPoints), total: userPoints.length, trend: trendOf(userPoints) },
        },
        reasons: {
          far_booking_km: FAR_BOOKING_KM,
          far_bookings: far.length,
          rows: TRAVEL_REASONS.map((r) => ({ key: r.key, label: r.label, bookings: reasonCounts[r.key] })),
        },
        far_user_km: FAR_USER_KM,
        far_users: farUsersAll.slice(0, FAR_USERS_PREVIEW).map(farUserRow),
        far_users_total: farUsersAll.length,
        distance_rows: DISTANCE_BUCKETS.map((b) => ({ key: b.key, label: b.label })),
        frequency: {
          cols: FREQUENCY_BUCKETS.map((b) => ({ key: b.key, label: b.label })),
          users: frequencyUsers,
          bookings: frequencyBookings,
        },
        time_preference: {
          start_hours: TIME_PREFERENCE_START_HOURS,
          bookings: timeBookings,
          users: timeUserSets.map((row) => row.map((set) => set.size)),
        },
        new_vs_returning: newVsReturning,
        cities,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getDeepUserInsightsV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch deep user insights");
    }
  },

  // ── Growth dashboard V2 ──
  // Free slot seats per live salon per day, fromDate .. end (exclusive), by
  // the app's availability rule (getSlotStatusV2): the weekday's active
  // slots, nothing on a one-off or weekly holiday, blocked slots out, `chairs`
  // seats per slot (1 without a chair subscription), minus occupied seats.
  // `upcoming` = free seats in slots that haven't started yet (differs from
  // `free` only today). Returns Map(store_id -> { ...salon, days: Map }).
  getSlotCapacity: async (fromDate, end) => {
    const run = (sql) =>
      adminDbController.connection.query(sql, {
        replacements: { fromDate, end },
        type: Sequelize.QueryTypes.SELECT,
      });
    const live = "s.status = 'active' AND s.completion_status = 'completed'";
    const [stores, slots, blocked, holidays, weekly, chairs, occupied] = await Promise.all([
      run(`
        SELECT s.id, s.name, pa.area, pa.city, pa.district, pa.latitude, pa.longitude
        FROM Store s LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
        WHERE ${live}`),
      run(`
        SELECT sl.id, sl.store_id, sl.day, TIME_FORMAT(sl.\`from\`, '%H:%i') AS start,
          (TIME_TO_SEC(sl.\`to\`) - TIME_TO_SEC(sl.\`from\`)) / 60 AS minutes
        FROM Slots sl INNER JOIN Store s ON s.id = sl.store_id
        WHERE sl.status = 'active' AND ${live}`),
      run(`
        SELECT slot_id, DATE_FORMAT(blocked_date, '%Y-%m-%d') AS d FROM SlotBlockedDates
        WHERE blocked_date >= :fromDate AND blocked_date < :end`),
      run(`
        SELECT store_id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS d FROM StoreHolidays
        WHERE holiday_date >= :fromDate AND holiday_date < :end`),
      run(`SELECT store_id, weekday FROM StoreWeeklyHolidays`),
      run(`
        SELECT store_id, MAX(quantity) AS quantity FROM StoreSubscription
        WHERE status = 'active' AND type = 'chairs' GROUP BY store_id`),
      run(`
        SELECT a.slot_id, DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS d, COUNT(*) AS n
        FROM appointments a
        WHERE a.slot_id IS NOT NULL AND a.booking_date >= :fromDate AND a.booking_date < :end
          AND ${SLOT_OCCUPIED_SQL}
        GROUP BY a.slot_id, d`),
    ]);

    const today = toIstDatePart(new Date());
    const nowHm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    const blockedSet = new Set(blocked.map((b) => `${b.slot_id}|${b.d}`));
    const holidaySet = new Set(holidays.map((h) => `${h.store_id}|${h.d}`));
    const weeklySet = new Set(weekly.map((w) => `${w.store_id}|${Number(w.weekday)}`));
    const seats = new Map(chairs.map((c) => [Number(c.store_id), Math.max(1, Number(c.quantity) || 1)]));
    const taken = new Map(occupied.map((o) => [`${o.slot_id}|${o.d}`, Number(o.n) || 0]));
    const slotsByStore = new Map();
    for (const sl of slots) {
      const list = slotsByStore.get(Number(sl.store_id)) || [];
      list.push(sl);
      slotsByStore.set(Number(sl.store_id), list);
    }

    const byStore = new Map();
    for (const s of stores) {
      const id = Number(s.id);
      const perSlot = seats.get(id) || 1;
      const days = new Map();
      for (let d = fromDate; d < end; d = addDays(d, 1)) {
        const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
        // free_minutes = free seats x slot length (empty seat time).
        const cell = { total: 0, free: 0, upcoming: 0, free_minutes: 0, closed: false };
        if (holidaySet.has(`${id}|${d}`) || weeklySet.has(`${id}|${weekday}`)) {
          cell.closed = true;
        } else {
          for (const sl of slotsByStore.get(id) || []) {
            if (sl.day && sl.day !== SLOT_WEEKDAYS[weekday]) continue;
            if (blockedSet.has(`${sl.id}|${d}`)) continue;
            const free = Math.max(0, perSlot - (taken.get(`${sl.id}|${d}`) || 0));
            const minutes = Number(sl.minutes) > 0 ? Number(sl.minutes) : 30;
            cell.total += perSlot;
            cell.free += free;
            cell.free_minutes += free * minutes;
            if (d > today || (d === today && sl.start > nowHm)) cell.upcoming += free;
          }
        }
        days.set(d, cell);
      }
      byStore.set(id, {
        id,
        name: s.name,
        area: placeLabel(s.area),
        // District first - the cleanest city field (see salonCityKeySql).
        city: placeLabel(String(s.district || "").trim() || s.city),
        lat: Number(s.latitude),
        lng: Number(s.longitude),
        days,
      });
    }
    return byStore;
  },

  // Users a bulk push goes to: name and push token, terminated accounts out.
  getUsersForBulkPush: async (userIds) =>
    adminDbController.connection.query(
      `SELECT id, firstname, lastname, device_id FROM User WHERE id IN (:userIds) AND status <> 'terminated'`,
      { replacements: { userIds }, type: Sequelize.QueryTypes.SELECT }
    ),

  // Growth dashboard: `date` drives the "today" cards (intent, drop-off,
  // empty slots, supply vs demand, alerts), from/to (default: the date's
  // month to date) the period cards. include_list returns one full list for
  // a "View" dialog instead.
  getGrowthDashboardV2: async (data = {}) => {
    try {
      const today = toIstDatePart(new Date());
      const date = data.date ? String(data.date) : today;
      if (!isValidDate(date)) throw Error.BadRequest("date must be YYYY-MM-DD");
      const period = resolveAnalyticsWindow(
        data.from || data.to ? data : { from: `${date.slice(0, 7)}-01`, to: date },
        30
      );
      const day = { from: date, to: date, end: addDays(date, 1) };
      const yesterday = addDays(date, -1);
      const valueFrom = addDays(date, -(BOOKING_VALUE_LOOKBACK_DAYS - 1));
      const list = GROWTH_LISTS.includes(data.include_list) ? data.include_list : null;
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const floor = bookingFloorSql("a");
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: {
            dayFrom: day.from,
            dayEnd: day.end,
            from: period.from,
            end: period.end,
            yesterday,
            valueFrom,
            cutoff: cutoff || null,
            ...extra,
          },
          type: Sequelize.QueryTypes.SELECT,
        });

      const [
        [since],
        dayAppts,
        dayViews,
        [dayActive],
        firsts,
        [freq],
        [userTotal],
        secondRows,
        latestLocations,
        periodActive,
        periodBookers,
        periodBookings,
        periodViewers,
        [failures],
        [cancels],
        valueRows,
        [platformValue],
        dayCap,
        periodCap,
        baseAlerts,
      ] = await Promise.all([
        run(`
          SELECT (SELECT DATE_FORMAT(MIN(started_at), '%Y-%m-%d') FROM UserAppSessions) AS activity_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserEvents) AS events_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserLocations) AS location_since`),
        // Checkouts placed on the day (an appointment row carries the slot).
        // Paid includes bookings refunded later.
        run(`
          SELECT a.user_id, MAX(${PAYMENT_MADE_SQL}) AS paid, COUNT(*) AS attempts, MAX(a.created_at) AS last_at
          FROM appointments a
          WHERE a.user_id IS NOT NULL AND a.created_at >= :dayFrom AND a.created_at < :dayEnd AND ${floor}
          GROUP BY a.user_id`),
        run(`
          SELECT e.user_id, e.store_id, COUNT(*) AS n, MAX(e.created_at) AS last_at
          FROM UserEvents e
          WHERE e.event = 'salon_view' AND e.created_at >= :dayFrom AND e.created_at < :dayEnd
          GROUP BY e.user_id, e.store_id`),
        run(`
          SELECT COUNT(DISTINCT s.user_id) AS users FROM UserAppSessions s
          WHERE s.started_at < :dayEnd AND s.last_seen_at >= :dayFrom`),
        // First served booking since go-live placed in the period.
        run(`
          SELECT a.user_id, a.id, a.created_at
          FROM (
            SELECT a.user_id, MIN(a.id) AS first_id FROM appointments a
            WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${floor} GROUP BY a.user_id
          ) fb
          INNER JOIN appointments a ON a.id = fb.first_id
          WHERE a.created_at >= :from AND a.created_at < :end`),
        // Lifetime served bookings per (non-terminated) user up to period end.
        run(`
          SELECT COUNT(*) AS bookers,
            COALESCE(SUM(x.n = 1), 0) AS b1, COALESCE(SUM(x.n = 2), 0) AS b2,
            COALESCE(SUM(x.n BETWEEN 3 AND 4), 0) AS b3_4, COALESCE(SUM(x.n BETWEEN 5 AND 9), 0) AS b5_9,
            COALESCE(SUM(x.n >= 10), 0) AS b10, COALESCE(SUM(x.n >= 3), 0) AS ge3, COALESCE(SUM(x.n >= 5), 0) AS ge5
          FROM (
            SELECT a.user_id, COUNT(*) AS n FROM appointments a
            INNER JOIN User u ON u.id = a.user_id AND u.status <> 'terminated'
            WHERE ${ACTIVE_BOOKING_SQL} AND ${floor} AND a.created_at < :end
            GROUP BY a.user_id
          ) x`),
        run(`
          SELECT COUNT(*) AS c FROM User u
          WHERE u.status <> 'terminated' AND (u.registered_at IS NULL OR u.registered_at < :end)`),
        // 2nd served booking placed in the period, and days since the 1st.
        run(`
          SELECT r.user_id,
            DATEDIFF(MAX(CASE WHEN r.rn = 2 THEN r.created_at END), MAX(CASE WHEN r.rn = 1 THEN r.created_at END)) AS days
          FROM (
            SELECT a.user_id, a.created_at,
              ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY a.created_at, a.id) AS rn
            FROM appointments a WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${floor}
          ) r
          WHERE r.rn <= 2
          GROUP BY r.user_id
          HAVING MAX(CASE WHEN r.rn = 2 THEN r.created_at END) >= :from
             AND MAX(CASE WHEN r.rn = 2 THEN r.created_at END) < :end`),
        run(`
          SELECT l.user_id, l.lat, l.lng FROM UserLocations l
          INNER JOIN (
            SELECT user_id, MAX(id) AS id FROM UserLocations WHERE created_at < :end GROUP BY user_id
          ) m ON m.id = l.id`),
        run(`
          SELECT DISTINCT s.user_id FROM UserAppSessions s
          WHERE s.started_at < :end AND s.last_seen_at >= :from`),
        run(`
          SELECT DISTINCT a.user_id FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL} AND a.user_id IS NOT NULL AND ${floor}
            AND a.created_at >= :from AND a.created_at < :end`),
        run(`
          SELECT a.store_id, COUNT(*) AS n FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL} AND ${floor} AND a.created_at >= :from AND a.created_at < :end
          GROUP BY a.store_id`),
        run(`
          SELECT e.store_id, e.user_id FROM UserEvents e
          WHERE e.event = 'salon_view' AND e.store_id IS NOT NULL
            AND e.created_at >= :from AND e.created_at < :end
          GROUP BY e.store_id, e.user_id`),
        run(`
          SELECT COUNT(*) AS attempts, COUNT(DISTINCT a.user_id) AS users FROM appointments a
          WHERE a.payment_status = 'failed' AND a.created_at >= :dayFrom AND a.created_at < :dayEnd AND ${floor}`),
        // Paid bookings for the day's and the previous day's appointments that
        // were cancelled or refunded - by booking date, as Dashboard V2 does:
        // cancel paths don't record when they happened (updated_at untouched).
        run(`
          SELECT COALESCE(SUM(a.booking_date >= :dayFrom), 0) AS today,
                 COALESCE(SUM(a.booking_date < :dayFrom), 0) AS yesterday
          FROM appointments a
          WHERE a.status IN ('cancelled', 'refunded') AND ${PAYMENT_MADE_SQL} AND ${floor}
            AND a.booking_date >= :yesterday AND a.booking_date < :dayEnd`),
        run(`
          SELECT a.store_id, AVG(${AMOUNT_PAID_SQL}) AS value FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL} AND ${floor} AND a.created_at >= :valueFrom AND a.created_at < :dayEnd
          GROUP BY a.store_id`),
        run(`
          SELECT AVG(${AMOUNT_PAID_SQL}) AS value FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL} AND ${floor} AND a.created_at >= :valueFrom AND a.created_at < :dayEnd`),
        adminDbController.app.getSlotCapacity(day.from, day.end),
        adminDbController.app.getSlotCapacity(period.from, period.end),
        adminDbController.app.getDashboardV2Alerts({}).catch(() => null),
      ]);

      const num = (v) => Number(v) || 0;
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const activitySince = since?.activity_since || null;
      const eventsSince = since?.events_since || null;
      const dayWord = date === today ? "today" : `on ${date}`;

      // ---- High intent (the day): picked a slot but didn't pay, or browsed
      // more than one salon / one salon more than once without booking.
      const apptByUser = new Map(dayAppts.map((r) => [r.user_id, r]));
      const viewsByUser = new Map();
      for (const v of dayViews) {
        const u = viewsByUser.get(v.user_id) || { salons: new Set(), views: 0, maxPerSalon: 0, last: 0 };
        u.salons.add(v.store_id);
        u.views += num(v.n);
        u.maxPerSalon = Math.max(u.maxPerSalon, num(v.n));
        u.last = Math.max(u.last, new Date(v.last_at).getTime());
        viewsByUser.set(v.user_id, u);
      }
      const INTENT_SEGMENTS = [
        { key: "slot", label: "Selected Slot, Didn't Pay" },
        { key: "multiple", label: "Viewed Multiple Salons" },
        { key: "revisit", label: "Revisited a Salon" },
      ];
      const intent = [];
      for (const userId of new Set([...apptByUser.keys(), ...viewsByUser.keys()])) {
        const appt = apptByUser.get(userId);
        if (appt && num(appt.paid)) continue;
        const v = viewsByUser.get(userId);
        let segment = null;
        if (appt) segment = "slot";
        else if (v.salons.size >= 2) segment = "multiple";
        else if (v.maxPerSalon >= 2) segment = "revisit";
        if (!segment) continue;
        const lastMs = Math.max(appt ? new Date(appt.last_at).getTime() : 0, v ? v.last : 0);
        intent.push({
          user_id: userId,
          segment,
          segment_label: INTENT_SEGMENTS.find((s) => s.key === segment).label,
          checkout_attempts: appt ? num(appt.attempts) : 0,
          salons_viewed: v ? v.salons.size : 0,
          salon_views: v ? v.views : 0,
          last_seen_at: lastMs ? new Date(lastMs).toISOString() : null,
        });
      }
      const dropoffUsers = intent.filter((u) => u.segment === "slot");

      // ---- First-time bookers of the period and where they are now.
      const firstIds = firsts.map((f) => f.user_id);
      const [bookCounts, lastSession, lastEvent, lastAppt] = firstIds.length
        ? await Promise.all([
            run(
              `SELECT a.user_id, COUNT(*) AS n FROM appointments a
               WHERE ${ACTIVE_BOOKING_SQL} AND ${floor} AND a.user_id IN (:firstIds) GROUP BY a.user_id`,
              { firstIds }
            ),
            run(`SELECT user_id, MAX(last_seen_at) AS at FROM UserAppSessions WHERE user_id IN (:firstIds) GROUP BY user_id`, { firstIds }),
            run(`SELECT user_id, MAX(created_at) AS at FROM UserEvents WHERE user_id IN (:firstIds) GROUP BY user_id`, { firstIds }),
            run(`SELECT user_id, MAX(created_at) AS at FROM appointments WHERE user_id IN (:firstIds) GROUP BY user_id`, { firstIds }),
          ])
        : [[], [], [], []];
      const countById = new Map(bookCounts.map((r) => [r.user_id, num(r.n)]));
      const lastMsById = new Map();
      for (const r of [...lastSession, ...lastEvent, ...lastAppt]) {
        const ms = r.at ? new Date(r.at).getTime() : 0;
        lastMsById.set(r.user_id, Math.max(lastMsById.get(r.user_id) || 0, ms));
      }
      const TRACKER = [
        { key: "booked_again", label: "Already Booked Again" },
        { key: "active_not_booked", label: "Active but Not Booked" },
        { key: "no_activity", label: "No Activity" },
        { key: "churn_risk", label: "Churn Risk" },
      ];
      const nowMs = Date.now();
      const churnMs = CHURN_RISK_DAYS * 864e5;
      const firstTimers = firsts.map((f) => {
        const firstMs = new Date(f.created_at).getTime();
        const lastMs = lastMsById.get(f.user_id) || firstMs;
        let status;
        if ((countById.get(f.user_id) || 0) >= 2) status = "booked_again";
        else if (lastMs > firstMs && nowMs - lastMs <= churnMs) status = "active_not_booked";
        else if (nowMs - Math.max(lastMs, firstMs) > churnMs) status = "churn_risk";
        else status = "no_activity";
        return {
          user_id: f.user_id,
          first_booking_at: new Date(firstMs).toISOString(),
          last_active_at: new Date(Math.max(lastMs, firstMs)).toISOString(),
          status,
          status_label: TRACKER.find((t) => t.key === status).label,
        };
      });
      const secondBookingUsers = firstTimers.filter((u) => u.status === "active_not_booked");

      // ---- Empty slots on the day and what filling them could earn.
      const valueByStore = new Map(valueRows.map((r) => [Number(r.store_id), num(r.value)]));
      const fallbackValue = num(platformValue?.value);
      const salonsToday = [...dayCap.values()].map((s) => {
        const cell = s.days.get(date) || { total: 0, free: 0, upcoming: 0, closed: false };
        const freeSeats = date >= today ? cell.upcoming : cell.free;
        const value = valueByStore.get(s.id) || fallbackValue;
        return {
          store_id: s.id,
          salon_name: s.name,
          area: s.area,
          city: s.city,
          closed: cell.closed,
          total_seats: cell.total,
          free_seats: freeSeats,
          free_all_day: cell.free,
          avg_booking_value: Number(value.toFixed(2)),
          potential_revenue: Number((freeSeats * value).toFixed(2)),
        };
      });
      const emptySlots = salonsToday.reduce((t, s) => t + s.free_seats, 0);
      const potentialRevenue = salonsToday.reduce((t, s) => t + s.potential_revenue, 0);
      const emptySalons = salonsToday.filter(
        (s) => s.total_seats >= EMPTY_SALON_MIN_SEATS && s.free_all_day / s.total_seats >= EMPTY_SALON_FREE_SHARE
      );

      // ---- Locations: areas of live salons. A user belongs to the area of
      // the salon nearest their latest reported location.
      const areaKey = (s) => `${placeKey(s.area) || "unknown"}|${placeKey(s.city)}`;
      const areas = new Map();
      const areaOfStore = new Map();
      for (const s of periodCap.values()) {
        const key = areaKey(s);
        const a = areas.get(key) || {
          key,
          area: s.area || "Unknown area",
          city: s.city,
          salons: 0,
          users: new Set(),
          active: 0,
          bookers: 0,
          bookings: 0,
          demand: new Set(),
          capacity: 0,
          day_demand: new Set(),
          day_capacity: 0,
        };
        a.salons += 1;
        for (const cell of s.days.values()) a.capacity += cell.free;
        const todayCell = dayCap.get(s.id)?.days.get(date);
        if (todayCell) a.day_capacity += todayCell.free;
        areas.set(key, a);
        areaOfStore.set(s.id, key);
      }
      const located = [...periodCap.values()].filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat || s.lng));
      const activeSet = new Set(periodActive.map((r) => r.user_id));
      const bookerSet = new Set(periodBookers.map((r) => r.user_id));
      for (const loc of latestLocations) {
        let best = null;
        for (const s of located) {
          const d = haversineKm(loc.lat, loc.lng, s.lat, s.lng);
          if (!best || d < best.d) best = { d, key: areaOfStore.get(s.id) };
        }
        const a = best && areas.get(best.key);
        if (!a) continue;
        a.users.add(loc.user_id);
        if (activeSet.has(loc.user_id)) a.active += 1;
        if (bookerSet.has(loc.user_id)) a.bookers += 1;
      }
      for (const r of periodBookings) {
        const a = areas.get(areaOfStore.get(Number(r.store_id)));
        if (a) a.bookings += num(r.n);
      }
      for (const r of periodViewers) areas.get(areaOfStore.get(Number(r.store_id)))?.demand.add(r.user_id);
      for (const r of dayViews) areas.get(areaOfStore.get(Number(r.store_id)))?.day_demand.add(r.user_id);

      const capacities = [...areas.values()].map((a) => a.capacity).sort((x, y) => x - y);
      const medianCapacity = capacities.length ? capacities[Math.floor(capacities.length / 2)] : 0;
      const statusOf = (demand, capacity, median) => {
        if (!demand) return "balanced";
        if (demand >= capacity) return capacity < median || !capacity ? "low_supply" : "high_demand";
        return demand / capacity >= 0.6 ? "moderate" : "balanced";
      };
      const locationRows = [...areas.values()]
        .map((a) => ({
          key: a.key,
          area: a.area,
          city: a.city,
          salons: a.salons,
          users: a.users.size,
          active_users: a.active,
          bookings: a.bookings,
          // Share of the area's users who made a served booking in the period.
          conversion_pct: pct(a.bookers, a.users.size),
          demand: a.demand.size,
          free_capacity: a.capacity,
          status: statusOf(a.demand.size, a.capacity, medianCapacity),
        }))
        .sort((x, y) => y.users - x.users || y.bookings - x.bookings || y.free_capacity - x.free_capacity);
      const dayCapacities = [...areas.values()].map((a) => a.day_capacity).sort((x, y) => x - y);
      const medianDayCapacity = dayCapacities.length ? dayCapacities[Math.floor(dayCapacities.length / 2)] : 0;
      const supplyRows = [...areas.values()]
        .map((a) => ({
          key: a.key,
          area: a.area,
          demand: a.day_demand.size,
          capacity: a.day_capacity,
          status: statusOf(a.day_demand.size, a.day_capacity, medianDayCapacity),
        }))
        .sort((x, y) => y.demand - x.demand || y.capacity - x.capacity);
      const overCapacity = supplyRows.filter((r) => r.demand > 0 && r.demand > r.capacity);

      // ---- Booking frequency and level-to-level conversion (lifetime).
      const totalUsers = num(userTotal?.c);
      const bookers = num(freq?.bookers);
      const reached = { 1: bookers, 2: bookers - num(freq?.b1), 3: num(freq?.ge3), 5: num(freq?.ge5), 10: num(freq?.b10) };
      const freqCounts = {
        never: Math.max(0, totalUsers - bookers),
        1: num(freq?.b1),
        2: num(freq?.b2),
        "3-4": num(freq?.b3_4),
        "5-9": num(freq?.b5_9),
        "10+": num(freq?.b10),
      };

      // ---- Day funnel: app opened -> viewed a salon -> picked a slot
      // (checkout) -> paid. Stages with no data yet are null.
      const viewers = viewsByUser.size;
      const paidUsers = dayAppts.filter((r) => num(r.paid)).length;
      const stages = [
        { key: "app_opened", label: "App Opened", users: activitySince && activitySince <= date ? num(dayActive?.users) : null },
        { key: "viewed_salon", label: "Viewed Salon", users: eventsSince && eventsSince <= date ? viewers : null },
        { key: "selected_slot", label: "Selected Slot (Checkout)", users: apptByUser.size },
        { key: "completed", label: "Booking Completed", users: paidUsers },
      ];
      let previous = null;
      for (const stage of stages) {
        if (stage.users === null) continue;
        if (previous) {
          stage.drop = Math.max(0, previous.users - stage.users);
          stage.drop_pct = pct(stage.drop, previous.users);
          stage.drop_from = previous.key;
        }
        previous = stage;
      }
      const biggest = stages
        .filter((s) => s.drop_pct !== undefined && s.drop_pct !== null)
        .sort((a, b) => b.drop_pct - a.drop_pct)[0];
      const viewersWithoutSlot = [...viewsByUser.keys()].filter((id) => !apptByUser.has(id)).length;

      // ---- Alerts.
      const alerts = [];
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      const addAlert = (key, severity, count, text, action) => {
        if (count > 0) alerts.push({ key, severity, count, text, action });
      };
      addAlert("high_intent", "high", intent.length, `${plural(intent.length, "high-intent user", "high-intent users")} didn't complete a booking ${dayWord}.`, {
        label: "Take Action",
        list: "high_intent",
      });
      addAlert(
        "unpaid_checkouts",
        "medium",
        num(failures?.attempts),
        `${plural(num(failures?.attempts), "booking attempt wasn't", "booking attempts weren't")} paid (failed or abandoned) ${dayWord}.`,
        { label: "Investigate", list: "checkout_dropoff" }
      );
      addAlert(
        "empty_salons",
        "medium",
        emptySalons.length,
        `${plural(emptySalons.length, "salon has", "salons have")} ${EMPTY_SALON_FREE_SHARE * 100}%+ of their slots empty ${dayWord}.`,
        { label: "Create Offer", route: "/coupon" }
      );
      addAlert(
        "demand_over_capacity",
        "medium",
        overCapacity.length,
        `${plural(overCapacity.length, "location has", "locations have")} more interested customers than free slots ${dayWord}.`,
        { label: "View Locations", list: "locations" }
      );
      const cancelToday = num(cancels?.today);
      const cancelYesterday = num(cancels?.yesterday);
      if (cancelToday > cancelYesterday) {
        addAlert(
          "cancellations",
          "high",
          cancelToday,
          cancelYesterday
            ? `Cancellations of ${date === today ? "today's" : `${date}'s`} appointments are up ${Math.round(((cancelToday - cancelYesterday) / cancelYesterday) * 100)}% on the day before (${cancelToday} vs ${cancelYesterday}).`
            : `${plural(cancelToday, "paid appointment", "paid appointments")} for ${date === today ? "today" : date} cancelled or refunded (none the day before).`,
          { label: "View Cancellations", route: "/bookings-by-order-date-v2" }
        );
      }
      if (baseAlerts) {
        addAlert(
          "idle_salons",
          "low",
          num(baseAlerts.idle_salons?.count),
          `${plural(num(baseAlerts.idle_salons?.count), "salon", "salons")} had no bookings in the last ${baseAlerts.idle_salons?.days || 7} days.`,
          { label: "View Salons", route: "/partner" }
        );
        addAlert(
          "overdue_payouts",
          "low",
          num(baseAlerts.overdue_payouts?.invoices),
          `${plural(num(baseAlerts.overdue_payouts?.invoices), "partner payout is", "partner payouts are")} overdue (₹${num(baseAlerts.overdue_payouts?.amount).toLocaleString("en-IN")}).`,
          { label: "View Payouts", route: "/invoice-payouts-v2" }
        );
      }

      // ---- One full list for a "View" dialog.
      if (list) {
        const withNames = async (rows) => {
          const ids = [...new Set(rows.map((r) => r.user_id))];
          const users = ids.length
            ? await run(`SELECT id, firstname, lastname, phone, gender FROM User WHERE id IN (:ids)`, { ids })
            : [];
          const byId = new Map(users.map((u) => [Number(u.id), u]));
          return rows.map((r) => {
            const u = byId.get(Number(r.user_id));
            const gender = u?.gender && String(u.gender).toLowerCase() !== "null" ? String(u.gender).trim() : null;
            return {
              ...r,
              name: u ? [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || null : null,
              phone: u?.phone ? String(u.phone) : null,
              gender,
            };
          });
        };
        const byLast = (a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || ""));
        const rowsFor = {
          high_intent: () => withNames([...intent].sort(byLast)),
          checkout_dropoff: () => withNames([...dropoffUsers].sort(byLast)),
          first_time: () => withNames(firstTimers),
          second_booking: () => withNames(secondBookingUsers),
          empty_slots: async () =>
            salonsToday.filter((s) => s.free_seats > 0).sort((a, b) => b.potential_revenue - a.potential_revenue),
          locations: async () => locationRows,
          days_to_second: () =>
            withNames(secondRows.map((r) => ({ user_id: r.user_id, days: num(r.days) })).sort((a, b) => b.days - a.days)),
        };
        return { list, date, period: { from: period.from, to: period.to }, rows: await rowsFor[list]() };
      }

      return {
        date,
        period: { from: period.from, to: period.to },
        activity_since: activitySince,
        events_since: eventsSince,
        location_since: since?.location_since || null,
        kpis: {
          high_intent: intent.length,
          checkout_dropoff: dropoffUsers.length,
          first_time_users: firstTimers.length,
          second_booking_users: secondBookingUsers.length,
          empty_slots: emptySlots,
          empty_slot_salons: salonsToday.filter((s) => s.free_seats > 0).length,
          potential_revenue: Number(potentialRevenue.toFixed(2)),
        },
        locations: { rows: locationRows.slice(0, GROWTH_PREVIEW_ROWS), total: locationRows.length },
        supply_demand: supplyRows.slice(0, GROWTH_PREVIEW_ROWS),
        tracker: {
          total: firstTimers.length,
          churn_risk_days: CHURN_RISK_DAYS,
          rows: TRACKER.map((t) => ({ ...t, users: firstTimers.filter((u) => u.status === t.key).length })),
        },
        frequency: {
          total_users: totalUsers,
          rows: BOOKING_FREQUENCY_BUCKETS.map((b) => ({ key: b.key, label: b.label, users: freqCounts[b.key] })),
        },
        levels: BOOKING_LEVELS.map((l) => ({
          label: l.label,
          from_users: reached[l.from],
          to_users: reached[l.to],
          rate: pct(reached[l.to], reached[l.from]),
        })),
        almost_booked: {
          total: intent.length,
          rows: INTENT_SEGMENTS.map((s) => ({ ...s, users: intent.filter((u) => u.segment === s.key).length })),
        },
        funnel: {
          stages,
          biggest: biggest
            ? { from: stages.find((s) => s.key === biggest.drop_from)?.label, to: biggest.label, pct: biggest.drop_pct }
            : null,
          causes: {
            unpaid_checkouts: Math.max(0, apptByUser.size - paidUsers),
            unpaid_attempts: num(failures?.attempts),
            viewers_without_slot: eventsSince && eventsSince <= date ? viewersWithoutSlot : null,
            fully_booked_salons: salonsToday.filter((s) => s.total_seats > 0 && s.free_all_day === 0).length,
            closed_salons: salonsToday.filter((s) => s.closed).length,
          },
        },
        days_to_second: {
          total: secondRows.length,
          rows: DAYS_TO_SECOND_BUCKETS.map((b, i) => ({
            key: b.key,
            label: b.label,
            users: secondRows.filter(
              (r) => DAYS_TO_SECOND_BUCKETS.findIndex((x) => num(r.days) <= x.max) === i
            ).length,
          })),
        },
        alerts,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getGrowthDashboardV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch growth dashboard");
    }
  },

  // ── Booking analytics V2 ──
  // Every salon with its type (men / women / unisex), area and city. The
  // type is Store.store_type when it names one, else derived from what the
  // salon's services are for (StoreServices.service_for), like the app's
  // gender filter does; 'unknown' when neither says.
  getStoreDirectory: async () => {
    const rows = await adminDbController.connection.query(
      `
      SELECT s.id, s.name, s.logo, s.store_type, s.status, s.completion_status,
        DATE_FORMAT(s.createdAt, '%Y-%m-%d') AS created_day,
        pa.area, pa.city, pa.district, pa.latitude, pa.longitude,
        (SELECT GROUP_CONCAT(DISTINCT ss.service_for) FROM StoreServices ss WHERE ss.store_id = s.id) AS service_for
      FROM Store s
      LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const typeOf = (storeType, serviceFor) => {
      const t = String(storeType || "").toLowerCase();
      if (/unisex|both/.test(t)) return "unisex";
      if (/female|women|ladies/.test(t)) return "women";
      if (/male|men|gents/.test(t)) return "men";
      const derived = String(deriveStoreTypeFromServiceNames(String(serviceFor || "").split(",")) || "").toLowerCase();
      if (/unisex/.test(derived)) return "unisex";
      if (/female/.test(derived)) return "women";
      if (/male/.test(derived)) return "men";
      return "unknown";
    };
    return rows.map((s) => {
      const city = String(s.district || "").trim() || s.city;
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      return {
        id: Number(s.id),
        name: s.name,
        logo: cleanLogo(s.logo),
        type: typeOf(s.store_type, s.service_for),
        status: s.status,
        listed: s.completion_status === "completed" && ["active", "inactive"].includes(s.status),
        live: s.completion_status === "completed" && s.status === "active",
        created_day: s.created_day,
        area: placeLabel(s.area) || "Unknown area",
        area_key: placeKey(s.area) || "unknown",
        city: placeLabel(city),
        city_key: placeKey(city),
        lat: Number.isFinite(lat) && lat ? lat : null,
        lng: Number.isFinite(lng) && lng ? lng : null,
      };
    });
  },

  // One row per booked item of the served bookings in the window. f = the
  // User Analytics filters (city + go-live cutoff); storeIds narrows to
  // salons. customer_gender is the guest's when booked for someone else.
  getBookingItems: async (win, f, storeIds = null) =>
    adminDbController.connection.query(
      `
      SELECT a.id AS booking_id, a.user_id, a.store_id, a.booking_for, a.status, a.discount_id,
        DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS day, HOUR(sl.\`from\`) AS hour,
        ${PLATFORM_FEE_SQL} AS platform_fee, a.distance_km,
        COALESCE(CASE WHEN a.booking_for IS NOT NULL AND a.booking_for <> 'myself' THEN g.gender END, u.gender) AS customer_gender,
        TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS customer_name,
        ai.id AS item_id, COALESCE(ai.service_amount, 0) AS price, ${ITEM_GMV_SQL} AS gmv,
        COALESCE(ai.list_amount, ss.amount, cb.amount, 0) AS list_price,
        COALESCE(ss.service_name, cb.combo) AS service_name,
        COALESCE(ss.service_category, cb.service_category) AS category_id
      FROM appointments a
      INNER JOIN appointment_items ai ON ai.appointment_id = a.id
      LEFT JOIN StoreServices ss ON ss.id = ai.service_id
      LEFT JOIN Combo cb ON cb.id = ai.combo_id
      LEFT JOIN Slots sl ON sl.id = a.slot_id
      LEFT JOIN User u ON u.id = a.user_id
      LEFT JOIN GuestDetails g ON g.id = a.guest_id
      ${f.cityJoin("a")}
      WHERE ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")}
        AND a.booking_date >= :from AND a.booking_date < :end ${f.cityWhere}
        ${storeIds ? "AND a.store_id IN (:storeIds)" : ""}
      `,
      {
        replacements: { ...f.replacements, from: win.from, end: win.end, storeIds: storeIds?.length ? storeIds : [0] },
        type: Sequelize.QueryTypes.SELECT,
      }
    ),

  // Items -> bookings: { id, user_id, store_id, day, hour, gmv, fee,
  // discounted, gender, items: [{ key, label, category_id, price, gmv }] }.
  // Service names are free text per salon, so they group on placeKey.
  rollUpBookings: (items) => {
    const bookings = new Map();
    for (const it of items) {
      const b = bookings.get(it.booking_id) || {
        id: it.booking_id,
        user_id: it.user_id,
        store_id: Number(it.store_id),
        day: it.day,
        hour: it.hour === null || it.hour === undefined ? null : Number(it.hour),
        status: it.status,
        gmv: 0,
        fee: Number(it.platform_fee) || 0,
        distance: it.distance_km === null || it.distance_km === undefined ? null : Number(it.distance_km),
        discounted: Number(it.discount_id) > 0,
        guest: Boolean(it.booking_for && it.booking_for !== "myself"),
        gender: /^(m|male)$/i.test(String(it.customer_gender || "").trim())
          ? "men"
          : /^(f|female)$/i.test(String(it.customer_gender || "").trim())
            ? "women"
            : null,
        customer_name: it.customer_name || null,
        items: [],
      };
      const gmv = Number(it.gmv) || 0;
      const price = Number(it.price) || 0;
      b.gmv += gmv;
      if (Number(it.list_price) > price) b.discounted = true;
      b.items.push({
        key: placeKey(it.service_name) || "unknown",
        label: placeLabel(it.service_name) || "Unknown service",
        category_id: it.category_id === null || it.category_id === undefined ? null : Number(it.category_id),
        price,
        gmv,
      });
      bookings.set(it.booking_id, b);
    }
    return [...bookings.values()];
  },

  // Service Intelligence V2. salon_type = men | women | unisex narrows to
  // salons of that type; "Men's / Women's" rankings split by the customer's
  // gender (the guest's for guest bookings).
  getServiceIntelligenceV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 7);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const salonType = SALON_TYPES.some((t) => t.key === data.salon_type) ? data.salon_type : null;
      const stores = await adminDbController.app.getStoreDirectory();
      const storeIds = salonType ? stores.filter((s) => s.type === salonType).map((s) => s.id) : null;

      const [items, prevItems, categoryRows, cities] = await Promise.all([
        adminDbController.app.getBookingItems(win, f, storeIds),
        adminDbController.app.getBookingItems(win.previous, f, storeIds),
        adminDbController.connection.query(`SELECT id, name FROM Servicecategory`, { type: Sequelize.QueryTypes.SELECT }),
        adminDbController.app.getSalonCities(),
      ]);
      const bookings = adminDbController.app.rollUpBookings(items);
      const prevBookings = adminDbController.app.rollUpBookings(prevItems);
      const categoryName = new Map(categoryRows.map((c) => [Number(c.id), placeLabel(c.name) || c.name]));

      // Service history of these customers (from go-live) for repeat rates
      // and first-time customers.
      const userIds = [...new Set([...bookings, ...prevBookings].map((b) => b.user_id).filter(Boolean))];
      const history = userIds.length
        ? await adminDbController.connection.query(
            `
            SELECT a.user_id, DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS day, COALESCE(ss.service_name, cb.combo) AS service_name
            FROM appointments a
            INNER JOIN appointment_items ai ON ai.appointment_id = a.id
            LEFT JOIN StoreServices ss ON ss.id = ai.service_id
            LEFT JOIN Combo cb ON cb.id = ai.combo_id
            WHERE ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")}
              AND a.user_id IN (:userIds) AND a.booking_date < :end
            `,
            { replacements: { userIds, end: win.end, cutoff: cutoff || null }, type: Sequelize.QueryTypes.SELECT }
          )
        : [];
      const firstServiceDay = new Map(); // user|serviceKey -> earliest day
      const firstBookingDay = new Map(); // user -> earliest day
      for (const h of history) {
        const key = `${h.user_id}|${placeKey(h.service_name) || "unknown"}`;
        if (!firstServiceDay.has(key) || h.day < firstServiceDay.get(key)) firstServiceDay.set(key, h.day);
        if (!firstBookingDay.has(h.user_id) || h.day < firstBookingDay.get(h.user_id)) firstBookingDay.set(h.user_id, h.day);
      }
      const isRepeat = (b, item) => {
        const first = firstServiceDay.get(`${b.user_id}|${item.key}`);
        return Boolean(first && first < b.day);
      };

      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);

      const kpisOf = (list) => {
        const allItems = list.flatMap((b) => b.items.map((it) => ({ b, it })));
        const gmv = list.reduce((t, b) => t + b.gmv, 0);
        return {
          bookings: list.length,
          gmv: money(gmv),
          unique_services: new Set(allItems.map(({ it }) => it.key)).size,
          avg_service_price: allItems.length ? money(allItems.reduce((t, { it }) => t + it.price, 0) / allItems.length) : null,
          addon_rate: pct(list.filter((b) => b.items.length >= 2).length, list.length),
          repeat_service_rate: pct(allItems.filter(({ b, it }) => isRepeat(b, it)).length, allItems.length),
        };
      };

      // Services ranked by bookings (a booking counts once per service).
      const rankServices = (list, limit = SERVICE_TOP_ROWS) => {
        const byKey = new Map();
        for (const b of list) {
          const seen = new Set();
          for (const it of b.items) {
            const s = byKey.get(it.key) || { key: it.key, labels: new Map(), bookings: 0, gmv: 0, repeat: 0, items: 0, days: new Map() };
            s.labels.set(it.label, (s.labels.get(it.label) || 0) + 1);
            s.gmv += it.gmv;
            s.items += 1;
            if (isRepeat(b, it)) s.repeat += 1;
            if (!seen.has(it.key)) {
              s.bookings += 1;
              s.days.set(b.day, (s.days.get(b.day) || 0) + 1);
              seen.add(it.key);
            }
            byKey.set(it.key, s);
          }
        }
        const label = (s) => [...s.labels].sort((a, b) => b[1] - a[1])[0][0];
        const total = list.length;
        const sorted = [...byKey.values()].sort((a, b) => b.bookings - a.bookings || b.gmv - a.gmv);
        const top = sorted.slice(0, limit).map((s) => ({
          key: s.key,
          name: label(s),
          bookings: s.bookings,
          share: pct(s.bookings, total),
          gmv: money(s.gmv),
          repeat_rate: pct(s.repeat, s.items),
          days: s.days,
        }));
        const rest = sorted.slice(limit);
        if (rest.length) {
          const restBookings = rest.reduce((t, s) => t + s.bookings, 0);
          top.push({
            key: "others",
            name: "Others",
            bookings: restBookings,
            share: pct(restBookings, total),
            gmv: money(rest.reduce((t, s) => t + s.gmv, 0)),
            repeat_rate: null,
            days: new Map(),
          });
        }
        return top;
      };
      // Drop the per-day map used for the trend before returning.
      const strip = (rows) => rows.map(({ days: _days, ...row }) => row);

      // Window split into up to 12 equal buckets (sparklines).
      const dayIndex = (d) => Math.round((Date.parse(d) - Date.parse(win.from)) / 864e5);
      const bucketCount = Math.min(12, win.days);
      const bucketOf = (d) => Math.min(bucketCount - 1, Math.floor((dayIndex(d) * bucketCount) / win.days));

      const all = rankServices(bookings);
      const men = rankServices(bookings.filter((b) => b.gender === "men"));
      const women = rankServices(bookings.filter((b) => b.gender === "women"));

      // Category split (a booking counts once per category).
      const catCounts = new Map();
      for (const b of bookings) {
        for (const cid of new Set(b.items.map((it) => it.category_id))) {
          const name = categoryName.get(cid) || "Uncategorised";
          catCounts.set(name, (catCounts.get(name) || 0) + 1);
        }
      }
      const catSorted = [...catCounts].sort((a, b) => b[1] - a[1]);
      const categories = catSorted.slice(0, 5).map(([name, count]) => ({ name, bookings: count, share: pct(count, bookings.length) }));
      const catRest = catSorted.slice(5).reduce((t, [, c]) => t + c, 0);
      if (catRest) categories.push({ name: "Others", bookings: catRest, share: pct(catRest, bookings.length) });

      // Daily trend of the three most booked services.
      const trendServices = all.filter((s) => s.key !== "others").slice(0, 3);
      const trend = [];
      for (let d = win.from; d <= win.to; d = addDays(d, 1)) {
        trend.push({ day: d, ...Object.fromEntries(trendServices.map((s) => [s.key, s.days.get(d) || 0])) });
      }

      // Add-ons: in a booking with 2+ services, every service but the one
      // that earned the most.
      const addonMap = new Map();
      for (const b of bookings) {
        if (b.items.length < 2) continue;
        const primary = b.items.reduce((best, it) => (it.gmv > best.gmv ? it : best), b.items[0]);
        const seen = new Set();
        for (const it of b.items) {
          if (it === primary || seen.has(it.key)) continue;
          seen.add(it.key);
          const a = addonMap.get(it.key) || { key: it.key, name: it.label, bookings: 0, gmv: 0 };
          a.bookings += 1;
          a.gmv += it.gmv;
          addonMap.set(it.key, a);
        }
      }
      const addonSorted = [...addonMap.values()].sort((a, b) => b.bookings - a.bookings);
      const addons = addonSorted.slice(0, 6).map((a) => ({ ...a, gmv: money(a.gmv), attach_rate: pct(a.bookings, bookings.length) }));
      const addonRest = addonSorted.slice(6);
      if (addonRest.length) {
        const n = addonRest.reduce((t, a) => t + a.bookings, 0);
        addons.push({ key: "others", name: "Others", bookings: n, gmv: money(addonRest.reduce((t, a) => t + a.gmv, 0)), attach_rate: pct(n, bookings.length) });
      }

      // Price bands of the charged service price.
      const allItems = bookings.flatMap((b) => b.items);
      const priceBands = PRICE_BANDS.map((band, i) => ({
        key: band.key,
        label: band.label,
        items: allItems.filter((it) => PRICE_BANDS.findIndex((p) => it.price < p.max) === i).length,
      })).map((band) => ({ ...band, share: pct(band.items, allItems.length) }));

      // Peak days for the top five categories (Mon..Sun, by booking date).
      const peakCats = categories.filter((c) => c.name !== "Others").map((c) => c.name);
      const peak = peakCats.map(() => Array(7).fill(0));
      for (const b of bookings) {
        const weekday = (new Date(`${b.day}T00:00:00Z`).getUTCDay() + 6) % 7;
        for (const cid of new Set(b.items.map((it) => it.category_id))) {
          const row = peakCats.indexOf(categoryName.get(cid) || "Uncategorised");
          if (row >= 0) peak[row][weekday] += 1;
        }
      }

      // Repeat rate of the most booked services, with a bookings sparkline.
      const repeat = all
        .filter((s) => s.key !== "others")
        .slice(0, 6)
        .map((s) => {
          const series = Array(bucketCount).fill(0);
          for (const [d, n] of s.days) series[bucketOf(d)] += n;
          return { key: s.key, name: s.name, rate: s.repeat_rate, series };
        });

      // Favourite services per customer group.
      const top2 = (list) =>
        rankServices(list, 2)
          .filter((s) => s.key !== "others")
          .map((s) => ({ name: s.name, share: s.share }));
      const isNewCustomer = (b) => firstBookingDay.get(b.user_id) === b.day || !firstBookingDay.get(b.user_id);
      const preferences = [
        { key: "new", label: "New Customers", top: top2(bookings.filter((b) => isNewCustomer(b) && b.day >= win.from)) },
        { key: "returning", label: "Returning Customers", top: top2(bookings.filter((b) => !isNewCustomer(b))) },
        { key: "high_spenders", label: `High Spenders (₹${HIGH_SPENDER_BOOKING}+)`, top: top2(bookings.filter((b) => b.gmv >= HIGH_SPENDER_BOOKING)) },
        { key: "offer", label: "Offer Users", top: top2(bookings.filter((b) => b.discounted)) },
      ];

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        filters: { city: f.city, salon_type: salonType },
        data_start_date: cutoff || null,
        kpis: kpisOf(bookings),
        previous_kpis: kpisOf(prevBookings),
        services: { all: strip(all), men: strip(men), women: strip(women) },
        gender_coverage: pct(bookings.filter((b) => b.gender).length, bookings.length),
        categories,
        trend: { services: trendServices.map((s) => ({ key: s.key, name: s.name })), days: trend },
        addons,
        price_bands: priceBands,
        peak: { categories: peakCats, weekdays: WEEKDAY_SHORT, values: peak },
        repeat,
        preferences,
        cities,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getServiceIntelligenceV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch service intelligence");
    }
  },

  // Paid bookings (refunds included) and how many were cancelled / refunded,
  // by booking date, per salon. The cancellation-rate base.
  getCancellationCounts: async (win, f) =>
    adminDbController.connection.query(
      `
      SELECT a.store_id, COUNT(*) AS paid, COALESCE(SUM(a.status IN ('cancelled', 'refunded')), 0) AS cancelled
      FROM appointments a ${f.cityJoin("a")}
      WHERE ${PAYMENT_MADE_SQL} AND ${bookingFloorSql("a")}
        AND a.booking_date >= :from AND a.booking_date < :end ${f.cityWhere}
      GROUP BY a.store_id
      `,
      { replacements: { ...f.replacements, from: win.from, end: win.end }, type: Sequelize.QueryTypes.SELECT }
    ),

  // Booking Intelligence V2: when bookings happen (slot time), how much they
  // earn, and the cancellation rate.
  getBookingIntelligenceV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const [items, prevItems, cancels, prevCancels, cities] = await Promise.all([
        adminDbController.app.getBookingItems(win, f),
        adminDbController.app.getBookingItems(win.previous, f),
        adminDbController.app.getCancellationCounts(win, f),
        adminDbController.app.getCancellationCounts(win.previous, f),
        adminDbController.app.getSalonCities(),
      ]);
      const bookings = adminDbController.app.rollUpBookings(items);
      const prevBookings = adminDbController.app.rollUpBookings(prevItems);
      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const cancelRate = (rows) => {
        const paid = rows.reduce((t, r) => t + num(r.paid), 0);
        return pct(rows.reduce((t, r) => t + num(r.cancelled), 0), paid);
      };
      const kpisOf = (list, cancelRows) => {
        const gmv = list.reduce((t, b) => t + b.gmv, 0);
        return {
          bookings: list.length,
          gmv: money(gmv),
          customers: new Set(list.map((b) => b.user_id).filter(Boolean)).size,
          aov: list.length ? money(gmv / list.length) : null,
          cancellation_rate: cancelRate(cancelRows),
        };
      };

      const weekdayOf = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
      const timed = bookings.filter((b) => b.hour !== null);
      const grid = (cols) => TWO_HOUR_SLOTS.map(() => Array(cols).fill(0));

      // Slot x weekday, and slot x period (the window cut into up to 12 parts).
      const byWeekday = { bookings: grid(7), gmv: grid(7) };
      const periods = Math.min(12, win.days);
      const periodOf = (d) => Math.min(periods - 1, Math.floor((Math.round((Date.parse(d) - Date.parse(win.from)) / 864e5) * periods) / win.days));
      const periodLabels = Array.from({ length: periods }, (_, p) => {
        const start = addDays(win.from, Math.ceil((p * win.days) / periods));
        const end = addDays(win.from, Math.ceil(((p + 1) * win.days) / periods) - 1);
        return start === end ? start : `${start}|${end}`;
      });
      const byPeriod = { bookings: grid(periods), gmv: grid(periods) };
      const byHour = Array(24).fill(0);
      const byHourGmv = Array(24).fill(0);
      for (const b of timed) {
        const slot = Math.min(11, Math.floor(b.hour / 2));
        const wd = weekdayOf(b.day);
        byWeekday.bookings[slot][wd] += 1;
        byWeekday.gmv[slot][wd] += b.gmv;
        const p = periodOf(b.day);
        byPeriod.bookings[slot][p] += 1;
        byPeriod.gmv[slot][p] += b.gmv;
        byHour[b.hour] += 1;
        byHourGmv[b.hour] += b.gmv;
      }
      const roundGrid = (g) => g.map((row) => row.map((v) => money(v)));

      const peakHours = byHour
        .map((n, h) => ({ hour: h, label: `${hourName(h)} – ${hourName(h + 1)}`, bookings: n, gmv: money(byHourGmv[h]) }))
        .filter((r) => r.bookings)
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);
      const weekdayTotals = WEEKDAY_FULL.map((label, wd) => {
        const list = bookings.filter((b) => weekdayOf(b.day) === wd);
        return { weekday: wd, label, bookings: list.length, gmv: money(list.reduce((t, b) => t + b.gmv, 0)) };
      });
      const busiestDays = [...weekdayTotals].filter((r) => r.bookings).sort((a, b) => b.bookings - a.bookings).slice(0, 5);
      const dayBands = DAY_BANDS.map((band) => {
        const list = timed.filter((b) => b.hour >= band.from && b.hour < band.to);
        return { key: band.key, label: band.label, bookings: list.length, gmv: money(list.reduce((t, b) => t + b.gmv, 0)) };
      });

      // This period vs the previous one, day by day (aligned by position).
      const daily = (list, from, days) => {
        const out = Array.from({ length: days }, (_, i) => ({ day: addDays(from, i), bookings: 0, gmv: 0 }));
        for (const b of list) {
          const i = Math.round((Date.parse(b.day) - Date.parse(from)) / 864e5);
          if (out[i]) {
            out[i].bookings += 1;
            out[i].gmv += b.gmv;
          }
        }
        return out.map((r) => ({ ...r, gmv: money(r.gmv) }));
      };

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        filters: { city: f.city },
        data_start_date: cutoff || null,
        kpis: kpisOf(bookings, cancels),
        previous_kpis: kpisOf(prevBookings, prevCancels),
        untimed_bookings: bookings.length - timed.length,
        slots: TWO_HOUR_SLOTS,
        by_weekday: { weekdays: WEEKDAY_SHORT, bookings: byWeekday.bookings, gmv: roundGrid(byWeekday.gmv) },
        by_period: { periods: periodLabels, bookings: byPeriod.bookings, gmv: roundGrid(byPeriod.gmv) },
        peak_hours: peakHours,
        busiest_days: busiestDays,
        weekday_totals: weekdayTotals,
        day_bands: dayBands,
        trend: { current: daily(bookings, win.from, win.days), previous: daily(prevBookings, win.previous.from, win.days) },
        cities,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getBookingIntelligenceV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch booking intelligence");
    }
  },

  // Salon Heatmap V2: bookings, GMV and growth per salon area (areas grouped
  // on the normalised area name; the hotspot sits at the average position of
  // the area's salons).
  getSalonHeatmapV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const cityKey = f.replacements.cityKey;
      const [stores, items, prevItems, cities] = await Promise.all([
        adminDbController.app.getStoreDirectory(),
        adminDbController.app.getBookingItems(win, f),
        adminDbController.app.getBookingItems(win.previous, f),
        adminDbController.app.getSalonCities(),
      ]);
      const bookings = adminDbController.app.rollUpBookings(items);
      const prevBookings = adminDbController.app.rollUpBookings(prevItems);
      const storeById = new Map(stores.map((s) => [s.id, s]));
      const inCity = (s) => !cityKey || s.city_key === cityKey;
      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);

      const areas = new Map();
      const areaFor = (s) => {
        const key = `${s.area_key}|${s.city_key}`;
        if (!areas.has(key)) {
          areas.set(key, { key, name: s.area, city: s.city, salons: new Set(), live: 0, coords: [], bookings: 0, gmv: 0, customers: new Set(), prev: 0 });
        }
        return areas.get(key);
      };
      for (const s of stores) {
        if (!s.listed || !inCity(s)) continue;
        const a = areaFor(s);
        a.salons.add(s.id);
        if (s.live) a.live += 1;
        if (s.lat !== null) a.coords.push([s.lat, s.lng]);
      }
      for (const b of bookings) {
        const s = storeById.get(b.store_id);
        if (!s) continue;
        const a = areaFor(s);
        a.bookings += 1;
        a.gmv += b.gmv;
        if (b.user_id) a.customers.add(b.user_id);
        if (s.lat !== null && !a.coords.length) a.coords.push([s.lat, s.lng]);
      }
      for (const b of prevBookings) {
        const s = storeById.get(b.store_id);
        if (s) areaFor(s).prev += 1;
      }
      const areaRows = [...areas.values()]
        .filter((a) => a.bookings || a.salons.size)
        .map((a) => ({
          key: a.key,
          name: a.name,
          city: a.city,
          lat: a.coords.length ? Number((a.coords.reduce((t, c) => t + c[0], 0) / a.coords.length).toFixed(5)) : null,
          lng: a.coords.length ? Number((a.coords.reduce((t, c) => t + c[1], 0) / a.coords.length).toFixed(5)) : null,
          salons: a.salons.size,
          live_salons: a.live,
          bookings: a.bookings,
          gmv: money(a.gmv),
          aov: a.bookings ? money(a.gmv / a.bookings) : null,
          customers: a.customers.size,
          previous_bookings: a.prev,
          growth_pct: a.prev ? pct(a.bookings - a.prev, a.prev) : null,
        }))
        .sort((x, y) => y.bookings - x.bookings || y.gmv - x.gmv);

      const kpisOf = (list, w) => {
        const gmv = list.reduce((t, b) => t + b.gmv, 0);
        return {
          bookings: list.length,
          gmv: money(gmv),
          customers: new Set(list.map((b) => b.user_id).filter(Boolean)).size,
          aov: list.length ? money(gmv / list.length) : null,
          active_salons: stores.filter((s) => s.live && inCity(s)).length,
          new_salons: stores.filter((s) => s.listed && inCity(s) && s.created_day >= w.from && s.created_day <= w.to).length,
        };
      };

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        filters: { city: f.city },
        data_start_date: cutoff || null,
        kpis: kpisOf(bookings, win),
        previous_kpis: kpisOf(prevBookings, win.previous),
        areas: areaRows,
        cities,
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getSalonHeatmapV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salon heatmap");
    }
  },

  // Salon Category Intelligence V2: the same metrics per salon type (men's /
  // unisex / women's) and overall. area narrows to one salon area. No-show
  // isn't recorded, so it isn't returned.
  getSalonCategoryV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const cityKey = f.replacements.cityKey;
      const areaKey = placeKey(data.area);
      const today = toIstDatePart(new Date());
      const capEnd = win.end < addDays(today, 1) ? win.end : addDays(today, 1);

      const stores = (await adminDbController.app.getStoreDirectory()).filter(
        (s) => (!cityKey || s.city_key === cityKey) && (!areaKey || s.area_key === areaKey)
      );
      const storeIds = stores.map((s) => s.id);
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { ...f.replacements, from: win.from, end: win.end, storeIds: storeIds.length ? storeIds : [0], ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });
      const [items, cancels, subscriptions, ratings, capacity, areaStores] = await Promise.all([
        adminDbController.app.getBookingItems(win, f, storeIds),
        adminDbController.app.getCancellationCounts(win, f),
        run(`
          SELECT store_id, COALESCE(SUM(subscription_deducted), 0) AS amount FROM InvoicePayouts
          WHERE paid_at >= :from AND paid_at < :end AND subscription_deducted > 0 AND store_id IN (:storeIds)
          GROUP BY store_id`),
        run(`
          SELECT store_id, SUM(rating) AS total, COUNT(*) AS reviews FROM Reviews
          WHERE status = 'active' AND rating BETWEEN 1 AND 5 AND store_id IN (:storeIds)
          GROUP BY store_id`),
        win.from < capEnd ? adminDbController.app.getSlotCapacity(win.from, capEnd) : new Map(),
        adminDbController.app.getStoreDirectory(),
      ]);
      const bookings = adminDbController.app.rollUpBookings(items);
      const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
      const visits = userIds.length
        ? await run(
            `SELECT a.user_id, a.store_id, COUNT(*) AS n FROM appointments a
             WHERE ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")} AND a.booking_date < :end AND a.user_id IN (:userIds)
             GROUP BY a.user_id, a.store_id`,
            { userIds }
          )
        : [];
      const visitsOf = new Map(visits.map((v) => [`${v.user_id}|${v.store_id}`, Number(v.n) || 0]));
      const cancelsByStore = new Map(cancels.map((c) => [Number(c.store_id), c]));
      const subsByStore = new Map(subscriptions.map((r) => [Number(r.store_id), Number(r.amount) || 0]));
      const ratingByStore = new Map(ratings.map((r) => [Number(r.store_id), r]));
      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const totalBookings = bookings.length;

      const summarise = (inType) => {
        const typeStores = stores.filter((s) => s.listed && inType(s));
        const ids = new Set(typeStores.map((s) => s.id));
        const list = bookings.filter((b) => ids.has(b.store_id));
        const gmv = list.reduce((t, b) => t + b.gmv, 0);
        const fees = list.reduce((t, b) => t + b.fee, 0);
        const active = typeStores.filter((s) => s.live).length;
        let paid = 0;
        let cancelled = 0;
        let subs = 0;
        let ratingTotal = 0;
        let ratingCount = 0;
        let seats = 0;
        let free = 0;
        for (const id of ids) {
          const c = cancelsByStore.get(id);
          paid += num(c?.paid);
          cancelled += num(c?.cancelled);
          subs += subsByStore.get(id) || 0;
          const r = ratingByStore.get(id);
          ratingTotal += num(r?.total);
          ratingCount += num(r?.reviews);
          for (const cell of capacity.get(id)?.days.values() || []) {
            seats += cell.total;
            free += cell.free;
          }
        }
        const pairs = new Map();
        for (const b of list) if (b.user_id) pairs.set(`${b.user_id}|${b.store_id}`, true);
        const repeatPairs = [...pairs.keys()].filter((k) => (visitsOf.get(k) || 0) >= 2).length;
        const distances = list.map((b) => b.distance).filter((d) => d !== null);
        const slotCounts = Array(12).fill(0);
        for (const b of list) if (b.hour !== null) slotCounts[Math.min(11, Math.floor(b.hour / 2))] += 1;
        const peakSlot = slotCounts.some(Boolean) ? slotCounts.indexOf(Math.max(...slotCounts)) : null;
        const dayCounts = Array(7).fill(0);
        for (const b of list) dayCounts[(new Date(`${b.day}T00:00:00Z`).getUTCDay() + 6) % 7] += 1;
        const peakDay = list.length ? dayCounts.indexOf(Math.max(...dayCounts)) : null;
        // No-show proxy: served bookings whose day has passed but were never marked completed.
        const past = list.filter((b) => b.day < today);
        return {
          total_salons: typeStores.length,
          active_salons: active,
          inactive_salons: typeStores.length - active,
          active_pct: pct(active, typeStores.length),
          bookings: list.length,
          booking_share: pct(list.length, totalBookings),
          bookings_per_salon: typeStores.length ? Number((list.length / typeStores.length).toFixed(1)) : null,
          bookings_per_active_salon: active ? Number((list.length / active).toFixed(1)) : null,
          gmv: money(gmv),
          aov: list.length ? money(gmv / list.length) : null,
          platform_fee_revenue: money(fees),
          subscription_revenue: money(subs),
          cancellation_rate: pct(cancelled, paid),
          repeat_customer_rate: pct(repeatPairs, pairs.size),
          avg_distance_km: distances.length ? Number((distances.reduce((t, d) => t + d, 0) / distances.length).toFixed(1)) : null,
          avg_rating: ratingCount ? Number((ratingTotal / ratingCount).toFixed(1)) : null,
          reviews: ratingCount,
          empty_slot_rate: pct(free, seats),
          peak_slot: peakSlot === null ? null : TWO_HOUR_SLOTS[peakSlot],
          peak_day: peakDay === null ? null : WEEKDAY_FULL[peakDay],
          not_completed_rate: pct(past.filter((b) => b.status !== "completed").length, past.length),
        };
      };

      const areas = new Map();
      for (const s of areaStores) {
        if (s.listed && (!cityKey || s.city_key === cityKey) && !areas.has(s.area_key)) areas.set(s.area_key, s.area);
      }

      return {
        from: win.from,
        to: win.to,
        filters: { city: f.city, area: areaKey ? placeLabel(data.area) : null },
        data_start_date: cutoff || null,
        types: SALON_TYPES.map((t) => ({ key: t.key, label: t.label, ...summarise((s) => s.type === t.key) })),
        overall: summarise(() => true),
        unclassified_salons: stores.filter((s) => s.listed && s.type === "unknown").length,
        areas: [...areas.values()].sort((a, b) => a.localeCompare(b)),
        cities: await adminDbController.app.getSalonCities(),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getSalonCategoryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salon category intelligence");
    }
  },

  // Salons for the Partner Details picker: name / area search, live first.
  getPartnerPickerV2: async (data = {}) => {
    try {
      const search = String(data.search || "").trim().toLowerCase();
      const stores = (await adminDbController.app.getStoreDirectory())
        .filter((s) => s.status !== "terminated")
        .filter((s) => !search || `${s.name} ${s.area} ${s.city || ""} ${s.id}`.toLowerCase().includes(search))
        .sort((a, b) => Number(b.live) - Number(a.live) || String(a.name).localeCompare(String(b.name)))
        .slice(0, 50)
        .map((s) => ({ store_id: s.id, name: s.name, logo: s.logo, area: s.area, city: s.city, type: s.type, live: s.live, status: s.status }));
      return { salons: stores };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getPartnerPickerV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salons");
    }
  },

  // Partner Details V2 (Overview tab) for one salon: profile, KPIs, trend,
  // services, peak times, retention, ratings, subscription, payouts, recent
  // bookings and activity. Window default: this month to date.
  getPartnerOverviewV2: async (data = {}) => {
    try {
      const storeId = Number(data.store_id);
      if (!Number.isInteger(storeId) || storeId <= 0) throw Error.BadRequest("store_id is required");
      const today = toIstDatePart(new Date());
      const win = resolveAnalyticsWindow(data.from || data.to ? data : { from: `${today.slice(0, 7)}-01`, to: today }, 30);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters({}, cutoff);
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { storeId, from: win.from, end: win.end, today, cutoff: cutoff || null, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });

      const [[store]] = await Promise.all([
        run(`
          SELECT s.id, s.name, s.logo, s.email, s.phone, s.whatsapp_number, s.store_type, s.status, s.completion_status,
            s.is_premium, s.payout_frequency, s.account_number, s.ifsc_code, s.bank_account_holder,
            DATE_FORMAT(s.createdAt, '%Y-%m-%d') AS created_day,
            pa.addressLine1, pa.area, pa.city, pa.district, pa.state
          FROM Store s LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
          WHERE s.id = :storeId`),
      ]);
      if (!store) throw Error.NotFound("Salon not found");

      const monthStart = `${today.slice(0, 7)}-01`;
      const lastMonthStart = addDays(monthStart, -1).slice(0, 7) + "-01";
      const weekStart = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      const [items, prevItems, [periods], [cancel], [subscriptionFees], ratingRows, [subscription], [lastPayout], recent, capacity, directory] =
        await Promise.all([
          adminDbController.app.getBookingItems(win, f, [storeId]),
          adminDbController.app.getBookingItems(win.previous, f, [storeId]),
          run(
            `
            SELECT COALESCE(SUM(a.booking_date >= :today AND a.booking_date < :tomorrow), 0) AS today,
                   COALESCE(SUM(a.booking_date >= :weekStart AND a.booking_date < :tomorrow), 0) AS week,
                   COALESCE(SUM(a.booking_date >= :monthStart AND a.booking_date < :tomorrow), 0) AS month,
                   COALESCE(SUM(a.booking_date >= :lastMonthStart AND a.booking_date < :monthStart), 0) AS last_month
            FROM appointments a
            WHERE a.store_id = :storeId AND ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")}
              AND a.booking_date >= :lastMonthStart AND a.booking_date < :tomorrow`,
            { tomorrow: addDays(today, 1), weekStart, monthStart, lastMonthStart }
          ),
          run(`
            SELECT COUNT(*) AS paid, COALESCE(SUM(a.status IN ('cancelled', 'refunded')), 0) AS cancelled
            FROM appointments a
            WHERE a.store_id = :storeId AND ${PAYMENT_MADE_SQL} AND ${bookingFloorSql("a")}
              AND a.booking_date >= :from AND a.booking_date < :end`),
          run(`
            SELECT COALESCE(SUM(subscription_deducted), 0) AS amount FROM InvoicePayouts
            WHERE store_id = :storeId AND paid_at >= :from AND paid_at < :end`),
          run(`
            SELECT rating, COUNT(*) AS n FROM Reviews
            WHERE store_id = :storeId AND status = 'active' AND rating BETWEEN 1 AND 5
            GROUP BY rating`),
          run(`
            SELECT status, plan_amount, activated_at, deactivated_at, next_due_date, outstanding_due, renewal_booking_limit, cycle_state
            FROM PartnerManualSubscriptions WHERE store_id = :storeId
            ORDER BY (status = 'active') DESC, activated_at DESC LIMIT 1`),
          run(`
            SELECT paid_at, SUM(amount) AS amount FROM InvoicePayouts
            WHERE store_id = :storeId AND paid_at IS NOT NULL
            GROUP BY paid_at ORDER BY paid_at DESC LIMIT 1`),
          run(`
            SELECT a.id, DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS day, TIME_FORMAT(sl.\`from\`, '%H:%i') AS time,
              a.status, a.payment_status, ${AMOUNT_PAID_SQL} AS amount,
              COALESCE(NULLIF(TRIM(a.customer_name), ''), TRIM(CONCAT_WS(' ', u.firstname, u.lastname))) AS customer,
              COALESCE(NULLIF(TRIM(a.customer_phone), ''), u.phone) AS phone, a.user_id,
              (SELECT GROUP_CONCAT(COALESCE(ss.service_name, cb.combo) SEPARATOR ', ')
                 FROM appointment_items ai
                 LEFT JOIN StoreServices ss ON ss.id = ai.service_id
                 LEFT JOIN Combo cb ON cb.id = ai.combo_id
                 WHERE ai.appointment_id = a.id) AS services
            FROM appointments a
            LEFT JOIN Slots sl ON sl.id = a.slot_id
            LEFT JOIN User u ON u.id = a.user_id
            WHERE a.store_id = :storeId AND ${PAYMENT_MADE_SQL} AND ${bookingFloorSql("a")}
            ORDER BY a.booking_date DESC, sl.\`from\` DESC, a.id DESC
            LIMIT 8`),
          win.from < addDays(today, 1)
            ? adminDbController.app.getSlotCapacity(win.from, win.end < addDays(today, 1) ? win.end : addDays(today, 1))
            : new Map(),
          adminDbController.app.getStoreDirectory(),
        ]);

      const bookings = adminDbController.app.rollUpBookings(items);
      const prevBookings = adminDbController.app.rollUpBookings(prevItems);
      const userIds = [...new Set([...bookings, ...prevBookings].map((b) => b.user_id).filter(Boolean))];
      const firsts = userIds.length
        ? await run(
            `SELECT a.user_id, DATE_FORMAT(MIN(a.booking_date), '%Y-%m-%d') AS first_day FROM appointments a
             WHERE a.store_id = :storeId AND ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")} AND a.user_id IN (:userIds)
             GROUP BY a.user_id`,
            { userIds }
          )
        : [];
      const firstDay = new Map(firsts.map((r) => [r.user_id, r.first_day]));
      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);

      const kpisOf = (list, w) => {
        const gmv = list.reduce((t, b) => t + b.gmv, 0);
        const customers = new Set(list.map((b) => b.user_id).filter(Boolean));
        const completed = list.filter((b) => b.status === "completed").length;
        return {
          bookings: list.length,
          completed_bookings: completed,
          completion_rate: pct(completed, list.length),
          gmv: money(gmv),
          platform_fee_revenue: money(list.reduce((t, b) => t + b.fee, 0)),
          customers: customers.size,
          new_customers: [...customers].filter((u) => (firstDay.get(u) || "") >= w.from).length,
          aov: list.length ? money(gmv / list.length) : null,
          services_sold: list.reduce((t, b) => t + b.items.length, 0),
        };
      };
      const kpis = kpisOf(bookings, win);
      kpis.subscription_revenue = money(subscriptionFees?.amount);
      kpis.gloup_revenue = money(kpis.platform_fee_revenue + kpis.subscription_revenue);
      kpis.cancellation_rate = pct(num(cancel?.cancelled), num(cancel?.paid));
      let freeMinutes = 0;
      for (const cell of capacity.get(storeId)?.days.values() || []) freeMinutes += cell.free_minutes || 0;
      kpis.empty_seat_hours = capacity.get(storeId) ? Number((freeMinutes / 60).toFixed(1)) : null;

      // Daily trend, services, peak times, retention.
      const trend = [];
      for (let d = win.from; d <= win.to && d <= today; d = addDays(d, 1)) {
        trend.push({ day: d, bookings: bookings.filter((b) => b.day === d).length });
      }
      const services = new Map();
      for (const b of bookings) {
        for (const it of b.items) {
          const s = services.get(it.key) || { key: it.key, name: it.label, bookings: 0, gmv: 0 };
          s.bookings += 1;
          s.gmv += it.gmv;
          services.set(it.key, s);
        }
      }
      const serviceRows = [...services.values()].sort((a, b) => b.bookings - a.bookings || b.gmv - a.gmv).map((s) => ({ ...s, gmv: money(s.gmv) }));
      const totalGmv = bookings.reduce((t, b) => t + b.gmv, 0);
      const revenueSplit = serviceRows.slice(0, 4).map((s) => ({ name: s.name, gmv: s.gmv, share: pct(s.gmv, totalGmv) }));
      const restGmv = serviceRows.slice(4).reduce((t, s) => t + s.gmv, 0);
      if (restGmv) revenueSplit.push({ name: "Others", gmv: money(restGmv), share: pct(restGmv, totalGmv) });
      const highest = bookings.reduce((best, b) => (!best || b.gmv > best.gmv ? b : best), null);
      const peak = WEEKDAY_SHORT.map(() => PARTNER_PEAK_HOURS.map(() => 0));
      for (const b of bookings) {
        const col = PARTNER_PEAK_HOURS.indexOf(b.hour === 0 ? 24 : b.hour);
        if (col >= 0) peak[(new Date(`${b.day}T00:00:00Z`).getUTCDay() + 6) % 7][col] += 1;
      }
      const customers = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
      const returning = customers.filter((u) => (firstDay.get(u) || win.from) < win.from).length;
      const ratingTotal = ratingRows.reduce((t, r) => t + num(r.n), 0);

      // Activity: the latest dated events for this salon.
      const activity = await run(`
        SELECT * FROM (
          SELECT 'holiday' AS kind, h.created_at AS at, DATE_FORMAT(h.holiday_date, '%Y-%m-%d') AS detail, h.reason AS note
            FROM StoreHolidays h WHERE h.store_id = :storeId AND h.created_at IS NOT NULL
          UNION ALL
          SELECT 'weekly_holiday', w.created_at, w.weekday, w.reason
            FROM StoreWeeklyHolidays w WHERE w.store_id = :storeId AND w.created_at IS NOT NULL
          UNION ALL
          SELECT 'payout', ip.paid_at, ROUND(SUM(ip.amount), 2), NULL
            FROM InvoicePayouts ip WHERE ip.store_id = :storeId AND ip.paid_at IS NOT NULL GROUP BY ip.paid_at
          UNION ALL
          SELECT 'subscription_started', pms.activated_at, pms.plan_amount, NULL
            FROM PartnerManualSubscriptions pms WHERE pms.store_id = :storeId AND pms.activated_at IS NOT NULL
          UNION ALL
          SELECT 'subscription_stopped', pms.deactivated_at, pms.plan_amount, NULL
            FROM PartnerManualSubscriptions pms WHERE pms.store_id = :storeId AND pms.deactivated_at IS NOT NULL
          UNION ALL
          SELECT 'review', r.cretaed_at, r.rating, LEFT(r.review_description, 120)
            FROM Reviews r WHERE r.store_id = :storeId AND r.cretaed_at IS NOT NULL
        ) x
        ORDER BY x.at DESC
        LIMIT 8`);

      const dir = directory.find((s) => s.id === storeId);
      const masked = store.account_number ? `•••• ${String(store.account_number).slice(-4)}` : null;
      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        data_start_date: cutoff || null,
        profile: {
          store_id: storeId,
          name: store.name,
          logo: cleanLogo(store.logo),
          type: dir?.type || "unknown",
          address: [store.addressLine1, placeLabel(store.area), placeLabel(store.district || store.city), store.state].filter(Boolean).join(", "),
          area: placeLabel(store.area),
          city: placeLabel(String(store.district || "").trim() || store.city),
          phone: store.phone ? String(store.phone) : null,
          whatsapp: store.whatsapp_number ? String(store.whatsapp_number) : null,
          email: store.email || null,
          status: store.status,
          completion_status: store.completion_status,
          is_premium: Boolean(store.is_premium),
          partner_since: store.created_day,
          payout_frequency: store.payout_frequency || "daily",
          bank: masked ? { account: masked, ifsc: store.ifsc_code || null, holder: store.bank_account_holder || null } : null,
        },
        subscription: subscription
          ? {
              status: subscription.status,
              plan_amount: money(subscription.plan_amount),
              activated_at: subscription.activated_at,
              deactivated_at: subscription.deactivated_at,
              next_due_date: subscription.next_due_date,
              outstanding_due: money(subscription.outstanding_due),
              renewal_booking_limit: subscription.renewal_booking_limit,
              cycle_state: subscription.cycle_state,
            }
          : null,
        last_payout: lastPayout ? { paid_at: lastPayout.paid_at, amount: money(lastPayout.amount) } : null,
        kpis,
        previous_kpis: kpisOf(prevBookings, win.previous),
        periods: {
          today: num(periods?.today),
          this_week: num(periods?.week),
          this_month: num(periods?.month),
          last_month: num(periods?.last_month),
        },
        trend,
        revenue_split: revenueSplit,
        highest_booking: highest ? { gmv: money(highest.gmv), day: highest.day } : null,
        top_services: serviceRows.slice(0, 5),
        booked_for: {
          self: bookings.filter((b) => !b.guest).length,
          guest: bookings.filter((b) => b.guest).length,
        },
        peak: { weekdays: WEEKDAY_SHORT, hours: PARTNER_PEAK_HOURS, values: peak },
        retention: { customers: customers.length, returning, new: customers.length - returning },
        ratings: {
          average: ratingTotal ? Number((ratingRows.reduce((t, r) => t + num(r.rating) * num(r.n), 0) / ratingTotal).toFixed(1)) : null,
          total: ratingTotal,
          bars: [5, 4, 3, 2, 1].map((stars) => {
            const n = num(ratingRows.find((r) => num(r.rating) === stars)?.n);
            return { stars, count: n, share: pct(n, ratingTotal) };
          }),
        },
        recent_bookings: recent.map((r) => ({
          id: r.id,
          day: r.day,
          time: r.time,
          customer: r.customer || null,
          phone: r.phone ? String(r.phone) : null,
          user_id: r.user_id,
          services: r.services || null,
          amount: money(r.amount),
          status: r.status === "refunded" || r.payment_status === "refunded"
            ? "refunded"
            : r.status === "cancelled"
              ? "cancelled"
              : r.status === "completed"
                ? "completed"
                : r.day >= today
                  ? "upcoming"
                  : "not_completed",
        })),
        activity: activity.map((a) => ({ kind: a.kind, at: a.at, detail: a.detail, note: a.note })),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getPartnerOverviewV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner overview");
    }
  },

  // User segments V2 (User Analytics Overview / 360): segment table, age
  // groups, lifetime spend, acquisition and booking behaviour. Segments are
  // as of the window's last day, first match wins:
  //   new       - signed up in the window
  //   loyal     - 5+ served bookings, the last within 60 days
  //   active    - booked or used the app within 30 days
  //   at_risk   - last booking / app use 31-60 days ago
  //   inactive  - nothing for 60+ days, or never
  getUserSegmentsV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 30);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { from: win.from, end: win.end, cutoff: cutoff || null, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });
      const served = `${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")}`;
      const [users, windowBookings, prevWindowBookings, gaps, prevGaps, hours, attribution, leaveReasons, checkoutReasons] = await Promise.all([
        run(`
          SELECT u.id, DATE_FORMAT(u.registered_at, '%Y-%m-%d') AS reg, u.age, u.date_of_birth, u.used_code,
            b.n AS bookings, DATE_FORMAT(b.last_day, '%Y-%m-%d') AS last_booking, b.spent,
            DATE_FORMAT(s.last_seen, '%Y-%m-%d') AS last_seen
          FROM User u
          LEFT JOIN (
            SELECT a.user_id, COUNT(*) AS n, MAX(a.booking_date) AS last_day, SUM(${AMOUNT_PAID_SQL}) AS spent
            FROM appointments a WHERE ${served} AND a.booking_date < :end GROUP BY a.user_id
          ) b ON b.user_id = u.id
          LEFT JOIN (
            SELECT user_id, MAX(last_seen_at) AS last_seen FROM UserAppSessions WHERE started_at < :end GROUP BY user_id
          ) s ON s.user_id = u.id
          WHERE u.status <> 'terminated'`),
        run(`
          SELECT a.user_id, COUNT(*) AS n, SUM(${AMOUNT_PAID_SQL}) AS amount FROM appointments a
          WHERE ${served} AND a.user_id IS NOT NULL AND a.booking_date >= :from AND a.booking_date < :end
          GROUP BY a.user_id`),
        run(
          `SELECT a.user_id, COUNT(*) AS n FROM appointments a
           WHERE ${served} AND a.user_id IS NOT NULL AND a.booking_date >= :prevFrom AND a.booking_date < :from
           GROUP BY a.user_id`,
          { prevFrom: win.previous.from }
        ),
        // Days between consecutive served bookings that end in the window.
        run(`
          SELECT DATEDIFF(r.booking_date, r.prev_date) AS gap FROM (
            SELECT a.user_id, a.booking_date,
              LAG(a.booking_date) OVER (PARTITION BY a.user_id ORDER BY a.booking_date, a.id) AS prev_date
            FROM appointments a WHERE ${served} AND a.user_id IS NOT NULL AND a.booking_date < :end
          ) r
          WHERE r.prev_date IS NOT NULL AND r.booking_date >= :from`),
        run(
          `SELECT DATEDIFF(r.booking_date, r.prev_date) AS gap FROM (
             SELECT a.user_id, a.booking_date,
               LAG(a.booking_date) OVER (PARTITION BY a.user_id ORDER BY a.booking_date, a.id) AS prev_date
             FROM appointments a WHERE ${served} AND a.user_id IS NOT NULL AND a.booking_date < :from
           ) r
           WHERE r.prev_date IS NOT NULL AND r.booking_date >= :prevFrom`,
          { prevFrom: win.previous.from }
        ),
        run(`
          SELECT HOUR(sl.\`from\`) AS hour, COUNT(*) AS n FROM appointments a
          INNER JOIN Slots sl ON sl.id = a.slot_id
          WHERE ${served} AND a.booking_date >= :from AND a.booking_date < :end
          GROUP BY HOUR(sl.\`from\`)`),
        run(`
          SELECT COALESCE(at.source, 'unknown') AS source, COUNT(*) AS users FROM UserAttribution at
          INNER JOIN User u ON u.id = at.user_id
          WHERE u.registered_at >= :from AND u.registered_at < :end
          GROUP BY COALESCE(at.source, 'unknown')`),
        run(`
          SELECT COALESCE(reason, 'other') AS reason, COUNT(*) AS n FROM UserFeedback
          WHERE type = 'account_delete' AND created_at >= :from AND created_at < :end
          GROUP BY COALESCE(reason, 'other')`),
        run(`
          SELECT COALESCE(reason, 'other') AS reason, COUNT(*) AS n FROM UserFeedback
          WHERE type = 'checkout_exit' AND created_at >= :from AND created_at < :end
          GROUP BY COALESCE(reason, 'other')`),
      ]);

      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const daysBefore = (d) => (d ? Math.round((Date.parse(win.to) - Date.parse(d)) / 864e5) : Infinity);
      const windowById = new Map(windowBookings.map((r) => [Number(r.user_id), r]));
      const lifetimeById = new Map(users.map((u) => [Number(u.id), num(u.bookings)]));

      const SEGMENTS = [
        { key: "new", label: "New Users" },
        { key: "active", label: "Active Users" },
        { key: "loyal", label: "Loyal Users" },
        { key: "at_risk", label: "At Risk Users" },
        { key: "inactive", label: "Inactive Users" },
      ];
      const segmentOf = (u) => {
        if (u.reg && u.reg >= win.from && u.reg <= win.to) return "new";
        const sinceBooking = daysBefore(u.last_booking);
        const last = Math.min(sinceBooking, daysBefore(u.last_seen));
        if (num(u.bookings) >= 5 && sinceBooking <= 60) return "loyal";
        if (last <= 30) return "active";
        if (last <= 60) return "at_risk";
        return "inactive";
      };
      const bySegment = new Map(SEGMENTS.map((s) => [s.key, { users: 0, bookings: 0, amount: 0, spent: 0 }]));
      for (const u of users) {
        const seg = bySegment.get(segmentOf(u));
        seg.users += 1;
        seg.spent += num(u.spent);
        const w = windowById.get(Number(u.id));
        if (w) {
          seg.bookings += num(w.n);
          seg.amount += num(w.amount);
        }
      }
      const segments = SEGMENTS.map((s) => {
        const v = bySegment.get(s.key);
        return {
          key: s.key,
          label: s.label,
          users: v.users,
          share: pct(v.users, users.length),
          bookings: v.bookings,
          aov: v.bookings ? money(v.amount / v.bookings) : null,
          avg_lifetime_spend: v.users ? money(v.spent / v.users) : null,
        };
      });

      // Age: User.age, else the date of birth (YYYY-MM-DD / DD-MM-YYYY / DD/MM/YYYY).
      const ageOf = (u) => {
        const age = num(u.age);
        if (age >= 10 && age <= 100) return age;
        const text = String(u.date_of_birth || "").trim();
        const m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (!m) return null;
        const year = Number(m[1].length === 4 ? m[1] : m[3]);
        const years = Number(win.to.slice(0, 4)) - year;
        return years >= 10 && years <= 100 ? years : null;
      };
      const AGE_BANDS = [
        { label: "Under 18", max: 18 },
        { label: "18 – 24", max: 25 },
        { label: "25 – 34", max: 35 },
        { label: "35 – 44", max: 45 },
        { label: "45 – 54", max: 55 },
        { label: "55+", max: Infinity },
      ];
      const ages = users.map(ageOf).filter((a) => a !== null);
      const ageGroups = AGE_BANDS.map((band, i) => {
        const n = ages.filter((a) => AGE_BANDS.findIndex((b) => a < b.max) === i).length;
        return { label: band.label, users: n, share: pct(n, ages.length) };
      });

      // Lifetime spend: how it splits across the top 20% / middle 60% / bottom 20% of spenders.
      const spenders = users.map((u) => num(u.spent)).filter((v) => v > 0).sort((a, b) => b - a);
      const spendTotal = spenders.reduce((t, v) => t + v, 0);
      // Group edges round up, so a handful of spenders still fills "Top 20%".
      const cut = (from, to) => spenders.slice(Math.ceil(spenders.length * from), Math.ceil(spenders.length * to)).reduce((t, v) => t + v, 0);
      const ltvShare = spenders.length
        ? [
            { key: "top20", label: "Top 20%", share: pct(cut(0, 0.2), spendTotal) },
            { key: "mid60", label: "Middle 60%", share: pct(cut(0.2, 0.8), spendTotal) },
            { key: "bottom20", label: "Bottom 20%", share: pct(cut(0.8, 1), spendTotal) },
          ]
        : [];

      // Acquisition: sign-ups in the window by referral code and, once the app
      // reports it, install source.
      const signups = users.filter((u) => u.reg && u.reg >= win.from && u.reg <= win.to);
      const referral = signups.filter((u) => u.used_code && String(u.used_code).trim()).length;

      // Booking behaviour (this window vs the previous one).
      const behaviourOf = (rows, gapRows) => {
        const customers = rows.length;
        const total = rows.reduce((t, r) => t + num(r.n), 0);
        const gapList = gapRows.map((g) => num(g.gap)).filter((g) => g > 0);
        return {
          customers,
          avg_bookings_per_user: customers ? Number((total / customers).toFixed(2)) : null,
          avg_days_between: gapList.length ? Math.round(gapList.reduce((t, g) => t + g, 0) / gapList.length) : null,
        };
      };
      // Customers in the window with 2+ served bookings to date.
      const repeatRate = pct(
        windowBookings.filter((r) => (lifetimeById.get(Number(r.user_id)) || 0) >= 2).length,
        windowBookings.length
      );
      const hourTotals = Array(24).fill(0);
      for (const h of hours) if (h.hour !== null) hourTotals[num(h.hour)] += num(h.n);
      const threeHour = hourTotals.map((_, h) => (h <= 21 ? hourTotals[h] + hourTotals[h + 1] + hourTotals[h + 2] : 0));
      const bestStart = threeHour.some(Boolean) ? threeHour.indexOf(Math.max(...threeHour)) : null;

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        data_start_date: cutoff || null,
        total_users: users.length,
        segments,
        age_groups: { known: ages.length, total: users.length, groups: ageGroups },
        ltv: {
          by_segment: segments.map((s) => ({ key: s.key, label: s.label, avg_lifetime_spend: s.avg_lifetime_spend })),
          share: ltvShare,
          spenders: spenders.length,
        },
        acquisition: {
          signups: signups.length,
          referral,
          organic: signups.length - referral,
          sources: attribution.map((r) => ({ source: r.source, users: num(r.users) })),
        },
        leave_reasons: leaveReasons.map((r) => ({ reason: r.reason, users: num(r.n) })),
        checkout_reasons: checkoutReasons.map((r) => ({ reason: r.reason, users: num(r.n) })),
        booking_behavior: {
          ...behaviourOf(windowBookings, gaps),
          repeat_booking_rate: repeatRate,
          preferred_time: bestStart === null ? null : `${hourName(bestStart)} – ${hourName(bestStart + 3)}`,
          previous: behaviourOf(prevWindowBookings, prevGaps),
        },
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getUserSegmentsV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user segments");
    }
  },

  // Latest sign-ups, bookings and reviews (User Analytics 360 live feed).
  getUserLiveFeedV2: async (data = {}) => {
    try {
      const limit = Math.min(Math.max(Number(data.limit) || 10, 1), 50);
      const since = addDays(toIstDatePart(new Date()), -30);
      const rows = await adminDbController.connection.query(
        `
        SELECT * FROM (
          SELECT 'signup' AS kind, u.registered_at AS at, u.id AS user_id,
            TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name, NULL AS store, NULL AS area, NULL AS detail, NULL AS amount
          FROM User u WHERE u.registered_at >= :since
          UNION ALL
          SELECT 'booking', a.created_at, a.user_id, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), s.name, pa.area,
            (SELECT COALESCE(ss.service_name, cb.combo) FROM appointment_items ai
               LEFT JOIN StoreServices ss ON ss.id = ai.service_id LEFT JOIN Combo cb ON cb.id = ai.combo_id
               WHERE ai.appointment_id = a.id ORDER BY ai.id LIMIT 1),
            ${AMOUNT_PAID_SQL}
          FROM appointments a
          LEFT JOIN User u ON u.id = a.user_id
          LEFT JOIN Store s ON s.id = a.store_id
          LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
          WHERE ${PAID_BOOKING_SQL} AND a.created_at >= :since
          UNION ALL
          SELECT 'review', r.cretaed_at, r.user_id, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), s.name, pa.area, r.rating, NULL
          FROM Reviews r
          LEFT JOIN User u ON u.id = r.user_id
          LEFT JOIN Store s ON s.id = r.store_id
          LEFT JOIN PartnerAddress pa ON pa.id = s.address_id
          WHERE r.cretaed_at >= :since AND r.status = 'active'
        ) x
        ORDER BY x.at DESC
        LIMIT :limit
        `,
        { replacements: { since, limit }, type: Sequelize.QueryTypes.SELECT }
      );
      return {
        items: rows.map((r) => ({
          kind: r.kind,
          at: r.at,
          user_id: r.user_id,
          name: r.name || null,
          store: r.store || null,
          area: placeLabel(r.area),
          detail: r.detail,
          amount: r.amount === null ? null : Number(Number(r.amount).toFixed(2)),
        })),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getUserLiveFeedV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch live activity");
    }
  },

  // Behavior Analytics V2. Server-side signals now (sessions, screen views,
  // salon views, coupons, checkouts, bookings); app events (filters, taps)
  // add to the same numbers once the app sends them. include_list =
  // viewed_not_booked | checkout_unpaid | offer_not_booked | inactive_7d
  // returns that opportunity's users for a push / contact export.
  getBehaviorAnalyticsV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 7);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const f = adminDbController.app.getUserAnalyticsFilters(data, cutoff);
      const today = toIstDatePart(new Date());
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { ...f.replacements, from: win.from, end: win.end, cutoff: cutoff || null, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });
      const pf = f.platformWhere("s");
      const oppFrom = addDays(win.to, -6);
      const served = `${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")}`;

      const sessionStats = (w) =>
        run(
          `SELECT COUNT(*) AS sessions, COUNT(DISTINCT s.user_id) AS users, AVG(${SESSION_SECONDS_SQL}) AS avg_seconds
           FROM UserAppSessions s WHERE s.started_at >= :wFrom AND s.started_at < :wEnd ${pf}`,
          { wFrom: w.from, wEnd: w.end }
        );
      const eventStats = (w) =>
        run(
          `SELECT COALESCE(SUM(event = 'salon_view' OR (event = 'screen_view' AND screen = 'salon_details' AND source = 'app')), 0) AS views
           FROM UserEvents WHERE created_at >= :wFrom AND created_at < :wEnd`,
          { wFrom: w.from, wEnd: w.end }
        );
      const completedStats = (w) =>
        run(
          `SELECT COUNT(*) AS completed FROM appointments a
           WHERE ${served} AND a.status = 'completed' AND a.booking_date >= :wFrom AND a.booking_date < :wEnd`,
          { wFrom: w.from, wEnd: w.end }
        );

      const [
        [sess],
        [prevSess],
        [views],
        [prevViews],
        [completed],
        [prevCompleted],
        activeDays,
        sessionLengths,
        items,
        eventRows,
        checkoutRows,
        feedback,
        categoryRows,
        [since],
      ] = await Promise.all([
        sessionStats(win),
        sessionStats(win.previous),
        eventStats(win),
        eventStats(win.previous),
        completedStats(win),
        completedStats(win.previous),
        adminDbController.app.getUserActiveDays(win.previous.from, win.end, f),
        run(`SELECT ${SESSION_SECONDS_SQL} AS seconds FROM UserAppSessions s WHERE s.started_at >= :from AND s.started_at < :end ${pf}`),
        adminDbController.app.getBookingItems(win, f),
        run(`
          SELECT e.user_id, e.event, e.screen, e.element, e.store_id, e.meta, e.source,
            DATE_FORMAT(e.created_at, '%Y-%m-%d') AS day, e.created_at AS at
          FROM UserEvents e
          WHERE e.created_at >= :from AND e.created_at < :end`),
        run(`
          SELECT a.user_id, a.id, a.created_at AS at, DATE_FORMAT(a.created_at, '%Y-%m-%d') AS day,
            (${PAYMENT_MADE_SQL}) AS paid
          FROM appointments a
          WHERE a.user_id IS NOT NULL AND a.created_at >= :from AND a.created_at < :end AND ${bookingFloorSql("a")}`),
        run(`
          SELECT COALESCE(reason, 'other') AS reason, COUNT(*) AS n FROM UserFeedback
          WHERE type = 'checkout_exit' AND created_at >= :from AND created_at < :end
          GROUP BY COALESCE(reason, 'other')`),
        run(`SELECT id, name FROM Servicecategory`),
        run(`
          SELECT (SELECT DATE_FORMAT(MIN(started_at), '%Y-%m-%d') FROM UserAppSessions) AS activity_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserEvents) AS events_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserEvents WHERE source = 'app') AS app_events_since`),
      ]);

      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const parseMeta = (m) => {
        try {
          return m ? JSON.parse(m) : {};
        } catch {
          return {};
        }
      };

      // Active users / DAU per window.
      const activeIn = (w) => {
        const users = new Set();
        let sum = 0;
        let days = 0;
        for (let d = w.from; d <= w.to && d <= today; d = addDays(d, 1)) {
          const ids = activeDays.get(d) || [];
          ids.forEach((id) => users.add(id));
          sum += ids.length;
          days += 1;
        }
        return { users: users.size, dau: days ? Number((sum / days).toFixed(1)) : null };
      };
      const act = activeIn(win);
      const prevAct = activeIn(win.previous);
      const tracked = Boolean(since?.activity_since);
      const kpis = {
        active_users: tracked ? act.users : null,
        dau: tracked ? act.dau : null,
        sessions: tracked ? num(sess?.sessions) : null,
        avg_session_seconds: num(sess?.sessions) ? Math.round(num(sess.avg_seconds)) : null,
        salon_views: since?.events_since ? num(views?.views) : null,
        bookings_completed: num(completed?.completed),
      };
      const previousKpis = {
        active_users: tracked ? prevAct.users : null,
        dau: tracked ? prevAct.dau : null,
        sessions: tracked ? num(prevSess?.sessions) : null,
        avg_session_seconds: num(prevSess?.sessions) ? Math.round(num(prevSess.avg_seconds)) : null,
        salon_views: since?.events_since ? num(prevViews?.views) : null,
        bookings_completed: num(prevCompleted?.completed),
      };

      // Booking frequency (served bookings per month in the window).
      const bookings = adminDbController.app.rollUpBookings(items);
      const customerIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
      const history = customerIds.length
        ? await run(
            `SELECT a.user_id, a.id, DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS day, HOUR(sl.\`from\`) AS hour,
               ${ITEM_GMV_SQL} AS gmv, COALESCE(ss.service_category, cb.service_category) AS category_id,
               COALESCE(ss.service_name, cb.combo) AS service_name
             FROM appointments a
             INNER JOIN appointment_items ai ON ai.appointment_id = a.id
             LEFT JOIN StoreServices ss ON ss.id = ai.service_id
             LEFT JOIN Combo cb ON cb.id = ai.combo_id
             LEFT JOIN Slots sl ON sl.id = a.slot_id
             WHERE ${served} AND a.user_id IN (:customerIds) AND a.booking_date < :end`,
            { customerIds }
          )
        : [];
      const historyByUser = new Map();
      for (const h of history) {
        const list = historyByUser.get(h.user_id) || [];
        list.push(h);
        historyByUser.set(h.user_id, list);
      }
      const months = Math.max(1, win.days / 30);
      const windowCount = new Map();
      for (const b of bookings) if (b.user_id) windowCount.set(b.user_id, (windowCount.get(b.user_id) || 0) + 1);
      const FREQ = [
        { key: "1", label: "1 time / month" },
        { key: "2", label: "2 times / month" },
        { key: "3", label: "3 times / month" },
        { key: "4+", label: "4+ times / month" },
        { key: "irregular", label: "Irregular (back after 60+ days)" },
      ];
      const freqCounts = Object.fromEntries(FREQ.map((x) => [x.key, 0]));
      for (const [userId, n] of windowCount) {
        const days = [...new Set((historyByUser.get(userId) || []).map((h) => h.day))].sort();
        const firstInWindow = days.find((d) => d >= win.from);
        const before = days.filter((d) => d < firstInWindow);
        const gap = before.length ? (Date.parse(firstInWindow) - Date.parse(before[before.length - 1])) / 864e5 : 0;
        if (n === 1 && gap > 60) freqCounts.irregular += 1;
        else {
          const rate = n / months;
          freqCounts[rate < 1.5 ? "1" : rate < 2.5 ? "2" : rate < 3.5 ? "3" : "4+"] += 1;
        }
      }
      const frequency = FREQ.map((x) => ({ ...x, users: freqCounts[x.key], share: pct(freqCounts[x.key], windowCount.size) }));

      // Service segments: each customer's most booked kind of service.
      const categoryName = new Map(categoryRows.map((c) => [Number(c.id), String(c.name || "")]));
      // Matched on the service name first, then its category; premium wins
      // ("Keratin" in a "Hair Treatments" category is premium, not a haircut).
      const KINDS = [
        { key: "premium", label: "Premium Care", sub: "Smoothening, Keratin, Colour, Bridal", re: /smooth|keratin|botox|colou?r|bridal|make ?up|rebond|treatment|extension|straighten/i },
        { key: "relax", label: "Relaxation", sub: "Massage, Spa, Head Massage", re: /massage|\bspa\b|head|relax|pedicure|manicure/i },
        { key: "face", label: "Face Care", sub: "Facial, Clean up, D-Tan", re: /facial|clean ?up|d-?tan|\bface\b|thread|bleach|skin/i },
        { key: "basic", label: "Basic Grooming", sub: "Haircut, Trim, Shave", re: /hair ?cut|beard|shave|trim|groom|\bkids?\b|\bmen'?s?\b/i },
      ];
      const DISPLAY_ORDER = ["basic", "face", "relax", "premium"];
      const kindOf = (categoryId, serviceName) => {
        const byName = KINDS.find((k) => k.re.test(serviceName || ""));
        if (byName) return byName.key;
        return KINDS.find((k) => k.re.test(categoryName.get(Number(categoryId)) || ""))?.key || "other";
      };
      const userKind = new Map();
      for (const b of bookings) {
        if (!b.user_id) continue;
        const tally = userKind.get(b.user_id) || { counts: {}, gmv: 0, bookings: 0 };
        for (const it of b.items) {
          const k = kindOf(it.category_id, it.label);
          tally.counts[k] = (tally.counts[k] || 0) + 1;
        }
        tally.gmv += b.gmv;
        tally.bookings += 1;
        userKind.set(b.user_id, tally);
      }
      const kindRows = [...DISPLAY_ORDER.map((key) => KINDS.find((k) => k.key === key)), { key: "other", label: "Others", sub: "" }].map((k) => {
        const members = [...userKind.values()].filter((t) => Object.entries(t.counts).sort((a, b) => b[1] - a[1])[0]?.[0] === k.key);
        const bookingsN = members.reduce((t, m) => t + m.bookings, 0);
        return {
          key: k.key,
          label: k.label,
          sub: k.sub,
          users: members.length,
          share: pct(members.length, userKind.size),
          aov: bookingsN ? money(members.reduce((t, m) => t + m.gmv, 0) / bookingsN) : null,
        };
      });

      // Intent signals and pricing behaviour (users in the window).
      const viewsByUser = new Map();
      const usersWith = (pred) => new Set(eventRows.filter(pred).map((e) => e.user_id));
      for (const e of eventRows) {
        if (e.event !== "salon_view" || !e.store_id) continue;
        const v = viewsByUser.get(e.user_id) || { stores: new Set(), byDay: new Map() };
        v.stores.add(e.store_id);
        const dayStores = v.byDay.get(e.day) || new Set();
        dayStores.add(e.store_id);
        v.byDay.set(e.day, dayStores);
        viewsByUser.set(e.user_id, v);
      }
      const priceUsers = usersWith((e) => {
        const m = parseMeta(e.meta);
        return (e.event === "screen_view" && (/price/i.test(m.sort || "") || m.minPrice || m.maxPrice)) || (e.event === "filter" && (/price/i.test(e.element || "") || m.min_price || m.max_price));
      });
      const ratingUsers = usersWith((e) => {
        const m = parseMeta(e.meta);
        return (e.event === "screen_view" && (/rating/i.test(m.sort || "") || m.minRating)) || (e.event === "filter" && (/rating/i.test(e.element || "") || m.min_rating));
      });
      const offerUsers = usersWith((e) => (e.event === "screen_view" && e.screen === "offers") || e.event === "coupon_apply" || e.event === "coupon_attempt_failed");
      const couponUsers = usersWith((e) => e.event === "coupon_apply");
      const compareUsers = new Set([...viewsByUser].filter(([, v]) => [...v.byDay.values()].some((s) => s.size >= 2)).map(([u]) => u));
      const checkoutByUser = new Map();
      for (const c of checkoutRows) {
        const v = checkoutByUser.get(c.user_id) || { paid: false, rows: [] };
        if (num(c.paid)) v.paid = true;
        v.rows.push(c);
        checkoutByUser.set(c.user_id, v);
      }
      const unpaidUsers = new Set([...checkoutByUser].filter(([, v]) => !v.paid).map(([u]) => u));
      const base = act.users || new Set(eventRows.map((e) => e.user_id)).size;
      const intent = [
        { key: "viewed_3", label: "Viewed 3+ salons", users: [...viewsByUser.values()].filter((v) => v.stores.size >= 3).length },
        { key: "price_filter", label: "Filtered or sorted by price", users: priceUsers.size },
        { key: "unpaid_checkout", label: "Started checkout but didn't pay", users: unpaidUsers.size },
        { key: "offers", label: "Checked offers & coupons", users: offerUsers.size },
        { key: "coupon", label: "Applied a coupon", users: couponUsers.size },
      ].map((r) => ({ ...r, share: pct(r.users, base) }));
      const anyPricing = new Set([...priceUsers, ...offerUsers, ...ratingUsers, ...compareUsers]);
      const pricing = [
        { key: "compare", label: "Compared 2+ salons in a day", users: compareUsers.size },
        { key: "price", label: "Filtered / sorted by price", users: priceUsers.size },
        { key: "offers", label: "Looked for offers / coupons", users: offerUsers.size },
        { key: "rating", label: "Sorted / filtered by rating", users: ratingUsers.size },
        { key: "none", label: "No comparison behaviour", users: Math.max(0, base - anyPricing.size) },
      ].map((r) => ({ ...r, share: pct(r.users, base) }));

      // Time per session.
      const SESSION_BANDS = [
        { label: "0 – 30 sec", max: 30 },
        { label: "30 sec – 1 min", max: 60 },
        { label: "1 – 2 min", max: 120 },
        { label: "2 – 5 min", max: 300 },
        { label: "5 – 10 min", max: 600 },
        { label: "10+ min", max: Infinity },
      ];
      const lengths = sessionLengths.map((r) => num(r.seconds));
      const timeSpent = SESSION_BANDS.map((band, i) => {
        const n = lengths.filter((s) => SESSION_BANDS.findIndex((b) => s < b.max) === i).length;
        return { label: band.label, sessions: n, share: pct(n, lengths.length) };
      });

      // High-value services: highest average booking value (3+ bookings).
      const serviceStats = new Map();
      for (const b of bookings) {
        for (const it of b.items) {
          const s = serviceStats.get(it.key) || { key: it.key, name: it.label, users: new Set(), gmv: 0, items: 0 };
          s.users.add(b.user_id);
          s.gmv += it.gmv;
          s.items += 1;
          serviceStats.set(it.key, s);
        }
      }
      const lifetimeService = new Map();
      for (const h of history) {
        const k = `${h.user_id}|${placeKey(h.service_name) || "unknown"}`;
        lifetimeService.set(k, (lifetimeService.get(k) || 0) + 1);
      }
      const highValue = [...serviceStats.values()]
        .filter((s) => s.items >= 3)
        .map((s) => {
          const usersList = [...s.users].filter(Boolean);
          const repeaters = usersList.filter((u) => (lifetimeService.get(`${u}|${s.key}`) || 0) >= 2).length;
          return { key: s.key, name: s.name, users: usersList.length, aov: money(s.gmv / s.items), repeat_rate: pct(repeaters, usersList.length) };
        })
        .sort((a, b) => b.aov - a.aov)
        .slice(0, 5);

      // Booking speed: first salon view of the day -> checkout.
      const firstViewAt = new Map();
      for (const e of eventRows) {
        if (e.event !== "salon_view") continue;
        const k = `${e.user_id}|${e.day}`;
        const t = new Date(e.at).getTime();
        if (!firstViewAt.has(k) || t < firstViewAt.get(k)) firstViewAt.set(k, t);
      }
      const speeds = [];
      for (const c of checkoutRows) {
        const start = firstViewAt.get(`${c.user_id}|${c.day}`);
        const t = new Date(c.at).getTime();
        if (start && t >= start) speeds.push((t - start) / 60000);
      }
      const speed = [
        { key: "fast", label: "Fast (< 2 min)", users: speeds.filter((m) => m < 2).length },
        { key: "medium", label: "Medium (2 – 5 min)", users: speeds.filter((m) => m >= 2 && m <= 5).length },
        { key: "slow", label: "Slow (> 5 min)", users: speeds.filter((m) => m > 5).length },
      ].map((r) => ({ ...r, share: pct(r.users, speeds.length) }));

      // Lifestyle groups (rules, first match): spend -> cadence -> timing.
      const LIFESTYLE = [
        { key: "self_care", label: "Self Care Lovers", traits: "High spend or 3+ kinds of service" },
        { key: "regular", label: "Regular Maintainers", traits: "Books every 10–35 days" },
        { key: "busy", label: "Busy Professionals", traits: "Books evenings (7 PM+) or weekends" },
        { key: "occasional", label: "Occasional Users", traits: "Books rarely" },
      ];
      const lifestyleOf = (rows) => {
        const byBooking = new Map();
        for (const r of rows) {
          const b = byBooking.get(r.id) || { day: r.day, hour: r.hour === null ? null : num(r.hour), gmv: 0, cats: new Set() };
          b.gmv += num(r.gmv);
          if (r.category_id !== null) b.cats.add(r.category_id);
          byBooking.set(r.id, b);
        }
        const list = [...byBooking.values()].sort((a, b) => a.day.localeCompare(b.day));
        const avgGmv = list.reduce((t, b) => t + b.gmv, 0) / (list.length || 1);
        const kinds = new Set(list.flatMap((b) => [...b.cats]));
        if (avgGmv >= 800 || kinds.size >= 3) return { key: "self_care", list };
        const gaps = list.slice(1).map((b, i) => (Date.parse(b.day) - Date.parse(list[i].day)) / 864e5);
        const avgGap = gaps.length ? gaps.reduce((t, g) => t + g, 0) / gaps.length : null;
        if (list.length >= 3 && avgGap >= 10 && avgGap <= 35) return { key: "regular", list };
        const lateOrWeekend = list.filter((b) => (b.hour !== null && b.hour >= 19) || [0, 6].includes(new Date(`${b.day}T00:00:00Z`).getUTCDay()));
        if (list.length && lateOrWeekend.length / list.length >= 0.5) return { key: "busy", list };
        return { key: "occasional", list };
      };
      const lifestyleCounts = new Map(LIFESTYLE.map((l) => [l.key, { users: 0, hours: Array(24).fill(0) }]));
      for (const userId of customerIds) {
        const { key, list } = lifestyleOf(historyByUser.get(userId) || []);
        const entry = lifestyleCounts.get(key);
        entry.users += 1;
        for (const b of list) if (b.hour !== null) entry.hours[b.hour] += 1;
      }
      const lifestyle = LIFESTYLE.map((l) => {
        const entry = lifestyleCounts.get(l.key);
        const three = entry.hours.map((_, h) => (h <= 21 ? entry.hours[h] + entry.hours[h + 1] + entry.hours[h + 2] : 0));
        const best = three.some(Boolean) ? three.indexOf(Math.max(...three)) : null;
        return {
          ...l,
          users: entry.users,
          share: pct(entry.users, customerIds.length),
          best_time: best === null ? null : `${hourName(best)} – ${hourName(best + 3)}`,
        };
      });

      // Timeline: the latest customer who paid, their day step by step.
      const lastPaid = [...checkoutRows].filter((c) => num(c.paid)).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
      const timeline = lastPaid
        ? [
            ...eventRows
              .filter((e) => e.user_id === lastPaid.user_id && e.day === lastPaid.day && new Date(e.at) <= new Date(lastPaid.at))
              .map((e) => ({ at: e.at, kind: e.event, screen: e.screen, element: e.element, store_id: e.store_id })),
            { at: lastPaid.at, kind: "booking", screen: null, element: null, store_id: null },
          ]
            .sort((a, b) => new Date(a.at) - new Date(b.at))
            .slice(-8)
        : [];

      // Opportunities over the window's last 7 days.
      const recent = (e) => e.day >= oppFrom;
      const paidRecent = new Set(checkoutRows.filter((c) => c.day >= oppFrom && num(c.paid)).map((c) => c.user_id));
      const checkoutRecent = new Set(checkoutRows.filter((c) => c.day >= oppFrom).map((c) => c.user_id));
      const viewedNotBooked = new Set(eventRows.filter((e) => recent(e) && e.event === "salon_view" && !checkoutRecent.has(e.user_id)).map((e) => e.user_id));
      const unpaidRecent = new Set([...checkoutRecent].filter((u) => !paidRecent.has(u)));
      const offerNotBooked = new Set(
        eventRows
          .filter((e) => recent(e) && ((e.event === "screen_view" && e.screen === "offers") || e.event === "coupon_apply") && !paidRecent.has(e.user_id))
          .map((e) => e.user_id)
      );
      const inactiveRows = await run(
        `SELECT user_id FROM UserAppSessions GROUP BY user_id
         HAVING MAX(last_seen_at) < :sevenAgo AND MAX(last_seen_at) >= :thirtyAgo`,
        { sevenAgo: addDays(win.to, -6), thirtyAgo: addDays(win.to, -29) }
      );
      const inactive7 = new Set(inactiveRows.map((r) => r.user_id));
      const OPPORTUNITIES = [
        { key: "viewed_not_booked", label: "Viewed a salon but didn't book", set: viewedNotBooked },
        { key: "checkout_unpaid", label: "Started checkout but didn't pay", set: unpaidRecent },
        { key: "offer_not_booked", label: "Checked offers but didn't book", set: offerNotBooked },
        { key: "inactive_7d", label: "Inactive for 7+ days", set: inactive7 },
      ];
      if (data.include_list) {
        const opp = OPPORTUNITIES.find((o) => o.key === data.include_list);
        if (!opp) throw Error.BadRequest("include_list must be one of the opportunity keys");
        const ids = [...opp.set].filter(Boolean);
        const users = ids.length
          ? await run(`SELECT id, firstname, lastname, phone, gender FROM User WHERE id IN (:ids) AND status <> 'terminated'`, { ids })
          : [];
        return {
          list: opp.key,
          rows: users.map((u) => ({
            user_id: u.id,
            name: [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || null,
            phone: u.phone ? String(u.phone) : null,
            gender: u.gender && String(u.gender).toLowerCase() !== "null" ? String(u.gender).trim() : null,
          })),
        };
      }

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        data_start_date: cutoff || null,
        activity_since: since?.activity_since || null,
        events_since: since?.events_since || null,
        app_events_since: since?.app_events_since || null,
        kpis,
        previous_kpis: previousKpis,
        frequency,
        service_segments: kindRows,
        intent: { base, rows: intent },
        pricing: { base, rows: pricing },
        time_spent: timeSpent,
        high_value: highValue,
        speed: { checkouts: speeds.length, fast_share: pct(speeds.filter((m) => m < 2).length, speeds.length), rows: speed },
        drop_reasons: feedback.map((r) => ({ reason: r.reason, users: num(r.n) })),
        lifestyle,
        timeline,
        opportunities: { from: oppFrom, to: win.to, rows: OPPORTUNITIES.map((o) => ({ key: o.key, label: o.label, users: o.set.size })) },
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getBehaviorAnalyticsV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch behavior analytics");
    }
  },

  // Click & Interaction V2. "Interactions" = screen views (logged by the
  // backend, or sent by the app) + taps the app sends + actions the backend
  // serves (salon views, coupon attempts). Tap positions, gestures, time to
  // tap and rage taps exist only once the app sends events; until then
  // those parts are null / empty. platform / app_version filter the events.
  getClickInteractionV2: async (data = {}) => {
    try {
      const win = resolveAnalyticsWindow(data, 7);
      const { dashboard_data_start_date: cutoff } = await adminDbController.app.getDashboardSettings();
      const requested = String(data.platform || "").trim().toLowerCase();
      const platform = USER_ANALYTICS_PLATFORMS.includes(requested) ? requested : null;
      const appVersion = /^[0-9A-Za-z.+_-]{1,20}$/.test(String(data.app_version || "")) ? String(data.app_version) : null;
      const eventFilter = `${platform ? "AND e.platform = :platform" : ""} ${appVersion ? "AND e.app_version = :appVersion" : ""}`;
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { from: win.from, end: win.end, platform, appVersion, cutoff: cutoff || null, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });
      const INTERACTIONS = "('screen_view', 'tap', 'salon_view', 'coupon_apply', 'coupon_attempt_failed', 'search', 'filter', 'cart', 'checkout_step')";
      const kpiOf = (w) =>
        run(
          `SELECT COALESCE(SUM(e.event IN ${INTERACTIONS}), 0) AS interactions,
             COUNT(DISTINCT CASE WHEN e.event IN ${INTERACTIONS} THEN e.user_id END) AS users,
             COALESCE(SUM(e.event = 'tap'), 0) AS taps,
             AVG(CASE WHEN e.event = 'tap' THEN e.value END) AS avg_ms_to_tap,
             COALESCE(SUM(e.event = 'rage_tap'), 0) AS rage_taps,
             COALESCE(SUM(e.event = 'coupon_attempt_failed'), 0) AS failed_coupons
           FROM UserEvents e WHERE e.created_at >= :wFrom AND e.created_at < :wEnd ${eventFilter}`,
          { wFrom: w.from, wEnd: w.end }
        );

      const [[cur], [prev], events, checkouts, bookingCounts, versions, [since]] = await Promise.all([
        kpiOf(win),
        kpiOf(win.previous),
        run(`
          SELECT e.user_id, e.event, e.screen, e.element, e.x, e.y, e.value, e.platform, e.source,
            DATE_FORMAT(e.created_at, '%Y-%m-%d') AS day, e.created_at AS at
          FROM UserEvents e
          WHERE e.created_at >= :from AND e.created_at < :end ${eventFilter}
          ORDER BY e.created_at`),
        run(`
          SELECT a.user_id, DATE_FORMAT(a.created_at, '%Y-%m-%d') AS day, (${PAYMENT_MADE_SQL}) AS paid, a.payment_status
          FROM appointments a
          WHERE a.user_id IS NOT NULL AND a.created_at >= :from AND a.created_at < :end AND ${bookingFloorSql("a")}`),
        run(`
          SELECT a.user_id, COUNT(*) AS n FROM appointments a
          WHERE ${ACTIVE_BOOKING_SQL} AND ${bookingFloorSql("a")} AND a.user_id IS NOT NULL AND a.booking_date < :end
          GROUP BY a.user_id`),
        run(`
          SELECT app_version, COUNT(*) AS n FROM UserEvents
          WHERE app_version IS NOT NULL AND created_at >= :from AND created_at < :end
          GROUP BY app_version ORDER BY n DESC LIMIT 20`),
        run(`
          SELECT (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserEvents WHERE event = 'screen_view') AS screens_since,
                 (SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') FROM UserEvents WHERE source = 'app') AS app_events_since`),
      ]);

      const num = (v) => Number(v) || 0;
      const pct = (part, whole) => (whole ? Number(((part / whole) * 100).toFixed(1)) : null);
      const appEvents = Boolean(since?.app_events_since);
      const kpis = (k) => ({
        interactions: num(k?.interactions),
        unique_users: num(k?.users),
        avg_per_user: num(k?.users) ? Number((num(k.interactions) / num(k.users)).toFixed(1)) : null,
        taps: appEvents ? num(k?.taps) : null,
        avg_seconds_to_tap: k?.avg_ms_to_tap === null || k?.avg_ms_to_tap === undefined ? null : Number((num(k.avg_ms_to_tap) / 1000).toFixed(2)),
        repeated_attempts: num(k?.rage_taps) + num(k?.failed_coupons),
      });

      // Screens: views, unique users, average time (app screen_view durations).
      const SCREEN_LABELS = {
        home: "Home Screen",
        search: "Search Screen",
        salon_list: "Salon List",
        map: "Map",
        salon_details: "Salon Details",
        slots: "Slot Selection",
        offers: "Offers & Coupons",
        checkout: "Checkout",
        payment: "Payment Screen",
        payment_success: "Booking Confirmation",
        bookings: "My Bookings",
        favourites: "Favourites",
        reviews: "Reviews",
        profile: "Profile",
        wallet: "Wallet",
        notifications: "Notifications",
      };
      const labelOf = (screen) => SCREEN_LABELS[screen] || placeLabel(String(screen || "").replace(/_/g, " ")) || "Other";
      const screenViews = events.filter((e) => e.event === "screen_view" && e.screen);
      const screens = new Map();
      for (const e of screenViews) {
        const s = screens.get(e.screen) || { screen: e.screen, views: 0, users: new Set(), durations: [] };
        s.views += 1;
        s.users.add(e.user_id);
        if (e.source === "app" && num(e.value) > 0) s.durations.push(num(e.value));
        screens.set(e.screen, s);
      }
      const totalViews = screenViews.length;
      const screenRows = [...screens.values()]
        .sort((a, b) => b.views - a.views)
        .map((s) => ({
          screen: s.screen,
          label: labelOf(s.screen),
          views: s.views,
          share: pct(s.views, totalViews),
          unique_users: s.users.size,
          avg_seconds: s.durations.length ? Math.round(s.durations.reduce((t, d) => t + d, 0) / s.durations.length / 1000) : null,
        }));

      // Tap heatmaps per screen (app taps, 8 x 16 grid of the screen).
      const taps = events.filter((e) => e.event === "tap" && e.x !== null && e.y !== null);
      const heatmaps = {};
      for (const e of taps) {
        const h = (heatmaps[e.screen || "other"] ||= new Map());
        const cx = Math.min(7, Math.floor(num(e.x) * 8));
        const cy = Math.min(15, Math.floor(num(e.y) * 16));
        const k = `${cx},${cy}`;
        h.set(k, (h.get(k) || 0) + 1);
      }
      const heatmapOut = Object.fromEntries(
        Object.entries(heatmaps).map(([screen, cells]) => {
          const max = Math.max(...cells.values());
          return [
            screen,
            [...cells]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 14)
              .map(([k, n]) => {
                const [cx, cy] = k.split(",").map(Number);
                return { x: Number(((cx + 0.5) / 8).toFixed(3)), y: Number(((cy + 0.5) / 16).toFixed(3)), taps: n, weight: Number((n / max).toFixed(2)) };
              }),
          ];
        })
      );

      // Top elements: app taps by element; until the app sends taps, the
      // actions the backend sees.
      const elementCounts = new Map();
      if (taps.length || events.some((e) => e.event === "tap")) {
        for (const e of events) if (e.event === "tap" && e.element) elementCounts.set(e.element, (elementCounts.get(e.element) || 0) + 1);
      } else {
        const count = (pred) => events.filter(pred).length;
        elementCounts.set("Salon card (opened salon)", count((e) => e.event === "salon_view"));
        elementCounts.set("Search", count((e) => e.event === "screen_view" && e.screen === "search"));
        elementCounts.set("Offers", count((e) => e.event === "screen_view" && e.screen === "offers"));
        elementCounts.set("Time slot (opened slots)", count((e) => e.event === "screen_view" && e.screen === "slots"));
        elementCounts.set("Apply coupon", count((e) => e.event === "coupon_apply" || e.event === "coupon_attempt_failed"));
        elementCounts.set("Book now (checkout)", checkouts.length);
      }
      const elementTotal = [...elementCounts.values()].reduce((t, n) => t + n, 0);
      const elements = [...elementCounts]
        .filter(([, n]) => n)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([element, n]) => ({ element: placeLabel(String(element).replace(/_/g, " ")) || element, clicks: n, share: pct(n, elementTotal) }));

      // Journeys: each user-day's screens in order, repeats collapsed, the
      // first four steps.
      const journeys = new Map();
      for (const e of screenViews) {
        const k = `${e.user_id}|${e.day}`;
        const path = journeys.get(k) || [];
        if (path[path.length - 1] !== e.screen) path.push(e.screen);
        journeys.set(k, path);
      }
      const pathCounts = new Map();
      for (const path of journeys.values()) {
        if (path.length < 2) continue;
        const key = path.slice(0, 4).join(">");
        pathCounts.set(key, (pathCounts.get(key) || 0) + 1);
      }
      const multiStep = [...journeys.values()].filter((p) => p.length >= 2).length;
      const flows = [...pathCounts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, n]) => ({ steps: key.split(">").map(labelOf), sessions: n, share: pct(n, multiStep) }));

      // Tap intensity by vertical band of the screen.
      const BANDS = [
        { key: "top", label: "Top Section", max: 0.15 },
        { key: "search", label: "Search & Filters", max: 0.3 },
        { key: "content", label: "Salon / Content Area", max: 0.75 },
        { key: "cta", label: "Bottom Actions (CTAs)", max: 0.92 },
        { key: "nav", label: "Navigation Bar", max: Infinity },
      ];
      const areas = BANDS.map((band, i) => {
        const n = taps.filter((e) => BANDS.findIndex((b) => num(e.y) < b.max) === i).length;
        return { key: band.key, label: band.label, taps: n, share: pct(n, taps.length) };
      });

      // Repeated attempts: rage taps by element, failed coupon codes,
      // checkouts that weren't paid, and extra checkouts the same day.
      const rageRows = new Map();
      const addRage = (label, userId) => {
        const r = rageRows.get(label) || { element: label, attempts: 0, users: new Set() };
        r.attempts += 1;
        r.users.add(userId);
        rageRows.set(label, r);
      };
      for (const e of events) {
        if (e.event === "rage_tap") addRage(placeLabel(String(e.element || "Unknown").replace(/_/g, " ")) || "Unknown", e.user_id);
        if (e.event === "coupon_attempt_failed") addRage("Apply Coupon (invalid code)", e.user_id);
      }
      const checkoutsPerDay = new Map();
      for (const c of checkouts) {
        if (!num(c.paid) && c.payment_status === "failed") addRage("Proceed to Pay (not paid)", c.user_id);
        const k = `${c.user_id}|${c.day}`;
        checkoutsPerDay.set(k, (checkoutsPerDay.get(k) || 0) + 1);
      }
      for (const [k, n] of checkoutsPerDay) for (let i = 1; i < n; i += 1) addRage("Book Now (retried same day)", Number(k.split("|")[0]));
      const repeated = [...rageRows.values()]
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 6)
        .map((r) => ({ element: r.element, attempts: r.attempts, users: r.users.size }));

      // Gestures (app).
      const gestureMap = new Map();
      for (const e of events) {
        if (e.event !== "gesture") continue;
        const g = gestureMap.get(e.element) || { gesture: placeLabel(String(e.element || "other").replace(/_/g, " ")), users: new Set(), events: 0 };
        g.users.add(e.user_id);
        g.events += 1;
        gestureMap.set(e.element, g);
      }
      const gestureUsers = new Set(events.filter((e) => e.event === "gesture").map((e) => e.user_id)).size;
      const gestures = [...gestureMap.values()]
        .sort((a, b) => b.users.size - a.users.size)
        .map((g) => ({ gesture: g.gesture, users: g.users.size, events: g.events, share: pct(g.users.size, gestureUsers) }));

      // Drop-off after a click: salon details -> checkout -> payment -> success.
      const usersOn = (screen) => new Set(screenViews.filter((e) => e.screen === screen).map((e) => e.user_id));
      const steps = [
        { key: "salon_details", label: "Salon Details", users: usersOn("salon_details") },
        { key: "checkout", label: "Checkout", users: new Set([...usersOn("checkout"), ...checkouts.map((c) => c.user_id)]) },
        // Anyone who paid passed the payment step (wallet payments skip the screen's API).
        {
          key: "payment",
          label: "Payment",
          users: new Set([...usersOn("payment"), ...checkouts.filter((c) => num(c.paid)).map((c) => c.user_id)]),
        },
        { key: "payment_success", label: "Success", users: new Set(checkouts.filter((c) => num(c.paid)).map((c) => c.user_id)) },
      ];
      const dropOffs = steps.slice(1).map((s, i) => {
        const before = steps[i].users.size;
        const dropped = Math.max(0, before - s.users.size);
        return { step: `${steps[i].label} → ${s.label}`, dropped, of: before, rate: pct(dropped, before) };
      });

      // Behaviour by customer type (served bookings to date).
      const lifetime = new Map(bookingCounts.map((r) => [r.user_id, num(r.n)]));
      const typeOf = (userId) => {
        const n = lifetime.get(userId) || 0;
        return n >= 5 ? "loyal" : n >= 2 ? "active" : "new";
      };
      const perUserDay = new Map();
      for (const e of events) {
        if (!INTERACTIONS.includes(`'${e.event}'`)) continue;
        const k = `${e.user_id}|${e.day}`;
        const v = perUserDay.get(k) || { user: e.user_id, n: 0, screens: new Set() };
        v.n += 1;
        if (e.screen) v.screens.add(e.screen);
        perUserDay.set(k, v);
      }
      const rageUsers = new Set([...rageRows.values()].flatMap((r) => [...r.users]));
      const paidUsers = new Set(checkouts.filter((c) => num(c.paid)).map((c) => c.user_id));
      const tapMs = new Map();
      for (const e of events) {
        if (e.event !== "tap" || e.value === null) continue;
        const t = tapMs.get(e.user_id) || [];
        t.push(num(e.value));
        tapMs.set(e.user_id, t);
      }
      const byType = ["new", "active", "loyal"].map((type) => {
        const days = [...perUserDay.values()].filter((v) => typeOf(v.user) === type);
        const users = new Set(days.map((v) => v.user));
        const ms = [...users].flatMap((u) => tapMs.get(u) || []);
        return {
          type,
          users: users.size,
          interactions_per_session: days.length ? Number((days.reduce((t, v) => t + v.n, 0) / days.length).toFixed(1)) : null,
          interactions_per_screen: days.length
            ? Number((days.reduce((t, v) => t + v.n, 0) / Math.max(1, days.reduce((t, v) => t + v.screens.size, 0))).toFixed(1))
            : null,
          avg_seconds_to_tap: ms.length ? Number((ms.reduce((t, m) => t + m, 0) / ms.length / 1000).toFixed(2)) : null,
          repeated_attempt_rate: pct([...users].filter((u) => rageUsers.has(u)).length, users.size),
          conversion_rate: pct([...users].filter((u) => paidUsers.has(u)).length, users.size),
        };
      });

      // Devices: interactions per user by platform (where known).
      const devices = ["android", "ios", "web", "app"].map((p) => {
        const list = events.filter((e) => e.platform === p && INTERACTIONS.includes(`'${e.event}'`));
        const users = new Set(list.map((e) => e.user_id));
        const rage = events.filter((e) => e.platform === p && e.event === "rage_tap").length;
        const tapsN = list.filter((e) => e.event === "tap").length;
        return {
          platform: p,
          users: users.size,
          interactions_per_user: users.size ? Number((list.length / users.size).toFixed(1)) : null,
          rage_tap_rate: tapsN ? pct(rage, tapsN) : null,
        };
      }).filter((d) => d.users);

      return {
        from: win.from,
        to: win.to,
        previous: { from: win.previous.from, to: win.previous.to },
        filters: { platform, app_version: appVersion },
        screens_since: since?.screens_since || null,
        app_events_since: since?.app_events_since || null,
        kpis: kpis(cur),
        previous_kpis: kpis(prev),
        screens: screenRows,
        heatmaps: heatmapOut,
        elements,
        elements_source: taps.length || events.some((e) => e.event === "tap") ? "app_taps" : "server_actions",
        flows,
        areas: taps.length ? areas : null,
        repeated_attempts: repeated,
        gestures,
        drop_offs: dropOffs,
        by_customer_type: byType,
        devices,
        app_versions: versions.map((v) => v.app_version),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      console.log("🚀 ~ getClickInteractionV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch click & interaction analytics");
    }
  },

  // One-off maintenance action: zeroes User.paid_booking_count for every
  // user, so tiered-discount pricing treats everyone as brand new from
  // this point forward instead of counting their pre-existing booking
  // history (per client decision — history should not count). Manually
  // triggered on demand (e.g. after a Docker rebuild); does not touch the
  // migration that originally backfilled this column, which stays as-is.
  resetAllUserPaidBookingCounts: async () => {
    try {
      // loyalty_status is derived from paid_booking_count, so it's reset
      // alongside it here to avoid the two columns drifting out of sync.
      const [affectedCount] = await adminDbController.Models.User.update(
        { paid_booking_count: 0, loyalty_status: "new_user" },
        { where: {} }
      );
      return { reset_count: affectedCount };
    } catch (error) {
      console.log("🚀 ~ resetAllUserPaidBookingCounts error:", error);
      throw Error.SomethingWentWrong("Failed to reset user booking counts");
    }
  },

  generateInvoicePDFForPartner: async (data) => {
    try {
      const invoice = await adminDbController.app.getInvoiceDetailsForPartner(data);
      const pdfBuffer = await generateInvoicePDF(invoice);
      return pdfBuffer;
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ generateInvoicePDFForPartner error:", error);
      throw Error.SomethingWentWrong("Failed to generate invoice PDF");
    }
  },

  // ── Partner Invoice (monthly booking summary per salon) ─────────────────

  /**
   * Partners with at least one appointment in the invoice month.
   * Month = appointment booking_date month (salon visit day), Asia/Kolkata calendar.
   * Optional data.month (YYYY-MM); defaults to current month IST.
   */
  getInvoicePartnersMonthly: async (data = {}) => {
    try {
      const { month, fromDate, toDate } = resolveInvoiceMonthRange(data?.month);

      const rows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          COUNT(DISTINCT a.id) AS booking_count
        FROM appointments a
        INNER JOIN Store d ON a.store_id = d.id
        WHERE DATE(a.booking_date) BETWEEN :fromDate AND :toDate
          AND a.status != 'cancelled'
        GROUP BY d.id, d.name, d.phone, d.email
        ORDER BY d.name ASC
        `,
        {
          replacements: { fromDate, toDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      const totalBookings = rows.reduce(
        (sum, row) => sum + Number(row.booking_count || 0),
        0
      );

      return {
        month,
        from_date: fromDate,
        to_date: toDate,
        total_bookings: totalBookings,
        total_partners: rows.length,
        partners: rows.map((row) => ({
          partner_id: row.partner_id,
          partner_name: row.partner_name,
          partner_phone: row.partner_phone,
          partner_email: row.partner_email,
          booking_count: Number(row.booking_count || 0),
        })),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoicePartnersMonthly error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly invoice partners");
    }
  },

  // Line-item breakdown for one partner's appointments in the invoice month
  // (booking_date). Priced by "important" flag: important → full amount,
  // otherwise discounted when present.
  getInvoiceDetailsForPartnerMonthly: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const { month, fromDate, toDate } = resolveInvoiceMonthRange(data?.month);

      const storeRows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          f.addressLine1, f.addressLine2, f.area, f.city, f.district, f.state, f.zipcode
        FROM Store d
        LEFT JOIN PartnerAddress f ON d.address_id = f.id
        WHERE d.id = :partnerId
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      if (!storeRows.length) {
        throw Error.NotFound("Partner not found");
      }

      const itemRows = await adminDbController.connection.query(
        `
        SELECT
          a.id AS appointment_id,
          a.booking_date AS appointment_date,
          a.created_at AS order_time,
          e.\`from\` AS slot_from,
          a.status,
          a.payment_status,
          ai.service_amount AS charged_amount,
          ss.id AS service_id,
          ss.service_name,
          ss.amount AS service_amount,
          ss.important AS service_important,
          cb.id AS combo_id,
          cb.combo AS combo_name,
          cb.amount AS combo_amount
        FROM appointments a
        INNER JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ai.service_id = ss.id
        LEFT JOIN Combo cb ON ai.combo_id = cb.id
        LEFT JOIN Slots e ON a.slot_id = e.id
        WHERE a.store_id = :partnerId
          AND DATE(a.booking_date) BETWEEN :fromDate AND :toDate
          AND a.status != 'cancelled'
        ORDER BY a.booking_date ASC, e.\`from\` ASC, a.id ASC
        `,
        {
          replacements: {
            partnerId: data.partner_id,
            fromDate,
            toDate,
          },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      let total = 0;
      let totalDiscount = 0;
      const items = itemRows
        .map((row) => {
          let serviceName;
          let baseAmount;
          let important = false;

          if (row.service_id) {
            serviceName = row.service_name;
            important = !!row.service_important;
            baseAmount = Number(row.service_amount) || 0;
          } else if (row.combo_id) {
            serviceName = row.combo_name;
            baseAmount = Number(row.combo_amount) || 0;
          } else {
            return null;
          }

          // Actual billed amount for this booking (already reflects
          // whatever flat/tiered discount applied at booking time) —
          // not recomputed from the service's current pricing.
          // Important services are always shown at full price, no discount.
          const amount = important ? baseAmount : (Number(row.charged_amount) || 0);
          const discountApplied = Math.max(0, Number((baseAmount - amount).toFixed(2)));

          total += amount;
          totalDiscount += discountApplied;

          return {
            appointment_id: row.appointment_id,
            // booking_date is date-only (it reads as 05:30 IST), so the real
            // appointment time is the booked slot's start - same as the
            // partner app. null when the booking has no slot.
            booking_time: row.slot_from
              ? buildAppointmentDateTime(row.appointment_date, row.slot_from)
              : null,
            appointment_date: row.appointment_date,
            order_time: row.order_time,
            status: row.status,
            payment_status: row.payment_status,
            service_name: serviceName,
            important,
            base_amount: Number(baseAmount.toFixed(2)),
            discount_applied: discountApplied,
            amount: Number(amount.toFixed(2)),
          };
        })
        .filter(Boolean);

      const store = storeRows[0];

      return {
        partner: {
          id: store.partner_id,
          name: store.partner_name,
          phone: store.partner_phone,
          email: store.partner_email,
          address: [store.addressLine1, store.addressLine2, store.area, store.city, store.district]
            .filter(Boolean)
            .join(", "),
          state: store.state,
          zipcode: store.zipcode,
        },
        month,
        from_date: fromDate,
        to_date: toDate,
        items,
        total_bookings: items.length,
        total_amount: Number(total.toFixed(2)),
        total_discount: Number(totalDiscount.toFixed(2)),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoiceDetailsForPartnerMonthly error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly invoice details");
    }
  },

  generateMonthlyInvoicePDFForPartner: async (data) => {
    try {
      const invoice = await adminDbController.app.getInvoiceDetailsForPartnerMonthly(data);
      const pdfBuffer = await generateMonthlyInvoicePDF(invoice);
      return pdfBuffer;
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ generateMonthlyInvoicePDFForPartner error:", error);
      throw Error.SomethingWentWrong("Failed to generate monthly invoice PDF");
    }
  },

};
