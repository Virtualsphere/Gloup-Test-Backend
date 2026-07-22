import Razorpay from "razorpay";
import { partnerDbController } from "../database/Controller/partnerDbController.js";

const razorpay = new Razorpay({
  key_id: process.env.RZ_PAY_ID,
  key_secret: process.env.RZ_PAY_KEY,
});

/**
 * Resolve Razorpay plan id for a partner plan.
 * Prefers env overrides (dashboard plan ids), then DB `razorpay_plan_id`.
 */
export const resolveRazorpayPlanId = (plan) => {
  const name = String(plan?.plan_name || "").toLowerCase();
  if (name.includes("joining") && process.env.JOINING_FEE_RAZORPAY_PLAN_ID) {
    return process.env.JOINING_FEE_RAZORPAY_PLAN_ID;
  }
  if (name.includes("growth") && process.env.GROWTH_RAZORPAY_PLAN_ID) {
    return process.env.GROWTH_RAZORPAY_PLAN_ID;
  }
  if (name.includes("premium") && process.env.PREMIUM_RAZORPAY_PLAN_ID) {
    return process.env.PREMIUM_RAZORPAY_PLAN_ID;
  }
  return plan?.razorpay_plan_id || null;
};

/**
 * Persist env-mapped Razorpay plan id onto the DB row when missing/different.
 */
export const linkRazorpayPlanIdToDb = async (plan, razorpayPlanId) => {
  if (!plan?.plan_id || !razorpayPlanId) return;
  if (plan.razorpay_plan_id === razorpayPlanId) return;
  await partnerDbController.Models.PartnerSubscriptionPlans.update(
    { razorpay_plan_id: razorpayPlanId },
    { where: { plan_id: plan.plan_id } }
  );
};

/**
 * Create a Razorpay Plan for an internal PartnerSubscriptionPlans row
 * and store `razorpay_plan_id`. Idempotent if already synced.
 *
 * @param {object} plan - Sequelize model or plain object with plan_id, plan_name, etc.
 * @returns {Promise<string>} Razorpay plan id
 */
export const syncPlanToRazorpay = async (plan) => {
  if (!plan?.plan_id) {
    throw new Error("plan_id is required to sync with Razorpay");
  }

  const fromEnv = resolveRazorpayPlanId(plan);
  if (fromEnv) {
    await linkRazorpayPlanIdToDb(plan, fromEnv);
    return fromEnv;
  }

  if (plan.razorpay_plan_id) {
    return plan.razorpay_plan_id;
  }

  if (!process.env.RZ_PAY_ID || !process.env.RZ_PAY_KEY) {
    throw new Error("Razorpay credentials (RZ_PAY_ID / RZ_PAY_KEY) are not configured");
  }

  const amountRupees = parseFloat(
    plan.discount_price ?? plan.price ?? 0
  );
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    throw new Error(
      `Plan ${plan.plan_id} has invalid amount for Razorpay sync`
    );
  }

  const interval = Math.max(1, Number(plan.duration_months) || 1);

  const rzpPlan = await razorpay.plans.create({
    period: "monthly",
    interval,
    item: {
      name: String(plan.plan_name || `Plan ${plan.plan_id}`).slice(0, 255),
      amount: Math.round(amountRupees * 100),
      currency: "INR",
      description: String(plan.description || plan.plan_name || "").slice(0, 255),
    },
  });

  await partnerDbController.Models.PartnerSubscriptionPlans.update(
    { razorpay_plan_id: rzpPlan.id },
    { where: { plan_id: plan.plan_id } }
  );

  return rzpPlan.id;
};

/**
 * Ensure plan has razorpay_plan_id; sync if missing. Reloads from DB after sync.
 */
export const ensurePlanSyncedToRazorpay = async (planOrId) => {
  const planId =
    typeof planOrId === "object" ? planOrId.plan_id : planOrId;

  let plan =
    typeof planOrId === "object"
      ? planOrId
      : await partnerDbController.Models.PartnerSubscriptionPlans.findOne({
          where: { plan_id: planId, is_active: 1 },
        });

  if (!plan) {
    throw new Error(`Active plan ${planId} not found`);
  }

  const plain = typeof plan.toJSON === "function" ? plan.toJSON() : plan;
  const resolved = resolveRazorpayPlanId(plain);
  if (resolved) {
    await linkRazorpayPlanIdToDb(plain, resolved);
    return resolved;
  }

  if (plain.razorpay_plan_id) {
    return plain.razorpay_plan_id;
  }

  await syncPlanToRazorpay(plain);
  const refreshed =
    await partnerDbController.Models.PartnerSubscriptionPlans.findByPk(planId);
  return refreshed?.razorpay_plan_id;
};
