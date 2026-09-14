/**
 * Adds a single-row AdminSettings table holding
 * dashboard_data_start_date — the client's "go live" date. Revenue/sales
 * count/partner-count/etc. dashboard metrics (anything driven by a real
 * appointment or store creation date) only count activity on/after this
 * date, so pre-launch test/seed data doesn't pollute the numbers.
 *
 * Kept as an admin-editable setting (not hard-coded) so moving the cutoff
 * later doesn't need a code change/redeploy. NULL = no cutoff (all-time).
 *
 * Deliberately NOT applied to Total Users / First-Booking Users / Customer
 * Funnel / Customer Segments — those reflect lifetime user status
 * (loyalty tier, all-time paid_booking_count) and User has no signup-date
 * column to filter on at all.
 *
 * Seeded with 2026-06-11 per the client's stated finalize date.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "AdminSettings";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`${TABLE}\` (
        \`id\` INT NOT NULL,
        \`dashboard_data_start_date\` DATE NULL,
        \`updated_at\` DATETIME NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`[migrate] created: ${TABLE}`);
  } else {
    await addColumnIfMissing(
      queryInterface,
      TABLE,
      "dashboard_data_start_date",
      "`dashboard_data_start_date` DATE NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      TABLE,
      "updated_at",
      "`updated_at` DATETIME NULL"
    );
  }

  const [rows] = await queryInterface.sequelize.query(
    `SELECT id FROM \`${TABLE}\` WHERE id = 1`
  );
  if (!rows.length) {
    await queryInterface.sequelize.query(`
      INSERT INTO \`${TABLE}\` (id, dashboard_data_start_date, updated_at)
      VALUES (1, '2026-06-11', NOW())
    `);
    console.log(`[migrate] seeded: ${TABLE} row 1 (dashboard_data_start_date=2026-06-11)`);
  }
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await queryInterface.sequelize.query(`DROP TABLE \`${TABLE}\``);
  console.log(`[migrate] dropped: ${TABLE}`);
}
