/**
 * Store weekly recurring holidays (e.g. every Sunday / Saturday).
 * weekday: 0=Sunday … 6=Saturday (JS Date.getDay()).
 */

import {
  tableExists,
  addIndexIfMissing,
} from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, "StoreWeeklyHolidays")) {
    console.log("[migrate] skip: StoreWeeklyHolidays already exists");
  } else {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`StoreWeeklyHolidays\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`store_id\` INT NOT NULL,
        \`weekday\` TINYINT NOT NULL COMMENT '0=Sunday … 6=Saturday',
        \`reason\` TEXT NULL,
        \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_store_weekly_holiday\` (\`store_id\`, \`weekday\`),
        CONSTRAINT \`chk_store_weekly_weekday\` CHECK (\`weekday\` BETWEEN 0 AND 6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] created: StoreWeeklyHolidays");
  }

  await addIndexIfMissing(
    queryInterface,
    "StoreWeeklyHolidays",
    "idx_store_weekly_holidays_store",
    "`store_id`"
  );
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, "StoreWeeklyHolidays")) {
    await queryInterface.sequelize.query(`DROP TABLE \`StoreWeeklyHolidays\``);
    console.log("[migrate] dropped: StoreWeeklyHolidays");
  }
}
