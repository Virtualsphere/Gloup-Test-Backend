/**
 * Adds appointment_items.list_amount and appointment_items.is_important — the
 * service's (or combo's) list price and "important" flag AS THEY WERE WHEN
 * THE BOOKING WAS MADE.
 *
 * CAC (the discount Gloup funds on an item) is list price minus what the
 * customer was charged. service_amount (charged) was always stored on the
 * item, but the list price and important flag were read live from
 * StoreServices / Combo, so a salon editing a price or the admin toggling
 * "important" later silently rewrote CAC for every past month.
 *
 * Named list_amount / is_important (not amount / important) so raw
 * `SELECT *` joins with StoreServices or Combo can't clobber those columns.
 *
 * Existing rows are backfilled from the current StoreServices / Combo values
 * — the best available guess, and exactly what CAC already showed for them,
 * so no historical number moves on deploy. A service row wins over a combo
 * row, same as ITEM_CAC_SQL. Combos have no important flag (NULL).
 *
 * Idempotent: columns are only added if missing, and the backfill only
 * fills rows whose list_amount is still NULL, so it is safe to re-run.
 */

import {
  addColumnIfMissing,
  columnExists,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "appointment_items";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(queryInterface, TABLE, "list_amount", "`list_amount` BIGINT NULL DEFAULT NULL");
  await addColumnIfMissing(queryInterface, TABLE, "is_important", "`is_important` TINYINT(1) NULL DEFAULT NULL");

  if (await columnExists(queryInterface, "StoreServices", "important")) {
    const [result] = await queryInterface.sequelize.query(`
      UPDATE \`appointment_items\` ai
      INNER JOIN \`StoreServices\` ss ON ss.id = ai.service_id
      SET ai.\`list_amount\` = ss.amount, ai.\`is_important\` = ss.important
      WHERE ai.\`list_amount\` IS NULL
    `);
    console.log(`[migrate] backfilled ${TABLE} list price from StoreServices: ${result?.affectedRows ?? "?"} row(s)`);
  }

  if (await tableExists(queryInterface, "Combo")) {
    const [result] = await queryInterface.sequelize.query(`
      UPDATE \`appointment_items\` ai
      INNER JOIN \`Combo\` cb ON cb.id = ai.combo_id
      SET ai.\`list_amount\` = cb.amount
      WHERE ai.\`list_amount\` IS NULL
    `);
    console.log(`[migrate] backfilled ${TABLE} list price from Combo: ${result?.affectedRows ?? "?"} row(s)`);
  }
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "is_important");
  await dropColumnIfExists(queryInterface, TABLE, "list_amount");
}
