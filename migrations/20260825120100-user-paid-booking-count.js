/**
 * Adds User.paid_booking_count — a cached counter of each customer's paid,
 * non-cancelled bookings across every salon on the platform. Used to pick
 * the right tier in StoreServices.tier_discounts without recomputing a
 * COUNT(*) on every store-browse/checkout request (the count is incremented
 * in-app at the two places a booking actually becomes paid — see
 * userDbController.createorder/updatebooking).
 *
 * Backfills existing users' historical counts once, so rollout doesn't
 * treat every existing customer as brand new until their next booking.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "User";
const COLUMN = "paid_booking_count";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  const added = await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`paid_booking_count` INT NOT NULL DEFAULT 0"
  );

  if (added) {
    await queryInterface.sequelize.query(`
      UPDATE \`User\` u SET u.\`paid_booking_count\` = (
        SELECT COUNT(*) FROM \`appointments\` a
        WHERE a.\`user_id\` = u.\`id\`
          AND a.\`status\` != 'cancelled'
          AND a.\`payment_status\` IN ('sucssess', 'success')
      )
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
