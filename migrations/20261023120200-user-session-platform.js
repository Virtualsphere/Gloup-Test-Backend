/**
 * Adds UserSession.user_agent and UserSession.platform. Phone-OTP login
 * (createSession) passed the User-Agent to a `userAgent` attribute the model
 * never had, so it was dropped; Google / Apple login (insertsession) wrote it
 * into `ipv4`. Both now also fill these columns. Existing rows stay NULL.
 * Idempotent: no-op if the columns already exist.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "UserSession";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(queryInterface, TABLE, "user_agent", "`user_agent` VARCHAR(512) NULL");
  await addColumnIfMissing(queryInterface, TABLE, "platform", "`platform` VARCHAR(16) NULL");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "platform");
  await dropColumnIfExists(queryInterface, TABLE, "user_agent");
}
