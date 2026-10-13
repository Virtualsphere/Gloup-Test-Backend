/**
 * Sets appointments.gst to 5 (percent) on every booking.
 *
 * appointments.gst is a GST RATE in percent: every reader computes the GST
 * amount as discounted_amount * gst / 100. But from 2026-06-09 until commit
 * 14144d0 (2026-06-20) createOrderV2 saved `gst: gst || 5`, where `gst` was
 * the app's request field - the GST AMOUNT in rupees (e.g. 15 on a Rs 300
 * booking). Those rows show "GST (15%)" in booking details. GST is a static
 * 5% on every booking (the server ignores the app's gst field and has
 * written 5 since that commit); this fixes the rows saved before it, plus
 * any NULL / 0.
 *
 * The values being replaced are copied to appointments_gst_backup first
 * (appointment id, old gst), so the rupee amounts those bookings were
 * actually charged are not lost; down() restores them.
 *
 * Idempotent: once every row is 5 the UPDATE matches nothing, and the backup
 * only inserts ids it doesn't already hold.
 */

import { tableExists } from "../src/core/database/migrationHelpers.js";

const BACKUP = "appointments_gst_backup";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, "appointments"))) {
    console.log("[migrate] skip: appointments table does not exist");
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`${BACKUP}\` (
      \`appointment_id\` INT NOT NULL PRIMARY KEY,
      \`old_gst\` BIGINT NULL,
      \`backed_up_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [backup] = await queryInterface.sequelize.query(`
    INSERT IGNORE INTO \`${BACKUP}\` (appointment_id, old_gst)
    SELECT id, gst FROM \`appointments\`
    WHERE gst IS NULL OR gst <> 5
  `);
  console.log(`[migrate] backed up appointments.gst: ${backup?.affectedRows ?? "?"} row(s)`);

  const [result] = await queryInterface.sequelize.query(`
    UPDATE \`appointments\` SET gst = 5
    WHERE gst IS NULL OR gst <> 5
  `);
  console.log(`[migrate] set appointments.gst = 5: ${result?.affectedRows ?? "?"} row(s)`);
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, BACKUP))) {
    return;
  }
  await queryInterface.sequelize.query(`
    UPDATE \`appointments\` a
    INNER JOIN \`${BACKUP}\` b ON b.appointment_id = a.id
    SET a.gst = b.old_gst
  `);
}
