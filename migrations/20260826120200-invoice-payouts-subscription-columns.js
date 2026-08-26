/**
 * Extends InvoicePayouts to record what a manual-subscription deduction did
 * to a specific day's payout, so undoInvoicePayout can precisely reverse it:
 * - subscription_deducted: how much was subtracted from that day's gross
 *   invoice total (0 if the partner had no active subscription that day).
 * - subscription_outstanding_before / subscription_next_due_before:
 *   snapshot of PartnerManualSubscriptions.outstanding_due/next_due_date
 *   immediately before this payout's deduction was applied, so undo can
 *   restore the subscription row exactly.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "InvoicePayouts";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    "subscription_deducted",
    "`subscription_deducted` DECIMAL(10,2) NOT NULL DEFAULT 0"
  );
  await addColumnIfMissing(
    queryInterface,
    TABLE,
    "subscription_outstanding_before",
    "`subscription_outstanding_before` DECIMAL(10,2) NULL DEFAULT NULL"
  );
  await addColumnIfMissing(
    queryInterface,
    TABLE,
    "subscription_next_due_before",
    "`subscription_next_due_before` DATE NULL DEFAULT NULL"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, "subscription_deducted");
  await dropColumnIfExists(queryInterface, TABLE, "subscription_outstanding_before");
  await dropColumnIfExists(queryInterface, TABLE, "subscription_next_due_before");
}
