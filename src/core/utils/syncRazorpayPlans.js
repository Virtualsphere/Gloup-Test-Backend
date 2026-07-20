import Razorpay from "razorpay";
import { partnerDbController } from "../database/Controller/partnerDbController.js";

const razorpay = new Razorpay({
  key_id: process.env.RZ_PAY_ID,
  key_secret: process.env.RZ_PAY_KEY,
});

export const syncPlanToRazorpay = async (plan) => {
  const rzpPlan = await razorpay.plans.create({
    period: "monthly",
    interval: plan.duration_months || 1,
    item: {
      name: plan.plan_name,
      amount: Math.round(parseFloat(plan.discount_price) * 100),
      currency: "INR",
      description: plan.description || plan.plan_name,
    },
  });

  await partnerDbController.Models.PartnerSubscriptionPlans.update(
    { razorpay_plan_id: rzpPlan.id },
    { where: { plan_id: plan.plan_id } }
  );

  return rzpPlan.id;
};