/**
 * Adds AdminSettings.platform_fee - the per-booking platform fee (rupees)
 * customers pay on top of services + GST. Admin-editable via
 * /admin/app/updateplatformfee; reports (Monthly Report V2) multiply it by a
 * month's paid, non-cancelled bookings.
 *
 * Reporting only for now: the booking flow (createOrderV2) still charges its
 * own hard-coded PLATFORM_FEE = 3, which is why that is the default here.
 * Deliberately not on the AdminSettings model (same as free_booking_limit),
 * so the model upsert in updateDashboardDataStartDate can never reset it.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "AdminSettings";
const COLUMN = "platform_fee";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`platform_fee` DECIMAL(10,2) NOT NULL DEFAULT 3.00"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
