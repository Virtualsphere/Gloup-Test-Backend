/**
 * Refund helpers shared by the customer cancel (initiaterefund), the partner
 * holiday auto-cancels, the admin cancel and the admin refund
 * (/refundbookings).
 *
 * Refunds are manual for now: the admin refunds card / UPI payments on the
 * Razorpay dashboard and then marks the booking refunded; bookings paid from
 * the Gloup wallet are credited back to the wallet.
 */

import { Op } from "sequelize";
import { refund_requests } from "../database/models/index.js";

// "sucssess" is a misspelling the booking flow also writes.
export const PAID_PAYMENT_STATUSES = ["success", "sucssess"];

export const isPaidBooking = (appointment) =>
  PAID_PAYMENT_STATUSES.includes(appointment?.payment_status);

// Paid from the Gloup wallet: the legacy wallet flow sets is_wallet and never
// goes through Razorpay, so there is no payment_id to refund on.
export const isWalletPaid = (appointment) =>
  Boolean(appointment?.is_wallet) && !appointment?.payment_id;

/**
 * What the customer actually paid: discounted_amount + GST (gst is a percent)
 * + platform_fee. appointments.amount is a BIGINT, so it holds this total
 * rounded to the rupee.
 */
export function bookingPaidAmount(appointment) {
  const taxable = Number(appointment.discounted_amount) || 0;
  const gst = Math.round(taxable * (Number(appointment.gst) || 0)) / 100;
  const fee = Number(appointment.platform_fee) || 0;
  return Math.round((taxable + gst + fee) * 100) / 100;
}

/**
 * Opens a pending refund request for each paid booking that was cancelled
 * without one (salon holiday, admin cancel), so the admin is reminded to
 * refund it. Skips unpaid bookings and ones that already have a pending or
 * approved request. Each booking needs id, user_id, payment_status, is_wallet.
 */
export async function openRefundRequests(bookings, reason, transaction) {
  const paid = bookings.filter(isPaidBooking);
  if (paid.length === 0) return 0;

  const existing = await refund_requests.findAll({
    where: {
      appointment_id: { [Op.in]: paid.map((b) => b.id) },
      status: { [Op.in]: ["pending", "approved"] },
    },
    attributes: ["appointment_id"],
    raw: true,
    transaction,
  });
  const has = new Set(existing.map((r) => Number(r.appointment_id)));

  const rows = paid
    .filter((b) => !has.has(Number(b.id)))
    .map((b) => ({
      user_id: b.user_id,
      appointment_id: b.id,
      status: "pending",
      created_at: new Date(),
      reason,
      is_wallet: Boolean(b.is_wallet),
    }));
  if (rows.length > 0) {
    await refund_requests.bulkCreate(rows, { transaction });
  }
  return rows.length;
}

/** Marks a booking's pending refund request(s) approved once it is refunded. */
export async function closeRefundRequests(appointmentId, transaction) {
  await refund_requests.update(
    { status: "approved" },
    { where: { appointment_id: appointmentId, status: "pending" }, transaction },
  );
}
