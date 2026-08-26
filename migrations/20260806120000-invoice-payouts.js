/**
 * Tracks whether a partner's daily invoice (store_id + invoice_date) has been
 * paid out by the admin. Row existence == paid; deleting the row reverts it
 * back to pending (undo).
 * Idempotent: safe if table already exists.
 */

import {
  tableExists,
  addIndexIfMissing,
} from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, "InvoicePayouts")) {
    console.log("[migrate] skip: InvoicePayouts already exists");
  } else {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`InvoicePayouts\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`store_id\` INT NOT NULL,
        \`invoice_date\` DATE NOT NULL,
        \`amount\` DECIMAL(10,2) NULL,
        \`marked_by\` INT NULL,
        \`paid_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_invoice_payout_store_date\` (\`store_id\`, \`invoice_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] created: InvoicePayouts");
  }

  await addIndexIfMissing(
    queryInterface,
    "InvoicePayouts",
    "idx_invoice_payouts_date",
    "`invoice_date`"
  );
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, "InvoicePayouts")) {
    await queryInterface.sequelize.query(`DROP TABLE \`InvoicePayouts\``);
    console.log("[migrate] dropped: InvoicePayouts");
  }
}
