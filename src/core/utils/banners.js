/**
 * Which banners the apps get. Shared by the user app (V1 /getbanner, V2
 * /v2/getbanner, which the website also uses with place = web) and the
 * partner app (/getbanner, /banner-with-color).
 *
 * A banner is live when an admin hasn't paused or deleted it
 * (status = 'active') and NOW() is inside its optional schedule
 * (start_date / end_date, NULL = open on that side). They come in the
 * admin's display order (sort_order), newest first within the same order.
 */

import { Op } from "sequelize";

export const BANNER_PLACES = ["user", "partner", "web"];

/**
 * Sequelize `where` for the live banners of one place. `place` falls back to
 * `fallback` when it isn't user / partner / web. `withUnplaced` also keeps
 * banners saved before `place` existed (place NULL) in the user list - V1
 * /getbanner always showed them; V2 never did.
 */
export function liveBannerWhere(place, fallback = "user", withUnplaced = false) {
  const target = BANNER_PLACES.includes(place) ? place : fallback;
  const now = new Date();
  return {
    status: "active",
    [Op.and]: [
      target === "user" && withUnplaced
        ? { [Op.or]: [{ place: "user" }, { place: null }] }
        : { place: target },
      { [Op.or]: [{ start_date: null }, { start_date: { [Op.lte]: now } }] },
      { [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: now } }] },
    ],
  };
}

export const BANNER_ORDER = [
  ["sort_order", "ASC"],
  ["date", "DESC"],
  ["id", "DESC"],
];
