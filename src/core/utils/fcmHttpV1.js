import {
    getFcmAccessTokenViaFetch,
    getFirebaseProjectId,
} from "./fcmOAuth.js";

function mapHttpErrorToFcmCode(status, errorBody) {
    const statusName = errorBody?.error?.status || "";
    const message = errorBody?.error?.message || "";

    if (status === 401 || status === 403) {
        return "app/invalid-credential";
    }
    if (
        status === 404 ||
        statusName === "NOT_FOUND" ||
        message.includes("not found")
    ) {
        return "messaging/registration-token-not-registered";
    }
    if (status === 400) {
        return "messaging/invalid-argument";
    }
    return statusName || `http/${status}`;
}

/**
 * FCM HTTP v1 send using fetch (same transport as OAuth fallback).
 * Returns a sendEachForMulticast-compatible result shape.
 */
export async function sendEachForMulticastViaHttpV1(message) {
    const tokens = message.tokens || [];
    const accessToken = await getFcmAccessTokenViaFetch();
    const projectId = getFirebaseProjectId();
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const responses = await Promise.all(
        tokens.map(async (token) => {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        message: {
                            token,
                            notification: message.notification,
                            data: message.data,
                            android: message.android,
                            apns: message.apns,
                        },
                    }),
                });

                if (response.ok) {
                    return { success: true };
                }

                let errorBody = null;
                try {
                    errorBody = await response.json();
                } catch {
                    errorBody = null;
                }

                return {
                    success: false,
                    error: {
                        code: mapHttpErrorToFcmCode(response.status, errorBody),
                        message:
                            errorBody?.error?.message ||
                            `HTTP ${response.status}`,
                    },
                };
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: error.code || "messaging/internal-error",
                        message: error.message,
                    },
                };
            }
        })
    );

    const successCount = responses.filter((r) => r.success).length;

    return {
        successCount,
        failureCount: tokens.length - successCount,
        responses,
    };
}
