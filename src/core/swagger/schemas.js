/**
 * OpenAPI component schemas — explicit properties (avoids Swagger UI "additionalProp1").
 */
export const OPENAPI_SCHEMAS = {
  SendOtpRequest: {
    type: "object",
    required: ["phone"],
    properties: {
      phone: { type: "string", example: "9876543210", description: "10-digit mobile number" },
    },
  },
  VerifyOtpRequest: {
    type: "object",
    required: ["phone", "otp"],
    properties: {
      phone: { type: "string", example: "9876543210" },
      otp: { type: "string", example: "123456" },
    },
  },
  DeviceIdRequest: {
    type: "object",
    required: ["device_id"],
    properties: {
      device_id: {
        type: "string",
        example: "fcm_token_string",
        description: "FCM device token",
      },
    },
  },
  SocialLoginRequest: {
    type: "object",
    properties: {
      id_token: { type: "string", description: "Google/Apple ID token" },
      email: { type: "string", format: "email" },
      name: { type: "string" },
      apple_sub: { type: "string" },
    },
  },
  AdminLoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", example: "admin@gloup.in" },
      password: { type: "string", format: "password", example: "your_password" },
    },
  },
  AdminChangePasswordRequest: {
    type: "object",
    required: ["oldPassword", "newPassword"],
    properties: {
      oldPassword: { type: "string", format: "password", example: "old_password123" },
      newPassword: { type: "string", format: "password", example: "new_password123" },
    },
  },
  StoreIdRequest: {
    type: "object",
    required: ["store_id"],
    properties: {
      store_id: { type: "integer", example: 58 },
    },
  },
  StoreDetailsRequest: {
    type: "object",
    required: ["store_id"],
    properties: {
      store_id: { type: "integer", example: 58 },
      sex: {
        type: "string",
        enum: ["male", "female", "unisex"],
      },
    },
  },
  IdRequest: {
    type: "object",
    properties: {
      id: { type: "integer", example: 58, description: "Store or entity id" },
    },
  },
  NearbyStoresRequest: {
    type: "object",
    required: ["lat", "lng"],
    properties: {
      lat: { type: "number", format: "float", example: 22.7706 },
      lng: { type: "number", format: "float", example: 75.891 },
      gender: { type: "string", enum: ["male", "female", "unisex"], example: "unisex" },
      page: { type: "integer", example: 1 },
      limit: { type: "integer", example: 10 },
    },
  },
  MapMarkersRequest: {
    type: "object",
    required: ["lat", "lng"],
    properties: {
      lat: { type: "number", example: 22.7706 },
      lng: { type: "number", example: 75.891 },
      gender: { type: "string", enum: ["male", "female", "unisex"] },
      zoom: { type: "integer", example: 12 },
    },
  },
  TopSalonsQuery: {
    type: "object",
    properties: {
      lat: { type: "number", example: 22.7706 },
      lng: { type: "number", example: 75.891 },
      gender: { type: "string", enum: ["male", "female", "unisex"] },
      page: { type: "integer", example: 1 },
      limit: { type: "integer", example: 10 },
      minRating: { type: "number", example: 4 },
      minPrice: { type: "number", example: 200 },
      maxPrice: { type: "number", example: 2000 },
      search: { type: "string", example: "haircut" },
      sort: { type: "string", enum: ["distance", "price_asc", "price_desc", "review"] },
    },
  },
  SlotByDateRequest: {
    type: "object",
    properties: {
      store_id: { type: "integer", example: 58 },
      id: { type: "integer", example: 58 },
      date: { type: "string", format: "date", example: "2026-05-22" },
      saloon_id: { type: "integer", example: 58 },
    },
  },
  CreateOrderV2Request: {
    type: "object",
    required: ["booking_date", "slot_id", "store_id"],
    properties: {
      booking_date: { type: "string", format: "date", example: "2026-05-22" },
      slot_id: { type: "integer", example: 1 },
      store_id: { type: "integer", example: 58 },
      services: {
        type: "array",
        items: {
          type: "object",
          properties: {
            service_id: { type: "integer", example: 26 },
          },
        },
      },
      combos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            combo_id: { type: "integer" },
          },
        },
      },
      is_combo: { type: "boolean", example: false },
      booking_for: { type: "string", enum: ["myself", "guest"], example: "myself" },
      guest_id: { type: "integer" },
      guest_name: { type: "string" },
      guest_phone: { type: "string" },
      guest_gender: { type: "string" },
      professional_id: { type: "integer", example: 1 },
      is_wallet: { type: "boolean" },
      is_discounted: { type: "boolean" },
      discount_id: { type: "integer" },
      coupon_code: { type: "string" },
      gst: { type: "number", example: 18 },
      platform_fee: { type: "number", example: 10 },
      wallet_amount_used: { type: "number" },
    },
  },
  CreateOrderLegacyRequest: {
    type: "object",
    properties: {
      service: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "integer" } },
        },
      },
      combos: { type: "array", items: { type: "object" } },
      is_combo: { type: "boolean" },
      is_wallet: { type: "boolean" },
      is_discounted: { type: "boolean" },
      coupon_id: { type: "integer" },
      booking_date: { type: "string" },
      slot_id: { type: "integer" },
      store_id: { type: "integer" },
    },
  },
  RazorpayOrderRequest: {
    type: "object",
    required: ["amount"],
    properties: {
      amount: { type: "number", example: 500, description: "Amount in INR" },
      currency: { type: "string", example: "INR" },
      receipt: { type: "string" },
      notes: { type: "object" },
    },
  },
  RazorpayPaymentSuccessRequest: {
    type: "object",
    required: ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"],
    properties: {
      razorpay_order_id: { type: "string", example: "order_xxx" },
      razorpay_payment_id: { type: "string", example: "pay_xxx" },
      razorpay_signature: { type: "string", example: "signature_xxx" },
    },
  },
  WalletTopUpRequest: {
    type: "object",
    required: ["amount"],
    properties: {
      amount: { type: "number", example: 500 },
    },
  },
  ValidateCouponRequest: {
    type: "object",
    properties: {
      code: { type: "string", example: "SAVE10" },
      coupon_id: { type: "integer" },
    },
  },
  AddReviewRequest: {
    type: "object",
    properties: {
      store_id: { type: "integer", example: 58 },
      rating: { type: "number", example: 4.5 },
      description: { type: "string", example: "Great service" },
      appointment_id: { type: "integer" },
    },
  },
  UpdateReviewV2Request: {
    type: "object",
    properties: {
      rating: { type: "number", example: 4.5 },
      description: { type: "string", example: "Updated review text" },
    },
  },
  GuestAddRequest: {
    type: "object",
    required: ["name", "phone"],
    properties: {
      name: { type: "string", example: "Guest User" },
      gender: { type: "string", example: "male" },
      age: { type: "integer", example: 25 },
      phone: { type: "string", example: "9876543210" },
    },
  },
  GuestUpdateRequest: {
    type: "object",
    properties: {
      guestId: { type: "integer", example: 1 },
      name: { type: "string" },
      gender: { type: "string" },
      age: { type: "integer" },
      phone: { type: "string" },
    },
  },
  UpdateProfileRequest: {
    type: "object",
    properties: {
      firstname: { type: "string", example: "John" },
      lastname: { type: "string", example: "Doe" },
      email: { type: "string", format: "email" },
      gender: { type: "string", example: "male" },
      dob: { type: "string", example: "2001-04-11" },
      city: { type: "string", example: "Indore" },
      country: { type: "string", example: "India" },
    },
  },
  SearchStoresRequest: {
    type: "object",
    properties: {
      latitude: { type: "number", example: 22.77 },
      longitude: { type: "number", example: 75.89 },
      search: { type: "string", example: "hair" },
      service: { type: "string", example: "facial" },
    },
  },
  PartnerCreateStoreRequest: {
    type: "object",
    required: ["name", "addressLine1", "city", "area"],
    properties: {
      name: { type: "string", example: "Style Salon" },
      addressLine1: { type: "string", example: "123 Main Road" },
      city: { type: "string", example: "Indore" },
      area: { type: "string", example: "Vijay Nagar" },
      district: { type: "string" },
      state: { type: "string", example: "Madhya Pradesh" },
      type: { type: "string", example: "Unisex", description: "store_type" },
      phone: { type: "string", example: "9876543210" },
      website: { type: "string" },
      description: { type: "string" },
      category_id: { type: "string", description: "Comma-separated or array of category IDs" },
      categoryIds: { type: "array", items: { type: "integer" }, example: [1, 2] },
      latitude: { type: "string", example: "22.7196" },
      longitude: { type: "string", example: "75.8577" },
      referral_id: { type: "string" },
      team_size: { type: "string" },
      income_level: { type: "string" },
    },
  },
  PartnerAddServiceRequest: {
    type: "object",
    required: ["service_name", "service_category", "amount", "duration", "service_for"],
    properties: {
      service_name: { type: "string", example: "Hair Cut" },
      service_category: { type: "integer", example: 1 },
      amount: { type: "number", example: 500 },
      discounted_amount: { type: "number", example: 450 },
      duration: { type: "string", example: "1h", description: "1h, 30m, or HH:MM:SS" },
      service_for: { type: "string", enum: ["male", "female", "unisex"] },
      status: { type: "boolean", example: true },
    },
  },
  PartnerUpdateServiceRequest: {
    type: "object",
    properties: {
      id: { type: "integer", example: 42 },
      service_name: { type: "string" },
      service_category: { type: "integer" },
      amount: { type: "number" },
      discounted_amount: { type: "number" },
      duration: { type: "string" },
      service_for: { type: "string", enum: ["male", "female", "unisex"] },
      status: { type: "boolean" },
    },
  },
  PartnerSubscriptionPaymentRequest: {
    type: "object",
    properties: {
      razorpay_order_id: { type: "string" },
      razorpay_payment_id: { type: "string" },
      razorpay_signature: { type: "string" },
      plan_id: { type: "integer" },
    },
  },
  PartnerEnquiryRequest: {
    type: "object",
    required: ["name", "email"],
    properties: {
      name: { type: "string", example: "Salon Owner" },
      email: { type: "string", format: "email" },
      phone: { type: "string" },
      state: { type: "string" },
      message: { type: "string" },
    },
  },
  PartnerBankDetailsRequest: {
    type: "object",
    properties: {
      bank_account_holder: { type: "string" },
      account_number: { type: "string" },
      ifsc_code: { type: "string" },
    },
  },
  AdminBroadcastNotificationRequest: {
    type: "object",
    required: ["notification_type", "title", "description"],
    properties: {
      notification_type: { type: "string", enum: ["general", "subscription"], example: "general" },
      sent_to: { type: "string", enum: ["all", "user", "store"], example: "all" },
      title: { type: "string", example: "Announcement" },
      description: { type: "string", example: "Message body" },
      store_id: { type: "integer", description: "Required for subscription type" },
    },
  },
  AdminTargetedNotificationRequest: {
    type: "object",
    required: ["recipient_type", "title", "description"],
    properties: {
      recipient_type: { type: "string", enum: ["user", "partner"], example: "user" },
      recipient_id: { type: "integer", example: 42 },
      user_id: { type: "integer", description: "Alias for recipient_id (user)" },
      partner_id: { type: "integer", description: "Alias for recipient_id (partner)" },
      store_id: { type: "integer", description: "Alias for recipient_id (partner)" },
      title: { type: "string", example: "Hello" },
      description: { type: "string", example: "Notification body" },
    },
  },
  AdminVerifyPartnerRequest: {
    type: "object",
    required: ["completion_status"],
    properties: {
      completion_status: { type: "string", enum: ["completed", "pending"], example: "completed" },
      id: { type: "integer" },
    },
  },
  AdminPaginationFilterRequest: {
    type: "object",
    properties: {
      page: { type: "integer", example: 1 },
      limit: { type: "integer", example: 10 },
      search: { type: "string" },
      id: { type: "integer" },
      store_id: { type: "integer" },
      status: { type: "string" },
      from_date: { type: "string", format: "date" },
      to_date: { type: "string", format: "date" },
      month: { type: "integer" },
      year: { type: "integer" },
      category_id: { type: "integer" },
      city: { type: "string" },
    },
  },
  BlockSlotRequest: {
    type: "object",
    properties: {
      store_id: { type: "integer" },
      date: { type: "string", format: "date" },
      slot_id: { type: "integer" },
      status: { type: "string", enum: ["blocked", "active"] },
    },
  },
  EmptyBody: {
    type: "object",
    properties: {},
    description: "No body required (or empty JSON object).",
  },
};

/** Multipart form field hints for file-upload routes */
export const MULTIPART_SCHEMAS = {
  PartnerCreateStoreMultipart: {
    type: "object",
    properties: {
      name: { type: "string" },
      addressLine1: { type: "string" },
      city: { type: "string" },
      area: { type: "string" },
      latitude: { type: "string" },
      longitude: { type: "string" },
      type: { type: "string" },
      phone: { type: "string" },
      category_id: { type: "string" },
      images: { type: "array", items: { type: "string", format: "binary" } },
      documents: { type: "array", items: { type: "string", format: "binary" } },
      logo: { type: "string", format: "binary" },
    },
  },
  AdminCreatePartnerMultipart: {
    type: "object",
    properties: {
      name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      password: { type: "string" },
      addressLine1: { type: "string" },
      city: { type: "string" },
      area: { type: "string" },
      latitude: { type: "string" },
      longitude: { type: "string" },
      store_type: { type: "string" },
      images: { type: "array", items: { type: "string", format: "binary" } },
      documents: { type: "array", items: { type: "string", format: "binary" } },
      logo: { type: "string", format: "binary" },
    },
  },
  ProfileImageMultipart: {
    type: "object",
    properties: {
      profilepic: { type: "string", format: "binary" },
      profilePic: { type: "string", format: "binary" },
      firstname: { type: "string" },
      lastname: { type: "string" },
    },
  },
  BannerUploadMultipart: {
    type: "object",
    properties: {
      image: { type: "array", items: { type: "string", format: "binary" } },
      title: { type: "string" },
      link: { type: "string" },
    },
  },
  CategoryImageMultipart: {
    type: "object",
    properties: {
      image: { type: "string", format: "binary" },
      name: { type: "string" },
    },
  },
  S3UploadMultipart: {
    type: "object",
    properties: {
      file: { type: "string", format: "binary" },
    },
  },
};
