/**
 * Moves manual partner subscriptions from "a fee every month on the
 * activation day" to booking cycles (see partnerSubscriptionBilling.js):
 * after a fee is fully paid the salon gets renewal_booking_limit free
 * bookings, and the next fee is charged only once the renewal date has come
 * AND that limit has been passed.
 *
 * PartnerManualSubscriptions gains:
 *   renewal_booking_limit        free bookings per cycle, per salon
 *   cycle_state                  'collecting' (fee owed, deducted from
 *                                payouts) | 'waiting' (free period)
 *   cycle_start_date             invoice day the last fee was fully paid;
 *                                bookings after it count toward the limit
 *   charged_on / charged_from_appointment_id
 *                                where the current fee starts: nothing is
 *                                deducted from earlier invoice days, and on
 *                                charged_on only from that booking onward
 * next_due_date now holds the renewal date (cycle_start_date + 1 month).
 *
 * InvoicePayouts gains subscription_state_before (JSON of those columns
 * before the payout), so undoInvoicePayout can restore a cycle exactly.
 *
 * Existing rows (user decision): every salon's renewal limit starts at the
 * current free_booking_limit. An active salon keeps what it owes today under
 * the old rule (incl. months accrued but not yet deducted) and keeps
 * collecting; one that owes nothing starts waiting today (renewal date =
 * today + 1 month, bookings counted from today).
 *
 * The data conversion runs in one transaction; Umzug records the migration
 * only after up() succeeds, so a failed run converts nothing and can simply
 * be retried.
 */

import {
  addColumnIfMissing,
  columnExists,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";
import { accrueDue, addOneMonth, DEFAULT_FREE_BOOKING_LIMIT } from "../src/core/utils/partnerSubscriptionBilling.js";
import { toIstDatePart } from "../src/core/schema/formats.js";

const SUBS = "PartnerManualSubscriptions";
const PAYOUTS = "InvoicePayouts";

const previousDay = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

export async function up({ context: queryInterface }) {
  if (!(await tableExists(queryInterface, SUBS))) {
    console.log(`[migrate] skip: ${SUBS} table does not exist`);
    return;
  }

  await addColumnIfMissing(queryInterface, SUBS, "renewal_booking_limit",
    "`renewal_booking_limit` INT NOT NULL DEFAULT 15");
  await addColumnIfMissing(queryInterface, SUBS, "cycle_state",
    "`cycle_state` ENUM('collecting','waiting') NOT NULL DEFAULT 'collecting'");
  await addColumnIfMissing(queryInterface, SUBS, "cycle_start_date", "`cycle_start_date` DATE NULL DEFAULT NULL");
  await addColumnIfMissing(queryInterface, SUBS, "charged_on", "`charged_on` DATE NULL DEFAULT NULL");
  await addColumnIfMissing(queryInterface, SUBS, "charged_from_appointment_id",
    "`charged_from_appointment_id` INT NULL DEFAULT NULL");
  if (await tableExists(queryInterface, PAYOUTS)) {
    await addColumnIfMissing(queryInterface, PAYOUTS, "subscription_state_before",
      "`subscription_state_before` TEXT NULL DEFAULT NULL");
  }

  let freeLimit = DEFAULT_FREE_BOOKING_LIMIT;
  if (await columnExists(queryInterface, "AdminSettings", "free_booking_limit")) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT free_booking_limit FROM AdminSettings WHERE id = 1 LIMIT 1"
    );
    const value = Number(rows?.[0]?.free_booking_limit);
    if (Number.isInteger(value) && value >= 0) freeLimit = value;
  }

  const today = toIstDatePart(new Date());
  await queryInterface.sequelize.transaction(async (transaction) => {
    const run = (sql, replacements = {}) =>
      queryInterface.sequelize.query(sql, { replacements, transaction });

    await run(`UPDATE \`${SUBS}\` SET renewal_booking_limit = :freeLimit`, { freeLimit });

    const [subs] = await run(`
      SELECT id, plan_amount, outstanding_due, next_due_date, activated_at
      FROM \`${SUBS}\` WHERE status = 'active'
    `);
    let collecting = 0;
    let waiting = 0;
    for (const sub of subs) {
      const { due } = accrueDue(sub, today);
      if (due > 0) {
        collecting += 1;
        await run(
          `UPDATE \`${SUBS}\` SET outstanding_due = :due, cycle_state = 'collecting',
             cycle_start_date = NULL, charged_on = NULL, charged_from_appointment_id = NULL
           WHERE id = :id`,
          { due, id: sub.id }
        );
      } else {
        waiting += 1;
        await run(
          `UPDATE \`${SUBS}\` SET outstanding_due = 0, cycle_state = 'waiting',
             cycle_start_date = :start, next_due_date = :renewal,
             charged_on = NULL, charged_from_appointment_id = NULL
           WHERE id = :id`,
          { start: previousDay(today), renewal: addOneMonth(today), id: sub.id }
        );
      }
    }
    console.log(
      `[migrate] booking cycles: renewal limit ${freeLimit}; ${collecting} collecting, ${waiting} waiting from ${today}`
    );
  });
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, PAYOUTS)) {
    await dropColumnIfExists(queryInterface, PAYOUTS, "subscription_state_before");
  }
  if (!(await tableExists(queryInterface, SUBS))) {
    return;
  }
  for (const column of ["charged_from_appointment_id", "charged_on", "cycle_start_date", "cycle_state", "renewal_booking_limit"]) {
    await dropColumnIfExists(queryInterface, SUBS, column);
  }
}
