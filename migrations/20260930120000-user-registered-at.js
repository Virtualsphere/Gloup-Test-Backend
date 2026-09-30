/**
 * Adds User.registered_at — when the customer account was created. User
 * has always had timestamps: false, so until now there was no signup date
 * at all (user growth by month, new users in a period, etc. were
 * impossible). Named registered_at rather than created_at on purpose:
 * several raw queries join User with appointments via SELECT *, and a
 * second created_at column would silently clobber appointments.created_at
 * in those result rows.
 *
 * The column is added WITHOUT a default first so existing rows aren't all
 * stamped with the migration time, then the default is switched on so
 * every new row (Sequelize or raw INSERT) gets it automatically.
 *
 * Existing users are backfilled by 20260930130000-user-registered-at-backfill.js.
 * (The first version of this file backfilled here, only when the column was
 * newly added — a failed first run left the column in place, so a retry
 * would have skipped the backfill entirely. Kept separate so it always runs.)
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  addIndexIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "User";
const COLUMN = "registered_at";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`registered_at` DATETIME NULL"
  );

  await queryInterface.sequelize.query(
    "ALTER TABLE `User` MODIFY COLUMN `registered_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP"
  );

  await addIndexIfMissing(queryInterface, TABLE, "idx_user_registered_at", "`registered_at`");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
