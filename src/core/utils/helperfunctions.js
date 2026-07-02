import require from "requirejs";
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import { messagingFunction } from "../../core/utils/msg91.js";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import {
    persistNormalizedUserToken,
} from "../../core/utils/fcmTokenService.js";
import { sendPushNotification } from "../../core/utils/pushNotificationService.js";
import cron from 'node-cron';



export class helperfunction { }

helperfunction.validations = {
    updtaesubscription: async (body) => {
        try {
            const date = new Date();

            const getactivetabs = await userDbController.app.getactiveplans(date);
            const activesubs = await userDbController.app.deactivatesubs(date);

            for (const sub of getactivetabs) {
                if (sub.type === "range") {
                    await userDbController.app.updateaddress(sub.store_id);
                }
            }

            const activatediscounts = await userDbController.app.activatediscounts(date);

            const deactivatediscounts = await userDbController.app.deactivatesdiscounts(date);

        } catch (error) {
            //////console.log("🚀 ~ updtaesubscription: ~ error:", error)
            throw Error.SomethingWentWrong("Failed to update subscription");
        }
    },
    updatecopletionpercentage: async (data) => {
        try {
            const res = await userDbController.app.getcompletionpercentage(data);

            let percentage = 0
            const pending = []
            for (const item of res) {
                if (item.count != 0 && item.count != undefined && item.count != null) {
                    percentage += 16.66;
                } else {
                    pending.push(item.type);
                }
            }

            if (percentage > 98) {
                const res = await userDbController.app.updatecompletion_1(data);
            } else if (percentage < 98) {
                const res = await userDbController.app.updatecompletion(data);
            }


            return {
                percentage: percentage <= 98 ? percentage : 100,
                pending: pending
            }

        } catch (error) {
            ////console.log("🚀 ~ updatecopletionpercentage: ~ error:", error)
            throw Error.SomethingWentWrong("Failed to update completion percentage");
        }

    }

}




export class CronHelper {
    static initCronJobs() {
        this.scheduleSubscriptionUpdates();
        this.schedulePendingAppointmentExpiry();

        // Add other cron jobs here
    }

    static schedulePendingAppointmentExpiry() {
        cron.schedule('*/2 * * * *', async () => {
            try {
                const expiredCount = await userDbController.app.expirePendingAppointments();
                if (expiredCount > 0) {
                    console.log(`[Cron] Released ${expiredCount} expired pending appointment(s)`);
                }
            } catch (error) {
                console.error("Error in pending appointment expiry cron:", error);
            }
        }, {
            timezone: 'Asia/Kolkata'
        });
    }

    static scheduleSubscriptionUpdates() {
        cron.schedule('0 0 * * *', async () => {
            try {
                const datelimit = new Date().toISOString().split('T')[0];
                const todayorders = await userDbController.app.gettodayorders(datelimit);

                if (todayorders.length === 0) return;

                for (const order of todayorders) {
                    if (!order.device_id || !order.user_id) continue;

                    const token = await persistNormalizedUserToken(
                        order.user_id,
                        order.device_id
                    );
                    if (!token) continue;

                    const storeName = order.name || "your salon";

                    await sendPushNotification({
                        dedupeKey: `cron:appointment:${datelimit}:${order.user_id}`,
                        recipients: [{ token, user_id: order.user_id }],
                        title: "Hey You Have an Appointment Today",
                        body: `Your Booking with ${storeName} has been confirmed`,
                        collapseKey: `cron_${datelimit}_${order.user_id}`,
                        persistLogs: false,
                    });
                }

            } catch (error) {
                console.error("Error in cron job:", error);
            }
        }, {
            timezone: 'Asia/Kolkata'
        });
    }
}


