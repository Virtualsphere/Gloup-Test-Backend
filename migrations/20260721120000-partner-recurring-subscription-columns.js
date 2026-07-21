/**
 * Partner auto-pay / Razorpay Subscriptions schema.
 * Idempotent: safe if columns were already added manually or via model sync.
 */

import {
  addColumnIfMissing,
  addIndexIfMissing,
  dropColumnIfExists,
  tableExists,
} from "../src/core/database/migrationHelpers.js";

export async function up({ context: queryInterface }) {
  // ── Store: Razorpay customer for recurring mandates ─────────────────
  if (await tableExists(queryInterface, "Store")) {
    await addColumnIfMissing(
      queryInterface,
      "Store",
      "razorpay_customer_id",
      "`razorpay_customer_id` VARCHAR(255) NULL DEFAULT NULL"
    );
  } else {
    console.log("[migrate] skip: Store table does not exist yet");
  }

  // ── Plans: link to Razorpay Plan entity ─────────────────────────────
  if (await tableExists(queryInterface, "PartnerSubscriptionPlans")) {
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptionPlans",
      "razorpay_plan_id",
      "`razorpay_plan_id` VARCHAR(255) NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptionPlans",
      "description",
      "`description` TEXT NULL"
    );
  } else {
    console.log(
      "[migrate] skip: PartnerSubscriptionPlans table does not exist yet"
    );
  }

  // ── Subscriptions: recurring / autopay fields ───────────────────────
  if (await tableExists(queryInterface, "PartnerSubscriptions")) {
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "razorpay_subscription_id",
      "`razorpay_subscription_id` VARCHAR(255) NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "razorpay_customer_id",
      "`razorpay_customer_id` VARCHAR(255) NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "rzp_status",
      "`rzp_status` ENUM('created','authenticated','active','pending','halted','cancelled','completed','expired') NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "current_start",
      "`current_start` DATETIME NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "current_end",
      "`current_end` DATETIME NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "charge_at",
      "`charge_at` DATETIME NULL DEFAULT NULL"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "paid_count",
      "`paid_count` INT NOT NULL DEFAULT 0"
    );
    await addColumnIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "total_count",
      "`total_count` INT NULL DEFAULT NULL"
    );

    await addIndexIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "idx_partner_subs_rzp_subscription_id",
      "`razorpay_subscription_id`"
    );
    await addIndexIfMissing(
      queryInterface,
      "PartnerSubscriptions",
      "idx_partner_subs_salon_active",
      "`salon_id`, `is_active`"
    );
  } else {
    console.log(
      "[migrate] skip: PartnerSubscriptions table does not exist yet"
    );
  }
}

export async function down({ context: queryInterface }) {
  if (await tableExists(queryInterface, "PartnerSubscriptions")) {
    // Drop indexes first (ignore if missing)
    for (const idx of [
      "idx_partner_subs_rzp_subscription_id",
      "idx_partner_subs_salon_active",
    ]) {
      try {
        await queryInterface.sequelize.query(
          `DROP INDEX \`${idx}\` ON \`PartnerSubscriptions\``
        );
      } catch {
        /* already gone */
      }
    }

    for (const col of [
      "total_count",
      "paid_count",
      "charge_at",
      "current_end",
      "current_start",
      "rzp_status",
      "razorpay_customer_id",
      "razorpay_subscription_id",
    ]) {
      await dropColumnIfExists(queryInterface, "PartnerSubscriptions", col);
    }
  }

  if (await tableExists(queryInterface, "PartnerSubscriptionPlans")) {
    await dropColumnIfExists(
      queryInterface,
      "PartnerSubscriptionPlans",
      "razorpay_plan_id"
    );
    // Keep description — used by getplans; only drop if we want full reverse
    await dropColumnIfExists(
      queryInterface,
      "PartnerSubscriptionPlans",
      "description"
    );
  }

  if (await tableExists(queryInterface, "Store")) {
    await dropColumnIfExists(queryInterface, "Store", "razorpay_customer_id");
  }
}
