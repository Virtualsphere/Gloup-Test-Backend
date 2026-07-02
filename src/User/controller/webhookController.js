import crypto from "crypto";
import Razorpay from "razorpay";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import { sendBookingConfirmedNotifications } from "../../core/utils/bookingNotifications.js";
import dotenv from "dotenv";
dotenv.config();

const razorpay = new Razorpay({
    key_id: process.env.RZ_PAY_ID,
    key_secret: process.env.RZ_PAY_KEY,
});

/**
 * Razorpay Webhook Handler
 *
 * Razorpay sends POST requests to this endpoint when payment events occur.
 * This acts as a server-to-server safety net so that bookings are finalized
 * even when the mobile app fails to call /paymentsucssess.
 *
 * IMPORTANT: This route must NOT use UserAuthenticate middleware.
 * The request body must be the raw Buffer for HMAC signature verification.
 */
export const razorpayWebhook = async (req, res) => {
    try {
        const webhookSecret = process.env.RZ_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("[Webhook] RZ_WEBHOOK_SECRET is not configured");
            // Still return 200 to Razorpay so it doesn't keep retrying
            return res.status(200).json({ status: "ok" });
        }

        // ─── 1. Verify Signature ────────────────────────────────────────
        const receivedSignature = req.headers["x-razorpay-signature"];
        if (!receivedSignature) {
            console.warn("[Webhook] Missing x-razorpay-signature header");
            return res.status(400).json({ error: "Missing signature" });
        }

        const rawBody = req.body; // Buffer (thanks to express.raw middleware)
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(rawBody)
            .digest("hex");

        if (expectedSignature !== receivedSignature) {
            console.warn("[Webhook] Invalid signature");
            return res.status(400).json({ error: "Invalid signature" });
        }

        // ─── 2. Parse Payload ───────────────────────────────────────────
        const payload = JSON.parse(rawBody.toString("utf8"));
        const event = payload.event;

        console.log(`[Webhook] Received event: ${event}`);

        // ─── 3. Handle Events ───────────────────────────────────────────
        switch (event) {
            case "payment.captured":
                await handlePaymentCaptured(payload);
                break;

            case "payment.failed":
                await handlePaymentFailed(payload);
                break;

            default:
                console.log(`[Webhook] Ignoring unhandled event: ${event}`);
        }

        // Always respond 200 so Razorpay considers the webhook delivered
        return res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("[Webhook] Unhandled error:", error);
        // Still return 200 to prevent Razorpay from retrying endlessly
        return res.status(200).json({ status: "ok" });
    }
};

/**
 * Handle `payment.captured` event.
 *
 * When Razorpay confirms a payment has been captured, we:
 * 1. Find the appointment by razorpay_id (Razorpay order_id)
 * 2. If it's still pending, update it to booked/success
 * 3. Credit the store wallet
 * 4. Send push notifications to user and partner
 */
async function handlePaymentCaptured(payload) {
    try {
        const paymentEntity = payload.payload?.payment?.entity;
        if (!paymentEntity) {
            console.error("[Webhook] payment.captured: Missing payment entity");
            return;
        }

        const razorpayOrderId = paymentEntity.order_id;
        const razorpayPaymentId = paymentEntity.id;

        if (!razorpayOrderId) {
            console.error("[Webhook] payment.captured: Missing order_id in payment entity");
            return;
        }

        console.log(`[Webhook] payment.captured — order: ${razorpayOrderId}, payment: ${razorpayPaymentId}`);

        // ─── Check if appointment exists ────────────────────────────────
        const appointment = await userDbController.app.getordredetails(razorpayOrderId);

        if (!appointment) {
            console.warn(`[Webhook] No appointment found for razorpay_id: ${razorpayOrderId}`);
            return;
        }

        // ─── Idempotency: skip if already processed ────────────────────
        if (appointment.payment_status === "success" || appointment.payment_status === "sucssess") {
            console.log(`[Webhook] Appointment ${appointment.id} already marked as success, skipping`);
            return;
        }

        // ─── Update appointment to booked (atomic — only first caller wins) ─
        const rowsUpdated = await userDbController.app.updatebooking(
            razorpayOrderId,
            razorpayPaymentId,
            null
        );

        if (!rowsUpdated) {
            console.log(
                `[Webhook] Appointment ${appointment.id} already processed by another handler, skipping`
            );
            return;
        }

        console.log(`[Webhook] Appointment ${appointment.id} updated to booked/success`);

        if (appointment.is_discounted && appointment.discount_id) {
            const couponUsage = await userDbController.app.getCouponUsageCount1(
                { coupon_id: appointment.discount_id },
                appointment.user_id
            );
            if (!couponUsage) {
                await userDbController.app.addUsedCoupons(
                    appointment.discount_id,
                    appointment.user_id
                );
            }
        }

        // ─── Credit store wallet ────────────────────────────────────────
        try {
            await userDbController.app.addwalletamount(appointment.store_id, appointment.amount);
            console.log(`[Webhook] Store ${appointment.store_id} wallet credited with ${appointment.amount}`);
        } catch (walletError) {
            console.error(`[Webhook] Failed to credit store wallet:`, walletError);
            // Don't throw — booking is already saved, wallet can be reconciled manually
        }

        // ─── Send notifications (best-effort) ──────────────────────────
        try {
            await sendBookingConfirmedNotifications(appointment);
        } catch (notifyError) {
            console.error(`[Webhook] Notification error (non-fatal):`, notifyError);
        }
    } catch (error) {
        console.error("[Webhook] Error handling payment.captured:", error);
        // Don't throw — we still want to return 200 to Razorpay
    }
}

/**
 * Handle `payment.failed` event.
 *
 * Mark the appointment as failed so it doesn't stay as "pending" forever.
 */
async function handlePaymentFailed(payload) {
    try {
        const paymentEntity = payload.payload?.payment?.entity;
        if (!paymentEntity) return;

        const razorpayOrderId = paymentEntity.order_id;
        if (!razorpayOrderId) return;

        console.log(`[Webhook] payment.failed — order: ${razorpayOrderId}`);

        const appointment = await userDbController.app.getordredetails(razorpayOrderId);
        if (!appointment) {
            console.warn(`[Webhook] No appointment found for razorpay_id: ${razorpayOrderId}`);
            return;
        }

        // Only update if still pending
        if (appointment.payment_status === "pending") {
            await userDbController.app.releasePendingAppointment({
                appointmentId: appointment.id,
                userId: appointment.user_id,
            });
            console.log(`[Webhook] Appointment ${appointment.id} released after payment failure`);
        }
    } catch (error) {
        console.error("[Webhook] Error handling payment.failed:", error);
    }
}
