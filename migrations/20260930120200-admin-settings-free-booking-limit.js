/**
 * Adds AdminSettings.free_booking_limit — how many paid bookings a partner
 * gets free before they need a manual subscription (see
 * partnerSubscriptionBilling.js). Was hard-coded as 15 in
 * getPartnersNeedingManualSubscription; now admin-editable via
 * /admin/app/updatefreebookinglimit so changing it needs no redeploy.
 *
 * NOT NULL DEFAULT 15 keeps today's behaviour for the existing row and for
 * a row created later by the dashboard-date upsert.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "AdminSettings";
const COLUMN = "free_booking_limit";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`free_booking_limit` INT NOT NULL DEFAULT 15"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
