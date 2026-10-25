/**
 * App usage sessions (User Analytics V2 page). Built from /user/app/v2/heartbeat,
 * which the app sends every ~25-30s while in the foreground: a heartbeat
 * extends the user's open session (seen within the last few minutes) or
 * starts a new one, and `online: false` closes it. Session length is
 * COALESCE(ended_at, last_seen_at) - started_at.
 *
 * `platform` is what the app sends (android / ios), else what the
 * User-Agent tells (web / app), else NULL.
 *
 * History starts the day this is deployed - UserSession.updated_at, which
 * the heartbeat also touches, is overwritten on every ping.
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "UserAppSessions";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT NOT NULL,
      \`platform\` VARCHAR(16) NULL,
      \`started_at\` DATETIME NOT NULL,
      \`last_seen_at\` DATETIME NOT NULL,
      \`ended_at\` DATETIME NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_user_app_sessions_user_seen\` (\`user_id\`, \`last_seen_at\`),
      KEY \`idx_user_app_sessions_started\` (\`started_at\`),
      KEY \`idx_user_app_sessions_seen\` (\`last_seen_at\`)
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
