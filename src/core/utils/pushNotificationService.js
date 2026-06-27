import { createHash } from "crypto";
import redisClient from "../database/redisClient.js";
import {
    dedupeTokenObjects,
    deliverMulticastPush,
    latestTokenOnlyPerRecipient,
} from "./fcmTokenService.js";

const DEFAULT_DEDUPE_TTL_SECONDS = 86400;
const RAPID_DEDUPE_TTL_SECONDS = 60;

const EMPTY_RESULT = {
    skipped: false,
    attempted: 0,
    successCount: 0,
    failureCount: 0,
    prunedInvalidTokens: 0,
    failureReasons: [],
};

export function hashNotificationContent(title, body) {
    return createHash("sha256")
        .update(`${title}|${body}`)
        .digest("hex")
        .slice(0, 16);
}

function sanitizeCollapseKey(key) {
    if (!key) return undefined;
    return String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export async function acquirePushDedupeLock(
    dedupeKey,
    ttlSeconds = DEFAULT_DEDUPE_TTL_SECONDS
) {
    if (!dedupeKey) {
        return true;
    }

    try {
        const result = await redisClient.set(`push:dedupe:${dedupeKey}`, "1", {
            NX: true,
            EX: ttlSeconds,
        });
        return result === "OK";
    } catch (error) {
        console.warn(
            "[Push] Redis dedupe unavailable, proceeding with send:",
            error.message
        );
        return true;
    }
}

export async function releasePushDedupeLock(dedupeKey) {
    if (!dedupeKey) {
        return;
    }

    try {
        await redisClient.del(`push:dedupe:${dedupeKey}`);
    } catch (error) {
        console.warn("[Push] Failed to release dedupe lock:", error.message);
    }
}

/**
 * Central push entry point: token dedupe, Redis idempotency, FCM collapse keys.
 */
export async function sendPushNotification({
    dedupeKey,
    rapidDedupeKey,
    recipients,
    title,
    body,
    screen,
    collapseKey,
    persistLogs = true,
}) {
    if (!recipients?.length) {
        return { ...EMPTY_RESULT, skipped: false };
    }

    const tokenObjects = latestTokenOnlyPerRecipient(
        dedupeTokenObjects(recipients.filter((recipient) => recipient?.token))
    );

    if (!tokenObjects.length) {
        return { ...EMPTY_RESULT, skipped: false };
    }

    if (rapidDedupeKey) {
        const acquired = await acquirePushDedupeLock(
            rapidDedupeKey,
            RAPID_DEDUPE_TTL_SECONDS
        );
        if (!acquired) {
            console.log(
                `[Push] Skipped rapid duplicate: ${rapidDedupeKey}`
            );
            return {
                ...EMPTY_RESULT,
                skipped: true,
                skipReason: "rapid_dedupe",
            };
        }
    }

    if (dedupeKey) {
        const acquired = await acquirePushDedupeLock(dedupeKey);
        if (!acquired) {
            console.log(`[Push] Skipped duplicate event: ${dedupeKey}`);
            return {
                ...EMPTY_RESULT,
                skipped: true,
                skipReason: "already_sent",
            };
        }
    }

    const effectiveCollapseKey = sanitizeCollapseKey(
        collapseKey || dedupeKey
    );

    try {
        const result = await deliverMulticastPush({
            tokenObjects,
            title,
            description: body,
            persistLogs,
            collapseKey: effectiveCollapseKey,
            screen,
        });

        if (
            dedupeKey &&
            result.attempted > 0 &&
            (result.successCount || 0) === 0
        ) {
            await releasePushDedupeLock(dedupeKey);
        }

        return {
            skipped: false,
            ...result,
        };
    } catch (error) {
        if (dedupeKey) {
            await releasePushDedupeLock(dedupeKey);
        }
        throw error;
    }
}
