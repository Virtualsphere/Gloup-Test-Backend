import * as Models from "../database/models/index.js";
const { Servicecategory } = Models;
import sequelize from "sequelize";
const { Op } = sequelize;

/**
 * Resolves which discount amount applies to a service for a given customer,
 * based on how many prior PAID bookings they have (global, across every
 * salon on the platform — see User.paid_booking_count).
 *
 * tier_discounts is an admin-authored array on StoreServices: index 0 is the
 * discount for the customer's 1st booking (bookingCount === 0), index 1 is
 * the 2nd booking, etc. Once bookingCount reaches/exceeds tier_discounts.length,
 * or the customer is anonymous (bookingCount == null), this falls back to the
 * service's flat `discounted_amount` — the "default" discount.
 *
 * categoryDiscountPercent (optional 3rd param) takes absolute priority over
 * both of the above when present — see getActiveCategoryDiscountsMap below.
 */
export function resolveDiscountedAmount(service, bookingCount, categoryDiscountPercent) {
  if (categoryDiscountPercent != null && categoryDiscountPercent > 0) {
    const base = Number(service?.amount) || 0;
    return Number((base * (1 - categoryDiscountPercent / 100)).toFixed(2));
  }

  let tiers = service?.tier_discounts;
  // Sequelize model reads (findOne/findAll) auto-parse JSON columns, but raw
  // SQL (connection.query) returns them as a JSON string — normalize both.
  if (typeof tiers === "string") {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = null;
    }
  }
  if (!Array.isArray(tiers)) tiers = [];

  if (bookingCount != null && bookingCount >= 0 && bookingCount < tiers.length) {
    const tierValue = Number(tiers[bookingCount]);
    if (!Number.isNaN(tierValue) && tierValue > 0) {
      return tierValue;
    }
  }

  return service?.discounted_amount ?? null;
}

/**
 * Every service category currently inside its admin-set discount window
 * (discount_starts_at <= now <= discount_ends_at), as a Map<category_id, percent>.
 * Call once per request and look up per service — cheap, small table.
 */
export async function getActiveCategoryDiscountsMap() {
  const rows = await Servicecategory.findAll({
    where: {
      discount_percent: { [Op.not]: null },
      discount_starts_at: { [Op.lte]: new Date() },
      discount_ends_at: { [Op.gte]: new Date() },
    },
    attributes: ["id", "discount_percent"],
    raw: true,
  });
  return new Map(rows.map((r) => [r.id, Number(r.discount_percent)]));
}
