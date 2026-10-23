/**
 * App usage tracking for the admin User Analytics V2 page.
 *
 * - Sessions (UserAppSessions) come from /user/app/v2/heartbeat, which the
 *   app sends every ~25-30s in the foreground and with online:false when it
 *   goes to the background. A ping within SESSION_GAP_MS of the user's last
 *   one extends that session; a longer silence starts a new one.
 * - Events (UserEvents) are the actions the backend itself serves
 *   (salon_view, coupon_apply).
 *
 * Tracking must never break the request it rides on, so every write here
 * swallows its own errors.
 */

import sequelize from "sequelize";
import * as Models from "../database/models/index.js";

const { Op } = sequelize;

export const SESSION_GAP_MS = 5 * 60 * 1000;
export const APP_PLATFORMS = ["android", "ios", "web", "app"];

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

export async function recordAppHeartbeat({ userId, online, platform }) {
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
    const [extended] = await Models.UserAppSessions.update(patch, { where: open });
    if (!extended) {
      await Models.UserAppSessions.create({
        user_id: userId,
        platform: platform || null,
        started_at: now,
        last_seen_at: now,
      });
    }
  } catch (error) {
    console.warn("[appUsage] heartbeat not recorded:", error?.message || error);
  }
}

export async function recordUserEvent({ userId, event, storeId = null, couponCode = null }) {
  if (!userId || !event) return;
  try {
    await Models.UserEvents.create({
      user_id: userId,
      event,
      store_id: storeId ? Number(storeId) || null : null,
      coupon_code: couponCode ? String(couponCode).trim().slice(0, 64) || null : null,
      created_at: new Date(),
    });
  } catch (error) {
    console.warn(`[appUsage] ${event} not recorded:`, error?.message || error);
  }
}
