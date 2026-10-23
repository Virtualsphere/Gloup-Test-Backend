/**
 * Booking-time location snapshot (Deep User Insights V2): where the customer
 * was when the booking was placed and how far that is from the salon, in a
 * straight line. Taken from UserLocations at createorder / createOrderV2 -
 * a live location from the last 2 hours, else the user's latest manual one.
 * Existing bookings stay NULL (no location was ever recorded for them).
 * Idempotent: no-op if the columns already exist.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "appointments";
const COLUMNS = [
  ["user_lat", "`user_lat` DECIMAL(9,6) NULL"],
  ["user_lng", "`user_lng` DECIMAL(9,6) NULL"],
  ["user_location_source", "`user_location_source` VARCHAR(16) NULL"],
  ["distance_km", "`distance_km` DECIMAL(7,2) NULL"],
];

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }
  for (const [column, definition] of COLUMNS) {
    await addColumnIfMissing(queryInterface, TABLE, column, definition);
  }
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  for (const [column] of [...COLUMNS].reverse()) {
    await dropColumnIfExists(queryInterface, TABLE, column);
  }
}
