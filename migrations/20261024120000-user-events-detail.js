/**
 * Widens UserEvents for app-reported events (POST /user/app/v2/events) and
 * server-logged screen views (Click & Interaction / Behavior pages):
 *   screen      - fixed screen name (home, salon_details, checkout, ...)
 *   element     - tapped element, gesture, search text, cart action, step
 *   x / y       - tap position as a share of the screen (0-1)
 *   value       - a number for the event (duration ms, ms to first tap, taps, results)
 *   meta        - JSON text with the rest (filters, coupon validity, ...)
 *   platform / app_version - from the X-Platform / X-App-Version headers
 *   source      - 'server' (logged by the backend) or 'app' (sent by the app)
 * Idempotent: no-op for columns / index that already exist.
 */

import {
  addColumnIfMissing,
  addIndexIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "UserEvents";
const COLUMNS = [
  ["screen", "`screen` VARCHAR(40) NULL"],
  ["element", "`element` VARCHAR(80) NULL"],
  ["x", "`x` DECIMAL(5,4) NULL"],
  ["y", "`y` DECIMAL(5,4) NULL"],
  ["value", "`value` INT NULL"],
  ["meta", "`meta` TEXT NULL"],
  ["platform", "`platform` VARCHAR(16) NULL"],
  ["app_version", "`app_version` VARCHAR(20) NULL"],
  ["source", "`source` VARCHAR(8) NOT NULL DEFAULT 'server'"],
];

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }
  for (const [column, definition] of COLUMNS) {
    await addColumnIfMissing(queryInterface, TABLE, column, definition);
  }
  await addIndexIfMissing(queryInterface, TABLE, "idx_user_events_screen_created", "`screen`, `created_at`");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  for (const [column] of [...COLUMNS].reverse()) {
    await dropColumnIfExists(queryInterface, TABLE, column);
  }
}
