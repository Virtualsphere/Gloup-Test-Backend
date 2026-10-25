/**
 * Adds UserAppSessions.app_version (from the X-App-Version header on the
 * heartbeat), for the app-version filter on the analytics pages.
 * Idempotent: no-op if the column already exists.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "UserAppSessions";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }
  await addColumnIfMissing(queryInterface, TABLE, "app_version", "`app_version` VARCHAR(20) NULL");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "app_version");
}
