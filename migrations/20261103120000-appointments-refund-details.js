/**
 * Adds appointments.refund_amount / refund_method / refund_reference, written
 * by the admin refund (updateRefundBookingStatus):
 *   refund_amount     what the customer got back (discounted_amount + GST + fee)
 *   refund_method     'wallet' (credited to User.wallet) or 'manual' (the admin
 *                     refunded on the Razorpay dashboard)
 *   refund_reference  the Razorpay refund id (rfnd_...) the admin typed in, if any
 * Existing refunds stay NULL - none of this was stored before.
 * Idempotent: no-op if the columns already exist.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "appointments";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }
  await addColumnIfMissing(queryInterface, TABLE, "refund_amount", "`refund_amount` DECIMAL(10,2) NULL");
  await addColumnIfMissing(queryInterface, TABLE, "refund_method", "`refund_method` VARCHAR(20) NULL");
  await addColumnIfMissing(queryInterface, TABLE, "refund_reference", "`refund_reference` VARCHAR(100) NULL");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "refund_reference");
  await dropColumnIfExists(queryInterface, TABLE, "refund_method");
  await dropColumnIfExists(queryInterface, TABLE, "refund_amount");
}
