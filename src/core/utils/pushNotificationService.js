import { createHash } from "crypto";
import redisClient from "../database/redisClient.js";
import {
    dedupeTokenObjects,
    deliverMulticastPush,
    latestTokenOnlyPerRecipient,
    uniqueTokenOnly,
} from "./fcmTokenService.js";

const DEFAULT_DEDUPE_TTL_SECONDS = 86400;
const RAPID_DEDUPE_TTL_SECONDS = 60;
const TOKEN_DEDUPE_TTL_SECONDS = 300;
const IN_MEMORY_DEDUPE_TTL_MS = 120_000;

const EMPTY_RESULT = {
    skipped: false,
    attempted: 0,
    successCount: 0,
    failureCount: 0,
    prunedInvalidTokens: 0,
    failureReasons: [],
};

/** Process-local fallback when Redis is down (same instance only). */
const inMemoryDedupe = new Map();

function pruneInMemoryDedupe() {
    const now = Date.now();
    for (const [key, expiresAt] of inMemoryDedupe) {
        if (expiresAt <= now) {
            inMemoryDedupe.delete(key);
        }
    }
}

function acquireInMemoryDedupe(key, ttlMs = IN_MEMORY_DEDUPE_TTL_MS) {
    pruneInMemoryDedupe();
    const now = Date.now();
    const existing = inMemoryDedupe.get(key);
    if (existing && existing > now) {
        return false;
    }
    inMemoryDedupe.set(key, now + ttlMs);
    return true;
}

export function hashNotificationContent(title, body) {
    return createHash("sha256")
        .update(`${title}|${body}`)
        .digest("hex")
        .slice(0, 16);
}

function hashToken(token) {
    return createHash("sha256")
        .update(String(token))
        .digest("hex")
        .slice(0, 24);
}

function sanitizeCollapseKey(key) {
    if (!key) return undefined;
    return String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function buildTokenContentKey(token, title, body, collapseKey) {
    const contentHash = hashNotificationContent(
        title,
        body + (collapseKey || "")
    );
    return `push:token:${hashToken(token)}:${contentHash}`;
}

export async function acquirePushDedupeLock(
    dedupeKey,
    ttlSeconds = DEFAULT_DEDUPE_TTL_SECONDS
) {
    if (!dedupeKey) {
        return true;
    }

    const memoryKey = `event:${dedupeKey}`;
    if (!acquireInMemoryDedupe(memoryKey, ttlSeconds * 1000)) {
        return false;
    }

    try {
        const result = await redisClient.set(`push:dedupe:${dedupeKey}`, "1", {
            NX: true,
            EX: ttlSeconds,
        });
        if (result === "OK") {
            return true;
        }
        return false;
    } catch (error) {
        console.warn(
            "[Push] Redis dedupe unavailable, using in-memory fallback:",
            error.message
        );
        return true;
    }
}

export async function releasePushDedupeLock(dedupeKey) {
    if (!dedupeKey) {
        return;
    }

    inMemoryDedupe.delete(`event:${dedupeKey}`);

    try {
        await redisClient.del(`push:dedupe:${dedupeKey}`);
    } catch (error) {
        console.warn("[Push] Failed to release dedupe lock:", error.message);
    }
}

async function acquireTokenPushLock(token, title, body, collapseKey) {
    const key = buildTokenContentKey(token, title, body, collapseKey);
    if (!acquireInMemoryDedupe(key, TOKEN_DEDUPE_TTL_SECONDS * 1000)) {
        return false;
    }

    try {
        const result = await redisClient.set(key, "1", {
            NX: true,
            EX: TOKEN_DEDUPE_TTL_SECONDS,
        });
        return result === "OK";
    } catch {
        return true;
    }
}

function normalizeRecipients(recipients) {
    return uniqueTokenOnly(
        latestTokenOnlyPerRecipient(
            dedupeTokenObjects(
                recipients
                    .filter((recipient) => recipient?.token)
                    .map((recipient) => ({
                        ...recipient,
                        token: String(recipient.token).trim(),
                    }))
            )
        )
    );
}

/**
 * Central push entry point: Set-based token dedupe, Redis idempotency, FCM collapse keys.
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

    const effectiveCollapseKey = sanitizeCollapseKey(
        collapseKey || dedupeKey
    );

    let tokenObjects = normalizeRecipients(recipients);

    if (!tokenObjects.length) {
        return { ...EMPTY_RESULT, skipped: false };
    }

    if (rapidDedupeKey) {
        const acquired = await acquirePushDedupeLock(
            rapidDedupeKey,
            RAPID_DEDUPE_TTL_SECONDS
        );
        if (!acquired) {
            console.log(`[Push] Skipped rapid duplicate: ${rapidDedupeKey}`);
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

    const allowedRecipients = [];
    for (const recipient of tokenObjects) {
        const tokenAllowed = await acquireTokenPushLock(
            recipient.token,
            title,
            body,
            effectiveCollapseKey
        );
        if (tokenAllowed) {
            allowedRecipients.push(recipient);
        } else {
            console.log(
                `[Push] Skipped duplicate token within ${TOKEN_DEDUPE_TTL_SECONDS}s: ${hashToken(recipient.token)}`
            );
        }
    }

    tokenObjects = allowedRecipients;

    if (!tokenObjects.length) {
        return {
            ...EMPTY_RESULT,
            skipped: true,
            skipReason: "token_dedupe",
        };
    }

    try {
        const result = await deliverMulticastPush({
            tokenObjects,
            title,
            description: body,
            persistLogs,
            collapseKey: effectiveCollapseKey,
            screen,
        });

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
