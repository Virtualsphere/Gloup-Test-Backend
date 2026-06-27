import { userDbController } from "../database/Controller/userDbController.js";
import {
    persistNormalizedPartnerToken,
    persistNormalizedUserToken,
} from "./fcmTokenService.js";
import {
    acquirePushDedupeLock,
    sendPushNotification,
} from "./pushNotificationService.js";

const BOOKING_LOG_TTL_SECONDS = 86400;

async function addUserBookingLogIfNew(appointmentId, notify, userId, store) {
    const logKey = `push:log:booking:${appointmentId}:user`;
    const acquired = await acquirePushDedupeLock(logKey, BOOKING_LOG_TTL_SECONDS);
    if (!acquired) {
        return false;
    }

    await userDbController.app.addnotificationlogs(notify, userId, store);
    return true;
}

async function addPartnerBookingLogIfNew(
    appointmentId,
    notify,
    partnerAppointmentId,
    user,
    store
) {
    const logKey = `push:log:booking:${appointmentId}:partner`;
    const acquired = await acquirePushDedupeLock(logKey, BOOKING_LOG_TTL_SECONDS);
    if (!acquired) {
        return false;
    }

    await userDbController.app.addnotificationlogspartner(
        notify,
        partnerAppointmentId,
        user,
        store
    );
    return true;
}

/**
 * Send booking-confirmed push + in-app logs once per appointment (user + partner).
 */
export async function sendBookingConfirmedNotifications(appointment) {
    const store = await userDbController.app.getstore(appointment.store_id);
    if (!store) {
        console.warn(
            `[BookingNotify] Store ${appointment.store_id} not found, skipping`
        );
        return;
    }

    const appointmentId = appointment.id;

    const userDevice = await userDbController.app.getdeviceId(
        appointment.user_id
    );
    if (userDevice?.device_id) {
        const token = await persistNormalizedUserToken(
            appointment.user_id,
            userDevice.device_id
        );

        if (token) {
            const userNotify = {
                token: [token],
                eventTitle: "Order Confirmed",
                eventDescription: `Your Booking with ${store.name} has been confirmed`,
            };

            await addUserBookingLogIfNew(
                appointmentId,
                userNotify,
                appointment.user_id,
                store
            );

            await sendPushNotification({
                dedupeKey: `booking:${appointmentId}:user`,
                recipients: [{ token, user_id: appointment.user_id }],
                title: userNotify.eventTitle,
                body: userNotify.eventDescription,
                collapseKey: `booking_${appointmentId}_user`,
                persistLogs: false,
            });
        }
    }

    const partnerDevice = await userDbController.app.getdeviceIdbypartner(
        appointment.store_id
    );
    if (partnerDevice?.deviceId) {
        const token = await persistNormalizedPartnerToken(
            appointment.store_id,
            partnerDevice.deviceId
        );

        if (token) {
            const user = await userDbController.app.getuser(
                null,
                appointment.user_id
            );

            const partnerNotify = {
                token: [token],
                eventTitle: "New Booking",
                eventDescription: `You have received a new booking from ${user?.firstname || "a customer"}`,
            };

            await addPartnerBookingLogIfNew(
                appointmentId,
                partnerNotify,
                appointment.id,
                user,
                store
            );

            await sendPushNotification({
                dedupeKey: `booking:${appointmentId}:partner`,
                recipients: [{ token, partner_id: appointment.store_id }],
                title: partnerNotify.eventTitle,
                body: partnerNotify.eventDescription,
                collapseKey: `booking_${appointmentId}_partner`,
                persistLogs: false,
            });
        }
    }
}
