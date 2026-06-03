# Gloup Partner API Testing Scenarios (cURL)

This document contains a comprehensive set of testing scenarios for the Gloup Partner Backend APIs, including both positive and negative cases.

**Base URL**: `http://localhost:5678` (Update if running on a different port/host)

---

## 1. Authentication Flow (OTP)

### 1.1 Send OTP (`POST /partner/v2/sendotp`)

**Positive (Valid Phone)**
```bash
curl -X POST http://localhost:5678/partner/v2/sendotp \
     -H "Content-Type: application/json" \
     -d '{"phone": "9876543210"}'
```

**Negative (Missing Phone)**
```bash

curl -X POST http://localhost:5678/partner/v2/sendotp \
     -H "Content-Type: application/json" \
     -d '{}'
```

---

### 1.2 Verify OTP (`POST /partner/v2/verifyotp`)

**Positive (Valid OTP)**
*Note: Use `123456` if testing with mock numbers like `9876543210`.*
```bash
curl -X POST http://localhost:5678/partner/v2/verifyotp \
     -H "Content-Type: application/json" \
     -d '{"phone": "9876543210", "otp": "123456"}'
```

**Negative (Wrong OTP)**
```bash
curl -X POST http://localhost:5678/partner/v2/verifyotp \
     -H "Content-Type: application/json" \
     -d '{"phone": "9876543210", "otp": "000000"}'
```

**Negative (Missing Fields)**
```bash
curl -X POST http://localhost:5678/partner/v2/verifyotp \
     -H "Content-Type: application/json" \
     -d '{"phone": "9876543210"}'
```

---

## 2. Store Management

### 2.1 Create Store (`POST /partner/v2/createstore`)

**Positive (Complete Details)**
```bash
curl -X POST http://localhost:5678/partner/v2/createstore \
     -H "Content-Type: application/json" \
     -H "partnertoken: <YOUR_TOKEN_HERE>" \
     -d '{
           "name": "Sparkle Nails & Spa",
           "addressLine1": "No 45, Gandhi Nagar",
           "city": "Chennai",
           "area": "Adyar",
           "type": "Unisex",
           "phone": "9876543210",
           "categoryIds": [1, 5],
           "latitude": "13.0827",
           "longitude": "80.2707"
           
         }'
```

**Negative (Missing Required Field: Name)**
```bash
curl -X POST http://localhost:5678/partner/v2/createstore \
     -H "Content-Type: application/json" \
     -H "partnertoken: <YOUR_TOKEN_HERE>" \
     -d '{
           "addressLine1": "No 45, Gandhi Nagar",
           "city": "Chennai",
           "area": "Adyar"
         }'
```

**Negative (Missing Required Field: Area)**
```bash
curl -X POST http://localhost:5678/partner/v2/createstore \
     -H "Content-Type: application/json" \
     -H "partnertoken: <YOUR_TOKEN_HERE>" \
     -d '{
           "name": "Sparkle Nails & Spa",
           "addressLine1": "No 45, Gandhi Nagar",
           "city": "Chennai"
         }'
```

**Negative (Empty Coordinates - Should now default to 0 instead of erroring)**
```bash
curl -X POST http://localhost:5678/partner/v2/createstore \
     -H "Content-Type: application/json" \
     -H "partnertoken: <YOUR_TOKEN_HERE>" \
     -d '{
           "name": "Sparkle Nails & Spa",
           "addressLine1": "No 45, Gandhi Nagar",
           "city": "Chennai",
           "area": "Adyar",
           "latitude": "",
           "longitude": ""
         }'
```

**Negative (Invalid Partnertoken)**
```bash
curl -X POST http://localhost:5678/partner/v2/createstore \
     -H "Content-Type: application/json" \
     -H "partnertoken: invalid_token_xyz" \
     -d '{"name": "Fail Test"}'
```

---

## 3. Session & Logout

### 3.1 Logout (`POST /partner/auth/logout`)

**Positive (Manual Logout)**
```bash
curl -X POST http://localhost:5678/partner/auth/logout \
     -H "partnertoken: <YOUR_TOKEN_HERE>"
```

### 3.2 Post-Logout Verification (Unauthorized Request)
```bash
curl -X POST http://localhost:5678/partner/v2/createstore \
     -H "Content-Type: application/json" \
     -H "partnertoken: <EXPIRED_TOKEN_HERE>" \
     -d '{"name": "This Should Fail"}'
```

---

## 4. Admin Management (Approval Flow)

### 4.1 Get Pending Partners (`POST /admin/app/getverifypartner`)
```bash
curl -X POST http://localhost:5678/admin/app/getverifypartner \
     -H "adminauthtoken: <ADMIN_TOKEN_HERE>" \
     -H "Content-Type: application/json" \
     -d '{}'
```

### 4.2 Approve Partner (`POST /admin/app/getpartnerverification/:id`)
*Replaces `:id` with the Store ID from the previous step.*
```bash
curl -X POST http://localhost:5678/admin/app/getpartnerverification/<STORE_ID> \
     -H "adminauthtoken: <ADMIN_TOKEN_HERE>" \
     -H "Content-Type: application/json" \
     -d '{"completion_status": "completed"}'
```

---

## 5. User App Verification (Gating Logic)

### 5.1 Search Store (Should only show if Approved)
```bash
curl -X POST http://localhost:5678/User/app/v2/searchSalons \
     -H "Content-Type: application/json" \
     -d '{
           "search": "Sparkle",
           "limit": 10,
           "page": 1
         }'
```

### 5.2 Get Store Details (Gated by ID)
```bash
curl -X GET http://localhost:5678/User/app/v2/store-details?id=<STORE_ID>
```

---

## 6. Helpful Notes
- **Pending Status**: Upon successful creation via `/v2/createstore`, the `completion_status` will be `pending`.
- **Visibility Gate**: New stores will **NOT** appear in Search or Nearby results in the User App until Approved (Step 4.2).
- **Static OTP**: Both `9876543210` and `9876543211` work with OTP `123456`.
- **Tokens**: The `partnertoken` received from `/v2/verifyotp` is an AES-encrypted JWT.
