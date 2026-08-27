/**
 * Manually-administered partner subscription billing — entirely separate
 * from the Razorpay-driven PartnerSubscriptions/PartnerSubscriptionPlans
 * tables. One row per partner: their current flat monthly fee, and the
 * running billing-cycle state (outstanding_due / next_due_date) used to
 * deduct that fee from their daily invoice payout.
 * Idempotent: safe if table already exists.
 */

import {
  tableExists,
  addIndexIfMissing,
} from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  if (await tableExists(queryInterface, "PartnerManualSubscriptions")) {
    console.log("[migrate] skip: PartnerManualSubscriptions already exists");
  } else {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`PartnerManualSubscriptions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`store_id\` INT NOT NULL,
        \`plan_amount\` DECIMAL(10,2) NOT NULL,
        \`status\` ENUM('active','inactive') NOT NULL DEFAULT 'active',
        \`outstanding_due\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`next_due_date\` DATE NOT NULL,
        \`activated_at\` DATE NOT NULL,
        \`created_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_partner_manual_subscription_store\` (\`store_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] created: PartnerManualSubscriptions");
  }

  await addIndexIfMissing(
    queryInterface,
    "PartnerManualSubscriptions",
    "idx_partner_manual_subscriptions_status",
    "`status`"
  );
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, "PartnerManualSubscriptions")) {
    await queryInterface.sequelize.query(`DROP TABLE \`PartnerManualSubscriptions\``);
    console.log("[migrate] dropped: PartnerManualSubscriptions");
  }
}
