import require from "requirejs";
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import { messagingFunction } from "../../core/utils/msg91.js";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import admin from "firebase-admin";
import { createRequire } from "module";
// const require = createRequire(import.meta.url);
// const firebaseAdmin = admin.initializeApp({
//     credential: admin.credential.cert(require("../../../config/firebase.json")),
// });

import { FirebaseService } from "../../core/utils/notifier.js";
var CryptoJS = require("crypto-js");
import dotenv from "dotenv";
import cron from 'node-cron';
dotenv.config();



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

        // Add other cron jobs here
    }

    static scheduleSubscriptionUpdates() {
        cron.schedule('0 0 * * *', async () => {
            try {
                const datelimit = new Date().toISOString().split('T')[0];
                const todayorders = await userDbController.app.gettodayorders(datelimit);

                if (todayorders.length === 0) return;

                const tokenArray = [];
                const store = todayorders[0].store;

                for (const order of todayorders) {
                    if (!order.device_id) continue;

                    let new_array = Array.isArray(order.device_id)
                        ? order.device_id
                        : JSON.parse(order.device_id);

                    for (const device_id of new_array) {
                        tokenArray.push(device_id);
                    }
                }

                const notify = {
                    token: tokenArray,
                    eventTitle: "Hey You Have an Appointment Today",
                    eventDescription: `Your Booking with ${store.name} has been confirmed`,
                };

                await FirebaseService.notifyOrderStatus(notify);

            } catch (error) {
                console.error("Error in cron job:", error);
            }
        }, {
            timezone: 'Asia/Kolkata'
        });
    }
}


