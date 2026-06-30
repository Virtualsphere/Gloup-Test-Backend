import require from "requirejs";
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import { messagingFunction } from "../../core/utils/msg91.js";
var CryptoJS = require("crypto-js");
import dotenv from "dotenv";
import { adminDbController } from "../../core/database/Controller/AdminDbController.js";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import { addbanner, addcategory, deletecategory, getallcategory, getallcoupons, getallsubscription, getBookings, getBookingsDetails, getrefundrequests, updateuser, getBookingsDetailsById, downloadBookingPDF, getallpartner } from "../controller/adminappcontroller.js";
import { partnerDbController } from "../../core/database/Controller/partnerDbController.js";
import {
    getLatestFcmToken,
    uniqueTokenOnly,
} from "../../core/utils/fcmTokenService.js";
import {
    hashNotificationContent,
    sendPushNotification,
} from "../../core/utils/pushNotificationService.js";
import {
    createPushTraceId,
    findDuplicateTokens,
    logPushDebug,
    summarizeRecipients,
} from "../../core/utils/pushDebug.js";
import { admin } from "../../core/database/models/Admin.js";
import Razorpay from "razorpay";
import { uploadToS3, S3upload } from "../../core/utils/s3/s3Upload.js";

dotenv.config();


const razorpay = new Razorpay({
    key_id: process.env.RZ_PAY_ID,
    key_secret: process.env.RZ_PAY_KEY
});


export class Adminappmiddleware { }

Adminappmiddleware.app = {
    getallusers: async ({ body, user }) => {
        try {
            const users = await adminDbController.app.getallusers(body);
            if (users != null && users != undefined && Object.keys(users).length != 0) {
                return users;
            } else {
                throw Error.NotFound("No Users Found");
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to fetch users");
        }
    },
    getallnotification: async ({ body, user }) => {
        try {
            const user = await adminDbController.app.getadminnotification(body);
            if (user != null && user != undefined && Object.keys(user).length != 0) {
                return user;
            } else {
                throw Error.NotFound("No Notifications Found");
            }
        } catch (error) {
            //////console.log("🚀 ~ getallnotification:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch notifications");
        }
    },
    updatecoupons: async ({ body, user }) => {
        try {



        } catch (error) {
            throw Error.SomethingWentWrong("Failed to update coupons");
        }
    },
    getallsubscription: async ({ body, user }) => {
        try {
            const subscriptions = await adminDbController.app.getallsubscription(body);
            if (subscriptions != null && subscriptions != undefined && Object.keys(subscriptions).length != 0) {
                return subscriptions;
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to fetch subscriptions");
        }
    },
    getdashboard: async ({ body, user }) => {
        try {
            const year = new Date().getFullYear();
            const gettotalusers = await adminDbController.app.gettotalusers(body);
            const gettotalpartner = await adminDbController.app.gettotalpartner(body);

            const gettotalsales = await adminDbController.app.getotalsales(body);

            const totalsalescount = await adminDbController.app.getotalsalescount(body);

            const avearageordervalue = await adminDbController.app.getaverageordervalue(body);

            const topsalloons = await adminDbController.app.gettopsaloons(body);

            const getsalesbycategory = await adminDbController.app.getsalesbycategory(body);

            const getgendersales = await adminDbController.app.getgendersales(body);
            const salesbycategory = getsalesbycategory.map((item) => {
                return {
                    category: item.category_name,
                    total_sales: item.total_sales,
                }
            })

            const activebookingstoday = await adminDbController.app.getactivebookingstoday(body);

            const monthlyRevenueResult = await adminDbController.app.getmonthlysales(year);
            //console.log("🚀 ~ getdashboard:async ~ monthlyRevenueResult:", monthlyRevenueResult)

            const revenueMap = new Map(
                monthlyRevenueResult.map(item => [item.month, parseFloat(item.total_sales)])
            );
            const categories = [];
            const seriesData = [];

            for (let month = 1; month <= 12; month++) {
                const monthString = String(month).padStart(2, '0');
                const yearMonthKey = `${year}-${monthString}`;
                categories.push(yearMonthKey);
                seriesData.push(revenueMap.get(yearMonthKey) || 0);
            }

            const processedMonthlyRevenue = {
                categories: categories,
                series: [{
                    name: "Revenue",
                    data: seriesData
                }]
            };

            const result = {
                total_users: gettotalusers,
                total_partners: gettotalpartner,
                total_sales: gettotalsales,
                average_order_value: avearageordervalue,
                top_saloons: topsalloons,
                sales_by_category: salesbycategory,
                monthly_revenue: processedMonthlyRevenue,
                total_sales_count: totalsalescount,
                totalgendersales: getgendersales,
                active_bookings_today: activebookingstoday
            }

            return result;
        } catch (error) {
            //console.log("🚀 ~ getdashboard:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch dashboard data");
        }
    },
    addcoupons: async ({ body, user }) => {
        try {
            if (body.id === undefined || body.id === null || body.id === "") {
                const addcoupons = await adminDbController.app.addcoupons(body);
                if (addcoupons != null && addcoupons != undefined && Object.keys(addcoupons).length != 0) {
                    return "Coupons Added Successfully";
                } else {
                    throw Error.NotFound("No Coupons Found");
                }
            } else {
                const updatecoupons = await adminDbController.app.updatecoupons(body);
                if (updatecoupons != null && updatecoupons != undefined && Object.keys(updatecoupons).length != 0) {
                    return "Coupons Updated Successfully";
                } else {
                    throw Error.NotFound("No Coupons Found");
                }
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to add coupons");
        }
    },
    getallcoupons: async ({ body, user }) => {
        try {
            const coupons = await adminDbController.app.getallcoupons(body);
            if (coupons != null && coupons != undefined) {
                return coupons;
            } else {
                throw Error.NotFound("No Coupons Found");
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch coupons");
        }
    },
    addnotification: async ({ body, user }) => {
        try {

            const { notification_type, sent_to, title, description, store_id } = body;

            /* ------------------------------------------
               Helper: Extract valid tokens safely
            -------------------------------------------*/
            const extractTokens = (deviceField) => {
                if (!deviceField) return [];

                try {
                    const tokens = Array.isArray(deviceField)
                        ? deviceField
                        : JSON.parse(deviceField);

                    return tokens.filter(t => t);
                } catch (err) {
                    return [];
                }
            };

            /* ------------------------------------------
               Helper: Send Firebase Notification
            -------------------------------------------*/
            const sendNotification = async (tokenObjects, notificationId, traceId) => {
                if (!tokenObjects.length) return null;
                return sendPushNotification({
                    dedupeKey: `admin:${notificationId}`,
                    rapidDedupeKey: `admin:rapid:broadcast:${hashNotificationContent(title, description)}:${sent_to || "all"}`,
                    recipients: tokenObjects,
                    title,
                    body: description,
                    collapseKey: `admin_${notificationId}`,
                    persistLogs: true,
                    notificationOnly: true,
                    debugTraceId: traceId,
                    debugContext: `admin_broadcast:${sent_to}`,
                });
            };
            /* ------------------------------------------
               Fetch Users & Partners Once
            -------------------------------------------*/
            const [users, partners] = await Promise.all([
                adminDbController.app.getallusersdeviceId(),
                adminDbController.app.getallpartnerdeviceId()
            ]);

            let tokenArray = [];
            let userLogs = [];
            let partnerLogs = [];

            /* ======================================================
                              GENERAL NOTIFICATION
            =======================================================*/
            if (notification_type === "general") {

            /* ------------------------------------------
                STEP 1: Create Main Notification First
                -------------------------------------------*/
                const adminNotification = await adminDbController.app.addnotificationlogsadmin({
                    store_id,
                    notification_type,
                    sent_to,
                    title,
                    description,
                    date: new Date()
                });

                const notificationId = adminNotification.id;
                const pushTraceId = createPushTraceId("broadcast");

                logPushDebug(pushTraceId, "broadcast_start", {
                    notificationId,
                    sent_to,
                    notification_type,
                    title: title?.slice(0, 80),
                    activeUsersQueried: users.length,
                    activePartnersQueried: partners.length,
                });

                const userTokenEntries = [];
                const partnerTokenEntries = [];

                if (sent_to === "all" || sent_to === "user") {
                    users.forEach(userItem => {
                        const token = getLatestFcmToken(userItem.device_id);
                        if (token) {
                            userTokenEntries.push({
                                token,
                                user_id: userItem?.dataValues?.user_id,
                                partner_id: null,
                                notification_id: notificationId
                            });
                        }

                        userLogs.push({
                            notification_id: notificationId,
                            user_id: userItem?.dataValues?.user_id,
                            image: null,
                            title,
                            description,
                            status: "active",
                            date: new Date(),
                        });
                    });
                }

                if (sent_to === "all" || sent_to === "store") {
                    partners.forEach(partnerItem => {
                        const token = getLatestFcmToken(partnerItem.deviceId);
                        if (token) {
                            partnerTokenEntries.push({
                                token,
                                user_id: null,
                                partner_id: partnerItem?.dataValues?.store_id,
                                notification_id: notificationId
                            });
                        }

                        partnerLogs.push({
                            notification_id: notificationId,
                            partner_id: partnerItem?.dataValues?.store_id,
                            image: null,
                            title,
                            description,
                            status: "active",
                            date: new Date(),
                        });
                    });
                }

                tokenArray = [...userTokenEntries, ...partnerTokenEntries];

                const crossListDuplicates = findDuplicateTokens(
                    userTokenEntries,
                    partnerTokenEntries
                );

                //Remove Duplicate Tokens
                const uniqueTokensMap = new Map();

                tokenArray.forEach(item => {
                    if (!uniqueTokensMap.has(item.token)) {
                        uniqueTokensMap.set(item.token, item);
                    }
                });

                const beforeUniqueCount = tokenArray.length;
                tokenArray = uniqueTokenOnly(Array.from(uniqueTokensMap.values()));

                logPushDebug(pushTraceId, "broadcast_tokens_built", {
                    userTokensWithDevice: userTokenEntries.length,
                    partnerTokensWithDevice: partnerTokenEntries.length,
                    crossListDuplicateTokens: crossListDuplicates.length,
                    crossListDuplicates: summarizeRecipients(crossListDuplicates),
                    beforeUniqueCount,
                    afterUniqueCount: tokenArray.length,
                    finalRecipients: summarizeRecipients(tokenArray),
                    inAppUserLogsToInsert: userLogs.length,
                    inAppPartnerLogsToInsert: partnerLogs.length,
                });

                const pushResult = await sendNotification(
                    tokenArray,
                    notificationId,
                    pushTraceId
                );

                logPushDebug(pushTraceId, "broadcast_push_finished", {
                    pushResult: pushResult || { note: "no_tokens_sent" },
                });

                 /* ------------------------------------------
                STEP 4: Save Logs
                -------------------------------------------*/
                if (userLogs.length)
                    await userDbController.app.addnotificationlogs_1(userLogs);

                if (partnerLogs.length)
                    await userDbController.app.addnotificationlogspartner_1(partnerLogs);

                return "Notification Sent Successfully";
            }

            /* ======================================================
                            SUBSCRIPTION NOTIFICATION
            =======================================================*/
            if (notification_type === "subscription") {

                const subscription = await adminDbController.app.getactivesubs(body);

                if (!subscription)
                    return "There are no active subscription plans";

                const start_date = new Date(subscription.start_date);
                const end_date = new Date(subscription.end_date);

                const count = await adminDbController.app
                    .getactivesubscriptioncount(body, start_date, end_date);

                if (count >= subscription.quantity)
                    return "Notification Limit For This Store Already Reached";

                const store = await adminDbController.app.getstorebyid(store_id);

                const adminNotification =
                    await adminDbController.app.addnotificationlogsadmin({
                        store_id,
                        notification_type,
                        sent_to: "store",
                        title,
                        description,
                        date: new Date(),
                    });
                const notificationId = adminNotification.id;
                const pushTraceId = createPushTraceId("subscription");

                users.forEach((userItem) => {
                    const token = getLatestFcmToken(userItem.device_id);
                    if (token) {
                        tokenArray.push({
                            token,
                            user_id: userItem?.dataValues?.user_id,
                            partner_id: null,
                            notification_id: notificationId,
                        });
                    }

                    userLogs.push({
                        notification_id: notificationId,
                        user_id: userItem?.dataValues?.user_id,
                        image: store?.images ? JSON.parse(store.images) : null,
                        title,
                        description,
                        status: "active",
                        date: new Date(),
                    });
                });

                await sendNotification(tokenArray, notificationId, pushTraceId);

                await userDbController.app.addnotificationlogs_1(userLogs);

                return "Notification Sent Successfully";
            }

            return "Invalid Notification Type";

        } catch (error) {
            throw Error.SomethingWentWrong("Wrong Notification Type");
        }
    },

    /**
     * Send push notification to a single user or partner (store).
     * Body: recipient_type ("user"|"partner"|"store"), recipient_id (or user_id / partner_id / store_id), title, description
     */
    sendTargetedNotification: async ({ body }) => {
        try {
            const { title, description } = body;
            const rawRecipientType = (body.recipient_type || body.sent_to || "")
                .toLowerCase()
                .trim();
            const recipientTypeByAlias = {
                user: "user",
                partner: "partner",
                store: "partner",
            };
            const recipientType = recipientTypeByAlias[rawRecipientType];
            const recipientId = parseInt(
                body.recipient_id ?? body.user_id ?? body.partner_id ?? body.store_id,
                10
            );

            if (!title?.trim() || !description?.trim()) {
                throw Error.BadRequest("title and description are required");
            }
            if (!recipientType) {
                throw Error.BadRequest(
                    "recipient_type must be 'user', 'partner', or 'store'"
                );
            }
            if (!recipientId || isNaN(recipientId)) {
                throw Error.BadRequest(
                    "recipient_id is required (or user_id / partner_id / store_id)"
                );
            }

            let userId = null;
            let partnerId = null;
            let tokens = [];
            let recipientName = "";

            if (recipientType === "user") {
                const userRecord =
                    await adminDbController.app.getUserByIdForNotification(
                        recipientId
                    );
                if (!userRecord) {
                    throw Error.NotFound("User not found");
                }
                userId = userRecord.id;
                recipientName = [userRecord.firstname, userRecord.lastname]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                const latest = getLatestFcmToken(userRecord.device_id);
                tokens = latest ? [latest] : [];
            } else {
                const storeRecord =
                    await adminDbController.app.getStoreByIdForNotification(
                        recipientId
                    );
                if (!storeRecord) {
                    throw Error.NotFound("Partner / store not found");
                }
                partnerId = storeRecord.id;
                recipientName = storeRecord.name || "";
                const latest = getLatestFcmToken(storeRecord.deviceId);
                tokens = latest ? [latest] : [];
            }

            const trimmedTitle = title.trim();
            const trimmedDescription = description.trim();

            const adminNotification =
                await adminDbController.app.addnotificationlogsadmin({
                    store_id: partnerId,
                    notification_type: "general",
                    sent_to: recipientType === "user" ? "user" : "store",
                    title: trimmedTitle,
                    description: trimmedDescription,
                    date: new Date(),
                });

            const notificationId = adminNotification.id;
            const pushTraceId = createPushTraceId("targeted");

            logPushDebug(pushTraceId, "targeted_start", {
                notificationId,
                recipientType,
                recipientId,
                recipientName,
                tokenCount: tokens.length,
                tokens,
            });

            if (recipientType === "user") {
                await userDbController.app.addnotificationlogs_1([
                    {
                        notification_id: notificationId,
                        user_id: userId,
                        image: null,
                        title: trimmedTitle,
                        description: trimmedDescription,
                        status: "active",
                        date: new Date(),
                    },
                ]);
            } else {
                await userDbController.app.addnotificationlogspartner_1([
                    {
                        notification_id: notificationId,
                        partner_id: partnerId,
                        image: null,
                        title: trimmedTitle,
                        description: trimmedDescription,
                        status: "active",
                        date: new Date(),
                    },
                ]);
            }

            const tokenObjects = tokens.map((token) => ({
                token,
                user_id: userId,
                partner_id: partnerId,
                notification_id: notificationId,
            }));

            const pushResult =
                tokenObjects.length > 0
                    ? await sendPushNotification({
                          dedupeKey: `admin:${notificationId}`,
                          rapidDedupeKey: `admin:rapid:${recipientType}:${recipientId}:${hashNotificationContent(trimmedTitle, trimmedDescription)}`,
                          recipients: tokenObjects,
                          title: trimmedTitle,
                          body: trimmedDescription,
                          collapseKey: `admin_${notificationId}`,
                          persistLogs: true,
                          notificationOnly: true,
                          debugTraceId: pushTraceId,
                          debugContext: `admin_targeted:${recipientType}`,
                      })
                    : {
                          skipped: false,
                          attempted: 0,
                          successCount: 0,
                          failureCount: 0,
                          prunedInvalidTokens: 0,
                          failureReasons: [],
                      };

            logPushDebug(pushTraceId, "targeted_push_finished", {
                pushResult,
            });

            let message = "In-app notification saved.";
            if (pushResult.attempted === 0) {
                message +=
                    " Push skipped — no FCM tokens registered. Ask them to open the app and allow notifications.";
            } else if (
                pushResult.successCount > 0 &&
                pushResult.failureCount === 0
            ) {
                message += " Push delivered successfully.";
            } else if (pushResult.prunedInvalidTokens > 0) {
                message +=
                    " Push failed for invalid token(s); removed from database. User should reopen the app.";
            } else if (pushResult.failureCount > 0) {
                message += " Push delivery had failures.";
            }

            return {
                in_app_notification: true,
                push: {
                    attempted: pushResult.attempted,
                    success: pushResult.successCount,
                    failed: pushResult.failureCount,
                    pruned_invalid_tokens: pushResult.prunedInvalidTokens,
                    failure_reasons: pushResult.failureReasons,
                },
                message,
                recipient_type: recipientType,
                recipient_id: recipientId,
                recipient_name: recipientName || null,
                notification_id: notificationId,
            };
        } catch (error) {
            if (error.status) throw error;
            console.error("sendTargetedNotification error:", error);
            throw Error.SomethingWentWrong(
                error.message || "Failed to send notification"
            );
        }
    },

    getnotificationbyid: async ({ body, user }) => {
        try {
            const notification = await adminDbController.app.getnotificationbyid(body);
            if (notification != null && notification != undefined && Object.keys(notification).length != 0) {
                return notification;
            } else {
                throw Error.NotFound("No Notification Found");
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to fetch notification");
        }
    },
    updaterefundrequests: async ({ body, user }) => {
        try {
            const getrequest = await adminDbController.app.getrefundrequestbyid(body);
            //console.log("🚀 ~ updaterefundrequests:async ~ getrequest:", getrequest)
            if (getrequest == null || getrequest == undefined) {
                throw Error.NotFound("No Refund Request Found");
            }


            const getappoinment = await adminDbController.app.getappointmentbyid(getrequest.appointment_id);

            const getuser = await adminDbController.app.getuserdetails(getappoinment.user_id);

            if (body.status === "approved") {
                const deleterequest = await adminDbController.app.updaterefundrequest(body);


                if (getappoinment.is_wallet === true) {
                    const addwallet = await adminDbController.app.addwallet(getappoinment.user_id, getappoinment.discounted_amount);

                    return "Refunded amount to your wallet successfully";
                }
                const response = await razorpay.payments.refund(getappoinment.payment_id, {
                    speed: 'optimum',
                    notes: { reason: 'refund on order' }
                })
                //console.log("🚀 ~ updaterefundrequests:async ~ response:", response)

                return "Refunded amount successfully";
            } else {

                const updaterequest = await adminDbController.app.updaterequest(body);

                return "Refund Request Updated Successfully";

            }

        } catch (error) {
            //console.log("🚀 ~ updaterefundrequests:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to update refund request");
        }
    },
    deletereviewrequest: async ({ body, user }) => {
        try {
            const getrequest = await adminDbController.app.getrefundrequest(body);
            if (getrequest == null || getrequest == undefined) {
                throw Error.NotFound("No Review Request Found");
            }

            if (getrequest.status === "approved") {

                const deleterequest = await adminDbController.app.approve(body, user.id);

                const response = await razorpay.payments.refund(paymentId, {
                    speed: 'optimum',
                    notes: { reason: 'refund on items' }
                })


            } else {
                const updaterequest = await adminDbController.app.updaterefundrequest(body);
            }


            return getrequest;
        } catch (error) {
            //console.log("🚀 ~ deletereviewrequest:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to delete review request");
        }
    },
    getreviewrequest: async ({ body, user }) => {
        try {
            const getrequest = await adminDbController.app.getreviewrequest(body);
            if (getrequest == null || getrequest == undefined) {
                return [];
            }

            return getrequest;
        } catch (error) {
            //console.log("🚀 ~ getreviewrequest:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch review request");
        }
    },
    updatereviewrequest: async ({ body, user }) => {
        try {
            if (body.status === "approved") {
                const deleterequest = await adminDbController.app.deletereview(body, user.id);

                const updaterequest = await adminDbController.app.updaterequest(body);

                return "Review Request Deleted Successfully";
            } else if (body.status === "rejected") {
                const updaterequest = await adminDbController.app.updaterequest(body);

                return "Review Request Updated Successfully";
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to update review request");
        }
    },
    getpayoutlogs: async ({ body, user }) => {
        try {
            const payoutlogs = await adminDbController.app.getpayoutlogs(body);
            if (payoutlogs != null && payoutlogs != undefined) {
                return payoutlogs;
            } else {
                []
            }
        } catch (error) {
            console.log("🚀 ~ getpayoutlogs:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch payout logs");
        }
    },
    deletebanner: async ({ body, user }) => {
        try {
            const deletebanner = await adminDbController.app.deletebanner(body);
            if (deletebanner != null && deletebanner != undefined) {


                return "Banner Deleted Successfully";
            } else {
                throw Error.NotFound("No Banner Found");
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to delete banner");
        }
    },
    getallcategory: async ({ body, user }) => {
        try {

            const categories = await adminDbController.app.getallcategory(body);
            if (categories != null && categories != undefined && categories.length != 0) {
                return categories;
            } else {
                throw Error.NotFound("No Categories Found");
            }

        } catch (error) {
            throw Error.SomethingWentWrong("Failed to fetch categories");
        }
    },
    deletecategory: async ({ body, user }) => {
        try {
            const deletecategory = await adminDbController.app.deletecategory(body);
            if (deletecategory != null && deletecategory != undefined && Object.keys(deletecategory).length != 0) {
                return "Category Deleted Successfully";
            } else {
                throw Error.NotFound("No Category Found");
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to delete category");
        }
    },
    addcategory: async ({ body, user, file }) => {
        try {

            if (body.id === undefined || body.id === null || body.id === "") {
                  // ✅ Upload to S3
                const uploaded = await uploadToS3(file, "category");

                if (!uploaded || !uploaded.url || !uploaded.key) {
                    throw new Error("Upload failed");
                }

                const addcategory = await adminDbController.app.addcategory(body, "/" + uploaded.key);

                if (addcategory != null && addcategory != undefined && Object.keys(addcategory).length != 0) {
                    return "Category Added Successfully";
                } else {
                    throw Error.NotFound("No Category Found");
                }

            } else {
                if (!file || !file.originalname ) {
                    throw Error.NotFound("No file found");
                }
                console.log(file);
                const filePath = file?.filename;

                 // ✅ Upload to S3
                const uploaded = await uploadToS3(file, "category");

                if (!uploaded || !uploaded.url || !uploaded.key) {
                    throw new Error("Upload failed");
                }

                const addcategory = await adminDbController.app.updatecategory(body, "/" + uploaded.key);

                if (addcategory != null && addcategory != undefined) {
                    return "Category Added Successfully";
                } else {
                    throw Error.NotFound("No Category Found");
                }
            }

        } catch (error) {
            //console.log("🚀 ~ addcategory:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to add category");
        }
    },
    getbanners: async ({ body, user }) => {
        try {
            const banners = await adminDbController.app.getbanners(body);
            if (banners != null && banners != undefined && Object.keys(banners).length != 0) {
                return banners;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch banners");
        }
    },
    getBookings: async ({ body, user }) => {
        try {
            const bookings = await adminDbController.app.getBookings(body);
            if (bookings !== null && bookings !== undefined) {
                return bookings;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch bookings")
        }
    },
    getBookingsDetails: async ({ body, user }) => {
        try {
            const result = await adminDbController.app.getBookingsDetails(body);
            return {
            data: result.rows || [],
            total: result.totalCount || 0,
            };
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch booking details");
        }   
    },
        getBookingsDetailsById: async ({ body, user }) => {
        try {
            const result = await adminDbController.app.getBookingsDetailsById(body);
            if (result) {
                return result;
            } else {
                throw Error.NotFound("Booking Details Not Found");
            }
        } catch (error) {
            console.log("error:", error)
            throw Error.SomethingWentWrong("Failed to fetch booking details by ID");
        }
    },
    updatebookingstatus: async ({ body, user }) => {
  try {
    const updateStatus =
      await adminDbController.app.updateBookingStatus({ body });


    if (updateStatus) {
      return "Booking Status Updated Successfully";
    } else {
      throw Error.NotFound("No Booking Found");
    }
  } catch (error) {
    console.log("🚀 ~ error:", error)
    throw Error.SomethingWentWrong("Failed to update booking status");
  }
},
    getCancelledOrders: async ({ body }) => {
        try {
            const canclledOrders = await adminDbController.app.getCancelledOrders(body);
            if (canclledOrders !== null && canclledOrders !== undefined) {
                return canclledOrders;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch cancelled orders");
        }
    },
    getTopPerformingSalon: async ({ user }) => {
        try {
            const topSalon = await adminDbController.app.getTopPerformingSalon();
            if (topSalon !== null && topSalon !== undefined) {
                return topSalon;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ getTopPerformingSalon error:", error);
            throw Error.SomethingWentWrong("Failed to fetch top performing salon");
        }
    },
    getFilterReport: async ({ body, user }) => {
        try {
            const revenue = await adminDbController.app.getFilterReport(body);
            if (revenue !== null && revenue !== undefined) {
                return revenue;
            } else {
                return { totalRevenue: 0 };
            }
        } catch (error) {
            console.log("🚀 ~ getRevenueReport error:", error);
            throw Error.SomethingWentWrong("Failed to fetch revenue report");
        }
    },
    // getRevenueCount: async ({ body }) => {
    //     try {
    //         const revenue = await adminDbController.app.getRevenueCount(body);
    //         if (revenue !== null && revenue !== undefined) {
    //             return revenue;
    //         } else {
    //             return [];
    //         }
    //     } catch (error) {
    //         console.log("🚀 ~ error:", error)
    //         throw Error.SomethingWentWrong("Failed to get revenue count");
    //     }
    // },
    getMonthlyReport: async ({ body }) => {
        const report = await adminDbController.app.getMonthlyReport(body);
        if (report && Object.keys(report).length > 0) {
            return report;
        } else {
            return { totalRevenue: 0, totalAppointments: 0 };
        }
    },
    getFilteredStores: async ({ body }) => {
        const stores = await adminDbController.app.getFilteredStores(body);
        if (stores && stores.length > 0) {
            return stores;
        } else {
            return [];
        }
    },
    getCategoryRevenue: async ({ body }) => {
        const revenue = await adminDbController.app.getCategoryRevenue(body);
        if (revenue && revenue.length > 0) {
            return revenue;
        } else {
            return [];
        }
    },
    getStoreBySearch: async ({ body }) => {
        const stores = await adminDbController.app.searchStores(body);
        if (stores && stores.length > 0) {
            return stores;
        } else {
            return [];
        }
    },
    getStoresByStatus: async ({ body }) => {
        const stores = await adminDbController.app.getStoresByStatus(body);
        if (stores && stores.length > 0) {
            return stores;
        } else {
            return [];
        }
    },
    getSalons: async ({ params }) => {
        const salons = await adminDbController.app.getSalons(params);
        if (salons && salons.length > 0) {
            return salons;
        } else {
            return [];
        }
    },
    getRevenueCategory: async ({ body }) => {
        const salons = await adminDbController.app.getRevenueCategory(body);
        if (salons && salons.length > 0) {
            return salons;
        } else {
            return [];
        }
    },
    getRevenueCategoryGrowth: async ({ body }) => {
        const salons = await adminDbController.app.getRevenueCategoryGrowth(body);
        if (salons && salons.length > 0) {
            return salons;
        } else {
            return [];
        }
    },
    updateMultipleStore: async ({ body }) => {
        const { store_ids, status } = body;
        if (!store_ids || !Array.isArray(store_ids) || store_ids.length === 0) {
            throw Error.SomethingWentWrong("All fields are required.");
        }
        if (!status || !['active', 'inactive'].includes(status)) {
            throw Error.SomethingWentWrong("All fields are required.");
        }
        try {
            const updateResult = await adminDbController.app.updateMultipleStoreStatuses(store_ids, status);
            const affectedCount = Array.isArray(updateResult) ? updateResult[0] : updateResult;
            return {
                message: `${affectedCount} stores successfully set to '${status}'.`,
                affected_rows: affectedCount
            };
        } catch (error) {
            console.error("🚀 ~ updateMultipleStoreStatuses error:", error);
            throw Error.SomethingWentWrong("Failed to update store statuses.");
        }
    },
    getAdvancedSearch: async ({ body }) => {
        try {
            const results = await adminDbController.app.getAdvancedSearch(body);
            if (results && results.length > 0) {
                return results;
            } else {
                return [];
            }
        } catch (error) {
            console.error("🚀 ~ getAdvancedSearch error:", error);
            throw Error.SomethingWentWrong("Failed to perform advanced search");
        }
    },
    updateSalon: async ({ body, files }) => {
        try {
            const imageFiles = files?.images ? files.images.map(f => f.filename) : null;
            const docFiles = files?.documents ? files.documents.map(f => f.filename) : null;

            const updatesalon = await adminDbController.app.updateSalon(body, imageFiles, docFiles);
            if (!updatesalon) {
                throw Error.SomethingWentWrong("No Salon Found");
            }
            return "Salon Updated Successfully";
        } catch (error) {
            console.error("🚀 ~ updateSalon error:", error);
            throw Error.SomethingWentWrong("Failed to update salon");
        }
    },
    getCustomers: async ({ body }) => {
        const customers = await adminDbController.app.getCustomers(body);
        if (customers && customers.length > 0) {
            return customers;
        } else {
            return [];
        }
    },
    getRegisteredStore: async ({ body }) => {
        const stores = await adminDbController.app.getStore(body);
        if (stores && stores.length > 0) {
            return stores;
        } else {
            return [];
        }
    },
    updatepartner: async ({ body, user }) => {
        try {
            const updatepartner = await adminDbController.app.updatepartner(body);
            if (!updatepartner) {
                throw Error.SomethingWentWrong("No Partner Found");
            }

            return "Partner Updated Successfully";
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to update partner");
        }
    },
    updateMultiplePartner: async ({ body }) => {

        const { partnerIds, status } = body;
        if (!partnerIds || !Array.isArray(partnerIds) || partnerIds.length === 0) {
            throw Error.SomethingWentWrong("All fields are required");
        }
        if (!status || !['completed', 'terminated'.includes(status)]) {
            throw Error.SomethingWentWrong("All fields are required");
        }
        try {
            const result = await adminDbController.app.updateMultiplePartner(partnerIds, status);
            const updated = Array.isArray(result) ? result[0] : result;
            return {
                message: `${updated} partner successfully set to ${status}`,
                rows: updated
            }
        } catch (error) {
            console.error("🚀 ~ update Multiple Partner Statuses error:", error);
            throw Error.SomethingWentWrong("Failed to update partner statuses.");
        }
    },
    deletePartner: async ({ body, user }) => {
        try {
            const deletePartner = await adminDbController.app.deletePartner(body);
            if (!deletePartner) {
                throw Error.SomethingWentWrong("No Partner Found");
            }

            return "Partner Deleted Successfully";
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to delete partner");
        }
    },
    createPartner: async ({ body, user, files }) => {
        console.log("🚀 ~ files:", files)
        console.log("🚀 ~ body:", body)
        try {
            const images = files?.images;
            const docs = files?.documents;
            const logo = files?.logo?.[0]?.filename || null;

              const servicesProvidedFor = body.servicesProvidedFor
                ? JSON.parse(body.servicesProvidedFor)
                : [];

                const languages = body.languages
                ? JSON.parse(body.languages)
                : [];

                const isPremium =
                body.isPremium === "true" || body.isPremium === true;

            const createpartner = await adminDbController.app.createpartner({
                ...body,
                logo,
                servicesProvidedFor,
                languages,
                isPremium
            }, images, docs);
            if (!createpartner) {
                throw Error.NotFound("Creation Failed");
            }

            return "Partner Created Successfully";
        } catch (error) {
            console.log("🚀 ~ createpartner:async ~ error:", error);
             if (error.message === "Partner already exists with matching data") {
                throw error;
                }
                else{
                    throw Error.SomethingWentWrong("Failed to create partner");
                }
        }
    },
      editPartner: async ({ body, user, files }) => {
        console.log("🚀 ~ files:", files)
        console.log("🚀 ~ body:", body)
        try {
            const getpartner = await adminDbController.app.getstorebyid(body.id);
            if (!getpartner) {
                throw Error.NotFound("No Partner Found");
            }

            const images = files?.images || [];
            const docs = files?.documents || [];
            const logo = files?.logo?.[0] || null;

              const servicesProvidedFor = body.servicesProvidedFor
                ? JSON.parse(body.servicesProvidedFor)
                : [];

                const languages = body.languages
                ? JSON.parse(body.languages)
                : [];

                const isPremium =
                body.isPremium === "true" || body.isPremium === true;

            const updatepartner = await adminDbController.app.editpartner({
                ...body,
                logo,
                servicesProvidedFor,
                languages,
                isPremium
            }, images, docs);
            
            if (!updatepartner) {
                throw Error.NotFound("No Partner Found");
            }

            return "Partner Updated Successfully";
        } catch (error) {
            console.log("🚀 ~ updatepartner:async ~ error:", error);
            throw Error.SomethingWentWrong("Failed to update partner");
        }
    },
    createService: async ({ body }) => {
        console.log('Create Service Middleware: ', body);

        try {

            const createService =
                await adminDbController.app.createService(body);

            if (!createService) {
                throw Error.NotFound("Creation Failed");
            }

            return "Service Created Successfully";

        } catch (error) {

            console.log(
            "🚀 ~ createservice:async ~ error:",
            error
            );

            // Preserve existing application errors
            if (
                error?.name === "ApplicationError" ||
                error?.type ||
                error?.code
            ) {
                throw error;
            }

            // Unknown errors only
            throw Error.SomethingWentWrong(
                error?.message || "Failed to create service"
            );
        }
    },
    editService: async({body}) => {
        console.log('Edit Service Middleware: ', body);
        try {
            const createService = await adminDbController.app.editService(body);
            if (!createService) {
                throw Error.NotFound("Edit Failed");
            }

            return "Service Edited Successfully";
        } catch (error) {
            console.log("🚀 ~ editservice:async ~ error:", error);
            throw Error.SomethingWentWrong("Failed to edit service");
        }
    },
    getservicecategorylist: async ({ body }) => {
        try {
            const categoryList = await adminDbController.app.getServiceCategoryList(body);
            if (!categoryList) {
                throw Error.NotFound("No Categories Found");
            }
            return categoryList;
        }
        catch (error) {
            console.log("🚀 ~ getservicecategorylist:async ~ error:", error);
            throw Error.SomethingWentWrong("Failed to get service category list");
        }
    },
  
    deleteservice: async ({ body, user }) => {
        try {
            // Validate that service_id is provided
            if (!body.service_id) {
                throw Error.ValidationFailed("Service ID is required");
            }
    
            const deletedService = await adminDbController.app.deleteservice(body);
    
            return { 
                success: true, 
                deletedService: deletedService,
                message: "Service deleted successfully" 
            };
    
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to delete service");
        }
    },

    getservices: async ({ body, user }) => {
        try {
            const services = await adminDbController.app.getservices(body);

            const combos = await adminDbController.app.getallcombos(body);


            return { services: services, combos: combos };

        } catch (error) {
            throw Error.SomethingWentWrong("Failed to fetch services");
        }
    },
    addsubscription: async ({ body, user }) => {
        try {
            const userId = user.id;
            const subscription = await adminDbController.app.addsubscription(body, userId);
            if (subscription != null && subscription != undefined && Object.keys(subscription).length != 0) {
                return "Subscription Added Successfully";
            } else {
                throw Error.NotFound("No Subscription Found");
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to add subscription");
        }
    },
    updateuser: async ({ body, user }) => {
        try {

            const updatedUser = await adminDbController.app.upadteuser(body);

            return "User updated successfully";

        } catch (error) {
            throw Error.SomethingWentWrong("Failed to update user");
        }
    },
    getalluserbooking: async ({ body, user }) => {
        try {
            let data = []

            const getuserdeatils = await adminDbController.app.getuserdetails(body.id);

            const appoinments = await userDbController.app.getallapoinments(body, body.id);

            appoinments.forEach((item) => {
                item.images = JSON.parse(item.images);
            })

            const upcomming = []
            const past = []

           const today = new Date();
today.setHours(0, 0, 0, 0);

for (const item of appoinments) {

  const bookingDate = new Date(item.booking_date);
  bookingDate.setHours(0, 0, 0, 0);

  // 🟢 UPCOMING
  if (
    (item.appointment_status === 'confirmed' || item.appointment_status === 'booked') &&
    bookingDate >= today
  ) {
    item.status = 'upcomming';
  }

  // 🔵 PAST - COMPLETED
  else if (item.appointment_status === 'completed') {
    item.status = 'past';
  }

  // 🔴 PAST - NOT COMPLETED
  else if (bookingDate < today) {
    item.status = 'not_completed';
  }

  // 🟡 FALLBACK
  else {
    item.status = 'past';
  }
}




await Promise.all(
  appoinments.map(async (item) => {

    const services = await userDbController.app.getservicebyappoinment(item.id);

    const new_data = {
      common_data: item,
      items: services
    };

    if (item.status === 'upcomming') {
      upcomming.push(new_data);
    } 
    else if (item.status === 'not_completed') {
      past.push(new_data);
    } 
    else {
      past.push(new_data);
    }
  })
);


            const totalspent = await adminDbController.app.gettotalspent(body.id);



            return { upcoming: upcomming, past: past, totalspent: totalspent, userdetails: getuserdeatils };

        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    getallpartner: async ({ body }) => {
        console.log("🚀 ~ body:", body)
        try {
            const partners = await adminDbController.app.getallpartner(body);
            console.log("🚀 ~ partners:", partners)
            if (partners != null && partners != undefined) {

               partners.forEach((item) => {
                    if (item.images) {
                        try {
                        item.images = JSON.parse(item.images);
                        } catch {
                        item.images = [];
                        }
                    } else {
                        item.images = [];
                    }
                });
                return partners;
            } else {
                throw Error.NotFound("No Partners Found");
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch partners");
        }
    },
    getverifyPartnerlist: async ({ body }) => {
        try {
            const partners = await adminDbController.app.getverifypartnerlist(body);
            if (partners != null && partners != undefined) {
                return partners;
            }
            else {
                throw Error.NotFound("No Partners Found");
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch partners");
        }
    },
    getparnerdetails: async ({ body, user }) => {
        try {
            console.log(body);
            const getstordetails = await partnerDbController.app.getstoredeatilsadmin(body.id);
            console.log('get sore details: ', getstordetails)
            if (!getstordetails) {
                throw Error.SomethingWentWrong("Store details not found");
            }

            getstordetails.images = getstordetails.images ? JSON.parse(getstordetails.images) : [];

            getstordetails.docs = getstordetails.docs ? JSON.parse(getstordetails.docs) : [];

            getstordetails.is_premium = Boolean(getstordetails.is_premium);

            const getprofessionals = await adminDbController.app.getproffesionalbyid(body.id);

            const getlanguages = await adminDbController.app.getlanguages(body.id);

            const getservicesprovidedfor = await adminDbController.app.getserviceprovidedfor(body.id);


            const get_totalsales = await partnerDbController.app.getotalsales(body, user.id);


            let data = []

            const appoinments = await partnerDbController.app.getallapoinments(body, user.id);


            const upcomming = []
            const past = []

            for (const item of appoinments) {
                if (new Date(item.booking_date).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0)) {
                    item.status = "upcomming";

                } else {
                    item.status = "past";

                }
            }


            for (const item of appoinments) {
                const getservices = await partnerDbController.app.getservicebyappoinment(item.id);
                const new_data = {
                    common_data: item,
                    items: getservices
                }
                if (new_data.common_data.status === "upcomming") {
                    upcomming.push(new_data)
                } else {
                    past.push(new_data)
                }
            }

            const get_logs = await adminDbController.app.getlogs(body.id);



            const appointments = { upcomming: upcomming, past: past }

            const timeslots = await partnerDbController.app.getPartnerSlots(body.id);


            return { get_totalsales: get_totalsales, store_details: getstordetails, professionals: getprofessionals, appointments: appointments, timeslots: timeslots, logs: get_logs[0], languages: getlanguages, servicesProvidedFor: getservicesprovidedfor };


        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong();
        }
    },
    getrefundrequests: async ({ body, user }) => {
        try {
            const refundrequests = await adminDbController.app.getrefundrequests(body);
            if (refundrequests != null && refundrequests != undefined && Object.keys(refundrequests).length != 0) {
                return refundrequests;
            } else {
                return [];
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to fetch refund requests");
        }
    },
    updatesubscription: async ({ body, user }) => {
        try {
            const subscription = await adminDbController.app.updatesubscription(body);
            if (subscription != null && subscription != undefined && Object.keys(subscription).length != 0) {
                return "Subscription Updated Successfully";
            } else {
                throw Error.NotFound("No Subscription Found");
            }
        } catch (error) {
            throw Error.SomethingWentWrong("Failed to update subscription");
        }
    },
    addpayouts: async ({ body, user }) => {
        try {
            const get_wallet = await adminDbController.app.getwallet(body.store_id);

            let remainig_balance = get_wallet.wallet_remaining - body.amount;

            const update_wallet = await adminDbController.app.updatewallet(body, remainig_balance);
            if (remainig_balance < 0) {
                throw Error.NotFound("Amount exceeds wallet balance");
            }

            const adddata = await adminDbController.app.addpayouts(body, remainig_balance, get_wallet.wallet_remaining);
            if (!adddata) {
                throw Error.NotFound("Failed to add payouts");
            }




            return "Payouts added successfully";

        } catch (error) {
            throw Error.SomethingWentWrong("Failed to add payouts");
        }

    },
    addbanner: async ({ body, user, files }) => {
        try {
            if (!files || files.length === 0) {
                throw Error.NotFound("No files found");
            }
            const results = [];
            for (let file of files) {
                const filePath = file.filename;

                let count = 1;
                const getactivesubscription = await adminDbController.app.getactivesubscription(body, user);

                if (body.issub === true && getactivesubscription) {
                    const maxCount = getactivesubscription.quantity;
                    const start_date = getactivesubscription.start_date;
                    const end_date = getactivesubscription.end_date;

                    const quantity = await adminDbController.app.checkbannerquantity(body, start_date, end_date);

                    if (quantity >= maxCount) {
                        return "You Have Already Added Maximum Number Of Banners";
                    }
                }

                 // ✅ Upload to S3
                const uploaded = await uploadToS3(file, "banner");

                if (!uploaded || !uploaded.url || !uploaded.key) {
                    throw new Error("Upload failed");
                }

                const addbanner = await adminDbController.app.addbanner(body, "/" + uploaded.key);
                results.push(addbanner);
            }

            return "Banners Added Successfully";
        } catch (error) {
            console.log("🚀 ~ addbanner:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to add banner");
        }
    },
    downloadBookingPDF: async (req) => {
    try {
        const bookingId = req.params.id;
        const pdfBuffer = await adminDbController.app.generateBookingPDF(bookingId);
        return pdfBuffer;
    } catch (error) {
        throw error;
    }
    },
    updaterefundBookingStatus: async ({ body, user }) => {
        try {
            const updateStatus = await adminDbController.app.updateRefundBookingStatus(body);
            if (updateStatus) {
                return "Booking refund status updated successfully";
            } else {
                throw Error.NotFound("No Booking Found");
            }       
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("Failed to update booking refund status");
        }
    },
    createDefaultTimeSlot: async ({ body, user }) => {
        try {
            const createTimeSlot = await adminDbController.app.createDefaultTimeSlot(body.storeId);
            if (createTimeSlot) {
                return "Default Time Slot Created Successfully";
            } else {
                throw Error.NotFound("Failed to create default time slot");
            }
        } catch (error) {
            console.log("🚀 ~ createDefaultTimeSlot:async ~ error:", error);
            throw Error.SomethingWentWrong("Failed to create default time slot");
        }
    },
    blockAndUnblockSlot: async ({ body, user }) => {
        try {
            const result = await adminDbController.app.blockAndUnblockSlot(body.storeId, body.slotId, body.status, body.date);
            if (result) {
                return "Time Slot Updated Successfully";
            } else {
                throw Error.NotFound("Failed to update time slot");
            }
        } catch (error) {
            console.log("🚀 ~ blockAndUnblockSlot:async ~ error:", error);
            throw Error.SomethingWentWrong("Failed to update time slot");
        }
    },
    getBlockedSlots: async ({ body, user }) => {
        try {
            const blockedSlots = await adminDbController.app.getBlockedSlots(body.storeId, body.date);
            if (blockedSlots) {
                return blockedSlots;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ getBlockedSlots:async ~ error:", error)
                throw Error.SomethingWentWrong("Failed to fetch blocked slots")
        }
    },
    getlanguage: async ({ body, user }) => {
        try {
            const languages = await adminDbController.app.getlanguagelist();
            if (languages) {
                return languages;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ getlanguage:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch languages")
        }
    },
    getserviceprovidedfor: async ({ body, user }) => {
        try {
            const options = await adminDbController.app.getserviceprovidedforlist();
            if (options) {
                return options;
            } else {                
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ getserviceprovidedfor:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch service options")
        }
    },
    getallpartnersubscription: async ({ body, user }) => {
        try {
            const subscriptions = await adminDbController.app.getallpartnersubscription(body);
            if (subscriptions) {
                return subscriptions;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ getallpartnersubscription:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch partner subscriptions")
        }
    },
    getpartnersubscriptionbyid: async ({ body, user }) => {
        try {
            const subscription = await adminDbController.app.getpartnersubscriptionbyid(body);
            if (subscription) {
                return subscription;
            }
                else {
                throw Error.NotFound("No Subscription Found");
            }
        } catch (error) {
            console.log("🚀 ~ getpartnersubscriptionbyid:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch partner subscription by ID")
        }
    },
    updatepartnersubscription: async ({ body, user }) => {
        try {
            const updateStatus = await adminDbController.app.updatepartnersubscription(body);
            if (updateStatus) {
                return "Partner Subscription Updated Successfully";
            }
            else {
                throw Error.NotFound("No Subscription Found");
            }
        } catch (error) {
            console.log("🚀 ~ updatepartnersubscription:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to update partner subscription")
        }
    },
    deletepartnersubscription: async ({ body, user }) => {
        try {
            const deleteStatus = await adminDbController.app.deletepartnersubscription(body);
            if (deleteStatus) {
                return "Partner Subscription Deleted Successfully";
            }
            else {
                throw Error.NotFound("No Subscription Found");
            }
        } catch (error) {
            console.log("🚀 ~ deletepartnersubscription:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to delete partner subscription")
        }
    },
    getallpartnersubscriptionfeatures: async ({ body, user }) => {
        try {
            const subscriptions = await adminDbController.app.getallpartnersubscriptionfeatures(body);
            if (subscriptions) {
                return subscriptions;
            } else {
                return [];
            }
        } catch (error) {
            console.log("🚀 ~ getallpartnersubscriptionfeatures:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to fetch partner subscriptions")
        }
    },
    addpartnersubscription: async ({ body, user }) => {
        try {
            const addStatus = await adminDbController.app.addpartnersubscription(body);
            if (addStatus) {
                return "Partner Subscription Added Successfully";
            }
            else {
                throw Error.NotFound("Failed to add subscription");
            }
        } catch (error) {
            console.log("🚀 ~ addpartnersubscription:async ~ error:", error)
            throw Error.SomethingWentWrong("Failed to add partner subscription")
        }
    },
    updateservicecategoryimage: async ({ body, user, file }) => {
        try {
            if (!body.category_id) {
                throw Error.BadRequest("category_id is required");
            }
            if (!file || !file.originalname) {
                throw Error.NotFound("No file found");
            }
            
            // Upload to S3 (GCS actually)
            const uploaded = await uploadToS3(file, "uploads/common/service-category/" + body.category_id);
            
            if (!uploaded || !uploaded.url || !uploaded.key) {
                throw new Error("Upload failed");
            }
            
            const updated = await adminDbController.app.updateservicecategoryimage(body.category_id, uploaded.key);
            
            if (updated) {
                return {
                    message: "Category Image Updated Successfully",
                    image: "https://storage.googleapis.com/gloup-images/" + uploaded.key
                };
            } else {
                throw Error.NotFound("No Category Found");
            }
        } catch (error) {
            console.log("🚀 ~ updateservicecategoryimage:async ~ error:", error);
            if (error.status) throw error;
            throw Error.SomethingWentWrong("Failed to update category image");
        }
    }
}
