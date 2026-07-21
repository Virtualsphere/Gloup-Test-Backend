/**
 * One-off / ops: sync all active PartnerSubscriptionPlans missing razorpay_plan_id.
 *
 *   node scripts/sync-razorpay-plans.mjs
 *
 * Safe to re-run — already-synced plans are skipped.
 */

import dotenv from "dotenv";
dotenv.config();

import { connection } from "../src/core/database/connection.js";
import { partnerDbController } from "../src/core/database/Controller/partnerDbController.js";
import { syncPlanToRazorpay } from "../src/core/utils/syncRazorpayPlans.js";

async function main() {
  await connection.authenticate();

  const plans =
    await partnerDbController.Models.PartnerSubscriptionPlans.findAll({
      where: { is_active: 1 },
    });

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const plan of plans) {
    const plain = plan.toJSON();
    if (plain.razorpay_plan_id) {
      skipped += 1;
      console.log(
        `[sync] skip plan_id=${plain.plan_id} already ${plain.razorpay_plan_id}`
      );
      continue;
    }
    try {
      const rzpId = await syncPlanToRazorpay(plain);
      synced += 1;
      console.log(`[sync] ok plan_id=${plain.plan_id} → ${rzpId}`);
    } catch (err) {
      failed += 1;
      console.error(
        `[sync] fail plan_id=${plain.plan_id}:`,
        err?.message || err
      );
    }
  }

  console.log(
    `[sync] done — synced=${synced} skipped=${skipped} failed=${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[sync] failed:", err?.stack || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await connection.close();
    } catch {
      /* ignore */
    }
    process.exit(process.exitCode || 0);
  });
