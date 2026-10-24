/**
 * Where each user installed the app from (POST /user/app/v2/attribution):
 * the Play Install Referrer / campaign link the app reads once after the
 * first login. First touch wins - later reports never overwrite a row.
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "UserAttribution";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT NOT NULL,
      \`source\` VARCHAR(40) NULL,
      \`medium\` VARCHAR(40) NULL,
      \`campaign\` VARCHAR(80) NULL,
      \`referrer\` TEXT NULL,
      \`platform\` VARCHAR(16) NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_user_attribution_user\` (\`user_id\`)
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
