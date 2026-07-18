/**
 * Adds customer contact columns on appointments (booker name/phone/email).
 * Idempotent: safe if columns were already added manually on the server.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
} from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  await addColumnIfMissing(
    queryInterface,
    "appointments",
    "customer_name",
    "`customer_name` VARCHAR(100) NULL DEFAULT NULL AFTER `guest_id`"
  );
  await addColumnIfMissing(
    queryInterface,
    "appointments",
    "customer_phone",
    "`customer_phone` VARCHAR(15) NULL DEFAULT NULL AFTER `customer_name`"
  );
  await addColumnIfMissing(
    queryInterface,
    "appointments",
    "customer_email",
    "`customer_email` VARCHAR(255) NULL DEFAULT NULL AFTER `customer_phone`"
  );
}

export async function down({ context: queryInterface }) {
  await dropColumnIfExists(queryInterface, "appointments", "customer_email");
  await dropColumnIfExists(queryInterface, "appointments", "customer_phone");
  await dropColumnIfExists(queryInterface, "appointments", "customer_name");
}
