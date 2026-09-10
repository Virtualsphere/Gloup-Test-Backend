/**
 * Adds refund_requests.cancel_notify_at / cancel_notified_at — used to delay
 * the "booking cancelled" WhatsApp message by 10 minutes after a refund
 * request is rejected, so an admin has a window to fix a mis-click before
 * the customer is notified. A cron (CronHelper.scheduleCancelledBookingNotify)
 * re-checks the row is still 'rejected' at send time, so anything that moves
 * it off 'rejected' within the window silently cancels the pending send.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "refund_requests";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    "cancel_notify_at",
    "`cancel_notify_at` DATETIME NULL"
  );
  await addColumnIfMissing(
    queryInterface,
    TABLE,
    "cancel_notified_at",
    "`cancel_notified_at` DATETIME NULL"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "cancel_notify_at");
  await dropColumnIfExists(queryInterface, TABLE, "cancel_notified_at");
}
