/**
 * Banner management (admin panel Banner V2 page):
 *   name, description   what the admin calls the banner (shown in the list)
 *   start_date/end_date optional schedule; the apps only get a banner while
 *                       NOW() is inside it (NULL = no limit on that side)
 *   sort_order          display order in the apps, lowest first
 *   created_by          admin.id of whoever added it
 *   updated_at          last edit
 *
 * Banner.status gains 'deleted'. Until now "Delete" set status = 'inactive',
 * so every existing inactive row is a deleted banner and is moved to
 * 'deleted'; 'inactive' now means paused (hidden from the apps, kept in the
 * admin list).
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  getColumnType,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "Banner";
const COLUMNS = [
  ["name", "`name` VARCHAR(120) NULL"],
  ["description", "`description` VARCHAR(255) NULL"],
  ["start_date", "`start_date` DATETIME NULL"],
  ["end_date", "`end_date` DATETIME NULL"],
  ["sort_order", "`sort_order` INT NOT NULL DEFAULT 0"],
  ["created_by", "`created_by` INT NULL"],
  ["updated_at", "`updated_at` DATETIME NULL"],
];

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  for (const [column, definition] of COLUMNS) {
    await addColumnIfMissing(queryInterface, TABLE, column, definition);
  }

  const current = String((await getColumnType(queryInterface, TABLE, "status")) || "").toLowerCase();
  if (current && !current.includes("'deleted'")) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`${TABLE}\`
        MODIFY COLUMN \`status\` ENUM('active','inactive','deleted') NULL
    `);
    await queryInterface.sequelize.query(
      `UPDATE \`${TABLE}\` SET \`status\` = 'deleted' WHERE \`status\` = 'inactive'`
    );
    console.log(`[migrate] updated: ${TABLE}.status ENUM (+deleted), old inactive rows -> deleted`);
  }
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }

  const current = String((await getColumnType(queryInterface, TABLE, "status")) || "").toLowerCase();
  if (current.includes("'deleted'")) {
    await queryInterface.sequelize.query(
      `UPDATE \`${TABLE}\` SET \`status\` = 'inactive' WHERE \`status\` = 'deleted'`
    );
    await queryInterface.sequelize.query(`
      ALTER TABLE \`${TABLE}\`
        MODIFY COLUMN \`status\` ENUM('active','inactive') NULL
    `);
  }

  for (const [column] of [...COLUMNS].reverse()) {
    await dropColumnIfExists(queryInterface, TABLE, column);
  }
}
