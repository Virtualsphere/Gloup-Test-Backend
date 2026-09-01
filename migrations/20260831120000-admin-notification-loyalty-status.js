/**
 * Adds Adminnotificationlogs.loyalty_status so admins can record which
 * user loyalty tier(s) a broadcast targeted (comma-separated ENUM values:
 * new_user, first_booking, repeat, loyal, vip). Null = no loyalty filter.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "Adminnotificationlogs";
const COLUMN = "loyalty_status";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`loyalty_status` VARCHAR(100) NULL DEFAULT NULL"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
