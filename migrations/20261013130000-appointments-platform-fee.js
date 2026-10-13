/**
 * Adds appointments.platform_fee — the platform fee (rupees) the customer
 * was charged on this booking. Until now the fee was baked into
 * appointments.amount and never stored on its own, so revenue had to work it
 * out as amount - subtotal - GST from whole-rupee columns, which drifted by
 * Rs 1 on fractional-coupon bookings.
 *
 * NOT NULL DEFAULT 3.00: every existing booking is recorded as Rs 3 (the
 * flat fee createOrderV2 has charged since launch — a business decision that
 * also covers the few legacy-flow bookings that paid none). New bookings
 * write the fee they actually charged (createOrderV2: its fee; legacy
 * createorder: 0).
 *
 * Idempotent: no-op if the column already exists.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "appointments";
const COLUMN = "platform_fee";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`platform_fee` DECIMAL(10,2) NOT NULL DEFAULT 3.00"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
