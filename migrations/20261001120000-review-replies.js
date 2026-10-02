/**
 * Admin replies to customer reviews (Reviews & Ratings V2 page). One reply
 * per review - replying again edits it. `replied_by` is the admin.id that
 * last wrote it. Reviews itself is untouched.
 * Idempotent: safe if table already exists.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const TABLE = "review_replies";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, TABLE)) {
    console.log(`[migrate] skip: ${TABLE} already exists`);
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`${TABLE}\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`review_id\` INT NOT NULL,
      \`reply\` TEXT NOT NULL,
      \`replied_by\` INT NULL,
      \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_review_replies_review\` (\`review_id\`)
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
