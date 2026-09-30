/**
 * Adds User.registered_at — when the customer account was created. User
 * has always had timestamps: false, so until now there was no signup date
 * at all (user growth by month, new users in a period, etc. were
 * impossible). Named registered_at rather than created_at on purpose:
 * several raw queries join User with appointments via SELECT *, and a
 * second created_at column would silently clobber appointments.created_at
 * in those result rows.
 *
 * Backfill for existing users uses the earliest evidence of the account
 * existing — first UserSession, first appointment or first OtpLogs row,
 * whichever is oldest (the same proxy getNewSignupsToday already uses).
 * Users with none of those stay NULL (signup date unknown).
 *
 * The column is added WITHOUT a default first so existing rows don't all
 * get stamped with the migration time, then the default is switched on
 * so every new row (Sequelize or raw INSERT) gets it automatically.
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

// Fill registered_at from `evidenceSql` (user_id, first_seen) wherever it
// is earlier than what's already there (or nothing is there yet).
const backfillFrom = async (queryInterface, evidenceSql) => {
  await queryInterface.sequelize.query(`
    UPDATE \`User\` u
    INNER JOIN (${evidenceSql}) e ON e.user_id = u.id
    SET u.\`registered_at\` = e.first_seen
    WHERE e.first_seen IS NOT NULL
      AND (u.\`registered_at\` IS NULL OR e.first_seen < u.\`registered_at\`)
  `);
};

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  const added = await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`registered_at` DATETIME NULL"
  );

  if (added) {
    if (await tableExists(queryInterface, "UserSession")) {
      await backfillFrom(
        queryInterface,
        "SELECT user_id, MIN(created_at) AS first_seen FROM `UserSession` WHERE user_id IS NOT NULL GROUP BY user_id"
      );
    }
    if (await tableExists(queryInterface, "appointments")) {
      await backfillFrom(
        queryInterface,
        "SELECT user_id, MIN(created_at) AS first_seen FROM `appointments` WHERE user_id IS NOT NULL GROUP BY user_id"
      );
    }
    if (await tableExists(queryInterface, "OtpLogs")) {
      await backfillFrom(
        queryInterface,
        "SELECT user_id, MIN(created_at) AS first_seen FROM `OtpLogs` WHERE user_id IS NOT NULL GROUP BY user_id"
      );
    }
    console.log(`[migrate] backfilled: ${TABLE}.${COLUMN}`);
  }

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
