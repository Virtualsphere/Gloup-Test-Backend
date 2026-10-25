/**
 * Locations the app reports for a user (POST /user/app/v2/location), for the
 * Deep User Insights V2 page. `source` = live (device GPS) or manual (a place
 * the user picked). Coordinates are rounded to 3 decimals (~100 m) before
 * they are stored. Each booking copies the location in force when it was
 * placed onto appointments (user_lat / user_lng / distance_km), so this is
 * only the history those snapshots are taken from.
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "UserLocations";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT NOT NULL,
      \`lat\` DECIMAL(9,6) NOT NULL,
      \`lng\` DECIMAL(9,6) NOT NULL,
      \`source\` VARCHAR(16) NOT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_user_locations_user_created\` (\`user_id\`, \`created_at\`)
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
