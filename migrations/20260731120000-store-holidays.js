/**
 * Store-level holidays: full day closed (no new bookings).
 * Idempotent: safe if table already exists.
 */

import {
  tableExists,
  addIndexIfMissing,
} from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, "StoreHolidays")) {
    console.log("[migrate] skip: StoreHolidays already exists");
  } else {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`StoreHolidays\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`store_id\` INT NOT NULL,
        \`holiday_date\` DATE NOT NULL,
        \`reason\` TEXT NULL,
        \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_store_holiday_date\` (\`store_id\`, \`holiday_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] created: StoreHolidays");
  }

  await addIndexIfMissing(
    queryInterface,
    "StoreHolidays",
    "idx_store_holidays_store_date",
    "`store_id`, `holiday_date`"
  );
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, "StoreHolidays")) {
    await queryInterface.sequelize.query(`DROP TABLE \`StoreHolidays\``);
    console.log("[migrate] dropped: StoreHolidays");
  }
}
