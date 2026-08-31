/**
 * Adds User.loyalty_status — a cached tier label derived from
 * paid_booking_count:
 *   0 bookings      -> new_user
 *   1 booking       -> first_booking
 *   2-4 bookings    -> repeat
 *   5-9 bookings    -> loyal
 *   10+ bookings    -> vip
 *
 * Kept in sync in-app whenever paid_booking_count is incremented (see
 * userDbController.js — syncUserLoyaltyStatus, called from
 * createorder/updatebooking right after the count increments) rather than
 * recomputed on every read.
 *
 * Backfills existing users from their current paid_booking_count once, so
 * rollout doesn't leave every existing customer at the column default.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "User";
const COLUMN = "loyalty_status";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  const added = await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`loyalty_status` ENUM('new_user','first_booking','repeat','loyal','vip') NOT NULL DEFAULT 'new_user'"
  );

  if (added) {
    await queryInterface.sequelize.query(`
      UPDATE \`User\` SET \`loyalty_status\` = CASE
        WHEN \`paid_booking_count\` <= 0 THEN 'new_user'
        WHEN \`paid_booking_count\` = 1 THEN 'first_booking'
        WHEN \`paid_booking_count\` <= 4 THEN 'repeat'
        WHEN \`paid_booking_count\` <= 9 THEN 'loyal'
        ELSE 'vip'
      END
    `);
    console.log(`[migrate] backfilled: ${TABLE}.${COLUMN}`);
  }
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
