import { adminDbController } from "../database/Controller/AdminDbController.js";
import { userDbController } from "../database/Controller/userDbController.js";
import { partnerDbController } from "../database/Controller/partnerDbController.js";
import { FirebaseService } from "./notifier.js";

/** FCM error codes that mean the token should be removed from storage */
export const FCM_PRUNABLE_ERRORS = [
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
];

/** One active FCM token per user/store — avoids duplicate pushes to the same phone */
export const MAX_FCM_TOKENS_PER_RECIPIENT = 1;

export function isPrunableFcmError(errorCode) {
    if (!errorCode) return false;
    const code = String(errorCode);
    return FCM_PRUNABLE_ERRORS.some(
        (e) => code === e || code.includes(e)
    );
}

/**
 * Parse device_id / deviceId field (JSON string or array) into token strings.
 */
export function extractFcmTokens(deviceField) {
    if (!deviceField) return [];
    try {
        const tokens = Array.isArray(deviceField)
            ? deviceField
            : JSON.parse(deviceField);
        return tokens.filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Register a new FCM token: dedupe, move latest to end, cap at MAX_FCM_TOKENS_PER_RECIPIENT.
 */
export function mergeFcmTokenRegistration(existingField, newToken) {
    const trimmed = String(newToken || "").trim();
    if (!trimmed) return extractFcmTokens(existingField);
    return [trimmed];
}

/** Most recently registered token (last in stored array). */
export function getLatestFcmToken(deviceField) {
    const tokens = extractFcmTokens(deviceField);
    return tokens.length ? tokens[tokens.length - 1] : null;
}

/** Keep only the latest token from a stored device_id / deviceId field. */
export function normalizeStoredTokens(deviceField) {
    const latest = getLatestFcmToken(deviceField);
    return latest ? [latest] : [];
}

export async function persistNormalizedUserToken(userId, deviceField) {
    const before = extractFcmTokens(deviceField);
    const normalized = normalizeStoredTokens(deviceField);
    if (before.length > 1 && normalized.length === 1) {
        await userDbController.auth.addDeviceId(normalized, userId);
    }
    return normalized[0] || null;
}

export async function persistNormalizedPartnerToken(partnerId, deviceField) {
    const before = extractFcmTokens(deviceField);
    const normalized = normalizeStoredTokens(deviceField);
    if (before.length > 1 && normalized.length === 1) {
        await partnerDbController.auth.addDeviceId(normalized, partnerId);
    }
    return normalized[0] || null;
}

/** Dedupe by token string; keep last metadata object per token. */
export function dedupeTokenObjects(tokenObjects) {
    const map = new Map();
    for (const obj of tokenObjects) {
        if (obj?.token) map.set(obj.token, obj);
    }
    return Array.from(map.values());
}

/**
 * One push per recipient: keep only the latest token per user_id / partner_id.
 */
export function latestTokenOnlyPerRecipient(tokenObjects) {
    const byRecipient = new Map();
    for (const obj of tokenObjects) {
        if (!obj?.token) continue;
        const key =
            obj.user_id != null
                ? `u:${obj.user_id}`
                : obj.partner_id != null
                  ? `p:${obj.partner_id}`
                  : `t:${obj.token}`;
        byRecipient.set(key, obj);
    }
    return Array.from(byRecipient.values());
}

/**
 * Remove invalid tokens from User.device_id / Store.deviceId after FCM failures.
 */
export async function pruneInvalidTokensFromStorage(failedEntries) {
    const toPrune = failedEntries.filter((e) => isPrunableFcmError(e.error));
    if (!toPrune.length) return 0;

    const userRemovals = new Map();
    const partnerRemovals = new Map();

    for (const entry of toPrune) {
        if (entry.user_id) {
            if (!userRemovals.has(entry.user_id)) {
                userRemovals.set(entry.user_id, new Set());
            }
            userRemovals.get(entry.user_id).add(entry.token);
        }
        if (entry.partner_id) {
            if (!partnerRemovals.has(entry.partner_id)) {
                partnerRemovals.set(entry.partner_id, new Set());
            }
            partnerRemovals.get(entry.partner_id).add(entry.token);
        }
    }

    let pruned = 0;

    for (const [userId, removeSet] of userRemovals) {
        const user = await adminDbController.app.getUserByIdForNotification(
            userId
        );
        if (!user) continue;
        const before = extractFcmTokens(user.device_id);
        const after = before.filter((t) => !removeSet.has(t));
        if (after.length !== before.length) {
            await userDbController.auth.addDeviceId(after, userId);
            pruned += before.length - after.length;
        }
    }

    for (const [partnerId, removeSet] of partnerRemovals) {
        const store = await adminDbController.app.getStoreByIdForNotification(
            partnerId
        );
        if (!store) continue;
        const before = extractFcmTokens(store.deviceId);
        const after = before.filter((t) => !removeSet.has(t));
        if (after.length !== before.length) {
            await partnerDbController.auth.addDeviceId(after, partnerId);
            pruned += before.length - after.length;
        }
    }

    return pruned;
}

/**
 * Send FCM multicast in chunks, log success/failure, prune dead tokens from DB.
 */
export async function deliverMulticastPush({
    tokenObjects,
    title,
    description,
    persistLogs = true,
    collapseKey,
    screen,
}) {
    if (!tokenObjects?.length) {
        return {
            attempted: 0,
            successCount: 0,
            failureCount: 0,
            prunedInvalidTokens: 0,
            failureReasons: [],
        };
    }

    tokenObjects = latestTokenOnlyPerRecipient(
        dedupeTokenObjects(tokenObjects)
    );

    if (!tokenObjects.length) {
        return {
            attempted: 0,
            successCount: 0,
            failureCount: 0,
            prunedInvalidTokens: 0,
            failureReasons: [],
        };
    }

    let totalSuccess = 0;
    let totalFailure = 0;
    const failureReasons = new Set();
    const allFailedForPrune = [];
    const chunkSize = 500;

    for (let i = 0; i < tokenObjects.length; i += chunkSize) {
        const chunk = tokenObjects.slice(i, i + chunkSize);
        const tokenList = chunk.map((obj) => obj.token);

        const response = await FirebaseService.notifyOrderStatus(
            {
                token: tokenList,
                eventTitle: title,
                eventDescription: description,
                collapseKey,
                screen,
            },
            screen
        );

        if (!response) {
            totalFailure += chunk.length;
            continue;
        }

        totalSuccess += response.successCount || 0;
        totalFailure += response.failureCount || 0;

        const failedTokens = [];
        const successTokens = [];
        const istDate = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        );

        response.responses?.forEach((resp, index) => {
            const currentObj = chunk[index];
            if (!resp.success) {
                const errorCode = resp.error?.code || resp.error?.message;
                if (errorCode) failureReasons.add(errorCode);
                failedTokens.push({
                    token: currentObj.token,
                    user_id: currentObj.user_id,
                    partner_id: currentObj.partner_id,
                    notification_id: currentObj.notification_id,
                    error: errorCode,
                    date: istDate,
                });
                allFailedForPrune.push({
                    token: currentObj.token,
                    user_id: currentObj.user_id,
                    partner_id: currentObj.partner_id,
                    error: errorCode,
                });
            } else {
                successTokens.push({
                    token: currentObj.token,
                    user_id: currentObj.user_id,
                    partner_id: currentObj.partner_id,
                    notification_id: currentObj.notification_id,
                    title,
                    description,
                    date: istDate,
                });
            }
        });

        if (persistLogs && failedTokens.length > 0) {
            await adminDbController.app.saveFailedNotificationTokens(
                failedTokens
            );
        }
        if (persistLogs && successTokens.length > 0) {
            await adminDbController.app.saveSuccessfulNotificationTokens(
                successTokens
            );
        }
    }

    const prunedInvalidTokens = allFailedForPrune.length
        ? await pruneInvalidTokensFromStorage(allFailedForPrune)
        : 0;

    return {
        attempted: tokenObjects.length,
        successCount: totalSuccess,
        failureCount: totalFailure,
        prunedInvalidTokens,
        failureReasons: Array.from(failureReasons).filter(Boolean),
    };
}
