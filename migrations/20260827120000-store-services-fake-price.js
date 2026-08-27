/**
 * Adds StoreServices.fake_price — a display-only marketing price (e.g. an
 * inflated "was" price shown to customers). Never used in any billing,
 * discount, or payout calculation.
 * Idempotent: no-op if the column already exists.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "StoreServices";
const COLUMN = "fake_price";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`fake_price` BIGINT NULL DEFAULT NULL"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
