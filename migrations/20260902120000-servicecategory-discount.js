/**
 * Adds a time-limited, category-wide discount to Servicecategory — while
 * discount_starts_at <= NOW() <= discount_ends_at, it overrides both the
 * tiered booking-count discount and the flat default discount for every
 * service in that category (see servicePricing.js getActiveCategoryDiscountsMap).
 * One active window per category; setting a new one overwrites the old.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "Servicecategory";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(queryInterface, TABLE, "discount_percent", "`discount_percent` DECIMAL(5,2) NULL DEFAULT NULL");
  await addColumnIfMissing(queryInterface, TABLE, "discount_starts_at", "`discount_starts_at` DATETIME NULL DEFAULT NULL");
  await addColumnIfMissing(queryInterface, TABLE, "discount_ends_at", "`discount_ends_at` DATETIME NULL DEFAULT NULL");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "discount_percent");
  await dropColumnIfExists(queryInterface, TABLE, "discount_starts_at");
  await dropColumnIfExists(queryInterface, TABLE, "discount_ends_at");
}
