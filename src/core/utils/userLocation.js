/**
 * User locations for the admin Deep User Insights V2 page.
 *
 * The app reports a location (POST /user/app/v2/location) on open, when the
 * user picks one manually, and when live GPS moves ~500 m (at most every 15
 * min). Each booking then snapshots the location in force onto the
 * appointment (user_lat / user_lng / user_location_source / distance_km), so
 * analytics never depend on where the user went afterwards.
 */

import sequelize from "sequelize";
import * as Models from "../database/models/index.js";
import { connection } from "../database/connection.js";

const { Op, QueryTypes } = sequelize;

export const LOCATION_SOURCES = ["live", "manual"];
// A booking uses a live location at most this old, else the latest manual one.
export const BOOKING_LIVE_LOCATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
// A report this close to the previous one (same source) within the window
// is dropped as a duplicate.
const DUPLICATE_METERS = 100;
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

// 3 decimals ~ 110 m: enough for distance in km, without storing exact homes.
const roundCoord = (value) => Math.round(Number(value) * 1000) / 1000;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (deg) => (Number(deg) * Math.PI) / 180;
  const dLat = rad(lat2) - rad(lat1);
  const dLng = rad(lng2) - rad(lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// { lat, lng, source } from a request body, or null when it isn't a usable
// coordinate (missing, out of range, or the 0,0 "no fix" placeholder).
export function parseLocation(body = {}) {
  const lat = Number(body.lat ?? body.latitude);
  const lng = Number(body.lng ?? body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const requested = String(body.source || "live").trim().toLowerCase();
  return {
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    source: LOCATION_SOURCES.includes(requested) ? requested : "live",
  };
}

// Saves a reported location unless it duplicates the user's previous one.
export async function recordUserLocation(userId, location) {
  const now = new Date();
  const last = await Models.UserLocations.findOne({
    where: { user_id: userId, source: location.source },
    order: [["created_at", "DESC"], ["id", "DESC"]],
    raw: true,
  });
  if (
    last &&
    now.getTime() - new Date(last.created_at).getTime() < DUPLICATE_WINDOW_MS &&
    haversineKm(last.lat, last.lng, location.lat, location.lng) * 1000 < DUPLICATE_METERS
  ) {
    return { saved: false, ...location };
  }
  await Models.UserLocations.create({ user_id: userId, ...location, created_at: now });
  return { saved: true, ...location };
}

/**
 * The appointment columns for a booking placed now: a live location from the
 * last 2 hours, else the latest manual one, plus the straight-line distance
 * to the salon. {} when the user has no location or anything fails - a
 * booking must never fail over analytics.
 */
export async function bookingLocationSnapshot(userId, storeId) {
  if (!userId) return {};
  try {
    const live = await Models.UserLocations.findOne({
      where: {
        user_id: userId,
        source: "live",
        created_at: { [Op.gte]: new Date(Date.now() - BOOKING_LIVE_LOCATION_MAX_AGE_MS) },
      },
      order: [["created_at", "DESC"], ["id", "DESC"]],
      raw: true,
    });
    const point =
      live ||
      (await Models.UserLocations.findOne({
        where: { user_id: userId, source: "manual" },
        order: [["created_at", "DESC"], ["id", "DESC"]],
        raw: true,
      }));
    if (!point) return {};

    const [salon] = storeId
      ? await connection.query(
          `SELECT pa.latitude, pa.longitude FROM Store s
           INNER JOIN PartnerAddress pa ON pa.id = s.address_id
           WHERE s.id = :storeId LIMIT 1`,
          { replacements: { storeId }, type: QueryTypes.SELECT }
        )
      : [];
    const salonLat = Number(salon?.latitude);
    const salonLng = Number(salon?.longitude);
    const hasSalon = Number.isFinite(salonLat) && Number.isFinite(salonLng) && (salonLat || salonLng);

    return {
      user_lat: point.lat,
      user_lng: point.lng,
      user_location_source: point.source,
      distance_km: hasSalon ? Number(haversineKm(point.lat, point.lng, salonLat, salonLng).toFixed(2)) : null,
    };
  } catch (error) {
    console.warn("[userLocation] booking snapshot skipped:", error?.message || error);
    return {};
  }
}
