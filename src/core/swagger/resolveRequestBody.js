import { MULTIPART_SCHEMAS } from "./schemas.js";

/** @typedef {{ schemaName: string, required?: boolean, multipart?: boolean }} BodyRef */

/** Exact match: "METHOD /path" (path without OpenAPI braces) */
const EXACT_BODY_MAP = {
  "POST /user/auth/sendOTP": "SendOtpRequest",
  "POST /partner/auth/sendOTP": "SendOtpRequest",
  "POST /user/auth/verifyOTP": "VerifyOtpRequest",
  "POST /partner/auth/verifyOTP": "VerifyOtpRequest",
  "POST /user/auth/deviceId": "DeviceIdRequest",
  "POST /partner/auth/deviceId": "DeviceIdRequest",
  "POST /user/auth/googlelogin": "SocialLoginRequest",
  "POST /user/auth/appleLogin": "SocialLoginRequest",
  "POST /partner/auth/googlelogin": "SocialLoginRequest",
  "POST /partner/auth/appleLogin": "SocialLoginRequest",
  "POST /admin/auth/login": "AdminLoginRequest",

  "POST /user/app/v2/store/nearby": "NearbyStoresRequest",
  "POST /user/app/v2/store/details": "StoreDetailsRequest",
  "POST /user/app/v2/salons/map-markers-clustered": "MapMarkersRequest",
  "POST /user/app/v2/favourites": "StoreIdRequest",
  "POST /user/app/v2/createorder": "CreateOrderV2Request",
  "POST /user/app/v2/paymentsuccess": "RazorpayPaymentSuccessRequest",
  "POST /user/app/v2/create-razorpay-order": "RazorpayOrderRequest",
  "POST /user/app/v2/guest/add": "GuestAddRequest",
  "PATCH /user/app/v2/guest/update": "GuestUpdateRequest",
  "PATCH /user/app/v2/profile": "UpdateProfileRequest",
  "PATCH /user/app/v2/reviews": "UpdateReviewV2Request",

  "POST /user/app/getstorebyid": "IdRequest",
  "POST /user/app/getslotbydate": "SlotByDateRequest",
  "POST /user/app/getnearbystores": "NearbyStoresRequest",
  "POST /user/app/topsaloons": "NearbyStoresRequest",
  "POST /user/app/getstorebysearch": "SearchStoresRequest",
  "POST /user/app/getstorebyservices": "SearchStoresRequest",
  "POST /user/app/getstorebycategory": "SearchStoresRequest",
  "POST /user/app/addfavourites": "StoreIdRequest",
  "POST /user/app/deletefavourites": "StoreIdRequest",
  "POST /user/app/validatecoupon": "ValidateCouponRequest",
  "POST /user/app/addreview": "AddReviewRequest",
  "POST /user/app/createorder": "CreateOrderLegacyRequest",
  "POST /user/app/createrazorpayorder": "RazorpayOrderRequest",
  "POST /user/app/paymentsucssess": "RazorpayPaymentSuccessRequest",
  "POST /user/app/create_order_wallet": "WalletTopUpRequest",
  "POST /user/app/addwallet": "WalletTopUpRequest",

  "POST /partner/app/v2/createstore": "PartnerCreateStoreMultipart",
  "POST /partner/app/v2/onboardingsalon": "PartnerCreateStoreMultipart",
  "POST /partner/app/v2/updatestore": "PartnerCreateStoreMultipart",
  "POST /partner/app/v2/addservices": "PartnerAddServiceRequest",
  "PATCH /partner/app/v2/updateservices": "PartnerUpdateServiceRequest",
  "POST /partner/app/v2/enquiry": "PartnerEnquiryRequest",
  "PATCH /partner/app/v2/addbankdetails": "PartnerBankDetailsRequest",
  "POST /partner/app/v2/subscription/verifypayment": "PartnerSubscriptionPaymentRequest",
  "PATCH /partner/app/v2/store/update": "PartnerCreateStoreMultipart",

  "POST /admin/app/addnotification": "AdminBroadcastNotificationRequest",
  "POST /admin/app/send-targeted-notification": "AdminTargetedNotificationRequest",
  "POST /admin/app/createpartner": "AdminCreatePartnerMultipart",
  "POST /admin/app/editpartner": "AdminCreatePartnerMultipart",
  "POST /admin/app/addbanner": "BannerUploadMultipart",
  "POST /admin/app/addcategory": "CategoryImageMultipart",
  "POST /api/upload": "S3UploadMultipart",

  "POST /user/auth/updateuser": "ProfileImageMultipart",
  "POST /partner/app/addownerprofile": "ProfileImageMultipart",
  "POST /partner/app/addprofessional": "ProfileImageMultipart",
  "POST /partner/app/updateproffesional": "ProfileImageMultipart",
  "POST /partner/app/createstore": "PartnerCreateStoreMultipart",
  "POST /partner/app/updatepics": "PartnerCreateStoreMultipart",
  "POST /admin/app/updateSalon": "PartnerCreateStoreMultipart",
};

/** Suffix / pattern inference when no exact match */
const PATTERN_RULES = [
  { test: (p) => /sendOTP$/i.test(p), schema: "SendOtpRequest" },
  { test: (p) => /verifyOTP$/i.test(p), schema: "VerifyOtpRequest" },
  { test: (p) => /deviceId$/i.test(p), schema: "DeviceIdRequest" },
  { test: (p) => /googlelogin|appleLogin/i.test(p), schema: "SocialLoginRequest" },
  { test: (p) => /\/login$/i.test(p), schema: "AdminLoginRequest" },
  { test: (p) => /send-targeted-notification/.test(p), schema: "AdminTargetedNotificationRequest" },
  { test: (p) => /addnotification/.test(p), schema: "AdminBroadcastNotificationRequest" },
  { test: (p) => /getpartnerverification/.test(p), schema: "AdminVerifyPartnerRequest" },
  { test: (p) => /v2\/createorder/.test(p), schema: "CreateOrderV2Request" },
  { test: (p) => /paymentsuccess|paymentsucssess/.test(p), schema: "RazorpayPaymentSuccessRequest" },
  { test: (p) => /razorpay-order|createrazorpayorder/.test(p), schema: "RazorpayOrderRequest" },
  { test: (p) => /\/nearby$/.test(p), schema: "NearbyStoresRequest" },
  { test: (p) => /store\/details/.test(p), schema: "StoreDetailsRequest" },
  { test: (p) => /getstorebyid/.test(p), schema: "StoreIdRequest" },
  { test: (p) => /favourites/.test(p), schema: "StoreIdRequest" },
  { test: (p) => /validatecoupon/.test(p), schema: "ValidateCouponRequest" },
  { test: (p) => /addreview|updaterating/.test(p), schema: "AddReviewRequest" },
  { test: (p) => /guest\/add/.test(p), schema: "GuestAddRequest" },
  { test: (p) => /guest\/update/.test(p), schema: "GuestUpdateRequest" },
  { test: (p) => /v2\/profile/.test(p), schema: "UpdateProfileRequest" },
  { test: (p) => /v2\/reviews/.test(p), schema: "UpdateReviewV2Request" },
  { test: (p) => /v2\/addservices/.test(p), schema: "PartnerAddServiceRequest" },
  { test: (p) => /v2\/updateservices/.test(p), schema: "PartnerUpdateServiceRequest" },
  { test: (p) => /v2\/enquiry/.test(p), schema: "PartnerEnquiryRequest" },
  { test: (p) => /v2\/onboarding|v2\/createstore|v2\/updatestore/.test(p), schema: "PartnerCreateStoreMultipart" },
  { test: (p) => /createstore|createpartner|editpartner|updateSalon|updatepics/.test(p), schema: "PartnerCreateStoreMultipart" },
  { test: (p) => /addbanner/.test(p), schema: "BannerUploadMultipart" },
  { test: (p) => /addcategory/.test(p), schema: "CategoryImageMultipart" },
  { test: (p) => /block.*slot/i.test(p), schema: "BlockSlotRequest" },
  { test: (p) => /topsaloons|getnearby/.test(p), schema: "NearbyStoresRequest" },
  { test: (p) => /getstorebysearch|getstorebyservice|getstorebycategory/.test(p), schema: "SearchStoresRequest" },
  { test: (p) => /createorder/.test(p), schema: "CreateOrderLegacyRequest" },
  { test: (p) => /wallet|addwallet/.test(p), schema: "WalletTopUpRequest" },
  { test: (p) => /logout/.test(p), schema: "EmptyBody" },
];

/**
 * @param {{ method: string, path: string, tag: string, multipart?: boolean }} route
 * @returns {BodyRef | null}
 */
export function resolveBodySchemaName(route) {
  const key = `${route.method.toUpperCase()} ${route.path}`;

  if (EXACT_BODY_MAP[key]) {
    const name = EXACT_BODY_MAP[key];
    return {
      schemaName: name,
      required: !name.startsWith("Empty"),
      multipart: Boolean(MULTIPART_SCHEMAS[name]),
    };
  }

  for (const rule of PATTERN_RULES) {
    if (rule.test(route.path)) {
      return {
        schemaName: rule.schema,
        required: rule.schema !== "EmptyBody",
        multipart: Boolean(MULTIPART_SCHEMAS[rule.schema]),
      };
    }
  }

  if (route.tag?.startsWith("Admin")) {
    return { schemaName: "AdminPaginationFilterRequest", required: false, multipart: false };
  }
  if (route.tag?.startsWith("Partner")) {
    return { schemaName: "AdminPaginationFilterRequest", required: false, multipart: false };
  }
  if (route.tag?.startsWith("User")) {
    return { schemaName: "AdminPaginationFilterRequest", required: false, multipart: false };
  }

  return { schemaName: "EmptyBody", required: false, multipart: false };
}

/** Query parameters for GET/DELETE */
const QUERY_MAP = {
  "GET /user/app/v2/salons/top": [
    { name: "lat", in: "query", schema: { type: "number" }, example: 22.77 },
    { name: "lng", in: "query", schema: { type: "number" }, example: 75.89 },
    { name: "gender", in: "query", schema: { type: "string", enum: ["male", "female", "unisex"] } },
    { name: "page", in: "query", schema: { type: "integer" }, example: 1 },
    { name: "limit", in: "query", schema: { type: "integer" }, example: 10 },
    { name: "minRating", in: "query", schema: { type: "number" } },
    { name: "minPrice", in: "query", schema: { type: "number" } },
    { name: "maxPrice", in: "query", schema: { type: "number" } },
    { name: "search", in: "query", schema: { type: "string" } },
    { name: "sort", in: "query", schema: { type: "string" } },
  ],
  "GET /user/app/v2/get-all-stores": [
    { name: "gender", in: "query", schema: { type: "string" } },
    { name: "category", in: "query", schema: { type: "integer" } },
    { name: "page", in: "query", schema: { type: "integer" } },
    { name: "limit", in: "query", schema: { type: "integer" } },
    { name: "lat", in: "query", schema: { type: "number" } },
    { name: "lng", in: "query", schema: { type: "number" } },
    { name: "search", in: "query", schema: { type: "string" } },
  ],
  "GET /user/app/v2/getslotstatus": [
    { name: "date", in: "query", required: true, schema: { type: "string", format: "date" }, example: "2026-05-22" },
    { name: "saloon_id", in: "query", required: true, schema: { type: "integer" }, example: 58 },
    { name: "store_id", in: "query", schema: { type: "integer" } },
  ],
  "GET /user/app/v2/reviews": [
    { name: "store_id", in: "query", schema: { type: "integer" } },
    { name: "page", in: "query", schema: { type: "integer" } },
    { name: "limit", in: "query", schema: { type: "integer" } },
  ],
  "DELETE /user/app/v2/reviews": [
    { name: "id", in: "query", required: true, schema: { type: "integer" } },
  ],
  "PATCH /user/app/v2/reviews": [
    { name: "id", in: "query", required: true, schema: { type: "integer" } },
  ],
  "DELETE /user/app/v2/favourites": [
    { name: "store_id", in: "query", required: true, schema: { type: "integer" } },
  ],
  "GET /partner/auth/verifyemail": [
    { name: "token", in: "query", schema: { type: "string" } },
  ],
  "GET /partner/app/v2/store-details": [
    { name: "id", in: "query", schema: { type: "integer" } },
    { name: "store_id", in: "query", schema: { type: "integer" } },
  ],
};

/**
 * @param {{ method: string, path: string }} route
 */
export function resolveQueryParameters(route) {
  const key = `${route.method.toUpperCase()} ${route.path}`;
  const exact = QUERY_MAP[key];
  if (exact) return exact.map((p) => ({ ...p, in: "query" }));

  const params = [];
  const pathParamRe = /:([A-Za-z0-9_]+)/g;
  let m;
  while ((m = pathParamRe.exec(route.path)) !== null) {
    params.push({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  }

  if (route.method === "get" || route.method === "delete") {
    if (/salons\/top/.test(route.path)) {
      return [
        ...params,
        { name: "lat", in: "query", schema: { type: "number" } },
        { name: "lng", in: "query", schema: { type: "number" } },
        { name: "gender", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ];
    }
    if (/get-all-stores/.test(route.path)) {
      return [
        ...params,
        { name: "gender", in: "query", schema: { type: "string" } },
        { name: "category", in: "query", schema: { type: "integer" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ];
    }
    if (/getslotstatus/.test(route.path)) {
      return [
        ...params,
        { name: "date", in: "query", schema: { type: "string", format: "date" } },
        { name: "saloon_id", in: "query", schema: { type: "integer" } },
      ];
    }
    if (/favourites/.test(route.path) && route.method === "delete") {
      return [...params, { name: "store_id", in: "query", schema: { type: "integer" } }];
    }
    if (/reviews/.test(route.path)) {
      return [...params, { name: "id", in: "query", schema: { type: "integer" } }];
    }
  }

  return params.length ? params : undefined;
}
