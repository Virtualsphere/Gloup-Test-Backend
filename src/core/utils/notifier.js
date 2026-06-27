import admin from "firebase-admin";
import { createRequire } from "module";
import { getFcmAccessTokenViaFetch } from "./fcmOAuth.js";
import { sendEachForMulticastViaHttpV1 } from "./fcmHttpV1.js";

const require = createRequire(import.meta.url);

const firebaseAdmin = admin.initializeApp({
    credential: admin.credential.cert(require("../../../config/firebase.json")),
});

const FCM_AUTH_ERROR_CODES = new Set([
    "app/invalid-credential",
    "messaging/invalid-credential",
    "messaging/authentication-error",
]);

/** "admin-sdk" | "fetch" — chosen at startup based on which OAuth path works. */
let fcmTransport = "admin-sdk";

function logMulticastFailures(tokens, responses) {
    const failuresByCode = new Map();

    responses.forEach((resp, idx) => {
        if (resp.success) {
            return;
        }

        const code = resp.error?.code || "unknown";
        if (!failuresByCode.has(code)) {
            failuresByCode.set(code, []);
        }
        failuresByCode.get(code).push(tokens[idx]);
    });

    for (const [code, failedTokens] of failuresByCode) {
        if (FCM_AUTH_ERROR_CODES.has(code)) {
            console.error(
                `[FCM] Auth failed (${code}) for ${failedTokens.length} token(s). ` +
                    "Check firebase.json and outbound HTTPS to Google OAuth from this runtime."
            );
            continue;
        }

        console.log(`[FCM] ${code}: ${failedTokens.length} token(s)`);
        failedTokens.slice(0, 3).forEach((token) => {
            console.log("Failed token:", token, "Reason:", code);
        });
        if (failedTokens.length > 3) {
            console.log(
                `[FCM] ... and ${failedTokens.length - 3} more with ${code}`
            );
        }
    }
}

async function verifyFirebaseCredential() {
    try {
        await firebaseAdmin.options.credential.getAccessToken();
        fcmTransport = "admin-sdk";
        console.log("[FCM] Firebase credentials verified (admin SDK)");
        return;
    } catch (adminError) {
        console.warn(
            "[FCM] Admin SDK OAuth failed:",
            adminError.code || adminError.message
        );
    }

    try {
        await getFcmAccessTokenViaFetch();
        fcmTransport = "fetch";
        console.log(
            "[FCM] Firebase credentials verified (fetch fallback — common fix for Docker on Windows)"
        );
    } catch (fetchError) {
        fcmTransport = "admin-sdk";
        console.error(
            "[FCM] Firebase credential check failed:",
            fetchError.message
        );
        console.error(
            "[FCM] Push notifications will fail until Google OAuth is reachable from this runtime."
        );
    }
}

async function sendMulticast(message) {
    if (fcmTransport === "fetch") {
        return sendEachForMulticastViaHttpV1(message);
    }

    try {
        return await firebaseAdmin.messaging().sendEachForMulticast(message);
    } catch (error) {
        if (
            FCM_AUTH_ERROR_CODES.has(error.code) ||
            String(error.message || "").includes("credential")
        ) {
            console.warn(
                "[FCM] Admin SDK send failed with auth error; retrying via fetch transport"
            );
            fcmTransport = "fetch";
            return sendEachForMulticastViaHttpV1(message);
        }
        throw error;
    }
}

let defaultAuth = await firebaseAdmin.auth();
await verifyFirebaseCredential();

export const FirebaseService = {
    notify: async (tokens, notification, fcmoptions) => {
        try {
            const response = await sendMulticast({
                tokens: tokens,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                data: notification.data,
                android: notification.android,
                apns: notification.apns,
                fcmOptions: fcmoptions,
            });
            return response;
        } catch (error) {
            return null;
        }
    },

    notifyUsers: async (body) => {
        let data = {
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            sound: "default",
            status: "done",
            screen: "",
        };
        let apns = { payload: { aps: { sound: "default" } } };
        let android = {
            priority: "high",
            notification: { sound: "default" },
        };
        let priority = { priority: "high" };
        body = {
            ...body,
            data: data,
            apns: apns,
            android: android,
            priority: priority,
        };
        try {
            await FirebaseService.notify(
                body.token,
                {
                    title: body.title,
                    image: body.image,
                    body: body.description,
                    data: body.data,
                    apns: body.apns,
                    android: body.android,
                    priority: body.priority,
                },
                {
                    fcmOptions: {
                        link: body.link,
                    },
                }
            )
                .then((response) => {})
                .catch((err) => {});
        } catch (error) {
            return null;
        }
    },

    notifyOrderStatus1: async (body, value) => {
        if (!body?.token || body.token.length === 0) {
            return null;
        }
        let data = {
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            sound: "default",
            status: "done",
            screen: `${value}`,
        };
        let apns = {
            payload: { aps: { sound: "default" } },
        };
        let android = {
            priority: "high",
            notification: {
                sound: "default",
            },
        };
        let priority = { priority: "high" };
        body = {
            ...body,
            data: data,
            apns: apns,
            android: android,
            priority: priority,
        };
        try {
            await FirebaseService.notify(
                body.token,
                {
                    title: body.eventTitle || "",
                    body: body.eventDescription || "",
                    data: body.data,
                    apns: body.apns,
                    android: body.android,
                    priority: body.priority,
                },
                {}
            )
                .then((response) => {
                    if (response.failureCount > 0) {
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                            }
                        });
                    }
                })
                .catch((err) => {});
        } catch (error) {
            return null;
        }
    },
    notifyOrderStatus: async (body, value) => {
        try {
            if (!body?.token || body.token.length === 0) {
                return null;
            }

            const tokens = [...new Set(body.token)].filter(Boolean);
            const screenValue = body.screen ?? (value ? String(value) : "");
            const collapseKey = body.collapseKey
                ? String(body.collapseKey).slice(0, 64)
                : undefined;

            const androidNotification = {
                sound: "default",
            };
            if (collapseKey) {
                androidNotification.tag = collapseKey;
            }

            const android = {
                priority: "high",
                notification: androidNotification,
            };
            if (collapseKey) {
                android.collapseKey = collapseKey;
            }

            const apns = {
                payload: {
                    aps: {
                        contentAvailable: true,
                        sound: "default",
                    },
                },
            };
            if (collapseKey) {
                apns.headers = { "apns-collapse-id": collapseKey };
            }

            const message = {
                tokens: tokens,

                notification: {
                    title: body.eventTitle || "",
                    body: body.eventDescription || "",
                },

                data: {
                    click_action: "FLUTTER_NOTIFICATION_CLICK",
                    sound: "default",
                    status: "done",
                    screen: screenValue,
                },

                android,
                apns,
            };

            const response = await sendMulticast(message);

            console.log("Success:", response.successCount);
            console.log("Failure:", response.failureCount);

            if (response.failureCount > 0) {
                logMulticastFailures(tokens, response.responses);
            }

            return response;
        } catch (error) {
            console.error("FCM Error:", error);
            return null;
        }
    },
    getAuth: async (data) => {
        try {
            return await defaultAuth.verifyIdToken(data.id_token);
        } catch (error) {
            return "Invalid Token";
        }
    },
};
