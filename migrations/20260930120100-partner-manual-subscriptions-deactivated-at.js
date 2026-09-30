/**
 * Adds PartnerManualSubscriptions.deactivated_at — the day a manual
 * subscription was switched off. Before this, deactivating only flipped
 * status to 'inactive' with no date, so "how many subscriptions were
 * active at the end of month X" (the dashboard's subscription growth) was
 * impossible to answer for any partner who had since been deactivated.
 *
 * Set in deactivateManualPartnerSubscription and cleared again when the
 * partner is re-assigned. Existing inactive rows can't be backfilled (the
 * date was never recorded), so they stay NULL and are simply left out of
 * historical counts.
 * Idempotent: safe to re-run.
 */

import {
  addColumnIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

const TABLE = "PartnerManualSubscriptions";
const COLUMN = "deactivated_at";

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    console.log(`[migrate] skip: ${TABLE} table does not exist`);
    return;
  }

  await addColumnIfMissing(
    queryInterface,
    TABLE,
    COLUMN,
    "`deactivated_at` DATE NULL DEFAULT NULL AFTER `activated_at`"
  );
}

export async function down({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, TABLE))) {
    return;
  }
  await dropColumnIfExists(queryInterface, TABLE, COLUMN);
}
