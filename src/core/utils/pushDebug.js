import { randomBytes } from "crypto";

export function createPushTraceId(flow) {
    return `${flow}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

export function maskToken(token) {
    if (!token) return "none";
    const value = String(token).trim();
    if (value.length <= 20) return value;
    return `${value.slice(0, 14)}...${value.slice(-8)}`;
}

/**
 * Structured push debug log — grep Docker logs with: [PushDebug]
 */
export function logPushDebug(traceId, phase, detail = {}) {
    const payload = {
        traceId: traceId || "no-trace",
        phase,
        ...detail,
    };

    if (Array.isArray(payload.tokens)) {
        payload.tokens = payload.tokens.map(maskToken);
    }
    if (payload.token) {
        payload.token = maskToken(payload.token);
    }

    console.log(`[PushDebug] ${JSON.stringify(payload)}`);
}

export function summarizeRecipients(recipients) {
    return (recipients || []).map((r) => ({
        user_id: r.user_id ?? null,
        partner_id: r.partner_id ?? null,
        token: maskToken(r.token),
    }));
}

export function findDuplicateTokens(userTokens, partnerTokens) {
    const partnerSet = new Set(partnerTokens.map((t) => t.token).filter(Boolean));
    return userTokens.filter((t) => t.token && partnerSet.has(t.token));
}
