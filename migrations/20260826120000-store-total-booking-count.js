/**
 * Adds Store.total_booking_count — a cached counter of each partner's
 * lifetime paid, non-cancelled bookings across the platform. Used to know
 * when a partner has crossed their free-15-bookings threshold and needs a
 * manual subscription assigned (see partnerSubscriptionBilling.js). The
 * count is incremented in-app at the two places a booking actually becomes
 * paid — see userDbController.createorder/updatebooking, same points that
 * already maintain User.paid_booking_count.
 *
 * Backfills existing partners' historical counts once, so rollout doesn't
 * treat every existing partner as brand new.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "Store";
const COLUMN = "total_booking_count";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  const added = await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`total_booking_count` INT NOT NULL DEFAULT 0"
  );

  if (added) {
    await queryInterface.sequelize.query(`
      UPDATE \`Store\` s SET s.\`total_booking_count\` = (
        SELECT COUNT(*) FROM \`appointments\` a
        WHERE a.\`store_id\` = s.\`id\`
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
