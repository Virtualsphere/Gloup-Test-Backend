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
 */
export function resolveDiscountedAmount(service, bookingCount) {
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
