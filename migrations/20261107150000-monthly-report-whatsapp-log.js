/**
 * One row per salon per month for the monthly report WhatsApp
 * (gloup_montly_invoice, sent on the 1st for the previous month).
 *   status - sent | failed | skipped (no usable phone number)
 * The unique key is what stops a salon getting the same month twice when the
 * job re-runs (retries later on the 1st, restarts, a second instance).
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "MonthlyReportWhatsappLog";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`store_id\` BIGINT NOT NULL,
      \`month\` CHAR(7) NOT NULL,
      \`status\` VARCHAR(16) NOT NULL,
      \`attempts\` INT NOT NULL DEFAULT 1,
      \`pdf_url\` VARCHAR(1024) NULL,
      \`last_error\` VARCHAR(512) NULL,
      \`sent_at\` DATETIME NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_monthly_report_store_month\` (\`store_id\`, \`month\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log(`[migrate] created: ${TABLE}`);
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    await queryInterface.sequelize.query(`DROP TABLE \`${TABLE}\``);
    console.log(`[migrate] dropped: ${TABLE}`);
  }
}
