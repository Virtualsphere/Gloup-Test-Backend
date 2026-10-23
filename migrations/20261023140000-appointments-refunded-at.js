/**
 * Adds appointments.refunded_at / refunded_by. The admin refund
 * (updateRefundBookingStatus) has always written both, but neither the model
 * nor the table had them, so Sequelize dropped the values silently.
 * Existing refunds stay NULL - when they happened was never stored.
 * Idempotent: no-op if the columns already exist.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "appointments";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }
  await addColumnIfMissing(queryInterface, TABLE, "refunded_at", "`refunded_at` DATETIME NULL");
  await addColumnIfMissing(queryInterface, TABLE, "refunded_by", "`refunded_by` INT NULL");
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "refunded_by");
  await dropColumnIfExists(queryInterface, TABLE, "refunded_at");
}
