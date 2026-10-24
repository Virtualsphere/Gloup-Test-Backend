/**
 * App usage tracking for the admin analytics pages (User Analytics, Behavior,
 * Click & Interaction, 360).
 *
 * - Sessions (UserAppSessions) come from /user/app/v2/heartbeat, which the
 *   app sends every ~25-30s in the foreground and with online:false when it
 *   goes to the background. A ping within SESSION_GAP_MS of the user's last
 *   one extends that session; a longer silence starts a new one.
 * - Server events (UserEvents, source 'server'): actions the backend serves
 *   (salon_view, coupon_apply, coupon_attempt_failed) and screen views logged
 *   by trackScreen() on the routes each app screen calls.
 * - App events (UserEvents, source 'app'): taps, gestures, searches, ... the
 *   app sends in batches to /user/app/v2/events.
 *
 * Tracking must never break or slow the request it rides on, so every write
 * here swallows its own errors and screen views are logged after the
 * response has been sent.
 */

import sequelize from "sequelize";
import * as Models from "../database/models/index.js";
import redisClient from "../database/redisClient.js";

const { Op } = sequelize;

export const SESSION_GAP_MS = 5 * 60 * 1000;
export const APP_PLATFORMS = ["android", "ios", "web", "app"];
// One screen counts once per user in this window (a screen often calls its
// API several times: refresh, pagination).
const SCREEN_VIEW_DEDUPE_MS = 30 * 1000;
const SCREEN_DEDUPE_MAX_KEYS = 20000;
// App event batches: at most this many events, none older than this.
const APP_EVENT_BATCH_MAX = 200;
const APP_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const APP_EVENT_TYPES = ["screen_view", "tap", "rage_tap", "gesture", "search", "filter", "cart", "checkout_step"];
export const FEEDBACK_TYPES = ["checkout_exit", "account_delete", "cancel_booking", "other"];

/**
 * android / ios when the app says so; otherwise what the User-Agent tells:
 * a browser is "web", the Flutter app's default `Dart/x.y (dart:io)` is the
 * same on Android and iOS, so it is only "app". null when unknown.
 */
export function resolveClientPlatform(declared, userAgent) {
  const value = String(declared || "").trim().toLowerCase();
  if (value === "android" || value === "ios" || value === "web") return value;
  const ua = String(userAgent || "");
  if (!ua) return null;
  // Browsers first: a phone browser says "Android" / "iPhone" too, but it's web.
  if (/mozilla/i.test(ua)) return "web";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod|cfnetwork|darwin/i.test(ua)) return "ios";
  if (/dart|okhttp|flutter/i.test(ua)) return "app";
  return null;
}

// "4.2.0" style version from the X-App-Version header, or null.
export function cleanAppVersion(value) {
  const text = String(value || "").trim();
  return /^[0-9A-Za-z.+_-]{1,20}$/.test(text) ? text : null;
}

// Platform and app version a request carries (X-Platform / X-App-Version,
// User-Agent fallback for the platform).
export function clientMetaOf(req, declaredPlatform = null) {
  return {
    platform: resolveClientPlatform(declaredPlatform || req.get?.("x-platform"), req.get?.("user-agent")),
    appVersion: cleanAppVersion(req.get?.("x-app-version")),
  };
}

// The logged-in user behind a request, read-only: req.user when the route
// authenticated, else the session for the `userauth` token. Never touches
// the session (verifyuser destroys expired ones; tracking must not).
async function requestUserId(req) {
  if (req.user?.id) return req.user.id;
  const token = req.headers?.userauth;
  if (!token) return null;
  try {
    const cached = redisClient?.isOpen ? await redisClient.get(`session:${token}`) : null;
    if (cached) return Number(cached) || null;
    const session = await Models.UserSession.findOne({
      where: { token, status: "active" },
      attributes: ["user_id"],
      raw: true,
    });
    return session?.user_id || null;
  } catch {
    return null;
  }
}

const recentScreens = new Map();
const seenRecently = (key) => {
  const now = Date.now();
  const last = recentScreens.get(key);
  if (last && now - last < SCREEN_VIEW_DEDUPE_MS) return true;
  if (recentScreens.size >= SCREEN_DEDUPE_MAX_KEYS) {
    for (const [k, at] of recentScreens) if (now - at >= SCREEN_VIEW_DEDUPE_MS) recentScreens.delete(k);
    if (recentScreens.size >= SCREEN_DEDUPE_MAX_KEYS) recentScreens.clear();
  }
  recentScreens.set(key, now);
  return false;
};

// Search / filter / sort inputs worth keeping with a screen view.
const SCREEN_META_KEYS = ["search", "sort", "minPrice", "maxPrice", "minRating", "gender", "sex", "category", "store_id"];
const screenMetaOf = (req) => {
  const meta = {};
  for (const key of SCREEN_META_KEYS) {
    const value = req.query?.[key] ?? req.body?.[key];
    if (value !== undefined && value !== null && value !== "") meta[key] = String(value).slice(0, 80);
  }
  return Object.keys(meta).length ? JSON.stringify(meta) : null;
};

/**
 * Express middleware: after a successful response, log that the logged-in
 * user opened `screenOf` (a name, or req -> name). Anonymous calls are
 * skipped.
 */
export function trackScreen(screenOf) {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      void (async () => {
        const screen = typeof screenOf === "function" ? screenOf(req) : screenOf;
        try {
          const userId = await requestUserId(req);
          if (!userId || seenRecently(`${userId}|${screen}`)) return;
          const { platform, appVersion } = clientMetaOf(req);
          await Models.UserEvents.create({
            user_id: userId,
            event: "screen_view",
            screen,
            meta: screenMetaOf(req),
            platform,
            app_version: appVersion,
            source: "server",
            created_at: new Date(),
          });
        } catch (error) {
          console.warn(`[appUsage] screen ${screen} not recorded:`, error?.message || error);
        }
      })();
    });
    next();
  };
}

export async function recordAppHeartbeat({ userId, online, platform, appVersion = null }) {
  if (!userId) return;
  try {
    const now = new Date();
    const open = {
      user_id: userId,
      ended_at: null,
      last_seen_at: { [Op.gte]: new Date(now.getTime() - SESSION_GAP_MS) },
    };
    if (!online) {
      await Models.UserAppSessions.update({ last_seen_at: now, ended_at: now }, { where: open });
      return;
    }
    // A UA guess ("app") never overwrites a platform the app declared.
    const patch = { last_seen_at: now };
    if (platform && platform !== "app") patch.platform = platform;
    if (appVersion) patch.app_version = appVersion;
    const [extended] = await Models.UserAppSessions.update(patch, { where: open });
    if (!extended) {
      await Models.UserAppSessions.create({
        user_id: userId,
        platform: platform || null,
        app_version: appVersion,
        started_at: now,
        last_seen_at: now,
      });
    }
  } catch (error) {
    console.warn("[appUsage] heartbeat not recorded:", error?.message || error);
  }
}

export async function recordUserEvent({ userId, event, storeId = null, couponCode = null, screen = null, meta = null }) {
  if (!userId || !event) return;
  try {
    await Models.UserEvents.create({
      user_id: userId,
      event,
      store_id: storeId ? Number(storeId) || null : null,
      coupon_code: couponCode ? String(couponCode).trim().slice(0, 64) || null : null,
      screen,
      meta: meta ? JSON.stringify(meta) : null,
      source: "server",
      created_at: new Date(),
    });
  } catch (error) {
    console.warn(`[appUsage] ${event} not recorded:`, error?.message || error);
  }
}

// ---- App-reported events (/user/app/v2/events) ---------------------------

const text = (value, max) => {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const share = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Number(n.toFixed(4)) : null;
};
const whole = (value, max = 2147483647) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};
const eventTime = (value, now) => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > now + 60 * 1000 || now - ms > APP_EVENT_MAX_AGE_MS) return new Date(now);
  return new Date(ms);
};

// One app event -> a UserEvents row, or null when it isn't usable.
function appEventRow(event, userId, clientMeta, now) {
  if (!event || typeof event !== "object") return null;
  const type = String(event.type || "").trim().toLowerCase();
  if (!APP_EVENT_TYPES.includes(type)) return null;
  const row = {
    user_id: userId,
    event: type,
    screen: text(event.screen, 40),
    platform: clientMeta.platform,
    app_version: clientMeta.appVersion,
    source: "app",
    created_at: eventTime(event.at, now),
  };
  const extra = {};
  switch (type) {
    case "screen_view":
      row.value = whole(event.duration_ms);
      break;
    case "tap":
      row.element = text(event.element, 80);
      row.x = share(event.x);
      row.y = share(event.y);
      row.value = whole(event.ms_since_screen_open);
      break;
    case "rage_tap":
      row.element = text(event.element, 80);
      row.value = whole(event.taps, 1000);
      break;
    case "gesture":
      row.element = text(event.gesture, 80);
      break;
    case "search":
      row.element = text(event.query, 80);
      row.value = whole(event.results);
      break;
    case "filter":
      row.element = text(event.sort, 80);
      for (const key of ["min_price", "max_price", "min_rating", "category"]) {
        if (event[key] !== undefined && event[key] !== null && event[key] !== "") extra[key] = String(event[key]).slice(0, 40);
      }
      break;
    case "cart":
      row.element = text(event.action, 80);
      row.store_id = whole(event.store_id) || null;
      if (event.service_id !== undefined) extra.service_id = String(event.service_id).slice(0, 20);
      break;
    case "checkout_step":
      row.element = text(event.step, 80);
      break;
    default:
      return null;
  }
  if (Object.keys(extra).length) row.meta = JSON.stringify(extra);
  return row;
}

/** Stores a batch from the app; returns { accepted, rejected }. */
export async function recordAppEvents(userId, events, clientMeta) {
  const list = Array.isArray(events) ? events.slice(0, APP_EVENT_BATCH_MAX) : [];
  const now = Date.now();
  const rows = list.map((e) => appEventRow(e, userId, clientMeta, now)).filter(Boolean);
  if (rows.length) await Models.UserEvents.bulkCreate(rows);
  return {
    accepted: rows.length,
    rejected: (Array.isArray(events) ? events.length : 0) - rows.length,
    max_batch: APP_EVENT_BATCH_MAX,
  };
}

/** First-touch install source; a later report never overwrites it. */
export async function recordAttribution(userId, body, clientMeta) {
  const existing = await Models.UserAttribution.findOne({ where: { user_id: userId }, raw: true });
  if (existing) return { saved: false, reason: "already recorded" };
  const source = text(body?.source, 40);
  const referrer = text(body?.referrer, 2000);
  if (!source && !referrer) return { saved: false, reason: "source or referrer is required" };
  await Models.UserAttribution.create({
    user_id: userId,
    source: source ? source.toLowerCase() : null,
    medium: text(body?.medium, 40)?.toLowerCase() || null,
    campaign: text(body?.campaign, 80),
    referrer,
    platform: clientMeta.platform,
    created_at: new Date(),
  });
  return { saved: true };
}

/** A reason the user picked in the app; null when type is unknown. */
export async function recordFeedback(userId, body) {
  const type = String(body?.type || "").trim().toLowerCase();
  if (!FEEDBACK_TYPES.includes(type)) return null;
  const reason = text(body?.reason, 64);
  const note = text(body?.note, 2000);
  if (!reason && !note) return null;
  await Models.UserFeedback.create({
    user_id: userId || null,
    type,
    reason: reason ? reason.toLowerCase() : null,
    note,
    appointment_id: whole(body?.appointment_id) || null,
    store_id: whole(body?.store_id) || null,
    created_at: new Date(),
  });
  return { saved: true, type, reason };
}
