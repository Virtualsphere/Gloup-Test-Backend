# Booking and Payment Flow

This document explains how booking and payment work in this backend in simple words. It is based on the current codebase, mainly the user app routes, user middleware, database controllers, webhook controller, and admin/partner booking actions.

## Quick Summary

The main customer booking flow is:

1. Customer selects a salon, service/combo, date, slot, and optional guest details.
2. Backend calculates the real amount from the database.
3. Backend creates a Razorpay order.
4. Backend creates an `appointments` row and `appointment_items` rows.
5. Mobile app opens Razorpay checkout using `razorpay_order_id`.
6. Mobile app calls payment success API after payment.
7. Backend marks the appointment as paid/booked and sends notifications.
8. Razorpay webhook is also available as a backup if the app does not call payment success.

Important note: the newer v2 flow currently stores the appointment with `payment_status = "pending"` but `status = "booked"` immediately during order creation. In industry-standard booking systems, this is usually handled as `status = "pending"` until payment is confirmed.

## Main Files Involved

| Area | File | What it does |
| --- | --- | --- |
| Express app setup | `app.js` | Mounts routes and adds raw body parsing for Razorpay webhook. |
| User routes | `src/User/routes/userapproutes.js` | Defines customer APIs like create order and payment success. |
| User controller | `src/User/controller/userappcontroller.js` | Thin controller layer that calls middleware. |
| User business logic | `src/User/middleware/appmiddleware.js` | Main booking/payment logic. |
| User DB layer | `src/core/database/Controller/userDbController.js` | Creates appointments, items, wallet logs, coupon usage, updates payment status. |
| Razorpay webhook | `src/User/controller/webhookController.js` | Server-to-server payment fallback from Razorpay. |
| User models | `src/core/database/models/User.js` | Defines `appointments`, `appointment_items`, wallet/refund/coupon tables. |
| Partner booking actions | `src/Partner/routes/partnerapproutes.js`, `src/Partner/middleware/partnerappmiddleware.js` | Partner can view/update/cancel bookings. |
| Admin booking/refund actions | `src/Admin/routes/approutes.js`, `src/Admin/middleware/adminappmiddleware.js`, `src/core/database/Controller/AdminDbController.js` | Admin can update booking status and handle refunds. |

## Important Customer Endpoints

All these routes are mounted under `/user/app`.

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /user/app/v2/getslotstatus` | No user auth in route | Shows slot status for a salon/date. |
| `POST /user/app/v2/createorder` | User auth required | Creates appointment plus Razorpay order. |
| `POST /user/app/v2/paymentsuccess` | User auth required | Marks payment as successful after Razorpay checkout. |
| `POST /user/app/v2/create-razorpay-order` | User auth required | Creates only a Razorpay order for a given amount. This is separate from the main booking flow. |
| `POST /user/app/initiaterefund` | User auth required | Cancels booking and may create a refund request. |

There is also an older v1 flow:

| Endpoint | Purpose |
| --- | --- |
| `POST /user/app/createorder` | Legacy create order flow with wallet support. |
| `POST /user/app/paymentsucssess` | Legacy payment success API. The route name has a spelling mistake: `paymentsucssess`. |
| `POST /user/app/createinternalorder` | Creates appointment first, without Razorpay order. |
| `POST /user/app/createrazorpayorder` | Creates Razorpay order separately. |

Webhook endpoint:

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /user/webhook/razorpay` | No user auth | Razorpay calls this directly for payment events. |

## Database Tables Used

### `appointments`

This is the main booking table. One row means one booking.

Important fields:

| Field | Meaning |
| --- | --- |
| `id` | Internal appointment/booking ID. |
| `user_id` | Customer who booked. |
| `store_id` | Salon/store. |
| `booking_date` | Date of the appointment. |
| `slot_id` | Selected time slot. |
| `amount` | Final payable amount saved for the booking. |
| `razorpay_id` | Razorpay order ID, for example `order_xxx`. |
| `payment_status` | Payment state, for example `pending`, `success`, `refunded`. |
| `payment_id` | Razorpay payment ID, for example `pay_xxx`. |
| `razorpay_signature` | Signature sent by Razorpay checkout. |
| `status` | Booking lifecycle state, for example `booked`, `confirmed`, `completed`, `cancelled`, `refunded`, `pending`. |
| `is_wallet` | Whether wallet was used. |
| `is_discounted` | Whether coupon/discount was used. |
| `discounted_amount` | Amount after discount but before some final additions. |
| `discount_id` | Applied coupon/discount ID. |
| `gst` | GST value/rate used by the flow. |
| `booking_for` | `myself` or someone else. |
| `guest_id` | Guest person linked to the booking. |

### `appointment_items`

This stores services and combos inside one booking.

Example:

- Appointment `101` can have service `26`.
- Appointment `101` can also have combo `5`.
- Each item stores its `service_amount`.

### Other Related Tables

| Table | Purpose |
| --- | --- |
| `User` | Customer profile and wallet balance. |
| `Store` | Salon/store data, including partner device token and `wallet_remaining`. |
| `StoreServices` | Services and their prices. |
| `Combo` | Combo package prices. |
| `Slots` | Salon time slots. |
| `UsedCoupons` | Tracks coupon usage per user. |
| `DiscountsUsed` | Older coupon usage table used by v1. |
| `refund_requests` | Refund request records. |
| `NotificationLogs` | Customer notification logs. |
| `PartnerNotificationLogs` | Partner notification logs. |
| `user_transaction_logs` | Wallet transaction logs. |

## Slot Availability Flow

Before booking, the customer app can ask:

```http
GET /user/app/v2/getslotstatus?saloon_id=58&date=2026-03-05
```

The backend:

1. Finds all active slots for the salon.
2. Counts appointments for each slot on that date.
3. Treats these appointment statuses as occupying the slot:
   - `booked`
   - `confirmed`
   - `completed`
   - recent `pending` appointments created within the last 5 minutes
4. Also checks blocked slots from `SlotBlockedDates`.
5. Returns each slot as `available`, `booked`, or `blocked`.

Simple meaning:

- If a slot has enough active bookings, it is shown as booked.
- If partner/admin blocked it, it is shown as blocked.
- Otherwise it is available.

Important issue:

The v2 create-order flow saves new appointments as `status = "booked"` even before payment is confirmed. Because slot logic counts `booked` appointments as occupied, a user who starts payment but never completes it can block that slot.

## Main V2 Booking Flow

### Step 1: Customer Creates Order

Endpoint:

```http
POST /user/app/v2/createorder
```

Example request:

```json
{
  "booking_date": "2026-03-05",
  "slot_id": 1,
  "services": [
    { "service_id": 26 }
  ],
  "is_combo": false,
  "booking_for": "myself",
  "professional_id": 1,
  "store_id": 58,
  "gst": 18,
  "platform_fee": 10
}
```

The controller calls:

```text
createOrderV2 -> userappmiddleware.user.createOrderV2
```

### Step 2: Backend Reads Service/Combo Prices From DB

The backend takes service IDs and combo IDs from the request.

Then it fetches actual prices from the database:

- `getStoreServicesByIdsV2(serviceIds)`
- `getCombosByIdsV2(comboIds)`

This is good because the backend does not simply trust the price sent by the mobile app.

Simple example:

- App sends service ID `26`.
- Backend checks service `26` in `StoreServices`.
- Backend uses database price, not frontend price.

### Step 3: Backend Calculates Amount

Calculation in v2:

1. Add service prices.
2. Add combo prices.
3. Apply coupon discount if `is_discounted` and `discount_id` are present.
4. Add `gst`.
5. Add `platform_fee`.
6. Create Razorpay order for the final amount.

In code, the final amount is:

```text
totalWithTaxes = finalTotal + gst + platform_fee
```

Important detail:

In v2, `gst` is treated like a direct amount added to the bill, not as a percentage. If frontend sends `"gst": 18`, the backend adds `18` rupees, not 18 percent.

### Step 4: Backend Creates Razorpay Order

The backend calls:

```js
razorpay.orders.create({
  amount: Math.round(totalWithTaxes * 100),
  currency: "INR"
})
```

Razorpay expects amount in paise, so rupees are multiplied by 100.

Example:

- Booking amount: `500`
- Amount sent to Razorpay: `50000` paise

The returned Razorpay order ID is saved as:

```text
appointments.razorpay_id
```

### Step 5: Backend Creates Appointment Row

The backend creates a row in `appointments`.

Current v2 values:

```text
payment_status = "pending"
status = "booked"
razorpay_id = Razorpay order ID
```

Simple meaning:

- Payment is not done yet.
- But booking is already marked as booked.

Industry-standard meaning should usually be:

```text
payment_status = "pending"
status = "pending"
```

Then after successful payment:

```text
payment_status = "success"
status = "booked"
```

### Step 6: Backend Creates Appointment Items

For each selected service, it inserts into `appointment_items`:

```text
appointment_id
service_id
service_amount
```

For each selected combo, it inserts:

```text
appointment_id
combo_id
service_amount
```

All of this happens inside a database transaction:

- Create appointment.
- Create appointment items.
- Add coupon usage if coupon used.
- Commit transaction.

If anything fails, transaction is rolled back.

### Step 7: API Response Goes Back To App

The v2 create order response includes:

```json
{
  "order_id": 123,
  "razorpay_order_id": "order_xxx",
  "amount": 528,
  "currency": "INR",
  "booking_date": "2026-03-05",
  "status": "booked"
}
```

Simple meaning:

- `order_id` is your internal appointment ID.
- `razorpay_order_id` is what mobile app needs for Razorpay checkout.
- `amount` is final amount in rupees.

## Payment Success Flow

### Step 1: Mobile App Completes Razorpay Checkout

After payment, Razorpay checkout returns:

```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx"
}
```

### Step 2: App Calls Backend Payment Success API

Endpoint:

```http
POST /user/app/v2/paymentsuccess
```

Example:

```json
{
  "razorpay_order_id": "order_SNBmUnOUYd69Hg",
  "razorpay_payment_id": "pay_PeGv8Zk6Z2Z2Z2",
  "razorpay_signature": "signature_PeGv8Zk6Z2Z2Z2"
}
```

### Step 3: Backend Finds Appointment

The backend searches:

```text
appointments.razorpay_id = razorpay_order_id
appointments.user_id = logged-in user ID
```

If no appointment is found, it returns an error.

### Step 4: Backend Updates Booking As Paid

The backend updates appointment:

```text
payment_status = "success"
status = "booked"
payment_id = razorpay_payment_id
razorpay_signature = razorpay_signature
```

Important issue:

The code stores `razorpay_signature`, but does not verify it in v2 payment success. A signature verification block exists in legacy code, but it is commented out.

Industry-standard behavior:

The backend should calculate:

```text
HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, Razorpay key secret)
```

Then compare that result with `razorpay_signature`.

Only if it matches should the booking become successful.

### Step 5: Backend Sends Notifications

After marking payment success, backend sends:

1. Customer notification:
   - Title: `Order Confirmed`
   - Description: `Your Booking with <store name> has been confirmed`

2. Partner notification:
   - Title: `New Booking`
   - Description: `You have received a new booking from <customer name>`

Notification logs are also inserted.

### Step 6: API Response

Response message:

```text
Payment successfully verified and order confirmed
```

Important wording issue:

The current message says "verified", but the v2 code does not actually verify Razorpay signature.

## Razorpay Webhook Flow

Webhook endpoint:

```http
POST /user/webhook/razorpay
```

This is mounted outside `/user/app`.

Why webhook exists:

Sometimes mobile app payment succeeds, but the app closes, network fails, or the user does not return to the app. In that case, the backend may never receive `/paymentsuccess`.

Razorpay webhook is a server-to-server backup.

### Raw Body Setup

In `app.js`, this line appears before `express.json()`:

```js
app.use("/user/webhook/razorpay", express.raw({ type: "application/json" }));
```

This is correct because Razorpay webhook signature verification needs the raw request body.

### Webhook Signature Check

Webhook handler:

1. Reads `x-razorpay-signature` header.
2. Creates HMAC using `RZ_WEBHOOK_SECRET`.
3. Compares expected signature with received signature.
4. If signature is invalid, rejects request.

This is good and important.

### `payment.captured`

When Razorpay sends `payment.captured`:

1. Backend reads Razorpay `order_id` and `payment_id`.
2. Finds appointment where `appointments.razorpay_id = order_id`.
3. If appointment is already `success` or legacy typo `sucssess`, it skips.
4. Otherwise it marks booking as paid/booked.
5. Credits store wallet using `Store.wallet_remaining += appointment.amount`.
6. Sends customer and partner notifications.

### `payment.failed`

When Razorpay sends `payment.failed`:

1. Backend finds appointment by Razorpay order ID.
2. If appointment is still `payment_status = "pending"`, it tries to mark it as failed.

Important issue:

The model enum for `appointments.status` does not include `failed`, but webhook uses:

```text
status = "failed"
```

That can fail at database/model level because valid statuses are:

```text
booked, cancelled, completed, confirmed, refunded, pending
```

## Partner Booking Flow After Payment

Partner routes are under `/partner/app`.

Important routes:

| Endpoint | Purpose |
| --- | --- |
| `GET /partner/app/getbookings` | Partner gets filtered bookings. |
| `POST /partner/app/today-bookings` | Partner gets today's bookings. |
| `POST /partner/app/updatebookings` | Partner updates booking status or professional assignment. |
| `PATCH /partner/app/cancel-booking?appointmentId=...` | Partner cancels a booked appointment. |

Partner can update booking status using `updatebookings`.

Partner cancel flow:

1. Finds appointment by appointment ID and partner store ID.
2. Allows cancellation only if current status is `booked`.
3. Sets status to `cancelled`.

Important issue:

Partner cancel currently changes booking status only. It does not automatically refund payment or create a refund request.

## Admin Booking Status Flow

Admin route:

```http
POST /admin/app/updateBookingStatus
```

The admin DB controller has allowed status transitions:

```text
booked -> confirmed, cancelled
confirmed -> completed, cancelled
completed -> refunded
cancelled -> no next status
refunded -> no next status
```

Simple meaning:

- A fresh booking is `booked`.
- Admin can confirm it.
- Confirmed booking can be completed.
- Completed booking can be refunded.

This is a good idea because it prevents random status jumps.

## Refund Flow

### Customer Refund Request

Endpoint:

```http
POST /user/app/initiaterefund
```

The logic:

1. Finds appointment by `id` and logged-in `user_id`.
2. If already cancelled, rejects.
3. Cancels the appointment.
4. If appointment is close to booking time, creates a row in `refund_requests`.
5. Returns message that refund will be processed in 3 to 5 business days.

Important detail:

The time condition currently says:

```text
if booking is more than 10 hours away:
    cancel only
else:
    cancel and create refund request
```

That looks backwards from many normal refund policies. Usually, if a booking is far enough in the future, refund is easier; if it is too close, refund is restricted. This should be confirmed with business rules.

### Admin Refund Request Approval

Admin route:

```http
POST /admin/app/updaterefundrequest
```

If approved:

- If appointment used wallet, admin credits user wallet.
- Otherwise, admin calls Razorpay refund using `payment_id`.

This is closer to industry standard because it triggers actual Razorpay refund.

### Admin Booking Refund Route

Admin route:

```http
POST /admin/app/refundbookings
```

Important issue:

The controller calls `Adminappmiddleware.app.updaterefundBooking(req)`, but middleware has `updaterefundBookingStatus`. The function names do not match, so this route likely fails.

Also, the DB helper has a TODO for Razorpay refund:

```text
TODO: Razorpay refund integration here
```

So this path updates booking to refunded but does not actually refund money through Razorpay yet.

## Legacy V1 Flow

The old flow is still present:

```http
POST /user/app/createorder
POST /user/app/paymentsucssess
```

Main differences:

1. It supports full wallet payment.
2. It supports partial wallet plus Razorpay.
3. It has older spelling values like `payment_status = "sucssess"`.
4. It has Razorpay signature verification code, but it is commented out.
5. It creates appointment as `status = "booked"` and `payment_status = "sucssess"` even during order creation in the DB helper.

Important bug in v1:

`userDbController.app.createorder()` ignores the `razorpay_id` parameter and saves:

```text
razorpay_id: data.razorpay_order_id || null
```

But the middleware often passes the newly created Razorpay order ID as a separate argument named `razorpay_id`. That means v1 may create Razorpay order successfully but not save it into the appointment row unless the request body already contains `razorpay_order_id`.

## Industry-Standard Loopholes And Risks

This section lists the main gaps I found compared to a safer production-grade booking/payment system.

### 1. Payment Success Does Not Verify Razorpay Signature

Risk:

Anyone who can call `/user/app/v2/paymentsuccess` with a valid `razorpay_order_id` for their own pending appointment could mark payment as success without proving Razorpay actually accepted payment.

Current code:

- Accepts `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
- Stores them.
- Does not verify signature.

Industry-standard fix:

- Verify Razorpay signature before updating booking.
- Also fetch payment from Razorpay and confirm:
  - payment belongs to the same order
  - payment status is `captured`
  - amount matches expected booking amount
  - currency is `INR`

Priority: Critical.

### 2. Appointment Is Marked `booked` Before Payment Is Successful

Risk:

A user can create order, never pay, and still block the slot because slot availability counts `booked` appointments.

Current v2:

```text
payment_status = "pending"
status = "booked"
```

Industry-standard fix:

Use:

```text
payment_status = "pending"
status = "pending"
```

Then after payment/webhook:

```text
payment_status = "success"
status = "booked"
```

Also auto-expire stale pending bookings after 5 to 10 minutes.

Priority: Critical.

### 3. No Strong Slot Locking Or Race Protection

Risk:

Two users can try to book the same slot at the same time. Both requests may pass availability check before either insert is committed.

Current code:

- Slot status counts existing appointments.
- Create-order does not visibly lock slot row or enforce unique active booking per store/date/slot.

Industry-standard fix:

- Use DB transaction with row lock or unique constraint.
- Recommended uniqueness:

```text
store_id + booking_date + slot_id + active status
```

Because MySQL partial unique indexes are limited, this can be implemented with a generated column or separate `slot_locks` table.

Priority: Critical.

### 4. Amount From Razorpay Is Not Rechecked On Payment Success

Risk:

Even if signature is valid, backend should verify Razorpay payment amount equals backend appointment amount.

Current code:

- On success API, it does not fetch Razorpay payment details.
- It does not compare paid amount to appointment amount.

Industry-standard fix:

After checkout success or webhook:

1. Fetch payment/order from Razorpay.
2. Compare amount paid with `appointments.amount * 100`.
3. Compare currency.
4. Compare order ID.
5. Only then mark success.

Priority: Critical.

### 5. Webhook And App Success Can Double-Process Side Effects

Risk:

Both the mobile success API and Razorpay webhook can run for the same payment.

Current code:

- Webhook skips if appointment is already success.
- Payment success API does not check if already processed.
- Wallet credit happens in legacy payment success and webhook, but v2 payment success does not credit store wallet.

Possible outcomes:

- Duplicate notifications.
- Duplicate wallet credit in some flows.
- Missing wallet credit in v2 app-success flow.

Industry-standard fix:

- Make payment finalization one shared idempotent function.
- Use a transaction.
- Update only when current state is `pending`.
- Store a payment event log with unique `razorpay_payment_id`.
- Send notifications after successful one-time state change.

Priority: High.

### 6. Store Wallet Credit Is Inconsistent

Risk:

Store wallet/revenue may be wrong.

Current behavior:

- Webhook `payment.captured` credits store wallet.
- Legacy payment success credits store wallet.
- V2 payment success does not credit store wallet.

Industry-standard fix:

- Decide when salon wallet should be credited.
- Usually credit after payment captured, or after appointment completed depending business settlement policy.
- Implement it in one shared finalization path.

Priority: High.

### 7. Coupon Usage Is Recorded Before Payment Success

Risk:

User can start checkout with coupon, abandon payment, and coupon usage is still consumed.

Current v2:

- `UsedCoupons` row is inserted during create order.
- Payment may remain pending or fail.

Industry-standard fix:

- Reserve coupon during pending order with expiry, or
- Insert coupon usage only after successful payment.

Priority: High.

### 8. Coupon Validation Does Not Check Date Range In The Booking Flow

Risk:

An active coupon may be used outside intended `start_date` and `end_date` if status is not perfectly maintained by cron/admin.

Current flow:

- `getdiscount()` checks only `id` and `status = "active"`.
- It does not check start/end dates at booking time.

Industry-standard fix:

At checkout, validate:

- status is active
- current date is between start and end date
- usage limit is not exceeded
- coupon applies to this user/store/service, if such rules exist

Priority: High.

### 9. GST Handling Is Confusing And Can Be Wrong

Risk:

Incorrect final amount, tax display mismatch, or compliance/reporting issues.

Current v2:

- Adds `gst` as an amount.
- Saves `gst || 5`.

Legacy flow:

- Calculates 5 percent GST internally.

Admin booking detail:

- Treats `gst` as a rate and calculates percentage.

Industry-standard fix:

Store clearly separated fields:

```text
subtotal
discount_amount
tax_rate
tax_amount
platform_fee
grand_total
```

Priority: High.

### 10. Request `store_id` Is Not Strictly Matched Against Selected Services

Risk:

Frontend can send `store_id` for one salon and service IDs from another salon.

Current v2:

- Services are fetched by IDs.
- The code comments say it validates services belong to the store, but actual query only checks service IDs and active status.
- `store_id` is taken from body if provided, otherwise from first service/combo.

Industry-standard fix:

- Require one store ID.
- Verify every selected service/combo belongs to that same store.
- Verify the selected slot also belongs to that store.

Priority: High.

### 11. Selected Slot Is Not Revalidated During Create Order

Risk:

The app may show a slot as available, but by the time checkout starts it may be booked or blocked.

Current v2:

- Create order does not visibly call slot availability validation before inserting appointment.

Industry-standard fix:

- Re-check slot availability inside the same transaction used to create appointment.
- Lock the slot or enforce unique active booking.

Priority: High.

### 12. Failed Payment Status Uses Invalid Appointment Status

Risk:

Webhook `payment.failed` may fail when trying to save invalid status.

Current code:

```text
appointments.status = "failed"
```

But model enum does not include `failed`.

Industry-standard fix:

Either add `failed` to enum, or keep:

```text
status = "pending"
payment_status = "failed"
```

Then expire/release the slot.

Priority: Medium.

### 13. Refund Paths Are Not Unified

Risk:

One admin path triggers Razorpay refund; another path has a TODO and only updates DB.

Current code:

- `/admin/app/updaterefundrequest` can call Razorpay refund.
- `/admin/app/refundbookings` appears broken due to function-name mismatch and the DB helper has Razorpay refund TODO.

Industry-standard fix:

- One refund service.
- Always verify payment status and amount.
- Call Razorpay refund.
- Save refund ID/status.
- Update appointment only after refund request is accepted by Razorpay.
- Use webhook for refund processed/failed events if enabled.

Priority: High.

### 14. Partner Cancellation Does Not Trigger Refund Logic

Risk:

Partner can cancel a paid booking, but the user may not automatically get a refund request or notification about refund status.

Current code:

- Partner cancel sets `status = "cancelled"`.
- No Razorpay refund call.
- No refund request creation.

Industry-standard fix:

- If partner cancels a paid booking, automatically create refund workflow.
- Notify customer.
- Track reason and who cancelled.

Priority: High.

### 15. State Names Are Inconsistent

Risk:

Reports and queries can miss records.

Current examples:

- `success`
- `sucssess`
- `pending`
- `completed`
- `paid`
- `refunded`

Industry-standard fix:

Use controlled enums and one spelling everywhere:

```text
payment_status: pending, success, failed, refunded
booking_status: pending, booked, confirmed, completed, cancelled, refunded
```

Priority: Medium.

### 16. Some Status Checks Use Loose Or Wrong Conditions

Risk:

Wrong branch may run.

Example:

Partner middleware checks:

```js
if (body.status !== undefined || body.status !== null || body.status !== "")
```

Because this uses `OR`, it is almost always true. It should use `AND`.

Industry-standard fix:

```js
if (body.status !== undefined && body.status !== null && body.status !== "")
```

Priority: Medium.

### 17. Webhook Secret Missing Still Returns Success

Risk:

If `RZ_WEBHOOK_SECRET` is missing, webhook returns `200 ok` without processing. Razorpay will stop retrying, and payments may remain pending.

Current code:

- Logs error.
- Returns 200.

Industry-standard fix:

- In production, fail startup if required payment secrets are missing.
- For webhook, return non-2xx for configuration errors if retry is desired.
- Alert the team.

Priority: Medium.

### 18. Pending Bookings Need Cleanup

Risk:

Pending or abandoned checkouts can remain forever and confuse reporting/slots.

Current code:

- Slot queries only count recent pending records for 5 minutes.
- But v2 records are saved as `booked`, so they do not expire from slot occupancy.

Industry-standard fix:

- Save unpaid booking as `pending`.
- Run cron job to mark old pending bookings as `expired` or `cancelled`.
- Release slot after expiry.

Priority: High.

## Recommended Cleaner Flow

This is the safer industry-standard flow I recommend.

### Create Order

1. Validate user.
2. Validate store is active.
3. Validate selected services/combos belong to that store.
4. Validate selected slot belongs to that store and is available.
5. Start DB transaction.
6. Lock slot or create slot lock.
7. Calculate amount from DB only.
8. Validate coupon, but mark it as reserved, not used.
9. Create Razorpay order.
10. Create appointment:

```text
status = "pending"
payment_status = "pending"
```

11. Create appointment items.
12. Commit transaction.
13. Return Razorpay order ID to app.

### Confirm Payment

1. Receive `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
2. Verify signature.
3. Fetch payment/order from Razorpay.
4. Confirm payment is captured.
5. Confirm amount and currency match appointment.
6. Start DB transaction.
7. Update only if current payment status is pending.
8. Set:

```text
payment_status = "success"
status = "booked"
```

9. Mark coupon as used.
10. Credit store wallet according to business policy.
11. Commit transaction.
12. Send notifications.

### Webhook

Webhook should call the same finalization service as payment success.

That means:

- Same signature/security checks.
- Same amount checks.
- Same idempotency checks.
- Same wallet/coupon/notification behavior.

## Simple Mental Model

Think of booking as two separate things:

1. Booking reservation:
   - "I want this slot."
   - Should be temporary until payment succeeds.

2. Payment confirmation:
   - "Money is received."
   - Only after this should the slot become a real booking.

Right now, parts of the code mix those two things. The biggest improvement is to separate them clearly:

```text
Before payment: pending booking
After payment: booked appointment
After salon accepts: confirmed appointment
After service done: completed appointment
If cancelled/refunded: cancelled/refunded appointment
```

## Source Pointers

| Topic | Source |
| --- | --- |
| Route mounting | `app.js`, `src/User/routes/indexroutes.js` |
| V2 customer routes | `src/User/routes/userapproutes.js` |
| V2 create order | `src/User/middleware/appmiddleware.js`, function `createOrderV2` |
| V2 payment success | `src/User/middleware/appmiddleware.js`, function `paymentsuccessV2` |
| Webhook | `src/User/controller/webhookController.js` |
| Appointment model | `src/core/database/models/User.js`, model `appointments` |
| Appointment item model | `src/core/database/models/User.js`, model `appointment_items` |
| Slot status query | `src/core/database/Controller/userDbController.js`, function `getSlotStatusData` |
| Payment status update | `src/core/database/Controller/userDbController.js`, function `updatebooking` |
| Partner booking update/cancel | `src/Partner/middleware/partnerappmiddleware.js`, `src/core/database/Controller/partnerDbController.js` |
| Admin status transitions/refund | `src/core/database/Controller/AdminDbController.js`, `src/Admin/middleware/adminappmiddleware.js` |
