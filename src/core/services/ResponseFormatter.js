import { find } from "geo-tz";

/**
 * Format Salon Details Response (v2) with all related data
 * Returns: about, amenities, stylists, slots, images, gallery
 */
export function formatSalonDetailsV2({
  salonDetails,
  stylists,
  getslotsv2,
  amenities,
}) {
  return {
    id: salonDetails.id,
    name: salonDetails.name,
    storeId: salonDetails.store_id || salonDetails.id,
    about: salonDetails.about || salonDetails.description || null,
    images: Array.isArray(salonDetails.images) ? salonDetails.images : [],
    gallery: Array.isArray(salonDetails.gallery) ? salonDetails.gallery : [],
    phone: salonDetails.phone || null,
    email: salonDetails.email || null,
    website: salonDetails.website || null,
    socialMedia: salonDetails.social_media || {},
    amenities: formatAmenitiesV2(salonDetails.amenities, amenities),
    stylists: formatStylistsv2(stylists),
    slots: formatSlotsv2(getslotsv2),
    operatingHours: formatOpeningHours(getslotsv2),
    // createdAt: salonDetails.createdAt,
    // updatedAt: salonDetails.updatedAt,
  };
}

/**
 * Format Amenities with details (id, name, icon)
 */
function formatAmenitiesV2(amenityIds = [], amenityDetails = []) {
  if (!amenityIds || amenityIds.length === 0) return [];

  return amenityIds.map((id) => {
    const detail = amenityDetails.find((a) => a.id === id);
    return {
      id,
      name: detail?.name || "Unknown",
      icon: detail?.icon || "info",
    };
  });
}

/**
 * Format Stylists with profile
 */
function formatStylistsv2(stylists = []) {
  return stylists.map((stylist) => ({
    id: stylist.id,
    name: stylist.name || "Unknown",
    designation: stylist.designation || "Stylist",
    profilePic: stylist.profilepic || null,
    experienceYears: stylist.experience_years || 0,
    specialization: stylist.known_services || null,
    rating: stylist.rating ? Number(stylist.rating).toFixed(1) : null,
    status: stylist.status || "active",
  }));
}

/**
 * Format Slots with day and time
 */
function formatSlotsv2(slots = []) {
  const groupedByDay = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  };

  slots.forEach((slot) => {
    // 🛡️ Skip slots with null/missing days
    if (!slot.day) return;

    // Convert slot.day (e.g. "monday") to "Monday" to match our predefined keys
    const capitalizedDay =
      slot.day.charAt(0).toUpperCase() + slot.day.slice(1).toLowerCase();

    if (groupedByDay[capitalizedDay]) {
      groupedByDay[capitalizedDay].push({
        id: slot.id,
        from: formatTimeTo12h(slot.from),
        to: formatTimeTo12h(slot.to),
        notes: slot.notes || "",
        isBlocked: slot.is_blocked === 1 || slot.is_blocked === true,
        isclosed: slot.is_closed === 1 || slot.is_closed === true,
      });
    }
  });

  return groupedByDay;
}

/**
 * Helper to convert 24h time string (HH:mm:ss or HH:mm) to 12h AM/PM
 */
function formatTimeTo12h(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  let h = parseInt(parts[0], 10);
  const m = parts[1] || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const hours = h < 10 ? `0${h}` : h;
  return `${hours}:${m} ${ampm}`;
}

export function updateFormatSalonResponseV2({
  store,
  stylists = [],
  slots = [],
  amenities = [],
}) {
  if (!store) return null;

  return {
    message: "Salon updated successfully",
    data: formatSalonDetailsV2({
      stylists,
      store,
      getslotsv2: slots,
      amenities,
    }),
  };
}
export function formatSalonResponse({
  store,
  services,
  stylists,
  reviews,
  slots,
  languages,
  amenities,
  ratingData,
  workingHours,
}) {
  const images = resolveStoreImages(store);
  const salonimage = pickSalonCoverUrl(store, images);
  const logo = pickSalonLogoUrl(store, images);
  const address = `${store.addressLine1 || ""}, ${store.area || ""}, ${store.city || ""} - ${store.zipcode || ""}`;
  return {
    id: store.id,
    name: store.name,
    isNew: isWithinDays(store.createdAt, 30),
    isPremium: store.is_premium,
    rating: Number(ratingData?.avg_rating || 0).toFixed(1),
    reviewCount: ratingData?.reviewCount || 0,
    gender: store.store_type,
    salonimage,
    logo,
    isOpen: checkIfOpen(slots, store.latitude, store.longitude),
    openingTime: getOpeningTime(slots),
    closingTime: getClosingTime(slots),
    languages: formatLanguages(languages),
    images,
    about: store.description,
    services: formatServices(services),
    ambients: formatAmenities(amenities),
    teamMembers: formatStylists(stylists),
    reviews: formatReviews(reviews),
    openingHours: formatOpeningHours(slots),
    workingHours: workingHours,
    Area: store.area,
    City: store.city,
    location: {
      latitude: store.latitude,
      longitude: store.longitude,
      address,
    },
  };
}

/* ---------------- HELPERS ---------------- */

function safeParse(data) {
  try {
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function isWithinDays(date, days) {
  if (!date) return false;
  const created = new Date(date);
  const now = new Date();
  const diff = (now - created) / (1000 * 60 * 60 * 24);
  return diff <= days;
}

function formatServices(services = []) {
  return services.map((service) => {

    const hasDiscount =
      service.discounted_amount &&
      service.discounted_amount < service.amount;

    return {
      id: service.id,

      name: service.service_name,

      duration: service.duration,

      price: hasDiscount
        ? service.discounted_amount
        : service.amount,

      originalPrice: hasDiscount
        ? service.amount
        : null,

      discountPercentage: hasDiscount
        ? `${Math.round(
            ((service.amount - service.discounted_amount) /
              service.amount) * 100
          )}%`
        : null,

      // FIXED
      isPopular: Boolean(service.is_popular),

      // ADD THESE
      popularRank: service.popular_rank || null,

      priority: service.priority || 0,

      serviceFor: service.service_for || "unisex",

      category: service.category_name || null,
    };
  });
}

function formatStylists(stylists = []) {
  return stylists.map((stylist) => ({
    id: `member_${stylist.id}`,
    name: stylist.name,
    role: stylist.designation,
    imageUrl: stylist.profilepic,
  }));
}

// function formatLanguages(languages = []) {
//   if (!Array.isArray(languages)) return [];

//   return languages.map(language => ({
//     id: `language_${language.id}`,
//     name: language.name,
//     code: language.code
//   }));
// }
function formatLanguages(languages = []) {
  return languages.map((language) => language.name);
}

function formatReviews(reviews = []) {
  return reviews.map((review) => ({
    id: `review_${review.id}`,
    userName: "User",
    userImage: null,
    timeAgo: calculateTimeAgo(review.cretaed_at),
    rating: review.rating,
    reviewText: review.review_description,
  }));
}

// function formatOpeningHours(slots = []) {
//   const result = {};
//   slots.forEach(slot => {
//     result[slot.day] =
//       `${formatTime(slot.from)} - ${formatTime(slot.to)}`;
//   });
//   console.log(result);
//   return result;
// }

function formatOpeningHours(slots = []) {
  const daysOfWeek = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const result = {};

  // Initialize all days with null
  daysOfWeek.forEach((day) => {
    result[day] = null;
  });

  for (const slot of slots) {
    const day = slot.day;
    if (result.hasOwnProperty(day)) {
      if (!result[day]) {
        result[day] = {
          open: formatTime(slot.from),
          close: formatTime(slot.to),
          rawOpen: slot.from,
          rawClose: slot.to,
        };
      } else {
        if (slot.from < result[day].rawOpen) {
          result[day].open = formatTime(slot.from);
          result[day].rawOpen = slot.from;
        }
        if (slot.to > result[day].rawClose) {
          result[day].close = formatTime(slot.to);
          result[day].rawClose = slot.to;
        }
      }
    }
  }

  // Remove raw times from result
  for (const day in result) {
    if (result[day]) {
      delete result[day].rawOpen;
      delete result[day].rawClose;
    }
  }

  return result;
}
// function formatOpeningHours(slots = []) {
//   const result = {};

//   for (const slot of slots) {
//     const day = slot.day;

//     if (!result[day]) {
//       result[day] = {
//         open: slot.from,
//         close: slot.to,
//       };
//     } else {
//       if (slot.from < result[day].open) result[day].open = slot.from;
//       if (slot.to > result[day].close) result[day].close = slot.to;
//     }
//   }
// }
//   const formatted = {};

//   for (const day in result) {
//     formatted[day] =
//       `${formatTime(result[day].open)} - ${formatTime(result[day].close)}`;
//   }

//   return formatted;
// }

function formatAmenities(amenities = []) {
  return amenities.map((a) => ({
    id: `ambient_${a.id}`,
    icon: "info",
    label: "Amenity",
  }));
}

function formatTime(time) {
  if (!time) return "";
  const [hour, minute] = time.split(":");
  const h = parseInt(hour);
  const ampm = h >= 12 ? "PM" : "AM";
  const formattedHour = h % 12 || 12;
  return `${formattedHour}:${minute} ${ampm}`;
}

function calculateTimeAgo(date) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Get timezone from latitude and longitude
 * Uses geo-tz library - no hardcoding needed, works globally
 */
function getTimezoneFromCoordinates(latitude, longitude) {
  try {
    if (!latitude || !longitude) {
      return "Asia/Kolkata"; // Fallback default
    }

    const timezones = find(parseFloat(latitude), parseFloat(longitude));
    return timezones && timezones.length > 0 ? timezones[0] : "Asia/Kolkata";
  } catch (error) {
    console.error("Error getting timezone from coordinates:", error);
    return "Asia/Kolkata"; // Fallback default
  }
}

/**
 * Get current time in store's timezone (based on coordinates)
 */
function getCurrentTimeInTimezone(latitude, longitude) {
  const now = new Date();
  const timezone = getTimezoneFromCoordinates(latitude, longitude);

  // Get day name in store's timezone
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  });
  const day = dayFormatter.format(now);

  // Get time in HH:mm format in store's timezone
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const timeStr = timeFormatter.format(now);
  const [hours, minutes] = timeStr.split(":");

  return {
    day,
    time: `${hours}:${minutes}`,
    minutes: parseInt(hours) * 60 + parseInt(minutes),
  };
}

function checkIfOpen(slots = [], latitude = "", longitude = "") {
  if (!slots || slots.length === 0) return false;

  try {
    const { day, minutes: currentMinutes } = getCurrentTimeInTimezone(
      latitude,
      longitude,
    );

    // Get slots for today
    const todaySlots = slots.filter(
      (s) =>
        s.day &&
        typeof s.day === "string" &&
        s.day.toLowerCase() === day.toLowerCase(),
    );

    if (todaySlots.length === 0) return false;

    // Check if current time falls within any slot
    for (const slot of todaySlots) {
      const fromMinutes = timeToMinutes(slot.from);
      const toMinutes = timeToMinutes(slot.to);

      if (currentMinutes >= fromMinutes && currentMinutes <= toMinutes) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error in checkIfOpen:", error);
    return false;
  }
}

// function getOpeningTime(slots = []) {
//   return slots.length ? formatTime(slots[0].from) : "";
// }

// function getClosingTime(slots = []) {
//   return slots.length ? formatTime(slots[0].to) : "";
// }

function getOpeningTime(slots = []) {
  if (!slots.length) return "";

  const earliest = slots.reduce((min, slot) =>
    slot.from < min.from ? slot : min,
  );

  return formatTime(earliest.from);
}

function getClosingTime(slots = []) {
  if (!slots.length) return "";

  const latest = slots.reduce((max, slot) => (slot.to > max.to ? slot : max));

  return formatTime(latest.to);
}

// get nearby services

function parseImages(images) {
  try {
    return typeof images === "string" ? JSON.parse(images) : images || [];
  } catch {
    return [];
  }
}

function resolveStoreImages(store) {
  return parseImages(store.images)
    .map((item) => (item == null ? null : String(item).trim()))
    .filter(Boolean);
}

/** List/card cover: primary image → logo → first gallery image */
function pickSalonCoverUrl(store, resolvedImages = []) {
  return (
    (store.salon_image ? String(store.salon_image).trim() : null) ||
    (store.logo ? String(store.logo).trim() : null) ||
    resolvedImages[0] ||
    null
  );
}

/** Brand logo for avatar; falls back to cover */
function pickSalonLogoUrl(store, resolvedImages = []) {
  return (
    (store.logo ? String(store.logo).trim() : null) ||
    (store.salon_image ? String(store.salon_image).trim() : null) ||
    resolvedImages[0] ||
    null
  );
}

function formatStoreMediaFields(store) {
  const images = resolveStoreImages(store);
  return {
    images,
    salonImage: pickSalonCoverUrl(store, images),
    logo: pickSalonLogoUrl(store, images),
  };
}

export function formatNearbyStores(stores = []) {
  if (!Array.isArray(stores)) return [];

  return stores.map((store) => {
    const media = formatStoreMediaFields(store);

    // Build address only if at least one field has a value
    let address = null;
    if (store.addressLine1 || store.area || store.city || store.zipcode) {
      const parts = [];
      if (store.addressLine1) parts.push(store.addressLine1);
      if (store.area) parts.push(store.area);
      if (store.city) parts.push(store.city);

      let addressStr = parts.join(", ");
      if (store.zipcode) {
        addressStr += ` - ${store.zipcode}`;
      }
      address = addressStr;
    }

    return {
      id: store.id,
      salonName: store.name,
      salonImage: media.salonImage,
      logo: media.logo,
      images: media.images,
      rating: parseFloat(Number(store.rating || 0).toFixed(1)),
      distance:
        store.distance != null && store.distance !== ""
          ? parseFloat(Number(store.distance).toFixed(2))
          : null,
      isPremium: !!store.is_premium,
      isFavorite: !!store.isFavorite,
      serviceName: store.serviceName || null,
      servicePrice: store.servicePrice || null,
      address,
      area: store.area || null,
      city: store.city || null,
      district: store.district || null,
      state: store.state || null,
      zipcode: store.zipcode || null,
      categories: store.categories ? store.categories.split(",") : [],
      languageCodes: store.languageCodes ? store.languageCodes.split(",") : [],
    };
  });
}
export const formatSalonList = ({
  rawData,
  page,
  limit,
  totalRecords,
  lat,
  lng,
}) => {
  const totalPages = Math.ceil(totalRecords / limit);

  return {
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
    },
    data: rawData.map((store) => {
      const media = formatStoreMediaFields(store);

      // Build address only if at least one field has a value
      let address = null;
      if (store.addressLine1 || store.area || store.city || store.zipcode) {
        const parts = [];
        if (store.addressLine1) parts.push(store.addressLine1);
        if (store.area) parts.push(store.area);
        if (store.city) parts.push(store.city);

        let addressStr = parts.join(", ");
        if (store.zipcode) {
          addressStr += ` - ${store.zipcode}`;
        }
        address = addressStr;
      }

      // Calculate distance if lat/lng provided and store has coordinates
      let distance = null;
      if (lat && lng && store.latitude && store.longitude) {
        distance = parseFloat(Number(store.distance || 0).toFixed(2));
      }

      return {
        id: store.id,
        salonName: store.name,
        salonImage: media.salonImage,
        logo: media.logo,
        images: media.images,
        salontype: store.store_type,
        rating: Number(store.rating),
        reviewCount: Number(store.reviewCount),
        distance: distance,
        address: address,
        isPremium: Boolean(store.is_premium),
        isFavorite: Boolean(store.isFavorite),
        serviceName: store.serviceName,
        servicePrice: store.servicePrice ? Number(store.servicePrice) : null,
        categories: store.categories ? store.categories.split(",") : [],
        languageCodes: store.languageCodes
          ? store.languageCodes.split(",")
          : [],
      };
    }),
  };
};

// formatters/topSalons.formatter.js
export const formatTopSalons = ({
  rawData,
  page,
  limit,
  totalRecords,
  lat,
  lng,
}) => {
  const totalPages = Math.ceil(totalRecords / limit);

  return {
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
    },
    data: rawData.map((store) => {
      const media = formatStoreMediaFields(store);

      // Build address only if at least one field has a value
      let address = null;
      if (store.addressLine1 || store.area || store.city || store.zipcode) {
        const parts = [];
        if (store.addressLine1) parts.push(store.addressLine1);
        if (store.area) parts.push(store.area);
        if (store.city) parts.push(store.city);

        let addressStr = parts.join(", ");
        if (store.zipcode) {
          addressStr += ` - ${store.zipcode}`;
        }
        address = addressStr;
      }

      // Calculate distance if lat/lng provided and store has coordinates
      let distance = null;
      if (lat && lng && store.latitude && store.longitude) {
        distance = parseFloat(Number(store.distance || 0).toFixed(2));
      }

      return {
        id: store.id,
        salonName: store.name,
        salonImage: media.salonImage,
        logo: media.logo,
        images: media.images,
        storeType: store.store_type,
        rating: Number(store.rating),
        reviewCount: Number(store.reviewCount),
        distance: distance,
        address: address,
        isPremium: Boolean(store.is_premium),
        isFavorite: Boolean(store.isFavorite),
        serviceName: store.serviceName,
        servicePrice: store.servicePrice ? Number(store.servicePrice) : null,
        categories: store.categories ? store.categories.split(",") : [],
        languageCodes: store.language_codes
          ? store.language_codes.split(",")
          : [],
      };
    }),
  };
};

export function formatCouponResponse(coupons = []) {
  return coupons.map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    // description: coupon.description,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
    // minOrderValue: Number(coupon.min_order_value),
    // maxDiscountAmount: Number(coupon.max_discount_amount),
    // expiryDate: coupon.expiry_date,
    // usageLimit: Number(coupon.usage_limit),
    // usedCount: Number(coupon.used_count || 0)
  }));
}

export function formatReviewListV2({ reviews, total, page, limit }) {
  const totalPages = Math.ceil(total / limit);

  return {
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalRecords: total,
      totalPages: totalPages,
    },
    data: reviews.map((review) => ({
      id: review.id,
      rating: Number(review.rating),
      description: review.review_description,
      store: {
        id: review.store_id,
        name: review.store_name,
        images: safeParse(review.store_images),
        address: {
          addressLine1: review.addressLine1,
          city: review.city,
          zipcode: review.zipcode,
        },
      },
    })),
  };
}
export function formatServicesListV2({
  summary,
  categoryStats,
  services,
  pagination,
}) {
  return {
    summary: {
      total: Number(summary.total || 0),
      active: Number(summary.active || 0),
      inactive: Number(summary.inactive || 0),
    },
    categories: [
      { id: 0, name: "All", count: Number(summary.total || 0) },
      ...categoryStats.map((cat) => ({
        id: cat.id,
        name: cat.name,
        count: Number(cat.count || 0),
      })),
    ],
    services: services.map((service) => {
      const amount = Number(service.amount || 0);
      const discountedAmount = Number(service.discounted_amount || 0);
      const hasDiscount = discountedAmount > 0 && discountedAmount < amount;

      return {
        id: service.id,
        name: service.service_name,
        category: service.category_name,
        duration: formatDuration(service.duration),
        price: hasDiscount ? discountedAmount : amount,
        originalPrice: hasDiscount ? amount : null,
        gender: formatGenderIcons(service.service_for),
        status: service.status,
        isInactive: service.status === "inactive",
      };
    }),
    pagination,
  };
}

/* --- Internal Helpers for v2 Services --- */

function formatDuration(duration) {
  if (!duration) return "0 min";
  // Assuming HH:mm:ss format
  const parts = duration.split(":");
  if (parts.length < 2) return duration;
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const totalMinutes = hours * 60 + minutes;
  return `${totalMinutes} min`;
}

function formatGenderIcons(serviceFor) {
  // Returns an array of genders to match the UI icons requirement
  switch (serviceFor?.toLowerCase()) {
    case "male":
      return ["male"];
    case "female":
      return ["female"];
    case "unisex":
      return ["male", "female"];
    default:
      return [];
  }
}

/**
 * Format Owner Profile Response (v2)
 * Cleans up sensitive and redundant data from subscriptions and plans
 */
export function formatOwnerProfileV2(profileData) {
  if (!profileData) return null;

  const {
    partnersubscription: sub,
    active_plan: plan,
    ...profile
  } = profileData;

  // 1. Clean subscription info (remove sensitive gateway IDs)
  const cleanSubscription = sub
    ? {
        subscription_id: sub.subscription_id,
        plan_id: sub.plan_id,
        start_date: sub.start_date,
        end_date: sub.end_date,
        amount_paid: sub.amount_paid,
        payment_status: sub.payment_status || "paid",
        is_active: sub.is_active === 1 || sub.is_active === true,
      }
    : null;

  // 2. Clean active plan info (focus on UI-relevant fields)
  const cleanPlan = plan
    ? {
        plan_id: plan.plan_id,
        plan_name: plan.plan_name,
        price: plan.price,
        original_price: plan.original_price,
        discount_price: plan.discount_price,
        duration_months: plan.duration_months,
        booking_limit: plan.booking_limit,
        is_unlimited: plan.is_unlimited === 1 || plan.is_unlimited === true,
        start_date: plan.start_date,
        end_date: plan.end_date,
      }
    : null;

  // 3. Calculate remaining days
  // 0. Calculate remaining days safely
  const subEndDate = sub?.end_date;
  const remainingDays =
    subEndDate
      ? Math.ceil((new Date(subEndDate) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

  return {
    id: profile.id || null,
    name: profile.name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    profile_pic: profile.profile_pic || null,
    country: profile.country || "",
    country_code: profile.country_code || "",
    Dob: profile.Dob || null,
    store_id: profile.store_id || null,
    city: profile.city || null,

    // Requested top-level keys
    plan_id: cleanPlan?.plan_id || 0,
    plan_name: cleanPlan?.plan_name || "Free",
    is_premium:
      profile.is_premium === 1 || profile.is_premium === true || false,
    plan_remaining_date: cleanPlan ? Math.max(0, remainingDays) : null,

    // partnersubscription: cleanSubscription,
    // active_plan: cleanPlan,
    // createdAt: profile.createdAt || profile.created_at || null,
    // updatedAt: profile.updatedAt || profile.updated_at || null,
  };
}
