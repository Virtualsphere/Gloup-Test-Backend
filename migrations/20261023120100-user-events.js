/**
 * In-app actions the backend can see (User Analytics V2 page):
 *   salon_view   - a logged-in user opened a salon (/v2/store/details, /getstorebyid)
 *   coupon_apply - a user applied a valid coupon code (/validatecoupon)
 * Searches, offer clicks and the cart happen only inside the app, so they
 * are not recorded here.
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "UserEvents";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT NOT NULL,
      \`event\` VARCHAR(32) NOT NULL,
      \`store_id\` BIGINT NULL,
      \`coupon_code\` VARCHAR(64) NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_user_events_event_created\` (\`event\`, \`created_at\`),
      KEY \`idx_user_events_user\` (\`user_id\`)
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
