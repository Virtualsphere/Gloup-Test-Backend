/**
 * Adds Store.payout_frequency - how often a salon is paid out: 'daily'
 * (default, how every salon has always been paid), 'weekly' or 'monthly'.
 * It only decides when a visit day's invoice is DUE for payout (see
 * INVOICE_DUE_DATE_SQL in AdminDbController); payouts are still recorded per
 * invoice day in InvoicePayouts by markInvoicePayout, unchanged.
 *
 * Deliberately not on the Store Sequelize model (same approach as
 * AdminSettings.free_booking_limit), so no existing Store query or
 * model-level write can ever touch it.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "Store";
const COLUMN = "payout_frequency";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`payout_frequency` ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'daily'"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
