/**
 * Short reasons users give in the app (POST /user/app/v2/feedback, and the
 * optional reason on DELETE /user/app/v2/profile):
 *   type   - checkout_exit | account_delete | cancel_booking | other
 *   reason - one of the app's fixed choices (price_too_high, ...)
 *   note   - optional free text
 * Feeds the drop-off / leave reasons on the Behavior and 360 pages.
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "UserFeedback";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT NULL,
      \`type\` VARCHAR(32) NOT NULL,
      \`reason\` VARCHAR(64) NULL,
      \`note\` TEXT NULL,
      \`appointment_id\` BIGINT NULL,
      \`store_id\` BIGINT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_user_feedback_type_created\` (\`type\`, \`created_at\`)
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
