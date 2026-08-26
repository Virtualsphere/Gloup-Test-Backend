/**
 * Adds StoreServices.tier_discounts — an admin-authored JSON array of
 * progressive discount amounts keyed by a customer's booking number
 * (index 0 = 1st booking discount, index 1 = 2nd, etc.). Falls back to the
 * existing discounted_amount ("default discount") once tiers are exhausted
 * or the customer is anonymous.
 * Idempotent: no-op if the column already exists.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "StoreServices";
const COLUMN = "tier_discounts";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`tier_discounts` JSON NULL DEFAULT NULL"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
