/**
 * Extends appointments.status ENUM to include 'pending'.
 * Idempotent: no-op if 'pending' is already in the ENUM definition.
 */

import { getColumnType } from "../src/core/database/migrationHelpers.js";

const TABLE = "appointments";
const COLUMN = "status";

export async function up({ context: queryInterface }) {
  const current = await getColumnType(queryInterface, TABLE, COLUMN);
  if (!current) {
    console.log(`[migrate] skip: ${TABLE}.${COLUMN} not found`);
    return;
  }

  if (String(current).toLowerCase().includes("'pending'")) {
    console.log(`[migrate] skip: ${TABLE}.${COLUMN} already includes pending`);
    return;
  }

  // Preserve existing nullability and default (NOT NULL DEFAULT 'booked' in prod)
  await queryInterface.sequelize.query(`
    ALTER TABLE \`${TABLE}\`
      MODIFY COLUMN \`${COLUMN}\`
      ENUM('booked','confirmed','completed','cancelled','refunded','pending')
      COLLATE utf8mb4_general_ci
      NOT NULL DEFAULT 'booked'
  `);
  console.log(`[migrate] updated: ${TABLE}.${COLUMN} ENUM (+pending)`);
}

export async function down({ context: queryInterface }) {
  const current = await getColumnType(queryInterface, TABLE, COLUMN);
  if (!current || !String(current).toLowerCase().includes("'pending'")) {
    console.log(`[migrate] skip down: pending not present on ${TABLE}.${COLUMN}`);
    return;
  }

  // Rows using 'pending' must be remapped before shrinking the ENUM
  await queryInterface.sequelize.query(`
    UPDATE \`${TABLE}\`
    SET \`${COLUMN}\` = 'booked'
    WHERE \`${COLUMN}\` = 'pending'
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE \`${TABLE}\`
      MODIFY COLUMN \`${COLUMN}\`
      ENUM('booked','confirmed','completed','cancelled','refunded')
      COLLATE utf8mb4_general_ci
      NOT NULL DEFAULT 'booked'
  `);
  console.log(`[migrate] reverted: ${TABLE}.${COLUMN} ENUM (-pending)`);
}
