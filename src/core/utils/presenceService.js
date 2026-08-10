/**
 * Real-time presence via Redis sorted sets (score = expiry epoch ms).
 * Dual-writes stay compatible with MySQL session.updated_at fallbacks.
 *
 * TTL: 90s — apps heartbeat every ~25–30s so 2–3 missed pings = offline.
 * Multi-instance: PUBLISH on presence:livestats; each API node fans out SSE.
 */

import redisClient from "../database/redisClient.js";

export const PRESENCE_TTL_MS = 90_000;
export const PRESENCE_TTL_SECONDS = Math.ceil(PRESENCE_TTL_MS / 1000);

const USER_ZSET = "presence:z:users";
const PARTNER_ZSET = "presence:z:partners";
const PUBSUB_CHANNEL = "presence:livestats";

let lastBroadcastKey = "";
let broadcastTimer = null;
let subscriber = null;
let fanoutHandler = null;

function isRedisReady() {
  return Boolean(redisClient?.isOpen);
}

async function touchMember(zset, id) {
  if (!isRedisReady() || id == null) return false;
  const exp = Date.now() + PRESENCE_TTL_MS;
  await redisClient.zAdd(zset, [{ score: exp, value: String(id) }]);
  return true;
}

async function dropMember(zset, id) {
  if (!isRedisReady() || id == null) return false;
  await redisClient.zRem(zset, String(id));
  return true;
}

async function countZset(zset) {
  if (!isRedisReady()) return null;
  const now = Date.now();
  await redisClient.zRemRangeByScore(zset, "-inf", now);
  return redisClient.zCard(zset);
}

export async function markUserOnline(userId) {
  const ok = await touchMember(USER_ZSET, userId);
  if (ok) schedulePresenceBroadcast();
  return ok;
}

export async function markUserOffline(userId) {
  const ok = await dropMember(USER_ZSET, userId);
  if (ok) schedulePresenceBroadcast();
  return ok;
}

export async function markPartnerOnline(storeId) {
  const ok = await touchMember(PARTNER_ZSET, storeId);
  if (ok) schedulePresenceBroadcast();
  return ok;
}

export async function markPartnerOffline(storeId) {
  const ok = await dropMember(PARTNER_ZSET, storeId);
  if (ok) schedulePresenceBroadcast();
  return ok;
}

/** @returns {Promise<number|null>} null if Redis unavailable */
export async function countActiveUsers() {
  try {
    return await countZset(USER_ZSET);
  } catch (err) {
    console.warn("[presence] countActiveUsers failed:", err?.message || err);
    return null;
  }
}

/** @returns {Promise<number|null>} null if Redis unavailable */
export async function countActivePartners() {
  try {
    return await countZset(PARTNER_ZSET);
  } catch (err) {
    console.warn("[presence] countActivePartners failed:", err?.message || err);
    return null;
  }
}

export async function getPresenceCounts() {
  const [users, partners] = await Promise.all([
    countActiveUsers(),
    countActivePartners(),
  ]);
  return {
    active_users_now: users,
    active_partners_now: partners,
    source: users != null && partners != null ? "redis" : "unavailable",
  };
}

/**
 * Debounced publish so rapid heartbeats don't spam admin SSE.
 * Only emits when the counts string changes.
 */
export function schedulePresenceBroadcast(delayMs = 400) {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    publishPresenceSnapshot().catch((err) => {
      console.warn("[presence] broadcast failed:", err?.message || err);
    });
  }, delayMs);
}

async function publishPresenceSnapshot() {
  if (!isRedisReady()) return;
  const counts = await getPresenceCounts();
  if (counts.active_users_now == null || counts.active_partners_now == null) {
    return;
  }
  const key = `${counts.active_users_now}:${counts.active_partners_now}`;
  if (key === lastBroadcastKey) return;
  lastBroadcastKey = key;

  const payload = JSON.stringify({
    type: "LIVE_STATS",
    active_users_now: counts.active_users_now,
    active_partners_now: counts.active_partners_now,
    ts: Date.now(),
  });

  try {
    await redisClient.publish(PUBSUB_CHANNEL, payload);
  } catch (err) {
    // Single-node fallback: fan out locally if publish fails
    if (typeof fanoutHandler === "function") {
      fanoutHandler(JSON.parse(payload));
    }
    throw err;
  }
}

/**
 * Call once at process boot. Registers Redis subscriber → SSE fanout.
 * @param {(payload: object) => void} onMessage
 */
export async function initPresenceFanout(onMessage) {
  fanoutHandler = onMessage;
  if (!isRedisReady() || subscriber) return;

  try {
    subscriber = redisClient.duplicate();
    subscriber.on("error", (err) =>
      console.error("[presence] subscriber error:", err?.message || err)
    );
    await subscriber.connect();
    await subscriber.subscribe(PUBSUB_CHANNEL, (message) => {
      try {
        const data = JSON.parse(message);
        if (typeof fanoutHandler === "function") fanoutHandler(data);
      } catch (err) {
        console.warn("[presence] bad pubsub payload:", err?.message || err);
      }
    });
    console.log("[presence] Redis pub/sub fanout ready");
  } catch (err) {
    console.warn(
      "[presence] pub/sub init failed (local fanout only):",
      err?.message || err
    );
    subscriber = null;
  }
}
