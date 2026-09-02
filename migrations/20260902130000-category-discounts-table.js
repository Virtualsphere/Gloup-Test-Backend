/**
 * Upgrades Category Discount storage from 3 plain columns on Servicecategory
 * (which could only ever hold one window, no history) to a proper table —
 * one row per discount campaign, so "current", "upcoming", and "history"
 * are all just different views of the same rows.
 *
 * Backfills any category that already has a discount set (from the
 * just-shipped 3-column version) into one row here, then drops those 3
 * now-redundant columns from Servicecategory.
 * Idempotent: safe to re-run.
 */

import {
  tableExists,
  columnExists,
  addIndexIfMissing,
  dropColumnIfExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "CategoryDiscounts";
const SOURCE_TABLE = "Servicecategory";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, SOURCE_TABLE))) {
    console.log(`[migrate] skip: ${SOURCE_TABLE} table does not exist`);
    return;
  }

  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
  } else {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`${TABLE}\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`category_id\` INT NOT NULL,
        \`discount_percent\` DECIMAL(5,2) NOT NULL,
        \`starts_at\` DATETIME NOT NULL,
        \`ends_at\` DATETIME NOT NULL,
        \`created_by\` INT NULL,
        \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`[migrate] created: ${TABLE}`);
  }

  await addIndexIfMissing(
    queryInterface,
    TABLE,
    "idx_category_discounts_window",
    "`category_id`, `starts_at`, `ends_at`"
  );

  // Backfill: if the old 3-column version still exists and has any
  // category with a discount set, copy it into one row here.
  if (await columnExists(queryInterface, SOURCE_TABLE, "discount_percent")) {
    await queryInterface.sequelize.query(`
      INSERT INTO \`${TABLE}\` (category_id, discount_percent, starts_at, ends_at)
      SELECT id, discount_percent, discount_starts_at, discount_ends_at
      FROM \`${SOURCE_TABLE}\`
      WHERE discount_percent IS NOT NULL
        AND discount_starts_at IS NOT NULL
        AND discount_ends_at IS NOT NULL
    `);
    console.log(`[migrate] backfilled existing discounts into ${TABLE}`);

    await dropColumnIfExists(queryInterface, SOURCE_TABLE, "discount_percent");
    await dropColumnIfExists(queryInterface, SOURCE_TABLE, "discount_starts_at");
    await dropColumnIfExists(queryInterface, SOURCE_TABLE, "discount_ends_at");
  }
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await queryInterface.sequelize.query(`DROP TABLE \`${TABLE}\``);
  console.log(`[migrate] dropped: ${TABLE}`);
}
