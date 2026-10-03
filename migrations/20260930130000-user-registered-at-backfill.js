/**
 * Backfills User.registered_at for users who existed before the column did
 * (see 20260930120000-user-registered-at.js), from the earliest evidence
 * of the account — whichever is oldest of:
 *   - first UserSession.created_at  (same proxy getNewSignupsToday uses)
 *   - first appointments.created_at
 *   - first OtpLogs.createdAt where userType = 'user' (OtpLogs uses
 *     Sequelize's default camelCase columns, and also logs partner OTPs,
 *     so it's filtered to customer rows)
 * Users with none of those stay NULL (signup date unknown).
 *
 * Only ever moves a date earlier (or fills a NULL), so it is safe to re-run
 * and never touches users who signed up after the column existed. Each
 * source is skipped if its table/columns aren't there, so schema drift
 * between environments can't fail the deploy.
 */

import {
  columnExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const SOURCES = [
  {
    table: "UserSession",
    columns: ["user_id", "created_at"],
    sql: "SELECT user_id, MIN(created_at) AS first_seen FROM `UserSession` WHERE user_id IS NOT NULL GROUP BY user_id",
  },
  {
    table: "appointments",
    columns: ["user_id", "created_at"],
    sql: "SELECT user_id, MIN(created_at) AS first_seen FROM `appointments` WHERE user_id IS NOT NULL GROUP BY user_id",
  },
  {
    table: "OtpLogs",
    columns: ["userId", "createdAt", "userType"],
    sql: "SELECT userId AS user_id, MIN(createdAt) AS first_seen FROM `OtpLogs` WHERE userId IS NOT NULL AND userType = 'user' GROUP BY userId",
  },
];

const hasColumns = async (queryInterface, table, columns) => {
  if (!(await tableExists(queryInterface, table))) return false;
  for (const column of columns) {
    if (!(await columnExists(queryInterface, table, column))) return false;
  }
  return true;
};

export async function up({ context: queryInterface }) {
  if (!(await columnExists(queryInterface, "User", "registered_at"))) {
    console.log("[migrate] skip: User.registered_at does not exist");
    return;
  }

  for (const source of SOURCES) {
    if (!(await hasColumns(queryInterface, source.table, source.columns))) {
      console.log(`[migrate] skip backfill source: ${source.table} (${source.columns.join(", ")}) not found`);
      continue;
    }
    const [result] = await queryInterface.sequelize.query(`
      UPDATE \`User\` u
      INNER JOIN (${source.sql}) e ON e.user_id = u.id
      SET u.\`registered_at\` = e.first_seen
      WHERE e.first_seen IS NOT NULL
        AND (u.\`registered_at\` IS NULL OR e.first_seen < u.\`registered_at\`)
    `);
    console.log(
      `[migrate] backfilled User.registered_at from ${source.table}: ${result?.affectedRows ?? "?"} row(s)`
    );
  }
}

export async function down() {
  // Nothing to undo: the backfilled values are dropped with the column by
  // 20260930120000-user-registered-at.js's down().
}
