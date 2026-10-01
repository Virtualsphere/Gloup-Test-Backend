import require from "requirejs";
import * as Error from "../../errors/ErrorConstant.js";
import { connection } from "../connection.js";
import * as Models from "../models/index.js";
import bcrypt from "bcrypt";
import { defaultdata } from "../../../../config/config.js";
import { getBookingsDetails, getlanguage, getserviceprovidedfor } from "../../../Admin/controller/adminappcontroller.js";
const { Op, Sequelize, fn, col } = require("sequelize");
var randomize = require('randomatic');
import generatePDF  from "../../utils/generatePDF.js";
import generateInvoicePDF from "../../utils/generateInvoicePDF.js";
import generateMonthlyInvoicePDF from "../../utils/generateMonthlyInvoicePDF.js";
import { partnerDbController } from "./partnerDbController.js";
import { uploadToS3, S3upload, deleteIfExists } from "../../utils/s3/s3Upload.js";
import logger from "../../utils/logger.js";
import { logErrorToDB } from "../../utils/loggerDB.js";
import { syncPlanToRazorpay } from "../../utils/syncRazorpayPlans.js";
import {
    formatDurationFromDecimal,
    normalizeCategoryKey,
} from "../../utils/excelParser.js";
import { buildAppointmentDateTime, toIstDatePart } from "../../schema/formats.js";
import {
  accrueDue,
  cycleFee,
  DEFAULT_FREE_BOOKING_LIMIT,
  MAX_FREE_BOOKING_LIMIT,
} from "../../utils/partnerSubscriptionBilling.js";
import { addDays, isValidDate, resolveRanges, rangesTableSql } from "../../utils/dashboardRanges.js";

const ALLOWED_STATUS_TRANSITIONS = {
  booked: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

// ── Bookings list V2 ──
const BOOKING_STATUSES = ["booked", "confirmed", "completed", "cancelled", "refunded", "pending"];
// payment filter -> SQL. "sucssess" is a misspelling the booking flow also
// writes; refunds set payment_status to 'refunded' (updateRefundBookingStatus).
const BOOKING_PAYMENT_FILTERS = {
  paid: "a.payment_status IN ('success', 'sucssess') AND a.status <> 'refunded'",
  unpaid: "(a.payment_status = 'pending' OR a.payment_status IS NULL)",
  failed: "a.payment_status = 'failed'",
  refunded: "(a.status = 'refunded' OR a.payment_status = 'refunded')",
};
const BOOKING_LIST_MAX_LIMIT = 10000;
// What one appointment_items row adds to a partner's invoice - the pricing
// rule in getInvoiceDetailsForPartner(/Monthly): "important" services at the
// full service price, everything else at what the customer was charged.
// Expects aliases ai (appointment_items), ss (StoreServices), cb (Combo).
const INVOICE_ITEM_AMOUNT_SQL = `
  CASE
    WHEN ss.id IS NOT NULL AND ss.important = 1 THEN ss.amount
    WHEN ss.id IS NOT NULL OR cb.id IS NOT NULL THEN COALESCE(ai.service_amount, 0)
    ELSE 0
  END`;
// Which date a bookings date range filters on: the appointment day (V1's
// behaviour, the default) or when the booking was placed.
const bookingListDateBasis = (basis) => {
  if (basis === undefined || basis === null || basis === "" || basis === "appointment") {
    return { dateColumn: "booking_date" };
  }
  if (basis === "order") return { dateColumn: "created_at" };
  throw Error.BadRequest("date_basis must be appointment or order");
};

// ── Admin users V2 ──
const USER_STATUSES = ["active", "inactive", "terminated"];
// Paid = a real booking; the booking flow writes both spellings.
const PAID_PAYMENT_SQL = "('success', 'sucssess')";
// How the account was created, inferred from what the sign-up paths store:
// Apple sign-in sets apple_sub, Google sign-in creates the row with an email
// and no phone, phone OTP sign-up creates it with a phone. A Google user who
// later adds a phone reads as "phone", so this is a best guess, not a record.
const USER_LOGIN_METHOD_SQL = `
  CASE
    WHEN u.apple_sub IS NOT NULL AND u.apple_sub <> '' THEN 'apple'
    WHEN (u.phone IS NULL OR u.phone = '') AND u.email IS NOT NULL AND u.email <> '' THEN 'google'
    ELSE 'phone'
  END`;
// Referral = signed up with someone's invite code (User.used_code).
const USER_SOURCE_SQL = "CASE WHEN u.used_code IS NOT NULL AND u.used_code <> '' THEN 'referral' ELSE 'organic' END";
// Per-user paid-booking stats / session activity, joined as derived tables.
const USER_BOOKING_STATS_SQL = `
  SELECT user_id,
    COUNT(*) AS total_bookings,
    SUM(status = 'completed') AS completed_bookings,
    MAX(created_at) AS last_booking_at
  FROM appointments
  WHERE payment_status IN ${PAID_PAYMENT_SQL}
  GROUP BY user_id`;
const USER_SESSION_STATS_SQL = `
  SELECT user_id, MAX(updated_at) AS last_active_at
  FROM UserSession
  WHERE user_id IS NOT NULL
  GROUP BY user_id`;
const USER_LIST_SORTS = {
  newest: "u.registered_at IS NULL, u.registered_at DESC, u.id DESC",
  last_active: "ss.last_active_at IS NULL, ss.last_active_at DESC, u.id DESC",
  last_booking: "bk.last_booking_at IS NULL, bk.last_booking_at DESC, u.id DESC",
  bookings: "COALESCE(bk.total_bookings, 0) DESC, u.id DESC",
};
const USER_LIST_MAX_LIMIT = 10000;
// What the customer paid for a booking: charged price + GST (appointments.gst %).
const AMOUNT_PAID_SQL = "a.discounted_amount + ROUND(a.discounted_amount * a.gst / 100, 2)";

const requireUserId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw Error.BadRequest("id must be a positive whole number");
  }
  return id;
};
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
// Store.images is a JSON array string; first image path or null.
const firstImage = (raw) => {
  if (!raw) return null;
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) && list.length ? list[0] : null;
  } catch {
    return null;
  }
};

const INVOICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Invoice day = appointment calendar day (IST). Optional YYYY-MM-DD override. */
function resolveInvoiceDate(dateInput) {
  if (dateInput != null && String(dateInput).trim() !== "") {
    const d = String(dateInput).trim().slice(0, 10);
    if (!INVOICE_DATE_RE.test(d)) {
      throw Error.BadRequest("date must be YYYY-MM-DD");
    }
    return d;
  }
  return toIstDatePart(new Date());
}

const INVOICE_MONTH_RE = /^\d{4}-\d{2}$/;

/** Invoice month = appointment booking_date month (IST). Optional YYYY-MM override; defaults to current month IST. */
function resolveInvoiceMonthRange(monthInput) {
  let year, month;
  if (monthInput != null && String(monthInput).trim() !== "") {
    const m = String(monthInput).trim().slice(0, 7);
    if (!INVOICE_MONTH_RE.test(m)) {
      throw Error.BadRequest("month must be YYYY-MM");
    }
    [year, month] = m.split("-").map(Number);
  } else {
    const todayIst = toIstDatePart(new Date());
    [year, month] = todayIst.split("-").map(Number);
  }
  const pad = (n) => String(n).padStart(2, "0");
  const fromDate = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { month: `${year}-${pad(month)}`, fromDate, toDate };
}

/** Last N calendar months as "YYYY-MM" strings, oldest first, ending this month. */
function buildLastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}



export class adminDbController { }
  adminDbController.scope = "defaultScope";
  adminDbController.Models = Models;
  adminDbController.connection = connection;
  adminDbController.defaults = {};

  // Helper to format time as HH:MM:SS
  function formatTime(date) {
    return date.toTimeString().split(" ")[0];
  }

  // Create Timeslot loop function
  async function createDefaultTimeSlots(storeId) {
  const daysOfWeek = [
    "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday"
  ];

   const SLOT_COUNT = 168;

  // 🔹 Check existing slots
  const existingSlots = await adminDbController.Models.Slots.count({
    where: { store_id: storeId }
  });

  // 🔹 If slots already correct, do nothing
  if (existingSlots === SLOT_COUNT) {
    return { message: "Slots already exist", count: existingSlots };
  }

  // 🔹 If incorrect slots exist → delete
  if (existingSlots > 0) {
    await adminDbController.Models.Slots.destroy({
      where: { store_id: storeId }
    });
  }

  const slots = [];

  for (const day of daysOfWeek) {
    const start = new Date();
    start.setHours(9, 0, 0, 0); // 9:00 AM

    const end = new Date();
    end.setHours(21, 0, 0, 0); // 9:00 PM

    let current = new Date(start);

    while (current < end) {
      const next = new Date(current.getTime() + 30 * 60 * 1000);

      slots.push({
        store_id: storeId,
        from: formatTime(current),
        to: formatTime(next),
        notes: "",
        status: "active",
        day: day  // 👈 week added
      });

      current = next;
    }
  }

  await adminDbController.Models.Slots.bulkCreate(slots);
  return slots;
}




adminDbController.auth = {
  checksession: async (id) => {
    try {
      return await adminDbController.Models.adminSession.findAll({
        where: {
          user_id: id,
          status: "active"
        },
        order: [['created_at', 'DESC']],
        limit: 1
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check session");
    }
  },
  checkuser: async (data) => {
    try {
      return await adminDbController.Models.admin.findOne({
        where: {
          email: data
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check user");
    }
  },
  insertsession: async (token, id, deviceinfo) => {
    try {
      return await adminDbController.Models.adminSession.create({
        token: token,
        user_id: id,
        deviceinfo: deviceinfo,
        status: "active"
      });
    } catch (error) {
      console.log(error)
      throw Error.SomethingWentWrong("Failed to insert session");
    }
  },
  destroysession: async (id) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { id: id } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to destroy session");
    }
  },
  destroysession_1: async (token) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { token: token } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to destroy session");
    }
  },
  findsession: async (token) => {
    try {
      return await adminDbController.Models.adminSession.findOne({
        where: {
          token: token,
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to find session");
    }
  },
  checkUserIdExists: async (user) => {
    try {
      return await adminDbController.Models.admin.findOne({
        where: {
          id: user.id,
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check user ID");
    }
  },
  logout: async (token) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { token: token } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to logout");
    }
  },
  updatePassword: async (id, hashedPassword) => {
    try {
      return await adminDbController.Models.admin.update(
        { password: hashedPassword },
        { where: { id: id } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update password");
    }
  },
  destroyAllSessions: async (userId) => {
    try {
      return await adminDbController.Models.adminSession.update(
        { status: "inactive" },
        { where: { user_id: userId } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to destroy all sessions");
    }
  }
}


adminDbController.app = {
  getallusers: async (body) => {
    try {
      const where = {};
      if (body?.min_bookings != null && body.min_bookings !== "") {
        where.paid_booking_count = { [Op.gte]: Number(body.min_bookings) };
      }

      return await adminDbController.Models.User.findAll({
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilepic', 'status', 'loyalty_status', 'paid_booking_count', 'gender', 'city', 'registered_at'],
        where,
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users");
    }
  },
  // ── Admin users V2 (UsersV2 / UserDetailsV2 pages) ───────────────────────

  // Paginated user list with every filter in SQL. Adds what the V1 list never
  // returned: gender, city, registered date, sign-up source / login method,
  // last active (latest UserSession activity), last paid booking and the real
  // paid-booking count (User.paid_booking_count was reset to 0 for tier
  // pricing, so it is not a booking count any more).
  getUsersListV2: async (data = {}) => {
    try {
      const where = [];
      const replacements = {};
      const addWhere = (sql, values = {}) => {
        where.push(sql);
        Object.assign(replacements, values);
      };

      const search = String(data.search || "").trim().replace(/^#/, "");
      if (search) {
        const conditions = [
          "CONCAT_WS(' ', u.firstname, u.lastname) LIKE :searchLike",
          "u.email LIKE :searchLike",
          "u.phone LIKE :searchLike",
        ];
        const values = { searchLike: `%${escapeLike(search)}%` };
        if (/^\d+$/.test(search)) {
          conditions.unshift("u.id = :searchId");
          values.searchId = Number(search);
        }
        addWhere(`(${conditions.join(" OR ")})`, values);
      }

      if (data.status) {
        if (!USER_STATUSES.includes(data.status)) {
          throw Error.BadRequest(`status must be one of: ${USER_STATUSES.join(", ")}`);
        }
        addWhere("u.status = :status", { status: data.status });
      }

      if (data.gender) {
        const gender = String(data.gender).toLowerCase();
        if (gender === "male") addWhere("LOWER(u.gender) IN ('male', 'm')");
        else if (gender === "female") addWhere("LOWER(u.gender) IN ('female', 'f')");
        else if (gender === "unknown") addWhere("(u.gender IS NULL OR LOWER(u.gender) NOT IN ('male', 'm', 'female', 'f'))");
        else throw Error.BadRequest("gender must be male, female or unknown");
      }

      if (data.city) {
        addWhere("LOWER(TRIM(u.city)) = LOWER(TRIM(:city))", { city: String(data.city) });
      }

      if (data.source) {
        if (!["referral", "organic"].includes(data.source)) {
          throw Error.BadRequest("source must be referral or organic");
        }
        addWhere(`${USER_SOURCE_SQL} = :source`, { source: data.source });
      }

      if (data.login_method) {
        if (!["apple", "google", "phone"].includes(data.login_method)) {
          throw Error.BadRequest("login_method must be apple, google or phone");
        }
        addWhere(`${USER_LOGIN_METHOD_SQL} = :loginMethod`, { loginMethod: data.login_method });
      }

      if (data.loyalty) {
        addWhere("u.loyalty_status = :loyalty", { loyalty: String(data.loyalty) });
      }

      if (data.booked === "yes" || data.booked === true) addWhere("COALESCE(bk.total_bookings, 0) > 0");
      else if (data.booked === "no" || data.booked === false) addWhere("COALESCE(bk.total_bookings, 0) = 0");
      else if (data.booked !== undefined && data.booked !== null && data.booked !== "") {
        throw Error.BadRequest("booked must be yes or no");
      }

      for (const [field, op] of [["joined_from", ">="], ["joined_to", "<"]]) {
        if (!data[field]) continue;
        if (!isValidDate(String(data[field]))) {
          throw Error.BadRequest(`${field} must be YYYY-MM-DD`);
        }
        const value = field === "joined_to" ? addDays(data[field], 1) : data[field];
        addWhere(`u.registered_at ${op} :${field}`, { [field]: value });
      }

      const sort = USER_LIST_SORTS[data.sort || "newest"];
      if (!sort) {
        throw Error.BadRequest(`sort must be one of: ${Object.keys(USER_LIST_SORTS).join(", ")}`);
      }

      const page = Math.max(1, Number(data.page) || 1);
      const limit = Math.min(Math.max(1, Number(data.limit) || 10), USER_LIST_MAX_LIMIT);
      const fromSql = `
        FROM User u
        LEFT JOIN (${USER_BOOKING_STATS_SQL}) bk ON bk.user_id = u.id
        LEFT JOIN (${USER_SESSION_STATS_SQL}) ss ON ss.user_id = u.id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      `;

      const [rows, totalRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT
            u.id, u.firstname, u.lastname,
            TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name,
            u.email, u.phone, u.gender, u.city, u.status, u.loyalty_status,
            u.profilePic AS profilepic, u.registered_at,
            ${USER_SOURCE_SQL} AS source,
            ${USER_LOGIN_METHOD_SQL} AS login_method,
            ss.last_active_at,
            bk.last_booking_at,
            COALESCE(bk.total_bookings, 0) AS total_bookings,
            COALESCE(bk.completed_bookings, 0) AS completed_bookings
          ${fromSql}
          ORDER BY ${sort}
          LIMIT :limit OFFSET :offset
          `,
          { replacements: { ...replacements, limit, offset: (page - 1) * limit }, type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(`SELECT COUNT(*) AS total ${fromSql}`, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      return {
        rows: rows.map((row) => ({
          ...row,
          total_bookings: Number(row.total_bookings) || 0,
          completed_bookings: Number(row.completed_bookings) || 0,
        })),
        total: Number(totalRows[0]?.total) || 0,
        page,
        limit,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUsersListV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch users");
    }
  },

  // KPIs and charts for the users page, all from real columns:
  // registered_at (join date), gender, city, used_code, UserSession, paid
  // appointments. Users with no registered_at (pre-existing accounts with no
  // history to backfill from) are counted in totals but not in any month.
  getUsersSummaryV2: async () => {
    try {
      const today = toIstDatePart(new Date());
      const [year, month] = today.split("-").map(Number);
      const pad = (n) => String(n).padStart(2, "0");
      const monthKey = (y, m) => {
        const d = new Date(Date.UTC(y, m - 1, 1));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
      };
      const thisMonth = monthKey(year, month);
      const lastMonth = monthKey(year, month - 1);
      const monthBefore = monthKey(year, month - 2);
      const dailyFrom = `${monthBefore}-01` < addDays(today, -29) ? `${monthBefore}-01` : addDays(today, -29);
      const yearStart = `${year}-01-01`;
      const run = (sql, replacements = {}) =>
        adminDbController.connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

      const [[totals], [booked], daily, monthly, [beforeYear], cities, [latestActive], [latestBooking]] =
        await Promise.all([
          run(`
            SELECT
              COUNT(*) AS total,
              COALESCE(SUM(u.status = 'active'), 0) AS active,
              COALESCE(SUM(LOWER(u.gender) IN ('male', 'm')), 0) AS male,
              COALESCE(SUM(LOWER(u.gender) IN ('female', 'f')), 0) AS female,
              COALESCE(SUM(${USER_SOURCE_SQL} = 'referral'), 0) AS referral,
              COALESCE(SUM(u.registered_at IS NULL), 0) AS unknown_join_date
            FROM User u
          `),
          run(`SELECT COUNT(DISTINCT user_id) AS booked_users FROM appointments WHERE payment_status IN ${PAID_PAYMENT_SQL}`),
          run(
            `SELECT DATE_FORMAT(registered_at, '%Y-%m-%d') AS day, COUNT(*) AS users
             FROM User WHERE registered_at >= :dailyFrom
             GROUP BY DATE_FORMAT(registered_at, '%Y-%m-%d')`,
            { dailyFrom }
          ),
          run(
            `SELECT DATE_FORMAT(registered_at, '%Y-%m') AS month, COUNT(*) AS users
             FROM User WHERE registered_at >= :yearStart
             GROUP BY DATE_FORMAT(registered_at, '%Y-%m')`,
            { yearStart }
          ),
          run(`SELECT COUNT(*) AS users FROM User WHERE registered_at < :yearStart OR registered_at IS NULL`, { yearStart }),
          run(`
            SELECT MIN(TRIM(city)) AS city, COUNT(*) AS users
            FROM User
            WHERE city IS NOT NULL AND TRIM(city) <> ''
            GROUP BY LOWER(TRIM(city))
            ORDER BY users DESC
            LIMIT 20
          `),
          run(`
            SELECT u.id, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name, u.profilePic AS profilepic, s.last_active_at
            FROM (${USER_SESSION_STATS_SQL}) s
            INNER JOIN User u ON u.id = s.user_id
            ORDER BY s.last_active_at DESC
            LIMIT 1
          `),
          run(`
            SELECT a.id AS appointment_id, a.created_at AS last_booking_at,
              u.id, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name, u.profilePic AS profilepic
            FROM appointments a
            INNER JOIN User u ON u.id = a.user_id
            WHERE a.payment_status IN ${PAID_PAYMENT_SQL}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT 1
          `),
        ]);

      const dailyMap = new Map(daily.map((r) => [r.day, Number(r.users) || 0]));
      const series = (from, days) =>
        Array.from({ length: days }, (_, i) => dailyMap.get(addDays(from, i)) || 0);
      const daysIn = (key) => {
        const [y, m] = key.split("-").map(Number);
        return new Date(Date.UTC(y, m, 0)).getUTCDate();
      };
      const sumMonth = (key) => series(`${key}-01`, daysIn(key)).reduce((a, b) => a + b, 0);

      const monthlyMap = new Map(monthly.map((r) => [r.month, Number(r.users) || 0]));
      let running = Number(beforeYear?.users) || 0;
      const growth = Array.from({ length: month }, (_, i) => {
        const key = monthKey(year, i + 1);
        running += monthlyMap.get(key) || 0;
        return { month: key, new_users: monthlyMap.get(key) || 0, total_users: running };
      });

      return {
        date: today,
        total_users: Number(totals?.total) || 0,
        active_users: Number(totals?.active) || 0,
        male_users: Number(totals?.male) || 0,
        female_users: Number(totals?.female) || 0,
        referral_users: Number(totals?.referral) || 0,
        unknown_join_date: Number(totals?.unknown_join_date) || 0,
        booked_users: Number(booked?.booked_users) || 0,
        new_this_month: sumMonth(thisMonth),
        new_last_month: sumMonth(lastMonth),
        new_month_before: sumMonth(monthBefore),
        daily_signups: {
          last_30_days: series(addDays(today, -29), 30),
          this_month: series(`${thisMonth}-01`, Number(today.slice(8, 10))),
          last_month: series(`${lastMonth}-01`, daysIn(lastMonth)),
        },
        growth,
        top_cities: cities.map((c) => ({ city: c.city, users: Number(c.users) || 0 })),
        latest_active: latestActive || null,
        latest_booking: latestBooking || null,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUsersSummaryV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch users summary");
    }
  },

  // Everything the V2 profile needs in one call, for a user of ANY status
  // (the V1 details call only returns active users). Bookings keep their real
  // appointments.status, and carry the list price, what was charged, GST,
  // what was paid and the saving, plus salon, slot time, services and coupon.
  getUserProfileV2: async (data = {}) => {
    try {
      const id = requireUserId(data.id);
      const run = (sql, replacements = {}) =>
        adminDbController.connection.query(sql, { replacements: { id, ...replacements }, type: Sequelize.QueryTypes.SELECT });

      const [[user], [sessions], bookingRows] = await Promise.all([
        run(`
          SELECT u.id, u.firstname, u.lastname, TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) AS name,
            u.email, u.phone, u.gender, u.age, u.date_of_birth, u.city, u.country, u.status,
            u.loyalty_status, u.profilePic AS profilepic, u.registered_at, u.wallet,
            u.invited_code, u.used_code,
            ${USER_SOURCE_SQL} AS source,
            ${USER_LOGIN_METHOD_SQL} AS login_method
          FROM User u
          WHERE u.id = :id
          LIMIT 1
        `),
        run(`
          SELECT COUNT(*) AS sessions, MAX(created_at) AS last_login_at, MAX(updated_at) AS last_active_at
          FROM UserSession
          WHERE user_id = :id
        `),
        run(`
          SELECT
            a.id, a.created_at,
            DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS booking_date,
            a.status, a.payment_status, a.is_wallet,
            a.amount AS list_price,
            a.discounted_amount AS amount,
            ROUND(a.discounted_amount * a.gst / 100, 2) AS gst_amount,
            ${AMOUNT_PAID_SQL} AS amount_paid,
            GREATEST(0, a.amount - a.discounted_amount) AS savings,
            cp.code AS coupon_code,
            e.\`from\` AS slot_from, e.\`to\` AS slot_to,
            d.id AS salon_id, d.name AS salon_name, d.images AS salon_images,
            f.area AS salon_area, f.city AS salon_city,
            (
              SELECT GROUP_CONCAT(COALESCE(ss.service_name, cb.combo) ORDER BY si.id SEPARATOR '||')
              FROM appointment_items si
              LEFT JOIN StoreServices ss ON si.service_id = ss.id
              LEFT JOIN Combo cb ON si.combo_id = cb.id
              WHERE si.appointment_id = a.id
            ) AS services,
            (
              SELECT GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR '||')
              FROM appointment_items ci
              LEFT JOIN StoreServices css ON ci.service_id = css.id
              LEFT JOIN Combo ccb ON ci.combo_id = ccb.id
              INNER JOIN Servicecategory sc ON sc.id = COALESCE(css.service_category, ccb.service_category)
              WHERE ci.appointment_id = a.id
            ) AS service_categories
          FROM appointments a
          LEFT JOIN Store d ON a.store_id = d.id
          LEFT JOIN PartnerAddress f ON d.address_id = f.id
          LEFT JOIN Slots e ON a.slot_id = e.id
          LEFT JOIN Coupons cp ON a.is_discounted = 1 AND cp.id = a.discount_id
          WHERE a.user_id = :id
            AND a.payment_status IN ${PAID_PAYMENT_SQL}
          ORDER BY a.booking_date DESC, e.\`from\` DESC, a.id DESC
        `),
      ]);

      if (!user) throw Error.NotFound("User not found");

      let referredBy = null;
      if (user.used_code) {
        const [referrer] = await run(
          `SELECT id, TRIM(CONCAT_WS(' ', firstname, lastname)) AS name FROM User WHERE invited_code = :code AND id <> :id LIMIT 1`,
          { code: user.used_code }
        );
        referredBy = referrer || null;
      }

      const split = (value) => (value ? String(value).split("||").filter(Boolean) : []);
      const money = (v) => Number(Number(v || 0).toFixed(2));
      const today = toIstDatePart(new Date());
      const bookings = bookingRows.map((row) => {
        const { salon_images: images, ...rest } = row;
        return {
          ...rest,
          list_price: money(row.list_price),
          amount: money(row.amount),
          gst_amount: money(row.gst_amount),
          amount_paid: money(row.amount_paid),
          savings: money(row.savings),
          is_wallet: !!row.is_wallet,
          salon_image: firstImage(images),
          services: split(row.services),
          service_categories: split(row.service_categories),
          upcoming: ["booked", "confirmed"].includes(row.status) && row.booking_date >= today,
        };
      });

      const count = (fn) => bookings.filter(fn).length;
      const completed = bookings.filter((b) => b.status === "completed");
      const spent = completed.reduce((sum, b) => sum + b.amount_paid, 0);
      const notCancelled = bookings.filter((b) => !["cancelled", "refunded"].includes(b.status));

      return {
        user: {
          ...user,
          wallet: Number(user.wallet) || 0,
          referred_by: referredBy,
          sessions: Number(sessions?.sessions) || 0,
          last_login_at: sessions?.last_login_at || null,
          last_active_at: sessions?.last_active_at || null,
        },
        summary: {
          total_bookings: bookings.length,
          upcoming: count((b) => b.upcoming),
          completed: completed.length,
          cancelled: count((b) => b.status === "cancelled"),
          refunded: count((b) => b.status === "refunded"),
          this_month: count((b) => b.booking_date && b.booking_date.slice(0, 7) === today.slice(0, 7)),
          // Paid (charged price + GST) on completed bookings.
          total_spent: money(spent),
          // List price minus charged price, on bookings that weren't cancelled/refunded.
          total_savings: money(notCancelled.reduce((sum, b) => sum + b.savings, 0)),
          avg_order_value: completed.length ? money(spent / completed.length) : null,
          highest_booking: completed.length ? Math.max(...completed.map((b) => b.amount_paid)) : null,
        },
        bookings,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUserProfileV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user profile");
    }
  },

  // Timeline for one user, newest first, merged from every per-user log the
  // platform writes: logins (UserSession), bookings placed / cancelled /
  // refunded / checkouts not completed (appointments), reviews, refund
  // requests, wallet credits/debits (user_transaction_logs), push
  // notifications received (NotificationLogs) and account changes
  // (AccountLogs). In-app actions like searches or salon views are not
  // recorded anywhere, so they can't appear. `communication` is the push
  // history on its own (WhatsApp / SMS aren't logged per user).
  getUserActivityV2: async (data = {}) => {
    try {
      const id = requireUserId(data.id);
      const limit = Math.min(Math.max(1, Number(data.limit) || 50), 200);
      const run = (sql) =>
        adminDbController.connection.query(sql, { replacements: { id, limit }, type: Sequelize.QueryTypes.SELECT });

      const [logins, placed, closed, failed, reviews, refunds, wallet, notifications, account] = await Promise.all([
        run(`SELECT id, created_at AS at FROM UserSession WHERE user_id = :id AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT :limit`),
        run(`
          SELECT a.id, a.created_at AS at, a.discounted_amount AS amount, d.name AS salon_name
          FROM appointments a LEFT JOIN Store d ON d.id = a.store_id
          WHERE a.user_id = :id AND a.payment_status IN ${PAID_PAYMENT_SQL}
          ORDER BY a.created_at DESC LIMIT :limit
        `),
        run(`
          SELECT a.id, a.updated_at AS at, a.status, d.name AS salon_name
          FROM appointments a LEFT JOIN Store d ON d.id = a.store_id
          WHERE a.user_id = :id AND a.status IN ('cancelled', 'refunded')
            AND a.payment_status IN (${PAID_PAYMENT_SQL.slice(1, -1)}, 'refunded')
            AND a.updated_at IS NOT NULL
          ORDER BY a.updated_at DESC LIMIT :limit
        `),
        run(`
          SELECT a.id, a.created_at AS at, d.name AS salon_name
          FROM appointments a LEFT JOIN Store d ON d.id = a.store_id
          WHERE a.user_id = :id AND a.payment_status = 'failed'
          ORDER BY a.created_at DESC LIMIT :limit
        `),
        run(`
          SELECT r.id, r.cretaed_at AS at, r.rating, r.review_description, d.name AS salon_name
          FROM Reviews r LEFT JOIN Store d ON d.id = r.store_id
          WHERE r.user_id = :id AND r.cretaed_at IS NOT NULL
          ORDER BY r.cretaed_at DESC LIMIT :limit
        `),
        run(`
          SELECT id, created_at AS at, appointment_id, reason, status
          FROM refund_requests WHERE user_id = :id AND created_at IS NOT NULL
          ORDER BY created_at DESC LIMIT :limit
        `),
        run(`
          SELECT id, date AS at, type, transaction_amount AS amount, description
          FROM user_transaction_logs WHERE user_id = :id AND date IS NOT NULL
          ORDER BY date DESC LIMIT :limit
        `),
        run(`
          SELECT id, date AS at, title, description
          FROM NotificationLogs WHERE user_id = :id AND date IS NOT NULL
          ORDER BY date DESC LIMIT :limit
        `),
        run(`
          SELECT id, date AS at, action, description
          FROM AccountLogs WHERE user_id = :id AND date IS NOT NULL
          ORDER BY date DESC LIMIT :limit
        `),
      ]);

      const money = (v) => Number(Number(v || 0).toFixed(2));
      const events = [
        ...logins.map((r) => ({ type: "login", at: r.at, title: "Logged in", ref_id: r.id })),
        ...placed.map((r) => ({
          type: "booking",
          at: r.at,
          title: `Booked${r.salon_name ? ` at ${r.salon_name}` : ""}`,
          amount: money(r.amount),
          ref_id: r.id,
        })),
        ...closed.map((r) => ({
          type: r.status === "refunded" ? "refund" : "cancellation",
          at: r.at,
          title: `Booking #${r.id} ${r.status}${r.salon_name ? ` (${r.salon_name})` : ""}`,
          ref_id: r.id,
        })),
        ...failed.map((r) => ({
          type: "checkout_failed",
          at: r.at,
          title: `Checkout not completed${r.salon_name ? ` at ${r.salon_name}` : ""}`,
          ref_id: r.id,
        })),
        ...reviews.map((r) => ({
          type: "review",
          at: r.at,
          title: `Rated ${r.salon_name || "a salon"} ${r.rating ?? "-"}/5`,
          description: r.review_description || null,
          ref_id: r.id,
        })),
        ...refunds.map((r) => ({
          type: "refund_request",
          at: r.at,
          title: `Refund requested for booking #${r.appointment_id} (${r.status || "pending"})`,
          description: r.reason || null,
          ref_id: r.id,
        })),
        ...wallet.map((r) => ({
          type: r.type === "debit" ? "wallet_debit" : "wallet_credit",
          at: r.at,
          title: `Wallet ${r.type === "debit" ? "debited" : "credited"}`,
          amount: money(r.amount),
          description: r.description || null,
          ref_id: r.id,
        })),
        ...notifications.map((r) => ({
          type: "notification",
          at: r.at,
          title: r.title || "Notification",
          description: r.description || null,
          ref_id: r.id,
        })),
        ...account.map((r) => ({
          type: "account",
          at: r.at,
          title: String(r.action || "Account change").replace(/_/g, " ").toLowerCase(),
          description: r.description || null,
          ref_id: r.id,
        })),
      ]
        .filter((e) => e.at)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, limit);

      return {
        events,
        communication: notifications.map((r) => ({
          id: r.id,
          channel: "push",
          at: r.at,
          title: r.title || "Notification",
          description: r.description || null,
        })),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUserActivityV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user activity");
    }
  },

  // Offers tab: coupons the user redeemed on paid bookings (with the booking
  // and date, from appointments.discount_id), any redemptions recorded in
  // UsedCoupons without a matching booking, and wallet credits/debits.
  getUserOffersV2: async (data = {}) => {
    try {
      const id = requireUserId(data.id);
      const run = (sql) =>
        adminDbController.connection.query(sql, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

      const [[user], couponBookings, usedCoupons, walletRows] = await Promise.all([
        run(`SELECT id, wallet FROM User WHERE id = :id LIMIT 1`),
        run(`
          SELECT a.id AS appointment_id, a.created_at AS used_at, a.status,
            GREATEST(0, a.amount - a.discounted_amount) AS booking_savings,
            cp.id AS coupon_id, cp.code, cp.discount_type, cp.discount_value, cp.description
          FROM appointments a
          INNER JOIN Coupons cp ON cp.id = a.discount_id
          WHERE a.user_id = :id AND a.is_discounted = 1
            AND a.payment_status IN ${PAID_PAYMENT_SQL}
          ORDER BY a.created_at DESC
        `),
        run(`
          SELECT uc.coupon_id, cp.code, cp.discount_type, cp.discount_value, COUNT(*) AS times_used
          FROM UsedCoupons uc
          LEFT JOIN Coupons cp ON cp.id = uc.coupon_id
          WHERE uc.user_id = :id
          GROUP BY uc.coupon_id, cp.code, cp.discount_type, cp.discount_value
        `),
        run(`
          SELECT id, date, type, transaction_amount AS amount, description
          FROM user_transaction_logs WHERE user_id = :id
          ORDER BY date DESC
        `),
      ]);

      if (!user) throw Error.NotFound("User not found");

      const money = (v) => Number(Number(v || 0).toFixed(2));
      const wallet = walletRows.map((r) => ({ ...r, amount: money(r.amount) }));
      const total = (type) => money(wallet.filter((w) => w.type === type).reduce((sum, w) => sum + w.amount, 0));
      const bookedCouponIds = new Set(couponBookings.map((c) => c.coupon_id));

      return {
        coupon_bookings: couponBookings.map((c) => ({
          ...c,
          booking_savings: money(c.booking_savings),
          discount_value: c.discount_value === null || c.discount_value === undefined ? null : Number(c.discount_value),
        })),
        // Redemptions with no paid booking attached (e.g. applied, then released).
        other_coupons: usedCoupons
          .filter((c) => !bookedCouponIds.has(c.coupon_id))
          .map((c) => ({ ...c, times_used: Number(c.times_used) || 0 })),
        wallet: {
          balance: Number(user.wallet) || 0,
          total_credited: total("credit"),
          total_debited: total("debit"),
          transactions: wallet,
        },
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getUserOffersV2 error:", error);
      throw Error.SomethingWentWrong("Failed to fetch user offers");
    }
  },

  // User row for the admin V1 profile call, regardless of status - the
  // active-only getuserdetails (used by refund approval) left inactive and
  // terminated users' profiles blank.
  getAdminUserById: async (id) => {
    try {
      return await adminDbController.Models.User.findOne({
        where: { id },
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilePic', 'status', 'device_id', 'date_of_birth', 'age', 'gender', 'loyalty_status', 'city', 'registered_at'],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user details");
    }
  },
  getUsersForExcelExport: async () => {
    try {
      return await adminDbController.Models.User.findAll({
        attributes: ["firstname", "lastname", "phone", "gender"],
        where: {
          phone: { [Op.ne]: null },
        },
        order: [["id", "DESC"]],
        raw: true,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users for export");
    }
  },
  getstorebyid: async (id) => {
    try {
      return await adminDbController.Models.Store.findOne({
        where: {
          id: id,
          status: "active"
        },
        attributes: ['id', 'name', 'email', 'phone', 'images', 'status', 'completion_status']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Could Not Get Store")
    }
  },
  getadminnotification: async (body) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.findAll()
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch admin notifications");
    }
  },
  getpayoutlogs: async (body) => {
    try {
      return await adminDbController.Models.WalletLogs.findAll();
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch payout logs");
    }
  },
  getactivesubs: async (data) => {
    try {
      return await adminDbController.Models.StoreSubscription.findOne({
        type: "notification",
        store_id: data.store_id,
        status: "active"
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch notification count");
    }
  },
  getactivesubscriptioncount: async (data, start_date, end_date) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.count({
        where: {
          date: {
            [Op.between]: [start_date, end_date]
          }
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active subscription count");
    }
  },
  deletecategory: async (data) => {
    try {
      return await adminDbController.Models.category.update({
        status: "inactive"
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete category");
    }
  },
  getallcategory: async (body) => {
    try {
      return await adminDbController.Models.category.findAll({
        where: {
          status: "active"
        },
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch categories");
    }
  },
  addcategory: async (data, file) => {
    try {
      return await adminDbController.Models.category.create({
        name: data.name,
        image: file,
        status: "active",
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add category")
    }
  },
  updatecategory: async (data, file) => {
    try {
      return await adminDbController.Models.category.update({
        name: data.name,
        image: file,
        status: data.status || "active",
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update category");
    }
  },
  updateservicecategoryimage: async (category_id, imageKey) => {
    try {
      const result = await adminDbController.Models.Servicecategory.update({
        imageKey: imageKey,
      }, {
        where: { id: category_id }
      });
      return result[0] > 0;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update service category image");
    }
  },
  deletecoupon: async (data) => {
    try {

      return await adminDbController.Models.Coupons.update({
        status: "inactive"
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete coupon");
    }
  },
  getallsubscription: async () => {
    try {
      const res =  await adminDbController.Models.SubscriptionPlans.findAll({
        order: [['id', 'DESC']]
      });
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch subscriptions");
    }
  },
  getallcoupons: async (body) => {
    try {
      return await adminDbController.Models.Coupons.findAll({
        order: [['id', 'DESC']]
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch coupons");
    }
  },
  addcoupons: async (data) => {
    try {
      return await adminDbController.Models.Coupons.create({
        code: data.code,
        discount: data.discount,
        discount_type: data.discount_type,
        start_date: data.start_date,
        end_date: data.end_date,
        usage_limit: data.usage_limit,
        discount_value: data.discount_value,
        status: "active",
        created_at: new Date(),
        description: data.description || null
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add coupons");
    }
  },
  updatecoupons: async (data) => {
    try {
      return await adminDbController.Models.Coupons.update({
        code: data?.code,
        discount: data?.discount,
        discount_type: data?.discount_type,
        start_date: data?.start_date,
        end_date: data?.end_date,
        usage_limit: data?.usage_limit,
        discount_value: data?.discount_value,
        status: data?.status || "active",
        created_at: new Date(),
        description: data?.description || null
      }, {
        where: {
          id: data.id
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add coupons");
    }
  },
  // The client's "go live" date — appointment/store-driven dashboard
  // metrics only count activity on/after this date (NULL = all-time).
  // Deliberately NOT applied to user-status metrics (total users,
  // first-booking users, funnel, segments) — see the migration comment.
  getDashboardSettings: async () => {
    try {
      const row = await adminDbController.Models.AdminSettings.findOne({
        where: { id: 1 },
        raw: true,
      });
      return { dashboard_data_start_date: row?.dashboard_data_start_date || null };
    } catch (error) {
      console.log("🚀 ~ getDashboardSettings error:", error);
      throw Error.SomethingWentWrong("Failed to fetch dashboard settings");
    }
  },
  updateDashboardDataStartDate: async (data) => {
    try {
      await adminDbController.Models.AdminSettings.upsert({
        id: 1,
        dashboard_data_start_date: data.dashboard_data_start_date || null,
        updated_at: new Date(),
      });
      return { dashboard_data_start_date: data.dashboard_data_start_date || null };
    } catch (error) {
      console.log("🚀 ~ updateDashboardDataStartDate error:", error);
      throw Error.SomethingWentWrong("Failed to update dashboard data start date");
    }
  },

  // Free paid bookings a partner gets before they need a manual
  // subscription (AdminSettings.free_booking_limit). Raw SQL on purpose:
  // the column is deliberately not on the AdminSettings model, so the
  // model upsert in updateDashboardDataStartDate can never reset it.
  getFreeBookingLimit: async () => {
    try {
      const rows = await adminDbController.connection.query(
        `SELECT free_booking_limit FROM AdminSettings WHERE id = 1 LIMIT 1`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      const limit = rows[0]?.free_booking_limit;
      return {
        free_booking_limit:
          limit === null || limit === undefined ? DEFAULT_FREE_BOOKING_LIMIT : Number(limit),
      };
    } catch (error) {
      console.log("🚀 ~ getFreeBookingLimit error:", error);
      throw Error.SomethingWentWrong("Failed to fetch free booking limit");
    }
  },
  updateFreeBookingLimit: async (data) => {
    try {
      const raw = data?.free_booking_limit;
      const limit = Number(raw);
      const numeric = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "");
      if (!numeric || !Number.isInteger(limit)) {
        throw Error.BadRequest("free_booking_limit must be a whole number");
      }
      if (limit < 0 || limit > MAX_FREE_BOOKING_LIMIT) {
        throw Error.BadRequest(`free_booking_limit must be between 0 and ${MAX_FREE_BOOKING_LIMIT}`);
      }

      await adminDbController.connection.query(
        `
        INSERT INTO AdminSettings (id, free_booking_limit, updated_at)
        VALUES (1, :limit, NOW())
        ON DUPLICATE KEY UPDATE free_booking_limit = VALUES(free_booking_limit), updated_at = NOW()
        `,
        { replacements: { limit }, type: Sequelize.QueryTypes.INSERT }
      );

      return await adminDbController.app.getFreeBookingLimit();
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ updateFreeBookingLimit error:", error);
      throw Error.SomethingWentWrong("Failed to update free booking limit");
    }
  },

  // ── Dashboard V2 ────────────────────────────────────────────────────────
  //
  // Same metrics for every requested { key, from, to } range (see
  // dashboardRanges.js), so the client can show any period it likes and
  // compare it against any other. One query per metric group — the ranges
  // are a derived table, not a loop.
  //
  // Definitions:
  //   bookings        paid appointments (payment_status success/sucssess —
  //                   same rule as Store.total_booking_count), by booking_date
  //   cancellations   of those, the ones later cancelled or refunded
  //   revenue         SUM(discounted_amount) of completed appointments —
  //                   same basis as the V1 dashboard's total_sales
  //   cac_spend       the discount Gloup funds per booking: StoreServices
  //                   price minus what the customer was charged, 0 for
  //                   "important" services — exactly the invoice's
  //                   "Acquisition Cost" column (getInvoiceDetailsForPartner)
  //   checkout_dropoffs  appointments whose payment failed/expired
  //                   (payment_status 'failed'), by created_at
  //   total_users / total_partners / active_subscriptions
  //                   running totals as of the end of the range
  //
  // Appointment/store metrics honour dashboard_data_start_date; user and
  // subscription metrics don't (same policy as getDashboard).
  getDashboardV2Metrics: async (data = {}) => {
    try {
      const { dashboard_data_start_date: cutoff } =
        await adminDbController.app.getDashboardSettings();
      const resolved = resolveRanges(data.ranges, cutoff || null);
      const { sql: rangesSql, replacements } = rangesTableSql(resolved);
      const run = (sql, extra = {}) =>
        adminDbController.connection.query(sql, {
          replacements: { ...replacements, ...extra },
          type: Sequelize.QueryTypes.SELECT,
        });

      const [bookingRows, cacRows, dropoffRows, userRows, partnerRows, subscriptionRows] =
        await Promise.all([
          run(`
            SELECT r.k,
              COUNT(a.id) AS bookings,
              COALESCE(SUM(a.status IN ('cancelled', 'refunded')), 0) AS cancellations,
              COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.discounted_amount END), 0) AS revenue
            FROM (${rangesSql}) r
            LEFT JOIN appointments a
              ON a.booking_date >= r.f AND a.booking_date < r.e
              AND a.payment_status IN ('success', 'sucssess')
            GROUP BY r.k
          `),
          run(`
            SELECT r.k,
              COUNT(DISTINCT a.id) AS cac_bookings,
              COALESCE(SUM(
                CASE
                  WHEN ss.id IS NOT NULL THEN
                    IF(ss.important = 1, 0, GREATEST(0, ss.amount - COALESCE(ai.service_amount, 0)))
                  WHEN cb.id IS NOT NULL THEN
                    GREATEST(0, cb.amount - COALESCE(ai.service_amount, 0))
                  ELSE 0
                END
              ), 0) AS cac_spend
            FROM (${rangesSql}) r
            LEFT JOIN appointments a
              ON a.booking_date >= r.f AND a.booking_date < r.e
              AND a.payment_status IN ('success', 'sucssess')
              AND a.status NOT IN ('cancelled', 'refunded')
            LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
            LEFT JOIN StoreServices ss ON ai.service_id = ss.id
            LEFT JOIN Combo cb ON ai.combo_id = cb.id
            GROUP BY r.k
          `),
          run(`
            SELECT r.k,
              COUNT(a.id) AS checkout_dropoffs,
              COUNT(DISTINCT a.user_id) AS checkout_dropoff_users
            FROM (${rangesSql}) r
            LEFT JOIN appointments a
              ON a.created_at >= r.f AND a.created_at < r.e
              AND a.payment_status = 'failed'
            GROUP BY r.k
          `),
          run(`
            SELECT r.k,
              (SELECT COUNT(*) FROM User u
                WHERE u.status = 'active'
                  AND (u.registered_at IS NULL OR u.registered_at < r.e)) AS total_users,
              (SELECT COUNT(*) FROM User u
                WHERE u.registered_at >= r.fr AND u.registered_at < r.e) AS new_users
            FROM (${rangesSql}) r
          `),
          run(`
            SELECT r.k,
              (SELECT COUNT(*) FROM Store s
                WHERE s.status = 'active' AND s.completion_status = 'completed'
                  AND (:cutoff IS NULL OR s.createdAt >= :cutoff)
                  AND s.createdAt < r.e) AS total_partners,
              (SELECT COUNT(*) FROM Store s
                WHERE s.status = 'active' AND s.completion_status = 'completed'
                  AND s.createdAt >= r.f AND s.createdAt < r.e) AS new_partners
            FROM (${rangesSql}) r
          `, { cutoff: cutoff || null }),
          // A subscription counts as active on day d if it had started by
          // then and either is still active or was deactivated after d.
          // Rows deactivated before deactivated_at existed have no date and
          // are left out of history (see that migration).
          run(`
            SELECT r.k,
              (SELECT COUNT(*) FROM PartnerManualSubscriptions pms
                WHERE pms.activated_at <= r.d
                  AND (pms.status = 'active' OR pms.deactivated_at > r.d)) AS active_subscriptions,
              (SELECT COUNT(*) FROM PartnerManualSubscriptions pms
                WHERE pms.activated_at >= DATE(r.fr) AND pms.activated_at <= r.d) AS new_subscriptions
            FROM (${rangesSql}) r
          `),
        ]);

      const byKey = (rows) => new Map(rows.map((row) => [row.k, row]));
      const bookings = byKey(bookingRows);
      const cac = byKey(cacRows);
      const dropoffs = byKey(dropoffRows);
      const users = byKey(userRows);
      const partners = byKey(partnerRows);
      const subscriptions = byKey(subscriptionRows);
      const num = (v) => Number(v) || 0;
      const money = (v) => Number(num(v).toFixed(2));

      const result = {};
      resolved.forEach((r) => {
        const b = bookings.get(r.key) || {};
        const c = cac.get(r.key) || {};
        const d = dropoffs.get(r.key) || {};
        const u = users.get(r.key) || {};
        const p = partners.get(r.key) || {};
        const s = subscriptions.get(r.key) || {};
        // Appointment/store metrics for a range wholly before go-live are
        // unknown, not zero.
        const gated = (v) => (r.beforeDataStart ? null : v);
        const cacBookings = num(c.cac_bookings);

        result[r.key] = {
          from: r.from,
          to: r.to,
          data_from: r.beforeDataStart ? null : r.dataFrom,
          bookings: gated(num(b.bookings)),
          cancellations: gated(num(b.cancellations)),
          revenue: gated(money(b.revenue)),
          cac_spend: gated(money(c.cac_spend)),
          cac_bookings: gated(cacBookings),
          cac_per_booking: gated(cacBookings ? money(num(c.cac_spend) / cacBookings) : null),
          checkout_dropoffs: gated(num(d.checkout_dropoffs)),
          checkout_dropoff_users: gated(num(d.checkout_dropoff_users)),
          total_partners: gated(num(p.total_partners)),
          new_partners: gated(num(p.new_partners)),
          total_users: num(u.total_users),
          new_users: num(u.new_users),
          active_subscriptions: num(s.active_subscriptions),
          new_subscriptions: num(s.new_subscriptions),
        };
      });

      return { dashboard_data_start_date: cutoff || null, ranges: result };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getDashboardV2Metrics error:", error);
      throw Error.SomethingWentWrong("Failed to fetch dashboard metrics");
    }
  },

  // Point-in-time alerts for the dashboard V2 "Alerts & Insights" card.
  //   idle_salons        active salons (older than the window) with no paid
  //                      booking created in the last `idle_days` days
  //   overdue_payouts    past invoice days (store, date) with non-cancelled
  //                      bookings but no InvoicePayouts row. Looks back
  //                      `overdue_days`, never before the first payout ever
  //                      recorded (days before the payout feature existed
  //                      were never meant to be marked) or the go-live
  //                      cutoff. Amount is the invoice gross, before any
  //                      subscription deduction.
  //   subscription_dues  what active manual subscriptions owe right now
  //                      (same accrueDue maths as the invoice page)
  //   checkout_dropoffs  failed/expired payments created today
  getDashboardV2Alerts: async (data = {}) => {
    try {
      const idleDays = Math.min(Math.max(Number(data.idle_days) || 7, 1), 90);
      const overdueDays = Math.min(Math.max(Number(data.overdue_days) || 30, 1), 365);
      const today = toIstDatePart(new Date());
      const idleFrom = addDays(today, -(idleDays - 1));

      const { dashboard_data_start_date: cutoff } =
        await adminDbController.app.getDashboardSettings();
      const [firstPayout] = await adminDbController.connection.query(
        `SELECT MIN(invoice_date) AS first_date FROM InvoicePayouts`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      const firstPayoutDate = firstPayout?.first_date ? toIstDatePart(firstPayout.first_date) : null;
      const overdueFrom = [addDays(today, -overdueDays), cutoff, firstPayoutDate]
        .filter(Boolean)
        .sort()
        .pop();
      const overdueTo = addDays(today, -1);

      const [idleRows, overdueRows, subs, dropoffRows] = await Promise.all([
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS idle_salons
          FROM Store s
          WHERE s.status = 'active' AND s.completion_status = 'completed'
            AND s.createdAt < :idleFrom
            AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.store_id = s.id
                AND a.payment_status IN ('success', 'sucssess')
                AND a.created_at >= :idleFrom
            )
          `,
          { replacements: { idleFrom }, type: Sequelize.QueryTypes.SELECT }
        ),
        // Invoice gross per (store, day) — same pricing rule as
        // getInvoiceDetailsForPartner: important services at full price,
        // everything else at what the customer was charged.
        overdueFrom > overdueTo
          ? Promise.resolve([])
          : adminDbController.connection.query(
            `
            SELECT a.store_id, DATE(a.booking_date) AS invoice_date,
              SUM(
                CASE
                  WHEN ss.id IS NOT NULL AND ss.important = 1 THEN ss.amount
                  WHEN ss.id IS NOT NULL OR cb.id IS NOT NULL THEN COALESCE(ai.service_amount, 0)
                  ELSE 0
                END
              ) AS amount
            FROM appointments a
            INNER JOIN appointment_items ai ON ai.appointment_id = a.id
            LEFT JOIN StoreServices ss ON ai.service_id = ss.id
            LEFT JOIN Combo cb ON ai.combo_id = cb.id
            LEFT JOIN InvoicePayouts ip
              ON ip.store_id = a.store_id AND ip.invoice_date = DATE(a.booking_date)
            WHERE a.booking_date >= :overdueFrom AND a.booking_date < :today
              AND a.status != 'cancelled'
              AND ip.id IS NULL
            GROUP BY a.store_id, DATE(a.booking_date)
            `,
            { replacements: { overdueFrom, today }, type: Sequelize.QueryTypes.SELECT }
          ),
        adminDbController.connection.query(
          `
          SELECT store_id, plan_amount, outstanding_due, next_due_date
          FROM PartnerManualSubscriptions
          WHERE status = 'active'
          `,
          { type: Sequelize.QueryTypes.SELECT }
        ),
        adminDbController.connection.query(
          `
          SELECT COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS users
          FROM appointments
          WHERE payment_status = 'failed' AND created_at >= :today
          `,
          { replacements: { today }, type: Sequelize.QueryTypes.SELECT }
        ),
      ]);

      const overdueAmount = overdueRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      const dues = subs.map((sub) => accrueDue(sub, today).due).filter((due) => due > 0);

      return {
        date: today,
        idle_salons: { count: Number(idleRows[0]?.idle_salons) || 0, days: idleDays },
        overdue_payouts: {
          invoices: overdueRows.length,
          partners: new Set(overdueRows.map((row) => row.store_id)).size,
          amount: Number(overdueAmount.toFixed(2)),
          from_date: overdueFrom > overdueTo ? null : overdueFrom,
          to_date: overdueTo,
        },
        subscription_dues: {
          partners: dues.length,
          amount: Number(dues.reduce((sum, due) => sum + due, 0).toFixed(2)),
        },
        checkout_dropoffs: {
          attempts: Number(dropoffRows[0]?.attempts) || 0,
          users: Number(dropoffRows[0]?.users) || 0,
        },
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getDashboardV2Alerts error:", error);
      throw Error.SomethingWentWrong("Failed to fetch dashboard alerts");
    }
  },
  gettotalusers: async () => {
    try {
      return await adminDbController.Models.User.count({
        where: {
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total users");
    }
  },
  getfirstbookingusers: async () => {
    try {
      return await adminDbController.Models.User.count({
        where: {
          status: "active",
          loyalty_status: "first_booking"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch first-booking users");
    }
  },
  // Cumulative funnel: each stage is a strict subset of the one above it,
  // derived from the same paid_booking_count thresholds that drive
  // loyalty_status (0=new_user, 1=first_booking, 2-4=repeat, 5-9=loyal, 10+=vip).
  getCustomerFunnel: async () => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN loyalty_status != 'new_user' THEN 1 ELSE 0 END) AS made_booking,
          SUM(CASE WHEN loyalty_status IN ('repeat','loyal','vip') THEN 1 ELSE 0 END) AS repeat_users,
          SUM(CASE WHEN loyalty_status IN ('loyal','vip') THEN 1 ELSE 0 END) AS loyal_users,
          SUM(CASE WHEN loyalty_status = 'vip' THEN 1 ELSE 0 END) AS vip_users,
          AVG(CASE WHEN paid_booking_count > 0 THEN paid_booking_count END) AS avg_bookings_per_user
        FROM \`User\`
        WHERE status = 'active'
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const row = rows[0] || {};
      const total = Number(row.total || 0);
      const pct = (n) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);

      const stageDefs = [
        { key: "total_users", label: "Total Users", min_bookings: 0, count: total },
        { key: "made_booking", label: "Made a Booking", min_bookings: 1, count: Number(row.made_booking || 0) },
        { key: "repeat_users", label: "Repeat Users", min_bookings: 2, count: Number(row.repeat_users || 0) },
        { key: "loyal_users", label: "Loyal Customers", min_bookings: 5, count: Number(row.loyal_users || 0) },
        { key: "vip_users", label: "VIP Customers", min_bookings: 10, count: Number(row.vip_users || 0) },
      ].map((s) => ({ ...s, percentage: pct(s.count) }));

      return {
        stages: stageDefs,
        avg_bookings_per_user: row.avg_bookings_per_user != null ? Number(Number(row.avg_bookings_per_user).toFixed(1)) : 0,
      };
    } catch (error) {
      console.log("🚀 ~ getCustomerFunnel error:", error);
      throw Error.SomethingWentWrong("Failed to compute customer funnel");
    }
  },
  getAvgDaysBetweenVisits: async ({ dataStartDate } = {}) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT AVG(gap_days) AS avg_days_between_visits FROM (
          SELECT
            user_id,
            DATEDIFF(booking_date, LAG(booking_date) OVER (PARTITION BY user_id ORDER BY booking_date)) AS gap_days
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        ) t
        WHERE gap_days > 0
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );
      const value = rows[0]?.avg_days_between_visits;
      return value != null ? Number(Number(value).toFixed(1)) : 0;
    } catch (error) {
      console.log("🚀 ~ getAvgDaysBetweenVisits error:", error);
      throw Error.SomethingWentWrong("Failed to compute average days between visits");
    }
  },
  getCustomerLifetimeValue: async ({ dataStartDate } = {}) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT AVG(user_total) AS avg_clv FROM (
          SELECT user_id, SUM(amount) AS user_total
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
          GROUP BY user_id
        ) t
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );
      const value = rows[0]?.avg_clv;
      return value != null ? Number(Number(value).toFixed(2)) : 0;
    } catch (error) {
      console.log("🚀 ~ getCustomerLifetimeValue error:", error);
      throw Error.SomethingWentWrong("Failed to compute customer lifetime value");
    }
  },
  getactivebookingstoday: async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return await adminDbController.Models.appointments.count({
        where: {
          booking_date: {
            [Sequelize.Op.gte]: today,
            [Sequelize.Op.lt]: tomorrow
          },
          status: "booked"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active bookings");
    }
  },
  getcancelledrefundedorders: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.appointments.count({
        where: {
          status: {
            [Op.in]: ["cancelled", "refunded"]
          },
          ...(dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch cancelled/refunded orders");
    }
  },
  gettopsaloons: async ({ dataStartDate } = {}) => {
    try {
      let sql = `SELECT S.id, S.name, S.email, S.phone, S.images, COUNT(A.id) AS total_appointments
                   FROM Store S
                   LEFT JOIN appointments A ON S.id = A.store_id AND A.status = 'completed' || 'booked'
                     AND (:dataStartDate IS NULL OR A.booking_date >= :dataStartDate)
                   WHERE S.status = 'active'
                   GROUP BY S.id
                   ORDER BY total_appointments DESC
                   LIMIT 10`;
      return await adminDbController.connection.query(sql, {
        replacements: { dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch top saloons");
    }
  },
  gettopcategory: async () => {
    try {
      let sql = `SELECT C.id as category_name , C.name as category_name ,`;
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch top category");
    }
  },
  getaverageordervalue: async ({ dataStartDate } = {}) => {
    try {
      const dateWhere = dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {};
      const totalSales = await adminDbController.Models.appointments.sum('amount', {
        where: {
          status: "completed",
          ...dateWhere,
        }
      });
      const totalOrders = await adminDbController.Models.appointments.count({
        where: {
          status: "completed",
          ...dateWhere,
        }
      });
      return totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : 0;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch average order value");
    }
  },
  getotalsales: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.appointments.sum('discounted_amount', {
        where: {
          status: "completed",
          ...(dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total sales");
    }
  },
  getotalsalescount: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.appointments.count({
        where: {
          status: "completed",
          ...(dataStartDate ? { booking_date: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total sales count");
    }
  },
  gettotalpartner: async ({ dataStartDate } = {}) => {
    try {
      return await adminDbController.Models.Store.count({
        where: {
          status: "active",
          completion_status: "completed",
          ...(dataStartDate ? { createdAt: { [Op.gte]: dataStartDate } } : {}),
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total partners");
    }
  },
  getsalesbycategory: async ({ dataStartDate } = {}) => {
    try {
      let sql = `SELECT c.name as category_name, SUM(a.amount) as total_sales
              FROM category c
              LEFT JOIN Store s ON c.id = s.category_id
              LEFT JOIN appointments a ON s.id = a.store_id
                AND (:dataStartDate IS NULL OR a.booking_date >= :dataStartDate)
              GROUP BY c.name
              ORDER BY total_sales`;
      return await adminDbController.connection.query(sql, {
        replacements: { dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch sales by category");
    }
  },
  getgendersales: async ({ dataStartDate } = {}) => {
    try {
      let sql = `SELECT
         SUM(CASE WHEN u.gender = 'Male' THEN 1 ELSE 0 END) as total_men_count,
         SUM(CASE WHEN u.gender = 'Male' THEN a.discounted_amount ELSE 0 END) as total_men_sales,
         SUM(CASE WHEN u.gender = 'Female' THEN 1 ELSE 0 END) as total_women_count,
         SUM(CASE WHEN u.gender = 'Female' THEN a.discounted_amount ELSE 0 END) as total_women_sales
         FROM appointments a
         JOIN User u ON a.user_id = u.id
         WHERE a.status = 'completed'
           AND (:dataStartDate IS NULL OR a.booking_date >= :dataStartDate)`;
      return await adminDbController.connection.query(sql, {
        replacements: { dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get gender sales");
    }
  },
  getmonthlysales: async ({ year, dataStartDate } = {}) => {
    try {
      let sql = `SELECT DATE_FORMAT(a.booking_date, '%Y-%m') as month, SUM(a.discounted_amount) as total_sales
          FROM appointments a
          WHERE a.status = 'completed'
          AND  YEAR(a.booking_date) = :year
          AND (:dataStartDate IS NULL OR a.booking_date >= :dataStartDate)
          GROUP BY month
          ORDER BY month DESC`;
      return await adminDbController.connection.query(sql, {
        replacements: { year: year, dataStartDate: dataStartDate || null },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      //////console.log("🚀 ~ getmonthlysales:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch monthly sales");
    }
  },

  getActiveUsersNow: async (minutesThreshold = 2) => {
    try {
      const cutoff = new Date(Date.now() - minutesThreshold * 60 * 1000);
      return await adminDbController.Models.UserSession.count({
        where: {
          status: "active",
          updated_at: { [Op.gte]: cutoff },
        },
        col: "user_id",
        distinct: true,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active users");
    }
  },

  getActivePartnersNow: async (minutesThreshold = 2) => {
    try {
      const cutoff = new Date(Date.now() - minutesThreshold * 60 * 1000);
      return await adminDbController.Models.StoreSession.count({
        where: {
          status: "active",
          updated_at: { [Op.gte]: cutoff },
        },
        col: "store_id",
        distinct: true,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active partners");
    }
  },

  getNewSignupsToday: async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const sql = `SELECT
        (SELECT COUNT(*) FROM (
          SELECT user_id
          FROM UserSession
          WHERE user_id IS NOT NULL
          GROUP BY user_id
          HAVING MIN(created_at) >= :todayStart
        ) AS new_user_sessions) AS new_users,
        (SELECT COUNT(*) FROM Store WHERE createdAt >= :todayStart AND status = 'active') AS new_partners`;
      const [result] = await adminDbController.connection.query(sql, {
        replacements: { todayStart },
        type: Sequelize.QueryTypes.SELECT,
      });
      return {
        new_users: parseInt(result.new_users) || 0,
        new_partners: parseInt(result.new_partners) || 0,
      };
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch new signups");
    }
  },

  addwallet: async (id, amount) => {
    try {
      return await adminDbController.Models.User.increment({
        wallet: amount,
      }, {
        where: { id: id }
      })
    } catch (error) {
      //console.log("🚀 ~ addwallet:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to add wallet");
    }
  },
  getPartnerPaymentStatus: async (body = {}) => {
    try {
      const page = Number(body.page) || 1;
      const limit = Number(body.limit) || 10;
      const offset = (page - 1) * limit;

      const statusFilter = ['paid', 'unpaid'].includes(body.status) ? body.status : null;
      const search = body.search ? `%${body.search}%` : null;

      const baseSql = `
        FROM Store s
        LEFT JOIN (
          SELECT ps1.*
          FROM PartnerSubscriptions ps1
          INNER JOIN (
            SELECT salon_id, MAX(created_at) AS max_created
            FROM PartnerSubscriptions
            GROUP BY salon_id
          ) latest
            ON ps1.salon_id = latest.salon_id
            AND ps1.created_at = latest.max_created
        ) latestSub ON latestSub.salon_id = s.id
        LEFT JOIN PartnerSubscriptionPlans psp ON latestSub.plan_id = psp.plan_id
        LEFT JOIN (
          SELECT p1.*
          FROM PartnerSubscriptionsPayments p1
          INNER JOIN (
            SELECT subscription_id, MAX(payment_date) AS max_date
            FROM PartnerSubscriptionsPayments
            GROUP BY subscription_id
          ) latestPay
            ON p1.subscription_id = latestPay.subscription_id
            AND p1.payment_date = latestPay.max_date
        ) lastPay ON lastPay.subscription_id = latestSub.subscription_id
        WHERE s.completion_status = 'completed'
        ${search ? "AND (s.name LIKE :search OR s.email LIKE :search OR s.phone LIKE :search)" : ""}
      `;

      const selectSql = `
        SELECT
          s.id AS store_id,
          s.name AS salon_name,
          s.email,
          s.phone,
          s.is_premium,
          latestSub.subscription_id,
          latestSub.plan_id,
          psp.plan_name,
          psp.price_tag,
          psp.duration_months,
          latestSub.amount_paid,
          latestSub.payment_status AS subscription_payment_status,
          latestSub.is_active AS subscription_is_active,
          latestSub.start_date,
          latestSub.end_date,
          latestSub.current_start,
          latestSub.current_end,
          latestSub.charge_at,
          latestSub.rzp_status,
          lastPay.payment_status AS last_payment_status,
          lastPay.amount AS last_payment_amount,
          lastPay.payment_method AS last_payment_method,
          lastPay.payment_date AS last_payment_date,
          lastPay.transaction_id AS last_transaction_id,
          CASE
            WHEN latestSub.payment_status = 'paid' AND latestSub.is_active = 1 THEN 'paid'
            ELSE 'unpaid'
          END AS paid_status
        ${baseSql}
      `;

      const wrappedSql = `
        SELECT * FROM (${selectSql}) t
        ${statusFilter ? "WHERE t.paid_status = :statusFilter" : ""}
        ORDER BY t.salon_name ASC
        LIMIT :limit OFFSET :offset
      `;

      const countSql = `
        SELECT COUNT(*) AS totalCount FROM (${selectSql}) t
        ${statusFilter ? "WHERE t.paid_status = :statusFilter" : ""}
      `;

      const summarySql = `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN t.paid_status = 'paid' THEN 1 ELSE 0 END) AS paid,
          SUM(CASE WHEN t.paid_status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid
        FROM (${selectSql}) t
      `;

      const replacements = { limit, offset };
      if (search) replacements.search = search;
      if (statusFilter) replacements.statusFilter = statusFilter;

      const [rows, countResult, summaryResult] = await Promise.all([
        adminDbController.connection.query(wrappedSql, { replacements, type: Sequelize.QueryTypes.SELECT }),
        adminDbController.connection.query(countSql, { replacements, type: Sequelize.QueryTypes.SELECT }),
        adminDbController.connection.query(summarySql, { replacements: search ? { search } : {}, type: Sequelize.QueryTypes.SELECT }),
      ]);

      return {
        rows,
        totalCount: countResult?.[0]?.totalCount || 0,
        summary: {
          total: summaryResult?.[0]?.total || 0,
          paid: summaryResult?.[0]?.paid || 0,
          unpaid: summaryResult?.[0]?.unpaid || 0,
        },
      };
    } catch (error) {
      console.log("🚀 ~ getPartnerPaymentStatus DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner payment status");
    }
  },
  addnotificationlogsadmin: async (data) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.create({
        store_id: data?.store_id || null,
        notification_type: data?.notification_type || null,
        sent_to: data?.sent_to || null,
        loyalty_status: data?.loyalty_status || null,
        date: new Date(),
        title: data?.title || null,
        description: data?.description || null,
      })
    } catch (error) {
      console.error("addnotificationlogsadmin error:", error?.parent?.sqlMessage || error.message)
      throw Error.SomethingWentWrong("Failed to add notification logs");
    }
  },
 getnotificationbyid: async (id) => {
  try {

    const notificationId = id.id;

    // 1️⃣ Get main notification
    const notification = await adminDbController.Models.Adminnotificationlogs.findOne({
      where: { id: notificationId }
    });

    if (!notification) return null;

    // 2️⃣ Get Success Count
    const successCount = await adminDbController.Models.SentNotificationDevices.count({
      where: { notification_id: notificationId }
    });

    // 3️⃣ Get Failed Count
    const failedCount = await adminDbController.Models.FailedNotificationTokens.count({
      where: { notification_id: notificationId }
    });

    // 4️⃣ Get Failed Details with user info
      let sql = `SELECT FNT.token, FNT.error_code, FNT.user_id, u.firstname, u.lastname, u.email
      FROM FailedNotificationTokens FNT
      LEFT JOIN User u ON FNT.user_id = u.id
      WHERE FNT.notification_id = :notificationId`;

      const failedDetails = await adminDbController.connection.query(sql, {
        replacements: { notificationId },
        type: Sequelize.QueryTypes.SELECT,
      });


    const formattedFailedDetails = failedDetails.map(item => ({
      token: item.token,
      error_code: item.error_code,
      user_id: item.user_id,
      firstname: item.firstname || null,
      lastname: item.lastname || null,
      email: item.email || null
    }));
    return {
      notification,
      total_sent: successCount + failedCount,
      success_count: successCount,
      failed_count: failedCount,
      failed_details: formattedFailedDetails
    };

  } catch (error) {
    throw Error.SomethingWentWrong("Failed to fetch notification report");
  }
},
  getappointmentbyid: async (id) => {
    try {
      return await adminDbController.Models.appointments.findOne({
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch appointment by ID");
    }
  },
  updaterefundrequest: async (data) => {
    try {
      return await adminDbController.Models.refund_requests.update(
        { status: data.status },
        { where: { id: data.id } }
      )
    } catch (error) {
      //console.log("🚀 ~ updaterefundrequest:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to update refund requests");
    }
  },
  getrefundrequests: async (body) => {
    try {
      return await adminDbController.Models.refund_requests.findOne({
        where: {
          status: "pending",
          id: body.id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund requests");
    }
  },
  getallpartnerdeviceId: async () => {
    try {
      const res = await adminDbController.Models.Store.findAll({
        where: {
          status: "active",
          deviceId: {
            [Op.ne]: null
          }
        },
        attributes: [
          ['deviceId', 'deviceId'],
          ['id', 'partner_id'],
          ['images', 'images']
        ]
      })
      return res;
    } catch (error) {
      //console.log("🚀 ~ getallpartnerdeviceId:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch partners device ID");
    }
  },
saveFailedNotificationTokens: async (failedTokens) => {
  try {

    if (!failedTokens.length) return true;

    await adminDbController.Models.FailedNotificationTokens.bulkCreate(
      failedTokens.map(item => ({
        token: item.token,
        user_id: item.user_id,
        partner_id: item.partner_id,
        notification_id: item.notification_id,
        error_code: item.error,
        created_at: item.date
      }))
    );

    return true;

  } catch (error) {
    console.error("Error saving failed tokens:", error);
    return false;
  }
},
saveSuccessfulNotificationTokens: async (successTokens) => {
  try {

    if (!successTokens.length) return true;

    await adminDbController.Models.SentNotificationDevices.bulkCreate(
      successTokens.map(item => ({
        token: item.token,
        user_id: item.user_id,
        partner_id: item.partner_id,
        notification_id: item.notification_id,
        notification_title: item.title,
        notification_description: item.description,
        created_at: item.date
      }))
    );

    return true;

  } catch (error) {
    console.error("Error saving success tokens:", error);
    return false;
  }
},
  getallusersdeviceId: async (loyaltyStatuses) => {
    try {
      const where = {
        status: "active",
        device_id: {
          [Op.ne]: null
        }
      };

      if (Array.isArray(loyaltyStatuses) && loyaltyStatuses.length > 0) {
        where.loyalty_status = { [Op.in]: loyaltyStatuses };
      }

      const res = await adminDbController.Models.User.findAll({
        where,
        attributes: [
          ['device_id', 'device_id'],
          ['id', 'user_id'],
          ['profilePic', 'profilePic'],
          ['loyalty_status', 'loyalty_status'],
        ]
      })
      return res;

    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users device ID");
    }
  },
  /**
   * Active users for loyalty-targeted broadcasts.
   * Includes users without FCM tokens so in-app logs are still created.
   */
  getUsersByLoyaltyStatus: async (loyaltyStatuses) => {
    try {
      const where = { status: "active" };
      if (Array.isArray(loyaltyStatuses) && loyaltyStatuses.length > 0) {
        where.loyalty_status = { [Op.in]: loyaltyStatuses };
      }
      return await adminDbController.Models.User.findAll({
        where,
        attributes: [
          ["device_id", "device_id"],
          ["id", "user_id"],
          ["profilePic", "profilePic"],
          ["loyalty_status", "loyalty_status"],
        ],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users by loyalty status");
    }
  },
  getLoyaltyStatusCounts: async () => {
    try {
      const rows = await adminDbController.Models.User.findAll({
        attributes: [
          "loyalty_status",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        ],
        where: { status: "active" },
        group: ["loyalty_status"],
        raw: true,
      });
      const tiers = ["new_user", "first_booking", "repeat", "loyal", "vip"];
      const byStatus = Object.fromEntries(tiers.map((t) => [t, 0]));
      for (const row of rows) {
        if (row.loyalty_status in byStatus) {
          byStatus[row.loyalty_status] = Number(row.count) || 0;
        }
      }
      return {
        tiers: byStatus,
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      };
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch loyalty status counts");
    }
  },
  // Dashboard "Customer Segments" donut — reuses getLoyaltyStatusCounts,
  // folds new_user+first_booking into one "New User" bucket (mockup only
  // has 5 labeled slots; a single-booking customer hasn't repeated yet),
  // and adds an "Inactive" bucket from User.status (separate from
  // loyalty_status) so every account is counted exactly once.
  getCustomerSegments: async () => {
    try {
      const { tiers, total: activeTotal } = await adminDbController.app.getLoyaltyStatusCounts();
      const inactiveCount = await adminDbController.Models.User.count({
        where: { status: "inactive" },
      });

      const segmentDefs = [
        { key: "new_user", label: "New User", count: tiers.new_user + tiers.first_booking, color: "#10B981" },
        { key: "repeat_user", label: "Repeat User", count: tiers.repeat, color: "#3B82F6" },
        { key: "loyal_user", label: "Loyal User", count: tiers.loyal, color: "#F59E0B" },
        { key: "vip_user", label: "VIP User", count: tiers.vip, color: "#EF4444" },
        { key: "inactive", label: "Inactive", count: inactiveCount, color: "#9CA3AF" },
      ];

      const grandTotal = activeTotal + inactiveCount;
      const segments = segmentDefs.map((s) => ({
        ...s,
        percentage: grandTotal > 0 ? Number(((s.count / grandTotal) * 100).toFixed(1)) : 0,
      }));

      return { segments, total: grandTotal };
    } catch (error) {
      console.log("🚀 ~ getCustomerSegments error:", error);
      throw Error.SomethingWentWrong("Failed to compute customer segments");
    }
  },
  // % of each month's bookers who had already booked before (repeat rate),
  // last 6 months, zero-filled. Uses ROW_NUMBER() per user ordered by
  // booking_date to determine which bookings are a user's 2nd-or-later.
  getRepeatBookingRateByMonth: async ({ dataStartDate } = {}) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT month, SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END) AS repeat_count, COUNT(*) AS total_count
        FROM (
          SELECT
            user_id,
            DATE_FORMAT(booking_date, '%Y-%m-01') AS month,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY booking_date) AS rn
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        ) t
        WHERE month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
        GROUP BY month
        ORDER BY month
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );

      const byMonth = new Map(
        rows.map((r) => [
          r.month.slice(0, 7),
          r.total_count > 0 ? Number(((r.repeat_count / r.total_count) * 100).toFixed(1)) : 0,
        ])
      );

      return buildLastNMonths(6).map((month) => ({
        month,
        repeat_rate: byMonth.get(month) || 0,
      }));
    } catch (error) {
      console.log("🚀 ~ getRepeatBookingRateByMonth error:", error);
      throw Error.SomethingWentWrong("Failed to compute repeat booking rate by month");
    }
  },
  // 6-month trend series backing the dashboard's sparkline stat cards.
  getDashboardTrends: async ({ dataStartDate } = {}) => {
    try {
      const monthFloor = `DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')`;

      // User has no signup-date column at all (timestamps: false on the
      // model) — there is genuinely no way to compute "new signups per
      // month". Using distinct active bookers per month instead (real data,
      // from appointments.booking_date) rather than fabricating a trend.
      const usersRows = await adminDbController.connection.query(
        `
        SELECT DATE_FORMAT(booking_date, '%Y-%m') AS month, COUNT(DISTINCT user_id) AS value
        FROM appointments
        WHERE status = 'completed' AND booking_date >= ${monthFloor}
          AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        GROUP BY month
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );

      const bookingRows = await adminDbController.connection.query(
        `
        SELECT
          month,
          SUM(CASE WHEN rn = 1 THEN 1 ELSE 0 END) AS first_time_value,
          SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END) AS repeat_value,
          COUNT(*) AS bookings_value
        FROM (
          SELECT
            user_id,
            DATE_FORMAT(booking_date, '%Y-%m') AS month,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY booking_date) AS rn
          FROM appointments
          WHERE status = 'completed'
            AND (:dataStartDate IS NULL OR booking_date >= :dataStartDate)
        ) t
        WHERE month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m')
        GROUP BY month
        `,
        { replacements: { dataStartDate: dataStartDate || null }, type: Sequelize.QueryTypes.SELECT }
      );

      const usersByMonth = new Map(usersRows.map((r) => [r.month, Number(r.value) || 0]));
      const firstTimeByMonth = new Map(bookingRows.map((r) => [r.month, Number(r.first_time_value) || 0]));
      const repeatByMonth = new Map(bookingRows.map((r) => [r.month, Number(r.repeat_value) || 0]));
      const bookingsByMonth = new Map(bookingRows.map((r) => [r.month, Number(r.bookings_value) || 0]));

      const months = buildLastNMonths(6);
      const seriesFrom = (map) => months.map((month) => ({ month, value: map.get(month) || 0 }));

      return {
        users_by_month: seriesFrom(usersByMonth),
        first_time_by_month: seriesFrom(firstTimeByMonth),
        repeat_by_month: seriesFrom(repeatByMonth),
        bookings_by_month: seriesFrom(bookingsByMonth),
      };
    } catch (error) {
      console.log("🚀 ~ getDashboardTrends error:", error);
      throw Error.SomethingWentWrong("Failed to compute dashboard trends");
    }
  },
  getUserByIdForNotification: async (userId) => {
    try {
      return await adminDbController.Models.User.findOne({
        where: { id: userId },
        attributes: ["id", "device_id", "firstname", "lastname", "status"],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user");
    }
  },
  getStoreByIdForNotification: async (storeId) => {
    try {
      return await adminDbController.Models.Store.findOne({
        where: { id: storeId },
        attributes: ["id", "deviceId", "name", "status"],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch partner");
    }
  },
  deletereview: async (data, id) => {
    try {
      return await adminDbController.Models.Reviews.update({
        status: "inactive",
      }, {
        where: { id: data.review_id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete review");
    }
  },
  updatereviewdeleterequest: async (data) => {
    try {
      return await adminDbController.Models.review_delete_requests.update(
        { status: data.status },
        { where: { id: data.id } },
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update review delete request");
    }
  },
  getreviewrequest: async (body) => {
    try {
      let sql = `SELECT S.name as store_name, S.email as store_email, u.firstname as user_firstname, u.lastname as user_lastname, R.review_description, R.rating, RD.* FROM review_delete_requests RD
         JOIN Reviews R ON RD.review_id = R.id
         JOIN User u ON R.user_id = u.id
         JOIN Store S ON R.store_id = S.id
         WHERE RD.status = 'pending'
         ORDER BY RD.id DESC`;
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      //console.log("🚀 ~ getreviewrequest:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch review requests");
    }
  },
  getallreviews: async (body = {}) => {
    try {
      const { store_id, status } = body;
      const replacements = {};
      let reviewWhere = "WHERE 1=1";
      let summaryWhere = "WHERE 1=1";

      if (store_id) {
        reviewWhere += " AND R.store_id = :store_id";
        summaryWhere += " AND R.store_id = :store_id";
        replacements.store_id = store_id;
      }

      if (status && status !== "all") {
        reviewWhere += " AND R.status = :status";
        summaryWhere += " AND R.status = :status";
        replacements.status = status;
      }

      const reviewsSql = `
        SELECT
          R.id AS review_id,
          R.rating,
          R.review_description,
          R.status AS review_status,
          R.cretaed_at,
          R.updated_at,
          R.store_id,
          S.name AS store_name,
          S.email AS store_email,
          S.phone AS store_phone,
          U.id AS user_id,
          U.firstname AS user_firstname,
          U.lastname AS user_lastname,
          U.phone AS user_phone,
          U.email AS user_email
        FROM Reviews R
        INNER JOIN Store S ON R.store_id = S.id
        INNER JOIN User U ON R.user_id = U.id
        ${reviewWhere}
        ORDER BY R.cretaed_at DESC
        LIMIT 1000
      `;

      const summarySql = `
        SELECT
          R.store_id,
          S.name AS store_name,
          S.email AS store_email,
          S.phone AS store_phone,
          ROUND(AVG(R.rating), 2) AS average_rating,
          COUNT(R.id) AS review_count
        FROM Reviews R
        INNER JOIN Store S ON R.store_id = S.id
        ${summaryWhere}
        GROUP BY R.store_id, S.name, S.email, S.phone
        ORDER BY average_rating DESC, review_count DESC
      `;

      const [reviews, salonSummaries] = await Promise.all([
        adminDbController.connection.query(reviewsSql, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
        adminDbController.connection.query(summarySql, {
          replacements,
          type: Sequelize.QueryTypes.SELECT,
        }),
      ]);

      return { reviews, salonSummaries };
    } catch (error) {
      console.log("🚀 ~ getallreviews error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salon reviews");
    }
  },
  getrefundrequest: async (body) => {
    try {
      let sql = `SELECT r.*, a.razorpay_id, a.payment.id , a.amount as discounted_amount, u.firstname as user_firstname, u.lastname as user_lastname, u.phone as user_phone, s.name as store_name, s.email as store_email, s.phone as store_phone FROM refund_request r JOIN s ON a.store_id = s.id JOIN User u ON a.user_id = u.id WHERE r.status = 'pending' ORDER BY r.created_at DESC`;

      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund request");
    }
  },
  deletebanner: async (data) => {
    try {
      return await adminDbController.Models.Banner.update({
        status: "inactive",
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete banner");
    }
  },
  // Rejecting a refund request also cancels the booking — but the "booking
  // cancelled" WhatsApp message is deferred 10 minutes (cancel_notify_at)
  // instead of sent here, giving an admin a window to fix a mis-click.
  // See CronHelper.scheduleCancelledBookingNotify, which re-checks the row
  // is still 'rejected' before actually sending.
  updaterequest: async (data) => {
    try {
      const updates = { status: data.status };
      if (data.status === "rejected") {
        updates.cancel_notify_at = Sequelize.literal("DATE_ADD(NOW(), INTERVAL 10 MINUTE)");
      }
      return await adminDbController.Models.refund_requests.update(updates, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update request");
    }
  },

  // Rejected requests whose 10-minute delay has elapsed and haven't been
  // notified yet. Requiring status = 'rejected' here is what makes an
  // "undo" (anything that moves the row off 'rejected' in the meantime)
  // silently cancel the pending send — there's nothing left to match.
  getDueCancelBookingNotifications: async () => {
    try {
      return await adminDbController.connection.query(
        `
        SELECT id, appointment_id
        FROM refund_requests
        WHERE status = 'rejected'
          AND cancel_notify_at IS NOT NULL
          AND cancel_notify_at <= NOW()
          AND cancel_notified_at IS NULL
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch due cancel-booking notifications");
    }
  },

  markCancelNotificationSent: async (id) => {
    try {
      return await adminDbController.Models.refund_requests.update(
        { cancel_notified_at: Sequelize.literal("NOW()") },
        { where: { id } }
      );
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to mark cancel notification sent");
    }
  },
  getbanners: async (body) => {
    try {
      const sql = `
      SELECT 
        b.*,
        s.name AS store_name,
        s.email AS store_email,
        s.phone AS store_phone
      FROM Banner b
      LEFT JOIN Store s 
        ON b.store_id = s.id
      WHERE b.status = 'active'
      ORDER BY b.date DESC
    `;
      const banners = await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
      return banners;
    } catch (error) {
      console.log("🚀 ~ getbanners error:", error);
      throw Error.SomethingWentWrong("Failed to fetch banners");
    }
  },

  addbanner: async (data, file) => {
    console.log("🚀 ~ data:", data)
    try {
      return await adminDbController.Models.Banner.create({
        store_id: data?.store_id || null,
        image: file,
        status: "active",
        date: new Date(),
        type: data?.type,
        place: data?.place,
        issub: data?.issub || false
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to add banner");
    }
  },
  getBookings: async (data) => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      return await adminDbController.Models.appointments.findAll({
        where: {
          status: 'booked',
          booking_date: {
            [Op.between]: [startOfDay, endOfDay]
          }
        },
        raw: true
      });
    } catch (error) {
      console.log("🚀 ~ getBookings DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch bookings");
    }
  },
  getCancelledOrders: async (data) => {
    try {
      return await adminDbController.Models.appointments.findAll({
        where: {
          status: 'cancelled',
        },
        raw: true,
      })
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to get cancelled orders")
    }
  },
  // booking_datetime here and in getBookingsDetailsByOrderDate/ById is the
  // appointment day + the booked slot's start: booking_date itself is
  // date-only and reads as 05:30 IST.
  getBookingsDetails: async (data) => {
  try {
    const page = Number(data.page) || 1;
    const limit = Number(data.limit) || 10;
    const offset = (page - 1) * limit;
    
    const dateFilter = (data.fromDate && data.toDate) ? `AND DATE(a.created_at) BETWEEN :fromDate AND :toDate` : '';
    const statusFilter = data.status ? `AND a.status = :status` : '';

    const query = `
      SELECT DISTINCT
        a.id,
        a.created_at,
        a.booking_date,
        c.firstname AS user_name,
        d.name AS salon_name,
        a.status,
        a.payment_status,
        CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), IFNULL(CONCAT(' ', TIME_FORMAT(e.\`from\`, '%H:%i')), '')) AS booking_datetime,
        a.amount AS service_amount,
        a.discounted_amount AS discount_amount,
        (a.amount - a.discounted_amount) AS subtotal,
        (a.discounted_amount) + ROUND(((a.discounted_amount) * a.gst / 100), 2) AS payable_amount,
        DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date
      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
      LEFT JOIN Slots e ON a.slot_id = e.id
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT :limit OFFSET :offset
    `;

    const replacements = {
      limit,
      offset
    };
    if (data.fromDate && data.toDate) {
      replacements.fromDate = data.fromDate;
      replacements.toDate = data.toDate;
    }
    if (data.status) {
      replacements.status = data.status;
    }

    const rows = await adminDbController.connection.query(query, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    const totalQuery = `
      SELECT COUNT(DISTINCT a.id) AS totalCount
      FROM appointments a
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
    `;

    const totalResult = await adminDbController.connection.query(totalQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    return {
      rows: rows || [],
      totalCount: totalResult?.[0]?.totalCount || 0,
    };
  } catch (error) {
    console.log("🚀 ~ getBookingsDetails DB error:", error);
    throw Error.SomethingWentWrong("Failed to fetch booking details");
  }
},
// Same as getBookingsDetails, but filters by appointment/order date (a.booking_date) instead of created_at
getBookingsDetailsByOrderDate: async (data) => {
  try {
    const page = Number(data.page) || 1;
    const limit = Number(data.limit) || 10;
    const offset = (page - 1) * limit;

    const dateFilter = (data.fromDate && data.toDate) ? `AND DATE(a.booking_date) BETWEEN :fromDate AND :toDate` : '';
    const statusFilter = data.status ? `AND a.status = :status` : '';

    const query = `
      SELECT DISTINCT
        a.id,
        a.created_at,
        a.booking_date,
        c.firstname AS user_name,
        d.name AS salon_name,
        a.status,
        a.payment_status,
        CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), IFNULL(CONCAT(' ', TIME_FORMAT(e.\`from\`, '%H:%i')), '')) AS booking_datetime,
        a.amount AS service_amount,
        a.discounted_amount AS discount_amount,
        (a.amount - a.discounted_amount) AS subtotal,
        (a.discounted_amount) + ROUND(((a.discounted_amount) * a.gst / 100), 2) AS payable_amount,
        DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date
      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
      LEFT JOIN Slots e ON a.slot_id = e.id
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
      ORDER BY a.booking_date DESC, a.id DESC
      LIMIT :limit OFFSET :offset
    `;

    const replacements = {
      limit,
      offset
    };
    if (data.fromDate && data.toDate) {
      replacements.fromDate = data.fromDate;
      replacements.toDate = data.toDate;
    }
    if (data.status) {
      replacements.status = data.status;
    }

    const rows = await adminDbController.connection.query(query, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    const totalQuery = `
      SELECT COUNT(DISTINCT a.id) AS totalCount
      FROM appointments a
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
    `;

    const totalResult = await adminDbController.connection.query(totalQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    });

    return {
      rows: rows || [],
      totalCount: totalResult?.[0]?.totalCount || 0,
    };
  } catch (error) {
    console.log("🚀 ~ getBookingsDetailsByOrderDate DB error:", error);
    throw Error.SomethingWentWrong("Failed to fetch booking details by order date");
  }
},
// ── Bookings list V2 (admin "Bookings by Order Date" V2 page) ─────────────
//
// Same rows as getBookingsDetailsByOrderDate (V1 keeps using that one,
// untouched), plus what the V2 table shows: customer phone, salon area/city,
// slot time, service names and their service categories ("booking type").
// Search, payment and booking-type filters run in SQL so they work across
// every page, not just the one loaded.
//
// Joins mirror the partner app: slot time via appointments.slot_id -> Slots
// (getTodayBookingsByStoreId), services via appointment_items -> StoreServices
// / Combo (getservicebyappoinment), category via service_category ->
// Servicecategory. User/Store are LEFT JOINed so the total matches V1's
// count of every appointment in the range.
getBookingsListV2: async (data = {}) => {
  try {
    const where = [];
    const replacements = {};
    const addWhere = (sql, values = {}) => {
      where.push(sql);
      Object.assign(replacements, values);
    };

    const { dateColumn } = bookingListDateBasis(data.date_basis);
    if (data.fromDate || data.toDate) {
      if (!isValidDate(String(data.fromDate || "")) || !isValidDate(String(data.toDate || ""))) {
        throw Error.BadRequest("fromDate and toDate must be YYYY-MM-DD");
      }
      if (data.fromDate > data.toDate) {
        throw Error.BadRequest("fromDate must not be after toDate");
      }
      addWhere(`a.${dateColumn} >= :fromDate AND a.${dateColumn} < :toDateEnd`, {
        fromDate: data.fromDate,
        toDateEnd: addDays(data.toDate, 1),
      });
    }

    if (data.status) {
      if (!BOOKING_STATUSES.includes(data.status)) {
        throw Error.BadRequest(`status must be one of: ${BOOKING_STATUSES.join(", ")}`);
      }
      addWhere("a.status = :status", { status: data.status });
    }

    if (data.payment) {
      const paymentSql = BOOKING_PAYMENT_FILTERS[data.payment];
      if (!paymentSql) {
        throw Error.BadRequest(`payment must be one of: ${Object.keys(BOOKING_PAYMENT_FILTERS).join(", ")}`);
      }
      addWhere(paymentSql);
    }

    if (data.service_category_id !== undefined && data.service_category_id !== null && data.service_category_id !== "") {
      const categoryId = Number(data.service_category_id);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        throw Error.BadRequest("service_category_id must be a positive whole number");
      }
      addWhere(
        `EXISTS (
          SELECT 1 FROM appointment_items fi
          LEFT JOIN StoreServices fss ON fi.service_id = fss.id
          LEFT JOIN Combo fcb ON fi.combo_id = fcb.id
          WHERE fi.appointment_id = a.id
            AND COALESCE(fss.service_category, fcb.service_category) = :categoryId
        )`,
        { categoryId }
      );
    }

    const search = String(data.search || "").trim().replace(/^#/, "");
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const conditions = [
        "CONCAT_WS(' ', c.firstname, c.lastname) LIKE :searchLike",
        "c.phone LIKE :searchLike",
        "c.email LIKE :searchLike",
        "d.name LIKE :searchLike",
      ];
      const searchValues = { searchLike: like };
      if (/^\d+$/.test(search)) {
        conditions.unshift("a.id = :searchId");
        searchValues.searchId = Number(search);
      }
      addWhere(`(${conditions.join(" OR ")})`, searchValues);
    }

    const page = Math.max(1, Number(data.page) || 1);
    const limit = Math.min(Math.max(1, Number(data.limit) || 10), BOOKING_LIST_MAX_LIMIT);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromSql = `
      FROM appointments a
      LEFT JOIN User c ON a.user_id = c.id
      LEFT JOIN Store d ON a.store_id = d.id
      LEFT JOIN PartnerAddress f ON d.address_id = f.id
      LEFT JOIN Slots e ON a.slot_id = e.id
      ${whereSql}
    `;

    const [rows, totalRows] = await Promise.all([
      adminDbController.connection.query(
        `
        SELECT
          a.id,
          a.created_at,
          DATE_FORMAT(a.booking_date, '%Y-%m-%d') AS booking_date,
          a.status,
          a.payment_status,
          a.amount,
          a.discounted_amount,
          ROUND(a.discounted_amount * a.gst / 100, 2) AS gst_amount,
          a.discounted_amount + ROUND(a.discounted_amount * a.gst / 100, 2) AS payable_amount,
          c.id AS user_id,
          TRIM(CONCAT_WS(' ', c.firstname, c.lastname)) AS user_name,
          c.phone AS user_phone,
          d.id AS salon_id,
          d.name AS salon_name,
          f.area AS salon_area,
          f.city AS salon_city,
          e.\`from\` AS slot_from,
          e.\`to\` AS slot_to,
          (
            SELECT GROUP_CONCAT(COALESCE(ss.service_name, cb.combo) ORDER BY si.id SEPARATOR '||')
            FROM appointment_items si
            LEFT JOIN StoreServices ss ON si.service_id = ss.id
            LEFT JOIN Combo cb ON si.combo_id = cb.id
            WHERE si.appointment_id = a.id
          ) AS services,
          (
            SELECT GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR '||')
            FROM appointment_items ci
            LEFT JOIN StoreServices css ON ci.service_id = css.id
            LEFT JOIN Combo ccb ON ci.combo_id = ccb.id
            INNER JOIN Servicecategory sc ON sc.id = COALESCE(css.service_category, ccb.service_category)
            WHERE ci.appointment_id = a.id
          ) AS service_categories
        ${fromSql}
        ORDER BY a.${dateColumn} DESC, a.id DESC
        LIMIT :limit OFFSET :offset
        `,
        {
          replacements: { ...replacements, limit, offset: (page - 1) * limit },
          type: Sequelize.QueryTypes.SELECT,
        }
      ),
      adminDbController.connection.query(
        `SELECT COUNT(*) AS total ${fromSql}`,
        { replacements, type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    const split = (value) => (value ? String(value).split("||").filter(Boolean) : []);
    return {
      rows: rows.map((row) => ({
        ...row,
        amount: Number(row.amount) || 0,
        discounted_amount: Number(row.discounted_amount) || 0,
        gst_amount: Number(row.gst_amount) || 0,
        payable_amount: Number(row.payable_amount) || 0,
        services: split(row.services),
        service_categories: split(row.service_categories),
      })),
      total: Number(totalRows[0]?.total) || 0,
      page,
      limit,
    };
  } catch (error) {
    if (error.status) throw error;
    console.log("🚀 ~ getBookingsListV2 error:", error);
    throw Error.SomethingWentWrong("Failed to fetch bookings");
  }
},

// Salons ranked by revenue for a date range (bookings page "Top Performing
// Salon"). Same definitions as the dashboard V2: bookings = paid
// appointments, revenue = discounted_amount of completed ones.
getTopSalonsByDateRange: async (data = {}) => {
  try {
    if (!isValidDate(String(data.fromDate || "")) || !isValidDate(String(data.toDate || ""))) {
      throw Error.BadRequest("fromDate and toDate must be YYYY-MM-DD");
    }
    if (data.fromDate > data.toDate) {
      throw Error.BadRequest("fromDate must not be after toDate");
    }
    const { dateColumn } = bookingListDateBasis(data.date_basis);
    const limit = Math.min(Math.max(1, Number(data.limit) || 1), 20);

    const rows = await adminDbController.connection.query(
      `
      SELECT
        d.id AS salon_id,
        d.name AS salon_name,
        f.area AS salon_area,
        f.city AS salon_city,
        COUNT(a.id) AS bookings,
        COALESCE(SUM(CASE WHEN a.status = 'completed' THEN a.discounted_amount END), 0) AS revenue
      FROM appointments a
      INNER JOIN Store d ON a.store_id = d.id
      LEFT JOIN PartnerAddress f ON d.address_id = f.id
      WHERE a.${dateColumn} >= :fromDate AND a.${dateColumn} < :toDateEnd
        AND a.payment_status IN ('success', 'sucssess')
      GROUP BY d.id, d.name, f.area, f.city
      ORDER BY revenue DESC, bookings DESC, d.id ASC
      LIMIT :limit
      `,
      {
        replacements: { fromDate: data.fromDate, toDateEnd: addDays(data.toDate, 1), limit },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    return rows.map((row) => ({
      ...row,
      bookings: Number(row.bookings) || 0,
      revenue: Number(Number(row.revenue || 0).toFixed(2)),
    }));
  } catch (error) {
    if (error.status) throw error;
    console.log("🚀 ~ getTopSalonsByDateRange error:", error);
    throw Error.SomethingWentWrong("Failed to fetch top salons");
  }
},
// Revenue + booking-hour summary for the bookings V2 page.
//   revenue            invoice rule (getInvoiceDetailsForPartner /
//                      ...Monthly): every non-cancelled appointment in the
//                      range, each item priced at the full service price if
//                      the service is "important", otherwise at what was
//                      charged (appointment_items.service_amount); items with
//                      no service/combo are skipped; no GST. Summed over all
//                      salons it equals the sum of their invoices.
//   invoiced_bookings  appointments that contributed to revenue
//   avg_order_value    revenue / invoiced_bookings
//   today              the same revenue rule for appointments dated today
//   booking_hours      24 counts: paid bookings in the range by the hour
//                      they were placed (created_at, stored in IST)
getBookingsSummaryV2: async (data = {}) => {
  try {
    if (!isValidDate(String(data.fromDate || "")) || !isValidDate(String(data.toDate || ""))) {
      throw Error.BadRequest("fromDate and toDate must be YYYY-MM-DD");
    }
    if (data.fromDate > data.toDate) {
      throw Error.BadRequest("fromDate must not be after toDate");
    }
    const { dateColumn } = bookingListDateBasis(data.date_basis);
    const today = toIstDatePart(new Date());

    const revenueFor = (column, from, to) =>
      adminDbController.connection.query(
        `
        SELECT
          COUNT(DISTINCT a.id) AS invoiced_bookings,
          COALESCE(SUM(${INVOICE_ITEM_AMOUNT_SQL}), 0) AS revenue
        FROM appointments a
        INNER JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ai.service_id = ss.id
        LEFT JOIN Combo cb ON ai.combo_id = cb.id
        WHERE a.${column} >= :fromDate AND a.${column} < :toDateEnd
          AND a.status <> 'cancelled'
          AND (ss.id IS NOT NULL OR cb.id IS NOT NULL)
        `,
        {
          replacements: { fromDate: from, toDateEnd: addDays(to, 1) },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

    const [[range], [todayRow], hourRows] = await Promise.all([
      revenueFor(dateColumn, data.fromDate, data.toDate),
      // Invoices are per appointment day, so "today" is always by booking_date.
      revenueFor("booking_date", today, today),
      adminDbController.connection.query(
        `
        SELECT HOUR(a.created_at) AS hour, COUNT(*) AS bookings
        FROM appointments a
        WHERE a.${dateColumn} >= :fromDate AND a.${dateColumn} < :toDateEnd
          AND a.payment_status IN ('success', 'sucssess')
          AND a.created_at IS NOT NULL
        GROUP BY HOUR(a.created_at)
        `,
        {
          replacements: { fromDate: data.fromDate, toDateEnd: addDays(data.toDate, 1) },
          type: Sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const money = (v) => Number(Number(v || 0).toFixed(2));
    const summarize = (row) => {
      const revenue = money(row?.revenue);
      const invoiced = Number(row?.invoiced_bookings) || 0;
      return {
        revenue,
        invoiced_bookings: invoiced,
        avg_order_value: invoiced ? money(revenue / invoiced) : null,
      };
    };

    const bookingHours = Array(24).fill(0);
    hourRows.forEach((row) => {
      const hour = Number(row.hour);
      if (hour >= 0 && hour < 24) bookingHours[hour] = Number(row.bookings) || 0;
    });

    return {
      from: data.fromDate,
      to: data.toDate,
      ...summarize(range),
      today: { date: today, ...summarize(todayRow) },
      booking_hours: bookingHours,
    };
  } catch (error) {
    if (error.status) throw error;
    console.log("🚀 ~ getBookingsSummaryV2 error:", error);
    throw Error.SomethingWentWrong("Failed to fetch bookings summary");
  }
},

getBookingsDetailsById: async (data) => {
  try {
    const query = `
      SELECT
          a.id,
          COALESCE(c.firstname, '') AS user_name,
          COALESCE(c.phone, '') AS contact_number,
          COALESCE(c.email, '') AS email,
          d.name AS salon_name,
          CONCAT(f.area,' | ',f.city,' | ',f.district) AS salon_address,
          d.phone AS salon_phone,
          d.email AS salon_mail,
          a.status,
          CONCAT(DATE_FORMAT(a.booking_date, '%Y-%m-%d'), IFNULL(CONCAT(' ', TIME_FORMAT(e.\`from\`, '%H:%i')), '')) AS booking_datetime,
          CONCAT(e.from,'-',e.to) AS slot_timing,
          a.gst,
          DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date,
          a.razorpay_id,
          a.payment_status,
          a.payment_id,

          ai.id AS appointment_item_id,
          ss.id AS service_id,
          ss.service_name,
          ss.amount,
          ss.discounted_amount,
          (ss.amount - ss.discounted_amount) AS subtotal

      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
      INNER JOIN Slots e ON a.slot_id = e.id
      INNER JOIN PartnerAddress f ON d.address_id = f.id
      LEFT JOIN appointment_items ai ON a.id = ai.appointment_id
      LEFT JOIN StoreServices ss ON ai.service_id = ss.id
      WHERE a.id = :id
    `;

    const rows = await adminDbController.connection.query(query, {
      replacements: { id: data.id },
      type: Sequelize.QueryTypes.SELECT,
    });

    if (!rows.length) return null;

    const booking = {
      id: rows[0].id,
      user_name: rows[0].user_name,
      contact_number: rows[0].contact_number,
      email: rows[0].email,
      salon_name: rows[0].salon_name,
      salon_address: rows[0].salon_address,
      salon_phone: rows[0].salon_phone,
      salon_mail: rows[0].salon_mail,
      status: rows[0].status,
      booking_datetime: rows[0].booking_datetime,
      slot_timing: rows[0].slot_timing,
      order_date: rows[0].order_date,
      razorpay_id: rows[0].razorpay_id,
      payment_status: rows[0].payment_status,
      payment_id: rows[0].payment_id,
      appointment_items: [],
    };

    let totalAmount = 0;
    let totalDiscount = 0;

    rows.forEach((row) => {
      if (row.service_id) {
        const serviceSubtotal =
          Number(row.amount) - Number(row.discounted_amount);

        totalAmount += serviceSubtotal;
        totalDiscount += Number(row.discounted_amount);

        booking.appointment_items.push({
          appointment_item_id: row.appointment_item_id,
          service_id: row.service_id,
          service_name: row.service_name,
          service_amount: Number(row.amount),
          service_discount_amount: Number(row.discounted_amount),
          service_subtotal: serviceSubtotal,
        });
      }
    });

    // Use 5% GST when gst is 0 or null
    const gstRate =
      rows[0].gst && Number(rows[0].gst) > 0
        ? Number(rows[0].gst)
        : 5;

    // GST on total service amount after discounts
    const gstAmount = Number(
      ((totalAmount * gstRate) / 100).toFixed(2)
    );

    // Total amount + GST
    const subtotalAmount = Number(
      (totalAmount + gstAmount).toFixed(2)
    );

    booking.gst_rate = gstRate;
    booking.total_amount = Number(totalAmount.toFixed(2));
    booking.discount_amount = Number(totalDiscount.toFixed(2));
    booking.gst_amount = gstAmount;
    booking.subtotal_amount = Number(rows[0].amount || 0);
    booking.payable_amount = subtotalAmount;

    return booking;
  } catch (error) {
    console.log("getBookingsDetailsById DB error:", error);
    throw Error.SomethingWentWrong(
      "Failed to fetch booking details by ID"
    );
  }
},
updateBookingStatus: async ({ body }) => {
  try {
    const { id, status } = body;

    if (!id || !status) {
      throw Error.BadRequest("Booking ID and status are required");
    }

    // 🔹 Fetch current booking
    const booking = await adminDbController.Models.appointments.findOne({
      where: { id },
    });

    if (!booking) {
      throw Error.NotFound("Booking not found");
    }

    const currentStatus = booking.status;

    // 🔒 Validate transition
    if (
      !ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(status)
    ) {
      throw Error.BadRequest(
        `Cannot change status from ${currentStatus} to ${status}`
      );
    }

    // 🔹 Update status
    await adminDbController.app.updatebookingDBStatus(id, status);

    return `Booking ${status} successfully`;
  } catch (error) {
    console.log("🚀 updatebookingstatus error:", error);
    throw error;
  }
},
updatebookingDBStatus: async (id, status) => {
  try {
    const [affectedRows] =
      await adminDbController.Models.appointments.update(
        { status },
        { where: { id } }
      );

    return affectedRows > 0;
  } catch (error) {
    console.log("updateBookingStatus DB error:", error);
    throw Error.SomethingWentWrong("Failed to update booking status");
  }
},

  getTopPerformingSalon: async () => {
    try {
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [
          'store_id',
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalRevenue']
        ],
        group: ['store_id'],
        order: [[Sequelize.literal('totalRevenue'), 'DESC']],
        raw: true
      });

      return result || {};
    } catch (error) {
      console.log("🚀 ~ getTopPerformingSalon DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch top performing salon");
    }
  },
  getFilterReport: async (data) => {
    try {
      const { filterType, fromDate, toDate } = data;
      let whereCondition = {};

      const now = new Date();

      switch (filterType) {
        case 'day': {
          const start = new Date(now.setHours(0, 0, 0, 0));
          const end = new Date(now.setHours(23, 59, 59, 999));
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        case 'date': {
          if (!fromDate || !toDate) throw new Error('fromDate and toDate are required for this filter');
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        case 'week': {
          const start = new Date();
          start.setDate(start.getDate() - 7);
          whereCondition.booking_date = { [Op.gte]: start };
          break;
        }
        case 'month': {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        case 'quarter': {
          const start = new Date();
          start.setMonth(start.getMonth() - 6);
          whereCondition.booking_date = { [Op.gte]: start };
          break;
        }
        case 'year': {
          const start = new Date(now.getFullYear(), 0, 1);
          const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          whereCondition.booking_date = { [Op.between]: [start, end] };
          break;
        }
        default:
          break;
      }
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalRevenue']
        ],
        where: whereCondition,
        raw: true
      });
      return { totalRevenue: result.totalRevenue || 0 };
    } catch (error) {
      console.log("🚀 ~ getRevenueReport DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch revenue report");
    }
  },
  getMonthlyReport: async (data) => {
    const { filterType } = data;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    if (filterType === "monthlyRevenue") {
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [[fn("SUM", col("amount")), "totalRevenue"]],
        where: {
          // status: "booked",
          booking_date: { [Op.between]: [startOfMonth, endOfMonth] }
        },
        raw: true
      });
      return { totalRevenue: result?.totalRevenue || 0 };
    }
    if (filterType === "monthlyAppointments") {
      const result = await adminDbController.Models.appointments.findOne({
        attributes: [[fn("COUNT", col("id")), "totalAppointments"]],
        where: {
          // status: "booked",
          booking_date: { [Op.between]: [startOfMonth, endOfMonth] }
        },
        raw: true
      });
      return { totalAppointments: result?.totalAppointments || 0 };
    }
    return { totalRevenue: 0, totalAppointments: 0 };
  },
  // Booking count per month for a given year, optionally scoped to one salon
  getMonthlyBookingsReport: async (data) => {
    try {
      const year = Number(data.year) || new Date().getFullYear();
      const storeFilter = data.store_id ? `AND a.store_id = :store_id` : '';

      const sql = `
        SELECT DATE_FORMAT(a.booking_date, '%Y-%m') as month, COUNT(a.id) as total_bookings
        FROM appointments a
        WHERE YEAR(a.booking_date) = :year
        ${storeFilter}
        GROUP BY month
        ORDER BY month ASC
      `;

      const replacements = { year };
      if (data.store_id) replacements.store_id = data.store_id;

      const rows = await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      const countByMonth = {};
      rows.forEach((r) => { countByMonth[r.month] = Number(r.total_bookings); });

      const report = [];
      for (let m = 1; m <= 12; m++) {
        const month = `${year}-${String(m).padStart(2, "0")}`;
        report.push({ month, total_bookings: countByMonth[month] || 0 });
      }
      return report;
    } catch (error) {
      console.log("🚀 ~ getMonthlyBookingsReport error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly bookings report");
    }
  },
  // Paginated list of bookings within a date range, with user + salon details, for reporting/export
  getBookingsByDateRange: async (data) => {
    try {
      const page = Number(data.page) || 1;
      const limit = Number(data.limit) || 10;
      const offset = (page - 1) * limit;

      const storeFilter = data.store_id ? `AND a.store_id = :store_id` : '';
      const statusFilter = data.status ? `AND a.status = :status` : '';

      const replacements = {
        fromDate: data.fromDate,
        toDate: data.toDate,
        limit,
        offset,
      };
      if (data.store_id) replacements.store_id = data.store_id;
      if (data.status) replacements.status = data.status;

      const query = `
        SELECT
          a.id,
          a.created_at AS booking_date,
          a.booking_date AS appointment_date,
          a.status,
          a.payment_status,
          CASE WHEN a.payment_status IN ('success', 'sucssess') THEN 'paid' ELSE 'unpaid' END AS paid_status,
          a.amount,
          a.discounted_amount,
          c.id AS user_id,
          c.firstname AS user_firstname,
          c.lastname AS user_lastname,
          c.phone AS user_phone,
          c.email AS user_email,
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          CONCAT_WS(', ', f.area, f.city, f.district) AS partner_address
        FROM appointments a
        INNER JOIN User c ON a.user_id = c.id
        INNER JOIN Store d ON a.store_id = d.id
        LEFT JOIN PartnerAddress f ON d.address_id = f.id
        WHERE DATE(a.created_at) BETWEEN :fromDate AND :toDate
        ${storeFilter}
        ${statusFilter}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT :limit OFFSET :offset
      `;

      const rows = await adminDbController.connection.query(query, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      const totalQuery = `
        SELECT COUNT(DISTINCT a.id) AS totalCount
        FROM appointments a
        INNER JOIN User c ON a.user_id = c.id
        INNER JOIN Store d ON a.store_id = d.id
        WHERE DATE(a.created_at) BETWEEN :fromDate AND :toDate
        ${storeFilter}
        ${statusFilter}
      `;

      const totalResult = await adminDbController.connection.query(totalQuery, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      return {
        rows: rows || [],
        totalCount: totalResult?.[0]?.totalCount || 0,
      };
    } catch (error) {
      console.log("🚀 ~ getBookingsByDateRange error:", error);
      throw Error.SomethingWentWrong("Failed to fetch bookings by date range");
    }
  },
  // Total booking count for the current month, optionally scoped to one salon
  getCurrentMonthBookingsCount: async (data) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const where = {
        created_at: { [Op.between]: [startOfMonth, endOfMonth] },
      };
      if (data.store_id) where.store_id = data.store_id;

      const total = await adminDbController.Models.appointments.count({ where });

      return {
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        total_bookings: total || 0,
      };
    } catch (error) {
      console.log("🚀 ~ getCurrentMonthBookingsCount error:", error);
      throw Error.SomethingWentWrong("Failed to fetch current month bookings count");
    }
  },
  getFilteredStores: async (body) => {
    try {
      let sql = `
      SELECT 
        s.id,
        s.name,
        s.store_type,
        s.email,
        s.phone,
        s.images,
        s.description,
        c.name AS category_name
      FROM Store s
      LEFT JOIN category c
        ON FIND_IN_SET(c.id, s.category_id)
      WHERE 1=1
    `;
      const replacements = {};
      if (body.salon) {
        sql += ` AND s.name LIKE :salon`;
        replacements.salon = `%${body.salon}%`;
      }
      if (body.category) {
        sql += ` AND c.name LIKE :category`;
        replacements.category = `%${body.category}%`;
      }
      sql += ` ORDER BY s.name ASC`;
      return await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      console.log("🚀 ~ getFilteredStores error:", error);
      throw Error.SomethingWentWrong("Failed to fetch filtered stores");
    }
  },
  getCategoryRevenue: async (body) => {
    const { category, month, year } = body;

    if (!category) {
      throw Error.SomethingWentWrong("category is required");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetYear = year || currentYear;
    const targetMonth = month || currentMonth;

    const sql = `
    SELECT 
      c.name AS category_name,
      COALESCE(SUM(a.amount), 0) AS total_revenue
    FROM appointments a
    INNER JOIN Store s
      ON a.store_id = s.id
    INNER JOIN category c
      ON FIND_IN_SET(c.id, s.category_id)
    WHERE 
      a.amount IS NOT NULL
      AND c.name LIKE :categoryPattern
      AND YEAR(a.booking_date) = :targetYear
      AND MONTH(a.booking_date) = :targetMonth
    GROUP BY 
      c.id, c.name
  `;
    const result = await connection.query(sql, {
      replacements: {
        categoryPattern: `%${category}%`,
        targetYear,
        targetMonth,
      },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result.length ? result : [];
  },

  searchStores: async (body) => {
    try {
      const { search, status } = body;
      let sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa
        ON pa.store_id = s.id
      WHERE 1=1
    `;
      const replacements = {};
      if (status) {
        sql += ` AND s.status = :status`;
        replacements.status = status;
      }
      if (search) {
        sql += ` AND (
        s.name LIKE :search
        OR s.email LIKE :search
        OR pa.city LIKE :search
      )`;
        replacements.search = `%${search}%`;
      }
      sql += ` ORDER BY s.id DESC`;
      const result = await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ searchStores error:", error);
      throw Error.SomethingWentWrong("Failed to search stores");
    }
  },
  getStoresByStatus: async (body) => {
    try {
      const { status } = body;
      if (!status || !['active', 'inactive'].includes(status)) {
        throw Error.SomethingWentWrong("Please provide a valid status: 'active' or 'inactive'");
      }
      const sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa
        ON pa.store_id = s.id
      WHERE s.status = :status
      ORDER BY s.id DESC
    `;
      const result = await adminDbController.connection.query(sql, {
        replacements: { status },
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ getStoresByStatus error:", error);
      throw Error.SomethingWentWrong("Failed to fetch stores by status");
    }
  },
  getSalons: async (params) => {
    try {
      let sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa
        ON pa.store_id = s.id
      WHERE 1=1
    `;
      const replacements = {};
      if (params?.id) {
        sql += ` AND s.id = :id`;
        replacements.id = params.id;
      }
      sql += ` ORDER BY s.id DESC`;
      const result = await adminDbController.connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ getSalons error:", error);
      throw Error.SomethingWentWrong("Failed to fetch salons");
    }
  },
  getRevenueCategory: async (body) => {
    try {
      const { category } = body;
      const sql = `
            SELECT
                c.name AS category_name,
                COUNT(a.id) AS appointment_count,
                SUM(a.amount) AS total_revenue
            FROM
                appointments a
            JOIN
                Store s ON a.store_id = s.id
            JOIN
                category c ON CAST(s.category_id AS UNSIGNED) = c.id
            ${category ? 'WHERE c.name = :category' : ''} 
            ${category ? '' : 'WHERE a.amount IS NOT NULL'}
            GROUP BY
                c.name
            ORDER BY
                total_revenue DESC
        `;
      const replacements = {};
      if (category) {
        replacements.category = category;
      }
      const result = await connection.query(sql, {
        replacements: replacements,
        type: Sequelize.QueryTypes.SELECT,
      });
      return result;
    } catch (error) {
      console.log("🚀 ~ getCategoryMetrics_Debug error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category metrics (Debug)");
    }
  },
  getRevenueCategoryGrowth: async (body = {}) => {
    try {
      const { category } = body;

      const now = new Date();
      const currentYear = now.getFullYear();
      const lastYear = currentYear - 1;

      const sql = `
      SELECT
        c.name AS category_name,
        SUM(CASE WHEN YEAR(a.booking_date) = :currentYear THEN a.amount ELSE 0 END) AS current_year_revenue,
        SUM(CASE WHEN YEAR(a.booking_date) = :lastYear THEN a.amount ELSE 0 END) AS last_year_revenue,
        ROUND(
          (SUM(CASE WHEN YEAR(a.booking_date) = :currentYear THEN a.amount ELSE 0 END)
          /
          NULLIF(SUM(CASE WHEN YEAR(a.booking_date) IN (:currentYear, :lastYear) THEN a.amount ELSE 0 END), 0)
          ) * 100, 2
        ) AS growth_percentage
      FROM appointments a
      JOIN Store s ON a.store_id = s.id
      JOIN category c ON CAST(s.category_id AS UNSIGNED) = c.id
      ${category ? 'WHERE c.name = :category' : 'WHERE a.amount IS NOT NULL'}
      GROUP BY c.name
      ORDER BY growth_percentage DESC
    `;

      const replacements = { currentYear, lastYear };
      if (category) replacements.category = category;

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      });

      return result.length ? result : [];
    } catch (error) {
      console.log("🚀 ~ getRevenueCategoryGrowth error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category revenue growth");
    }
  },
  updateMultipleStoreStatuses: async (storeIds, newStatus) => {
    try {
      const result = await adminDbController.Models.Store.update(
        {
          status: newStatus
        },
        {
          where: {
            id: {
              [Sequelize.Op.in]: storeIds
            }
          }
        }
      );
      return result;
    } catch (error) {
      console.log("🚀 ~ update Multiple Store Statuses error:", error);
      throw error;
    }
  },
  getAdvancedSearch: async (body) => {
    try {
      const { phone, email, salon_name } = body;

      const sql = `
      SELECT 
        s.id,
        s.name AS salon_name,
        s.email,
        s.phone,
        s.status,
        pa.city,
        pa.state,
        pa.district,
        pa.area,
        pa.zipcode
      FROM Store s
      LEFT JOIN PartnerAddress pa ON pa.store_id = s.id
      WHERE 
        (
          (:phone IS NOT NULL AND s.phone LIKE :phone)
          OR (:email IS NOT NULL AND s.email LIKE :email)
          OR (:salon_name IS NOT NULL AND s.name LIKE :salon_name)
        )
      ORDER BY s.id DESC
    `;

      const result = await adminDbController.connection.query(sql, {
        replacements: {
          phone: phone ? `%${phone}%` : null,
          email: email ? `%${email}%` : null,
          salon_name: salon_name ? `%${salon_name}%` : null,
        },
        type: Sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.log("🚀 ~ advancedSearchStores error:", error);
      throw Error.SomethingWentWrong("Failed to perform advanced search");
    }
  },
  updateSalon: async (data, images, docs) => {
    try {
      return await adminDbController.Models.Store.update({
        name: data.name,
        store_type: data.store_type,
        website: data.website,
        team_size: data.team_size,
        email: data.email,
        income: data.income,
        bank_account_holder: data.bank_account_holder,
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        description: data.description,
        phone: data.phone,
        status: data.status,
        images: images ? JSON.stringify(images) : data.images,
        docs: docs ? JSON.stringify(docs) : data.docs,
      }, {
        where: { id: data.id },
      });
    } catch (error) {
      console.log("🚀 ~ updateStoreDetails error:", error);
      throw Error.SomethingWentWrong("Failed to update store details");
    }
  },
  getCustomers: async (body) => {
    const { month, year } = body;
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const sql = `
    WITH current_month_customers AS (
      SELECT DISTINCT user_id
      FROM appointments
      WHERE 
        MONTH(booking_date) = :month
        AND YEAR(booking_date) = :year
        AND user_id IS NOT NULL
    ),
    new_customers AS (
      SELECT cm.user_id
      FROM current_month_customers cm
      WHERE NOT EXISTS (
        SELECT 1 
        FROM appointments a
        WHERE 
          a.user_id = cm.user_id
          AND (
            YEAR(a.booking_date) < :year OR
            (YEAR(a.booking_date) = :year AND MONTH(a.booking_date) < :month)
          )
      )
    )
    SELECT
      (SELECT COUNT(*) FROM new_customers) AS new_customers_count,
      (SELECT COUNT(*) FROM current_month_customers) - (SELECT COUNT(*) FROM new_customers) AS returning_customers_count,
      ROUND(
        (CAST((SELECT COUNT(*) FROM new_customers) AS DECIMAL(10,2)) / NULLIF((SELECT COUNT(*) FROM current_month_customers), 0)) * 100,
        2
      ) AS new_customers_percentage,
      ROUND(
        (CAST(((SELECT COUNT(*) FROM current_month_customers) - (SELECT COUNT(*) FROM new_customers)) AS DECIMAL(10,2)) / NULLIF((SELECT COUNT(*) FROM current_month_customers), 0)) * 100,
        2
      ) AS returning_customers_percentage
  `;

    const [result] = await adminDbController.connection.query(sql, {
      replacements: { month: targetMonth, year: targetYear },
      type: Sequelize.QueryTypes.SELECT,
    });

    return `
New Customers: ${result.new_customers_percentage || 0}%, Returning Customers: ${result.returning_customers_percentage || 0}%
  `.trim();
  },

  getStore: async (body) => {
    try {
      const { fromDate, toDate } = body;

      if (!fromDate || !toDate) {
        throw Error.SomethingWentWrong("Please provide both fromDate and toDate in 'YYYY-MM-DD' format");
      }

      const sql = `
            SELECT DISTINCT
                s.id,
                s.name AS salon_name,
                s.email,
                s.status,
                s.createdAt,
                pa.city,
                pa.state,
                pa.district,
                pa.area,
                pa.zipcode
            FROM Store s
            LEFT JOIN PartnerAddress pa
                ON pa.store_id = s.id
            WHERE DATE(s.createdAt) BETWEEN :fromDate AND :toDate
            ORDER BY s.createdAt DESC
        `;

      const result = await adminDbController.connection.query(sql, {
        replacements: { fromDate, toDate },
        type: Sequelize.QueryTypes.SELECT,
      });

      return result;
    } catch (error) {
      console.log("🚀 ~ getStoresByDateRange error:", error);
      throw Error.SomethingWentWrong("Failed to fetch stores by date range");
    }
  },

  getactivesubscription: async (data, store_id) => {
    try {
      return await adminDbController.Models.StoreSubscription.findOne({
        where: {
          status: "active",
          store_id: data.store_id,
          type: "banner"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch active subscriptions");
    }
  },
  checkbannerquantity: async (body, start_date, end_date) => {
    try {
      let sql = `SELECT COUNT(b.id) as total_banner 
              FROM Banner b 
              WHERE b.store_id = :store_id 
              AND b.status = 'active' 
              AND b.date <= :end_date 
              AND b.date >= :start_date`;

      return await adminDbController.connection.query(sql, {
        replacements: {
          store_id: body.id,
          start_date: start_date,
          end_date: end_date
        },
        type: Sequelize.QueryTypes.SELECT
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check banner quantity");
    }
  },
  checkbannerquantity: async (body, start_date, end_date) => {
    try {
      let sql = `SELECT COUNT(b.id) as total_banner 
              FROM Banner b 
              WHERE b.store_id = :store_id 
              AND b.status = 'active' 
              AND b.date <= :end_date 
              AND b.date >= :start_date`;

      return await adminDbController.connection.query(sql, {
        replacements: {
          store_id: body.id,
          start_date: start_date,
          end_date: end_date
        },
        type: Sequelize.QueryTypes.SELECT
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to check banner quantity");
    }
  },
  updatewallet: async (body, remainig_balance) => {
    try {
      return await adminDbController.Models.Store.update({
        wallet_remaining: remainig_balance,
      }, {
        where: { id: body.store_id }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update wallet");
    }
  },
  getwallet: async (id) => {
    try {
      return await adminDbController.Models.Store.findOne({
        where: {
          id: id,
          status: "active"
        },
        attributes: ['wallet_remaining']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch wallet details");

    }
  },
  addpayouts: async (body, remainig_balance, wallet) => {
    try {
      return await adminDbController.Models.WalletLogs.create({
        date: new Date(),
        amount_added: body.amount,
        balance_before: wallet,
        balance_after: remainig_balance,
        user_id: body.store_id,
        payment_sucssess: 'sucssess',
        updated_at: new Date(),
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add payouts");
    }
  },
  updatepartner: async (body) => {
    try {
      return await adminDbController.Models.Store.update({
        status: body.status,
      }, {
        where: { id: body.id }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update user");
    }
  },
  updateMultiplePartner: async (partnerIds, newStatus) => {
    try {
      const result = await adminDbController.Models.Store.update({
        completion_status: newStatus
      },
        {
          where: {
            id: {
              [Sequelize.Op.in]: partnerIds
            }
          }
        });
      return result;
    } catch (error) {
      console.log("🚀 ~ update Multiple Partner Statuses error:", error);
      throw error;
    }
  },
  deletePartner: async (body) => {
    try {
      return await adminDbController.Models.Store.update({
        status: "terminated",
      }, {
        where: { id: body.id }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to delete user");
    }
  },
  createService: async (data) => {
    console.log("Create Service AdminDB: ", data);

    try {

      // Convert to integer
      const priorityValue = Number(data.priority || 0);

      // Validate duplicate priority for same store
      if (priorityValue > 0) {

        const existingPriority =
        await adminDbController.Models.StoreServices.findOne({
          where: {
            store_id: data.store_id,
            service_category: Number(data.category),
            service_for: data.service_for,
            priority: priorityValue,
          },
        });

        if (existingPriority) {
          throw Error.BadRequest(
            `Priority number ${priorityValue} is already assigned to another service`
          );
        }
      }

      const store = await adminDbController.Models.StoreServices.create({
        service_name: data.service_name,
        store_id: Number(data.store_id),
        amount: Number(data.amount),
        discounted_amount: Number(data.discounted_amount),
        fake_price: data.fake_price != null && data.fake_price !== "" ? Number(data.fake_price) : null,
        duration: data.duration,
        status: data.status,

        // directly save integer
        priority: priorityValue,

        service_category: Number(data.category),
        service_for: data.service_for,
        tier_discounts: data.tier_discounts ?? null,
      });

      console.log("store: ", store);

      return { success: true, store };

    } catch (error) {

      console.log("❌ createservice error:", error);

      // Re-throw existing custom errors
      if (
        error?.name === "ApplicationError" ||
        error?.type ||
        error?.code
      ) {
        throw error;
      }

      // Unknown errors only
      throw Error.SomethingWentWrong(
        error?.message || "Failed to create service"
      );
    }
  },
  bulkCreateServices: async (rows, storeId) => {
    const created = [];
    const skipped = [];

    const categories = await adminDbController.Models.Servicecategory.findAll({
      where: { status: "active" },
      attributes: ["id", "name"],
      raw: true,
    });
    const categoryMap = new Map(categories.map((c) => [normalizeCategoryKey(c.name), c.id]));
    const genderMap = { male: "male", female: "female", unisex: "unisex" };

    for (const row of rows) {
      const missing = [];

      if (!row.service_name) missing.push("service name");
      if (!row.category_raw) missing.push("service category");
      if (row.duration_raw === null || row.duration_raw === undefined || row.duration_raw === "") missing.push("duration");
      if (!row.gender_raw) missing.push("gender");
      if (row.amount === null || row.amount === undefined || row.amount === "") missing.push("original price");
      if (row.discounted_amount === null || row.discounted_amount === undefined || row.discounted_amount === "") missing.push("offer price");
      if (row.priority === null || row.priority === undefined || row.priority === "") missing.push("priority");
      if (!row.status) missing.push("status");

      if (missing.length > 0) {
        skipped.push({
          row: row.rowNumber,
          service_name: row.service_name || "(blank)",
          reason: `Missing required field(s): ${missing.join(", ")}`,
        });
        continue;
      }

      const categoryId = categoryMap.get(normalizeCategoryKey(row.category_raw));
      const duration = formatDurationFromDecimal(row.duration_raw);
      const serviceFor = genderMap[row.gender_raw.toLowerCase()];
      const priorityValue = Number(row.priority);
      const statusValue = row.status.toLowerCase();

      if (!categoryId) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Unknown category "${row.category_raw}"` });
        continue;
      }
      if (!duration) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Invalid duration "${row.duration_raw}"` });
        continue;
      }
      if (!serviceFor) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Invalid gender "${row.gender_raw}" — must be Male, Female, or Unisex` });
        continue;
      }
      if (isNaN(Number(row.amount))) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: "Original price must be a number" });
        continue;
      }
      if (isNaN(Number(row.discounted_amount))) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: "Offer price must be a number" });
        continue;
      }
      if (isNaN(priorityValue)) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: "Priority must be a number" });
        continue;
      }
      if (!["active", "inactive"].includes(statusValue)) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: `Invalid status "${row.status}" — must be active or inactive` });
        continue;
      }

      if (priorityValue > 0) {
        const existingPriority = await adminDbController.Models.StoreServices.findOne({
          where: {
            store_id: storeId,
            service_category: categoryId,
            service_for: serviceFor,
            priority: priorityValue,
          },
        });
        if (existingPriority) {
          skipped.push({
            row: row.rowNumber,
            service_name: row.service_name,
            reason: `Priority ${priorityValue} already used for this category/gender`,
          });
          continue;
        }
      }

      try {
        const service = await adminDbController.Models.StoreServices.create({
          service_name: row.service_name,
          store_id: Number(storeId),
          amount: Number(row.amount),
          discounted_amount: Number(row.discounted_amount),
          duration,
          status: statusValue,
          priority: priorityValue,
          service_category: categoryId,
          service_for: serviceFor,
        });
        created.push(service);
      } catch (error) {
        skipped.push({ row: row.rowNumber, service_name: row.service_name, reason: error.message });
      }
    }

    return { created, skipped };
  },
  editService: async (data) => {
    console.log('Edit Service AdminDB: ', data);

    try {
      const store = await adminDbController.Models.StoreServices.update({
        service_name: data.service_name,
        store_id: data.store_id,
        amount: data.amount,
        discounted_amount: data.discounted_amount,
        fake_price: data.fake_price != null && data.fake_price !== "" ? Number(data.fake_price) : null,
        duration: data.duration,
        status: data.status,
        service_category: data.category,
        priority: data.priority,
        service_for: data.service_for,
        tier_discounts: data.tier_discounts ?? null,
      }, {
        where: { id: data.id }
      });

      console.log('store: ', store)

      return { success: true, store }
    } catch (error) {
      console.log("❌ editservice error:", error);
      throw Error.SomethingWentWrong("Failed to edit service");
    }
  },
  updateServiceImportant: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("Service ID is required");
      }

      await adminDbController.Models.StoreServices.update(
        { important: !!data.important },
        { where: { id: data.id } }
      );

      return { id: data.id, important: !!data.important };
    } catch (error) {
      console.log("❌ updateServiceImportant error:", error);
      throw Error.SomethingWentWrong("Failed to update service importance");
    }
  },
  updateServiceAmount: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("Service ID is required");
      }
      if (data.amount === undefined || data.amount === null || data.amount === "" || isNaN(Number(data.amount))) {
        throw Error.BadRequest("A valid amount is required");
      }

      const amount = Number(data.amount);

      await adminDbController.Models.StoreServices.update(
        { amount },
        { where: { id: data.id } }
      );

      return { id: data.id, amount };
    } catch (error) {
      if (error.status) throw error;
      console.log("❌ updateServiceAmount error:", error);
      throw Error.SomethingWentWrong("Failed to update service amount");
    }
  },
 getServiceCategoryList: async () => {
  try {
    const categories = await partnerDbController.Models.Servicecategory.findAll({
      where: { status: "active" },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
      raw: true, // ✅ returns plain JSON
    });

    return categories;
  } catch (error) {
    console.log("🚀 getServiceCategoryList error:", error);
    throw new Error("Failed to fetch service categories");
  }
},
  // Time-limited, category-wide discount that overrides tier/default pricing
  // while active — see servicePricing.js getActiveCategoryDiscountsMap for
  // the checkout-side logic that actually applies this. Stored as one row
  // per campaign in CategoryDiscounts, so "current"/"upcoming"/"history"
  // are all just different views of the same rows.
  getCategoryDiscountOverview: async () => {
    try {
      const categories = await adminDbController.Models.Servicecategory.findAll({
        attributes: ["id", "name", "status"],
        order: [["name", "ASC"]],
        raw: true,
      });

      const allDiscounts = await adminDbController.Models.CategoryDiscounts.findAll({
        attributes: ["id", "category_id", "discount_percent", "starts_at", "ends_at"],
        raw: true,
      });

      const now = new Date();
      return categories.map((cat) => {
        const rows = allDiscounts.filter((d) => d.category_id === cat.id);
        const active =
          rows.find((d) => new Date(d.starts_at) <= now && new Date(d.ends_at) >= now) || null;
        const upcoming_count = rows.filter((d) => new Date(d.starts_at) > now).length;
        const past_count = rows.filter(
          (d) => new Date(d.ends_at) < now && d.id !== active?.id
        ).length;

        return {
          ...cat,
          is_active: !!active,
          active_discount: active,
          upcoming_count,
          past_count,
        };
      });
    } catch (error) {
      console.log("🚀 ~ getCategoryDiscountOverview error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category discount overview");
    }
  },
  getCategoryDiscountHistory: async (data) => {
    try {
      if (!data.category_id) {
        throw Error.BadRequest("category_id is required");
      }

      const rows = await adminDbController.Models.CategoryDiscounts.findAll({
        where: { category_id: data.category_id },
        order: [["starts_at", "DESC"]],
        raw: true,
      });

      const now = new Date();
      return rows.map((r) => ({
        ...r,
        state:
          new Date(r.starts_at) <= now && new Date(r.ends_at) >= now
            ? "active"
            : new Date(r.starts_at) > now
              ? "upcoming"
              : "expired",
      }));
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getCategoryDiscountHistory error:", error);
      throw Error.SomethingWentWrong("Failed to fetch category discount history");
    }
  },
  addCategoryDiscount: async (data) => {
    try {
      if (!data.category_id) {
        throw Error.BadRequest("category_id is required");
      }
      const percent = Number(data.discount_percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw Error.BadRequest("discount_percent must be between 1 and 100");
      }
      if (!data.ends_at) {
        throw Error.BadRequest("ends_at is required");
      }

      const category = await adminDbController.Models.Servicecategory.findByPk(data.category_id);
      if (!category) {
        throw Error.NotFound("Category not found");
      }

      const startsAt = data.starts_at ? new Date(data.starts_at) : new Date();
      const endsAt = new Date(data.ends_at);
      if (isNaN(endsAt.getTime()) || (data.starts_at && isNaN(startsAt.getTime()))) {
        throw Error.BadRequest("Invalid date/time");
      }
      if (endsAt <= startsAt) {
        throw Error.BadRequest("ends_at must be after starts_at");
      }

      // Overlap check: reject if any existing window for this category
      // intersects the requested one (back-to-back windows are allowed).
      const conflicts = await adminDbController.Models.CategoryDiscounts.findAll({
        where: {
          category_id: data.category_id,
          starts_at: { [Op.lt]: endsAt },
          ends_at: { [Op.gt]: startsAt },
        },
        raw: true,
      });
      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        throw Error.BadRequest(
          `Conflicts with an existing ${Number(conflict.discount_percent)}% discount running ` +
          `${new Date(conflict.starts_at).toLocaleString()} to ${new Date(conflict.ends_at).toLocaleString()}`
        );
      }

      const created = await adminDbController.Models.CategoryDiscounts.create({
        category_id: data.category_id,
        discount_percent: percent,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by: data.created_by ?? null,
        created_at: new Date(),
      });

      return created.get({ plain: true });
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ addCategoryDiscount error:", error);
      throw Error.SomethingWentWrong("Failed to add category discount");
    }
  },
  endCategoryDiscountNow: async (data) => {
    try {
      if (!data.category_id) {
        throw Error.BadRequest("category_id is required");
      }

      const now = new Date();
      const [affected] = await adminDbController.Models.CategoryDiscounts.update(
        { ends_at: now },
        {
          where: {
            category_id: data.category_id,
            starts_at: { [Op.lte]: now },
            ends_at: { [Op.gte]: now },
          },
        }
      );
      if (affected === 0) {
        throw Error.NotFound("No active discount found for this category");
      }

      return { category_id: data.category_id, ended_at: now };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ endCategoryDiscountNow error:", error);
      throw Error.SomethingWentWrong("Failed to end category discount");
    }
  },
  cancelScheduledCategoryDiscount: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("id is required");
      }

      const row = await adminDbController.Models.CategoryDiscounts.findByPk(data.id);
      if (!row) {
        throw Error.NotFound("Discount not found");
      }
      if (new Date(row.starts_at) <= new Date()) {
        throw Error.BadRequest(
          "Only a not-yet-started discount can be cancelled — use 'end now' for one that's currently running"
        );
      }

      await row.destroy();
      return { id: data.id };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ cancelScheduledCategoryDiscount error:", error);
      throw Error.SomethingWentWrong("Failed to cancel scheduled category discount");
    }
  },
  createpartner: async (data, images, docs) => {
    const transaction = await adminDbController.connection.transaction();

    let uploadedFiles = []; // 🔥 track for rollback

    try {

      // -------------------------------
      // 1️⃣ DUPLICATE CHECK
      // -------------------------------
      const existing = await adminDbController.connection.query(
        `SELECT s.id
       FROM Store s
       LEFT JOIN PartnerAddress pa ON pa.store_id = s.id
       WHERE s.email = :email
       AND s.phone = :phone
       AND s.name = :name
       AND pa.area = :area
       LIMIT 1`,
        {
          replacements: {
            email: data.email,
            phone: data.phone,
            name: data.name,
            area: data.area
          },
          type: Sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      if (existing.length > 0) {
        throw new Error("Partner already exists with matching data");
      }

      // -------------------------------
      // 2️⃣ HASH PASSWORD
      // -------------------------------
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // -------------------------------
      // 3️⃣ CREATE STORE (NO FILES)
      // -------------------------------
      const store = await adminDbController.Models.Store.create({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        phone: data.phone,
        store_type: data.store_type,
        website: data.website || '',
        team_size: data.team_size || '',
        income: data.income || '',
        phone: data.phone,
        category_id: data.category_id,
        completion_status: data.completion_status || "pending",
        status: data.status || "active",
        bank_account_holder: data.bank_account_holder,
        account_number: data.account_number || null,
        ifsc_code: data.ifsc_code || null,
        address_id: 0,
        wallet_remaining: 0,
        description: data.description || null,
        deviceId: data.deviceId,
        whatsapp_number: data.whatsapp_number || data.phone || null,
        otp: null,
        otpExpiration: null,
        apple_sub: null
      }, { transaction });

      const storeId = store.id;
      const baseFolder = `store/${storeId}`;

      // -------------------------------
      // 4️⃣ CREATE ADDRESS
      // -------------------------------
      const address = await adminDbController.Models.PartnerAddress.create({
        store_id: storeId,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        district: data.district,
        area: data.area,
        zipcode: data.zipcode,
        landmark: data.landmark || null,
        area: data.area,
        city: data.city,
        state: data.state,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        location: {
          type: "Point",
          coordinates: [
              Number(data.longitude),
              Number(data.latitude)
            ]
          },
        radius: data.radius ? Number(data.radius) : null,
        status: data.status || "active",
      }, { transaction });

      await store.update({ address_id: address.id }, { transaction });

      // -------------------------------
      // 5️⃣ UPLOAD FILES (AFTER STORE CREATED)
      // -------------------------------

      // 📸 Images
      let uploadedImages = [];
      if (images?.length) {
        for (const file of images) {
          const res = await uploadToS3(file, `${baseFolder}/images`);
          uploadedImages.push("/" + res.key);
          uploadedFiles.push("/" + res.key); // track
        }
      }

      // 📄 Docs
      let uploadedDocs = [];
      if (docs?.length) {
        for (const file of docs) {
          const res = await uploadToS3(file, `${baseFolder}/docs`);
          uploadedDocs.push("/" + res.key);
          uploadedFiles.push("/" + res.key);
        }
      }

      // 🖼 Logo
      let uploadedLogo = null;
      if (data.logo) {
        const res = await uploadToS3(data.logo, `${baseFolder}/logo`);
        uploadedLogo = "/" + res.key;
        uploadedFiles.push("/" + res.key);
      }

      // -------------------------------
      // 6️⃣ UPDATE STORE WITH FILES
      // -------------------------------
      await store.update({
        images: JSON.stringify(uploadedImages),
        docs: JSON.stringify(uploadedDocs),
        logo: uploadedLogo,
        services_provided_for: data.servicesProvidedFor,
        languages: data.languages,
        is_premium: data.isPremium
      }, { transaction });

      // -------------------------------
      // 7️⃣ TIMESLOTS + LANGUAGES
      // -------------------------------
      await createDefaultTimeSlots(storeId);

      if (data.languages?.length) {
        await adminDbController.Models.StoreLanguages.bulkCreate(
          data.languages.map(lang => ({
            store_id: storeId,
            language_id: lang
          })),
          { transaction }
        );
      }

      // -------------------------------
      // 8️⃣ COMMIT
      // -------------------------------
      await transaction.commit();

      return { success: true, store };

    } catch (error) {

      await transaction.rollback();

      // 🔥 S3 cleanup
      if (uploadedFiles.length > 0) {
        await Promise.all(uploadedFiles.map(file => deleteIfExists(file)));
      }

      // 🧾 FILE + CONSOLE
      logger.error(`createpartner error: ${error.message}`, {
        stack: error.stack,
        code: error.code,
        parent: error?.parent?.sqlMessage,
      });

      // 🧾 DATABASE
      await logErrorToDB({
        module: "Partner",
        functionName: "createpartner",
        error,
        requestData: {
          name: data?.name,
          email: data?.email,
          phone: data?.phone
        }
      });

      throw Error.SomethingWentWrong("Failed to create partner");
    }
  },

editpartner: async (data, images, docs) => {
  console.log("EditpartnerDBcontr:", data);

  const transaction = await adminDbController.connection.transaction();

  try {

    const storeId = data.id;
    const baseFolder = `store/${storeId}`;

     // ---------- IMAGE UPLOAD TO S3 ----------
    let oldImages = [];

    if (typeof data.oldimages === "string") {
      try {
        oldImages = JSON.parse(data.oldimages);
      } catch {
        oldImages = data.oldimages.split(",").filter(Boolean);
      }
    } else {
      oldImages = data.oldimages || [];
    }

    const newImages = images || [];

    const imagesValue = [...oldImages, ...newImages];

    let newImageFileName = [];
    let uploadedFiles = [];

    if (imagesValue && imagesValue.length > 0) {
      for (const file of imagesValue) {
        const url = await uploadToS3(file, `${baseFolder}/images`);
        newImageFileName.push("/" + url.key);
        uploadedFiles.push("/" + url.key);
      }
    }

    const removedImages = oldImages.filter(
      img => !imagesValue.includes(img)
    );

    await Promise.all(removedImages.map(file => deleteIfExists(file)));

    // ---------- DOC UPLOAD TO S3 ----------
    let oldDocs = [];

    if (typeof data.oldDocs === "string") {
      try {
        oldDocs = JSON.parse(data.oldDocs);
      } catch {
        oldDocs = data.oldDocs.split(",").filter(Boolean);
      }
    } else {
      oldDocs = data.oldDocs || [];
    }
    
    const newDocs = docs || [];
    const docsValue = [...oldDocs, ...newDocs];

    let newDocFileName = [];

    if (docsValue && docsValue.length > 0) {
      for (const file of docsValue) {
        const url = await uploadToS3(file, `${baseFolder}/docs`);
        newDocFileName.push("/" + url.key);
      }
    }

    // ---------- LOGO UPLOAD ----------
    let newLogoFileName = data.oldLogo || null;

    if (data.removeLogo) {
      newLogoFileName = null;
    } else if (data.logo) {
      // if new logo file uploaded
      const logoUrl = await uploadToS3(data.logo, `${baseFolder}/logo`);
      newLogoFileName = "/" + logoUrl.key;
    }

    // ---------- STORE UPDATE ----------
    // Do not pass store_type: undefined — that can wipe the column and break user-app gender.
    const storeUpdate = {
        name: data.name,
        website: data.website,
        team_size: data.team_size,
        email: data.email,
        income: data.income,
        bank_account_holder: data.bank_account_holder,
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        description: data.description,
        phone: data.phone,
        category_id: data.category_id,
        completion_status: data.completion_status,
        status: data.status,
        whatsapp_number: data.whatsapp_number,
        images: JSON.stringify(newImageFileName),
        docs: JSON.stringify(newDocFileName),
        logo: newLogoFileName,
        services_provided_for: data.servicesProvidedFor,
        languages: data.languages,
        is_premium: data.isPremium,
    };
    if (data.store_type != null && String(data.store_type).trim() !== "") {
      storeUpdate.store_type = String(data.store_type).trim();
    }

    const st = await adminDbController.Models.Store.update(
      storeUpdate,
      {
        where: { id: data.id },
        transaction
      }
    );

    console.log("store done:", st);

    // ---------- ADDRESS UPDATE ----------
    const addressData = {
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      state: data.state || null,
      district: data.district || null,
      city: data.city || null,
      area: data.area || null,
      zipcode: data.zipcode || null,
      landmark: data.landmark || null,
      radius: data.radius || null,
      status: data.status || 'active'
    };
    if (data.latitude && data.longitude) {
      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        addressData.latitude = lat;
        addressData.longitude = lng;
        addressData.location = {
          type: "Point",
          coordinates: [lng, lat]
        };
        console.log("🚀 ~ Location set:", addressData.location);
      } else {
        console.log("⚠️ ~ Invalid latitude/longitude values:", { lat, lng });
      }
    } else {
      console.log("⚠️ ~ Latitude/Longitude not provided or null");
      addressData.latitude = null;
      addressData.longitude = null;
      addressData.location = null;
    }
    const existingAddress = await adminDbController.Models.PartnerAddress.findOne({
      where: { store_id: storeId },
      transaction
    });

    console.log("🚀 ~ Existing address found:", !!existingAddress);

    if (existingAddress) {
      // UPDATE if record exists
      console.log("🚀 ~ Updating existing address record...");
      const ad = await adminDbController.Models.PartnerAddress.update(
        addressData,
        {
          where: { store_id: storeId },
          transaction
        }
      );
      console.log("🚀 ~ Address update result:", ad);
    } else {
      // CREATE if record doesn't exist
      console.log("🚀 ~ Creating new address record...");
      const newAddress = await adminDbController.Models.PartnerAddress.create(
        {
          store_id: storeId,
          ...addressData
        },
        { transaction }
      );
      console.log("🚀 ~ Address created:", newAddress?.id);
    }

    // ---------- LANGUAGE UPDATE ----------
    const ln = data.languages || [];

    await adminDbController.Models.StoreLanguages.destroy({
      where: { store_id: data.id },
      transaction
    });

    if (ln.length > 0) {
      const now = new Date();
      const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));

      const languageRecords = ln.map((lang) => ({
        store_id: data.id,
        language_id: lang,
        CREATED_AT: istTime
      }));

      await adminDbController.Models.StoreLanguages.bulkCreate(
        languageRecords,
        { transaction }
      );
    }

    console.log("languages done:", ln);

    // ---------- COMMIT ----------
    await transaction.commit();

    return true;

  } catch (error) {

  await transaction.rollback();

  // ❌ rollback uploaded S3 files
  if (uploadedFiles.length > 0) {
    await Promise.all(uploadedFiles.map(file => deleteIfExists(file)));
  }

  // 🧾 FILE LOG
  logger.error(`editpartner error: ${error.message}`, {
    stack: error.stack
  });

  // 🧾 DB LOG
  await logErrorToDB({
    module: "Partner",
    functionName: "editpartner",
    error,
    requestData: {
      id: data?.id,
      name: data?.name
    }
  });

  throw Error.SomethingWentWrong("Failed to update partner");
}
},

getservices: async (body) => {
  try {

    const whereCondition = {
      status: "active",
      store_id: body.id
    };

    // ✅ Apply category filter only if provided
    if (body.category_id && body.category_id !== "all") {
      whereCondition.service_category = body.category_id;
    }

    const services = await adminDbController.Models.StoreServices.findAll({
      where: whereCondition,
      order: [['discounted_amount', 'ASC']]
    });

    console.log("Fetched services:", services);
    return services;

  } catch (error) {
    throw Error.SomethingWentWrong("Failed to fetch services");
  }
},

deleteservice: async (body) => {
    try {
        // Validate service_id exists
        if (!body.service_id) {
            throw new Error("Service ID is required");
        }

        // Find the service first to verify it exists
        const service = await adminDbController.Models.StoreServices.findOne({
            where: {
                id: body.service_id
            }
        });

        if (!service) {
            throw new Error("Service not found or already deleted");
        }

        // Delete the service
        const deletedRows = await adminDbController.Models.StoreServices.destroy({
            where: {
                id: body.service_id
            }
        });

        console.log("Deleted service:", service);
        return service;  // Return the deleted service data

    } catch (error) {
        throw Error.SomethingWentWrong("Failed to delete service");
    }
},

getlanguages: async (body) => {
    try {
      let sql = `SELECT l.name FROM StoreLanguages sl JOIN Languages l ON sl.language_id = l.id WHERE sl.store_id = :store_id`;
      const result = await adminDbController.connection.query(sql, {
        replacements: { store_id: body },
        type: Sequelize.QueryTypes.SELECT,
      });
      return result.map(r => r.name);
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch languages");
    }
},

getserviceprovidedfor: async (body) => {
    try {
      let sql = `SELECT spf.name
                FROM Store s
                JOIN StoreServicesProvidedFor spf
                ON JSON_CONTAINS(s.services_provided_for, CAST(spf.id AS JSON))
                WHERE s.id = :store_id`;
      const result = await adminDbController.connection.query(sql, {
        replacements: { store_id: body },
        type: Sequelize.QueryTypes.SELECT,
      });
      return result.map(r => r.name);
    }
      catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch services provided for");
    }
},

getallcombos: async (body) => {
    try {
      return await adminDbController.Models.Combo.findAll({
        where: {
          status: "active",
          store_id: body.id
        },
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch combos");
    }
  },
  getrefundrequests: async (body) => {
    try {
      let sql = `SELECT  r.*, a.razorpay_id ,a.discounted_amount as total , u.firstname as user_firstname, u.lastname as user_lastname, u.phone as user_phone ,  s.name as store_name, s.email as store_email, s.phone as store_phone
        FROM refund_requests r
        JOIN appointments a ON a.id = r.appointment_id
        JOIN User u ON a.user_id = u.id
        JOIN Store s ON a.store_id = s.id
        WHERE r.status = 'pending' 
        ORDER BY r.created_at DESC`;
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund requests");
    }
  },
  getrefundrequestbyid: async (body) => {
    try {
      return await adminDbController.Models.refund_requests.findOne({
        where: {
          id: body.id,
          status: "pending"
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch refund request by ID");
    }
  },
updateRefundBookingStatus: async ({ body, user }) => {
  try {
    const booking =
      await adminDbController.Models.appointments.findOne({
        where: { id: body.id },
      });

    if (!booking) {
      throw Error.NotFound("Booking not found");
    }

    // 🔒 Rule 1: Only completed bookings can be refunded
    if (booking.status !== "completed") {
      throw Error.BadRequest(
        "Only completed bookings can be refunded"
      );
    }

    // 🔒 Rule 2: Payment must be successful
    if (booking.payment_status !== "success") {
      throw Error.BadRequest(
        "Payment not completed, refund not allowed"
      );
    }

    // 🔹 TODO: Razorpay refund integration here
    // await razorpay.payments.refund(booking.payment_id);

    // 🔹 Update booking
    await adminDbController.Models.appointments.update(
      {
        status: "refunded",
        payment_status: "refunded",
        refunded_at: new Date(),
        refunded_by: user?.id || null,
      },
      { where: { id: body.id } }
    );

    return "Refund processed successfully";
  } catch (error) {
    console.log("refundBooking DB error:", error);
    throw error;
  }
},

  getproffesionalbyid: async (id) => {
    try {
      return await adminDbController.Models.Stylist.findAll({
        where: {
          store_id: id,
          status: "active"
        },
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch professional by ID");
    }
  },
  addsubscription: async (data, id) => {
    try {
      return await adminDbController.Models.SubscriptionPlans.create({
        type: data.type,
        days: data.days,
        price: data.price,
        status: "active",
        created_at: new Date(),
      });

    } catch (error) {
      throw Error.SomethingWentWrong("Failed to add subscription");
    }
  },
  upadteuser: async (data) => {
    try {
      const user = await adminDbController.Models.User.update({
        status: data.status,
      }, { where: { id: data.id } });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update user");
    }
  },
  // Users with no gender on file, ranked by how confidently their booking
  // history (gendered services booked + gendered salons visited) suggests
  // one. Only "real" bookings count (completed + actually paid), and only
  // users with at least one gendered signal are returned — no signal means
  // nothing to infer, so they're excluded rather than shown at a
  // meaningless 50/50.
  getUsersGenderProbability: async () => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT
          u.id AS user_id,
          u.firstname,
          u.lastname,
          u.email,
          u.phone,
          SUM(CASE WHEN ss.service_for = 'male' THEN 1 ELSE 0 END) AS male_service_count,
          SUM(CASE WHEN ss.service_for = 'female' THEN 1 ELSE 0 END) AS female_service_count,
          SUM(CASE WHEN (
            LOWER(TRIM(st.store_type)) NOT IN ('unisex', 'unisex salon')
            AND (
              LOWER(TRIM(st.store_type)) REGEXP '^male( only)?$'
              OR (
                LOWER(TRIM(st.store_type)) REGEXP 'men|gents|mens'
                AND LOWER(TRIM(st.store_type)) NOT REGEXP 'women|female|ladies'
              )
            )
          ) THEN 1 ELSE 0 END) AS male_salon_count,
          SUM(CASE WHEN (
            LOWER(TRIM(st.store_type)) NOT IN ('unisex', 'unisex salon')
            AND (
              LOWER(TRIM(st.store_type)) REGEXP '^female( only)?$'
              OR LOWER(TRIM(st.store_type)) REGEXP 'women|ladies|womens|woman'
              OR (
                (LOWER(TRIM(st.store_type)) LIKE '%beauty parlour%' OR LOWER(TRIM(st.store_type)) LIKE '%beauty parlor%')
                AND LOWER(TRIM(st.store_type)) NOT REGEXP 'men|gents|male'
              )
            )
          ) THEN 1 ELSE 0 END) AS female_salon_count
        FROM User u
        INNER JOIN appointments a
          ON a.user_id = u.id
          AND a.status = 'completed'
          AND a.payment_status IN ('success', 'sucssess')
        LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ss.id = ai.service_id
        LEFT JOIN Store st ON st.id = a.store_id
        WHERE (u.gender IS NULL OR u.gender = '')
        GROUP BY u.id, u.firstname, u.lastname, u.email, u.phone
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );

      const results = rows
        .map((row) => {
          const maleScore = Number(row.male_service_count || 0) + Number(row.male_salon_count || 0);
          const femaleScore = Number(row.female_service_count || 0) + Number(row.female_salon_count || 0);
          const totalSignal = maleScore + femaleScore;

          if (totalSignal === 0) return null;

          const probabilityMale = Math.round((maleScore / totalSignal) * 100);

          return {
            user_id: row.user_id,
            firstname: row.firstname,
            lastname: row.lastname,
            email: row.email,
            phone: row.phone,
            male_service_count: Number(row.male_service_count || 0),
            female_service_count: Number(row.female_service_count || 0),
            male_salon_count: Number(row.male_salon_count || 0),
            female_salon_count: Number(row.female_salon_count || 0),
            male_score: maleScore,
            female_score: femaleScore,
            probability_male: probabilityMale,
            probability_female: 100 - probabilityMale,
            suggested_gender:
              maleScore === femaleScore ? null : maleScore > femaleScore ? "male" : "female",
          };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.probability_male - 50) - Math.abs(a.probability_male - 50));

      return results;
    } catch (error) {
      console.log("🚀 ~ getUsersGenderProbability error:", error);
      throw Error.SomethingWentWrong("Failed to compute gender probability");
    }
  },
  updateUserGender: async (data) => {
    try {
      if (!data.id) {
        throw Error.BadRequest("User ID is required");
      }
      if (!["male", "female"].includes(data.gender)) {
        throw Error.BadRequest("gender must be male or female");
      }

      await adminDbController.Models.User.update(
        { gender: data.gender },
        { where: { id: data.id } }
      );

      return { id: data.id, gender: data.gender };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ updateUserGender error:", error);
      throw Error.SomethingWentWrong("Failed to update user gender");
    }
  },
  // getallpartner: async (data) => {
  //   try {
  //     const stores = await adminDbController.Models.Store.findAll({
  //       attributes: [
  //         'id', 'name', 'email', 'phone', 'images',
  //         'status', 'completion_status', 'createdAt'
  //       ],
  //       order: [['id', 'DESC']],
  //       raw: true
  //     });

  //     if (!stores || stores.length === 0) return [];
  //     const storeIds = stores.map((s) => s.id);
  //     const owners = await adminDbController.Models.OwnerProfile.findAll({
  //       where: { store_id: storeIds },
  //       attributes: [
  //         'store_id', 'name', 'email', 'phone',
  //         'profile_pic', 'country', 'country_code', 'Dob'
  //       ],
  //       raw: true
  //     });
  //     const appointments = await adminDbController.Models.appointments.findAll({
  //       attributes: [
  //         'store_id',
  //         [fn('COUNT', col('id')), 'TotalAppointment']
  //       ],
  //       where: { store_id: storeIds },
  //       group: ['store_id'],
  //       raw: true
  //     });

  //     const ownerMap = {};
  //     owners.forEach((o) => { ownerMap[o.store_id] = o; });
  //     const appointmentMap = {};
  //     appointments.forEach((a) => { appointmentMap[a.store_id] = parseInt(a.TotalAppointment) || 0; });

  //     const result = stores.map((store) => ({
  //       ...store,
  //       ownerDetails: ownerMap[store.id] || null,
  //       TotalAppointment: appointmentMap[store.id] || 0
  //     }));
  //     return result;

  //   } catch (error) {
  //     console.log("🚀 ~ getallpartner DB error:", error);
  //     throw Error.SomethingWentWrong("Failed to fetch partners");
  //   }
  // },

  getverifypartnerlist: async (data) => {
    try {
      let sql = `SELECT s.id, s.name, s.store_type,s.email, s.phone, s.images, s.status, s.completion_status, s.createdAt,
                  pa.city, pa.state, pa.district, pa.area, pa.zipcode
                FROM Store s
                LEFT JOIN PartnerAddress pa ON pa.store_id = s.id
                WHERE s.completion_status = 'pending' and s.status= 'active'
                ORDER BY s.createdAt DESC`;  
      return await adminDbController.connection.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      console.log("🚀 ~ getverifypartnerlist DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch verify partner list");
    }     
  },

verifypartnerdetails: async (data) => {
    try {
      return await adminDbController.Models.Store.update({
        completion_status: data.completion_status,
      }, {
        where: {
          id: data.id,
          completion_status: "pending"
        },
      });
    }
    catch (error) {
      console.log("🚀 ~ verifypartnerdetails DB error:", error);
      throw Error.SomethingWentWrong("Failed to verify partner details");
    } 
  },


  getallpartner: async (data) => {
    try {
      const stores = await adminDbController.Models.Store.findAll({
        where: {
          completion_status: 'completed'
        },
        attributes: [
          'id', 'name', 'email', 'phone', 'images',
          'status', 'completion_status', 'createdAt',
          'category_id', 'address_id'
        ],
        order: [['id', 'DESC']],
        raw: true
      });
      if (!stores.length) return [];
      const storeIds = stores.map(s => Number(s.id));
      const categoryIds = [...new Set(stores.map(s => s.category_id).filter(Boolean))];
      const owners = await adminDbController.Models.OwnerProfile.findAll({
        where: { store_id: storeIds },
        attributes: [
          'store_id', 'name', 'email', 'phone',
          'profile_pic', 'country', 'country_code', 'Dob'
        ],
        raw: true
      });
      const appointments = await adminDbController.Models.appointments.findAll({
        attributes: [
          'store_id',
          [fn('COUNT', col('id')), 'TotalAppointment'],
          [fn('SUM', col('amount')), 'totalRevenue']
        ],
        where: {
          store_id: { [Op.in]: storeIds },
          // status: { [Op.in]: ['completed', 'Completed'] }
        },
        group: ['store_id'],
        raw: true
      });
      const categories = await adminDbController.Models.category.findAll({
        where: { id: categoryIds },
        attributes: ['id', 'name'],
        raw: true
      });
      const addresses = await adminDbController.Models.PartnerAddress.findAll({
        where: { store_id: storeIds },
        attributes: ['store_id', 'city', 'addressLine1'],
        raw: true
      });
      const ownerMap = Object.fromEntries(owners.map(o => [o.store_id, o]));
      const appointmentMap = Object.fromEntries(
        appointments.map(a => [a.store_id, parseInt(a.TotalAppointment) || 0])
      );
      const revenueMap = Object.fromEntries(
        appointments.map(a => [a.store_id, parseFloat(a.totalRevenue) || 0])
      );
      const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
      const addressMap = Object.fromEntries(
        addresses.map(a => [
          a.store_id,
          { city: a.city || null, addressLine1: a.addressLine1 || null }
        ])
      );
      const result = stores.map(store => ({
        ...store,
        ownerDetails: ownerMap[store.id] || null,
        TotalAppointment: appointmentMap[store.id] || 0,
        totalRevenue: revenueMap[store.id] || 0,
        categoryName: categoryMap[store.category_id] || null,
        location: addressMap[store.id] || { city: null, addressLine1: null }
      }));
      return result;
    } catch (error) {
      console.log("🚀 ~ getallpartner DB error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partners");
    }
  },

  getuserdetails: async (id) => {
    try {
      const res = await adminDbController.Models.User.findOne({
                  where: {
                    id: id,
                    status: "active"
                  },
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilePic', 'status', 'device_id','date_of_birth','age','gender','loyalty_status']
      });
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user details");
    }
  },
  // What the user actually paid (charged price + GST) on completed, paid
  // bookings. The old filter `status: "booked" || "completed"` evaluated to
  // just "booked" and summed list prices of bookings not yet delivered.
  gettotalspent: async (id) => {
    try {
      const [row] = await adminDbController.connection.query(
        `
        SELECT COALESCE(SUM(${AMOUNT_PAID_SQL}), 0) AS spent
        FROM appointments a
        WHERE a.user_id = :id
          AND a.status = 'completed'
          AND a.payment_status IN ${PAID_PAYMENT_SQL}
        `,
        { replacements: { id }, type: Sequelize.QueryTypes.SELECT }
      );
      return Number(Number(row?.spent || 0).toFixed(2));
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total spent");
    }
  },
  getlogs: async (id) => {
    try {
      return await adminDbController.Models.WalletLogs.findAll({
        where: {
          user_id: id,
        },
        order: [['updated_at', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch logs");
    }
  },
  updatesubscription: async (data) => {
    try {
      return await adminDbController.Models.SubscriptionPlans.update({
        type: data?.type,
        days: data?.days,
        price: data?.price,
        status: data?.status,
        updated_at: new Date(),
      }, {
        where: { id: data.id }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update subscription");
    }
  },

  generateBookingPDF: async (bookingId) => {
    try {
      const booking = await adminDbController.app.getBookingsDetailsById({
        id: bookingId,
      });
      if (!booking) {
        throw Error.SomethingWentWrong("Booking not found");
      }
      const pdfBuffer = await generatePDF(booking);
      return pdfBuffer;
    } catch (error) {
      console.log("🚀 ~ generateBookingPDF error:", error);
      throw Error.SomethingWentWrong("Failed to generate booking PDF");
    } 
  },

  createDefaultTimeSlot: async (storeId) => {
    try {
       const result = await createDefaultTimeSlots(storeId);
       return result;
    } catch (error) {
      console.log("🚀 ~ createDefaultTimeSlots error:", error);
      throw Error.SomethingWentWrong("Failed to create default time slots");
    }
  },

  blockAndUnblockSlot: async (storeId, slotId, status, date, reason = null) => {

  const transaction = await partnerDbController.connection.transaction();

  try {

    const existingBlock =
      await partnerDbController.Models.SlotBlockedDates.findOne({
        where: {
          slot_id: slotId,
          store_id: storeId,
          blocked_date: date,
        },
        transaction,
      });

    // ========================
    // BLOCK SLOT
    // ========================
    if (status === "block") {

      if (existingBlock) {
        throw Error.InternalError("Slot already blocked for this date");
      }

      // Check booking exists
      const bookingExists = await partnerDbController.connection.query(
        `SELECT 1
         FROM appointments
         WHERE slot_id = :slotId
         AND store_id = :storeId
         AND booking_date = :date
         AND status NOT IN ('cancelled','completed')
         LIMIT 1`,
        {
          replacements: { slotId, storeId, date },
          type: partnerDbController.connection.QueryTypes.SELECT,
          transaction,
        }
      );

      if (bookingExists.length > 0) {
        throw Error.InternalError(
          "Slot already booked for this date. Cannot block."
        );
      }

      const block =
        await partnerDbController.Models.SlotBlockedDates.create(
          {
            slot_id: slotId,
            store_id: storeId,
            blocked_date: date,
            reason,
          },
          { transaction }
        );

      await transaction.commit();
      return block;
    }

    // ========================
    // UNBLOCK SLOT
    // ========================
    if (status === "unblock") {

      if (!existingBlock) {
        throw Error.InternalError("Slot is not blocked for this date");
      }

      await existingBlock.destroy({ transaction });

      await transaction.commit();

      return { message: "Slot unblocked successfully" };
    }

    throw Error.InternalError("Invalid slot action");

  } catch (error) {

    await transaction.rollback();

    console.log("🚀 blockAndUnblockSlot error:", error);

    if (error && error.type && error.code) {
      throw error;
    }

    throw Error.SomethingWentWrong("Failed to update time slot status");
  }
  },

  getBlockedSlots: async (storeId, date) => {
    try {
      const blockedSlots = await partnerDbController.Models.SlotBlockedDates.findAll({
        where: {
          store_id: storeId,
          blocked_date: date,
        },
        attributes: ['slot_id', 'reason'],
      });
      return blockedSlots;
    } catch (error) {
      console.log("🚀 getBlockedSlots error:", error);
      throw Error.SomethingWentWrong("Failed to fetch blocked slots");
    }
  },

  getlanguagelist: async () => {
    try {
      const languages = await partnerDbController.Models.Languages.findAll({
        where: { status: "active" },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
        raw: true
      });

      return languages || [];
    } catch (error) {
      console.error("🚀 getlanguagelist error:", error);
      throw new Error("Failed to fetch languages");
    }
  },

  getserviceprovidedforlist: async () => {
    try {
      const servicesProvidedFor = await partnerDbController.Models.ServicesProvidedFor.findAll({
        where: { status: "active" },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
        raw: true
      });
      return servicesProvidedFor || [];
    } catch (error) {
      console.error("🚀 getserviceprovidedforlist error:", error);
      throw new Error("Failed to fetch service options");
    }
  },
  getallpartnersubscription: async () => {
  try {
    const plans = await adminDbController.Models.PartnerSubscriptionPlans.findAll({
      where: { is_active: 1 },
      order: [['sort_order', 'ASC']],
      include: [
        {
          model: adminDbController.Models.PartnerSubscriptionPlanfeatureMapping,
          as: "featuresMapping",   // ✅ MUST MATCH ASSOCIATION
          include: [
            {
              model: adminDbController.Models.PartnerSubscriptionPlanfeatures,
              as: "featureDetails",        // ✅ MUST MATCH ASSOCIATION
              attributes: ["feature_name"]
            }
          ]
        }
      ]
    });

    return plans;
  } catch (error) {
    console.log("🚀 getallpartnersubscription error:", error);
    throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
  }
  },
  getpartnersubscriptionbyid: async (id) => {
    try {
      return await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: id.id },
        include: [
          {
            model: adminDbController.Models.PartnerSubscriptionPlanfeatureMapping,
            as: "featuresMapping",

            include: [
              {
                model: adminDbController.Models.PartnerSubscriptionPlanfeatures,
                as: "featureDetails",
                attributes: ["feature_name"],
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.log("🚀 getpartnersubscriptionbyid error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscription");
    }
  },
  addpartnersubscription: async (data) => {
    const t = await connection.transaction();
    try {

      const lastPlan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        order: [["sort_order", "DESC"]],
        attributes: ["sort_order"],
        lock: true,          // 🔥 prevents race condition
        transaction: t
      });

      const nextSortOrder = lastPlan ?.sort_order? lastPlan.sort_order + 1 : 1;

      const basePrice = data.discount_price ?? data.price;
      const plan = await adminDbController.Models.PartnerSubscriptionPlans.create({
        plan_name: data.plan_name,
        price: data.price,
        original_price: data.original_price ?? data.price,
        discount_price: basePrice,
        price_tag: data.price_tag ?? "month",
        duration_months: data.duration_months,
        booking_limit: data.booking_limit,
        is_unlimited: data.is_unlimited,
        description: data.description ?? data.plan_description ?? null,
        sort_order: nextSortOrder,
        is_active: 1
      }, { transaction: t });

      // Insert feature mapping
      if (data.features && data.features.length > 0) {
        const featureMappings = data.features.map(f => ({
          plan_id: plan.plan_id,
          feature_id: f
        }));

        await adminDbController.Models.PartnerSubscriptionPlanfeatureMapping.bulkCreate(featureMappings, { transaction: t });
      }

      await t.commit();

      // Sync to Razorpay after commit so a Razorpay outage does not roll back the plan.
      // create-recurring will also auto-heal if razorpay_plan_id is still null.
      try {
        await syncPlanToRazorpay(plan.toJSON ? plan.toJSON() : plan);
      } catch (syncError) {
        console.error(
          "[addpartnersubscription] Razorpay plan sync failed (plan saved locally):",
          syncError?.message || syncError
        );
      }

      return plan;

    } catch (error) {
      await t.rollback();
      console.log("🚀 addpartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to create subscription plan");
    }
  },
  updatepartnersubscription: async (data) => {
    const t = await connection.transaction();
    try {

      // 1. Check plan exists
      const plan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: data.id }
      });

      if (!plan) throw new Error("Plan not found");

      // 2. Update plan (Razorpay plans are immutable — only sync if never linked)
      const updatePayload = {
        plan_name: data.plan_name,
        price: data.price,
        duration_months: data.duration_months,
        booking_limit: data.booking_limit,
        is_unlimited: data.is_unlimited,
        sort_order: plan.sort_order,
        is_active: true
      };
      if (data.original_price != null) updatePayload.original_price = data.original_price;
      if (data.discount_price != null) updatePayload.discount_price = data.discount_price;
      if (data.price_tag != null) updatePayload.price_tag = data.price_tag;
      if (data.description != null || data.plan_description != null) {
        updatePayload.description = data.description ?? data.plan_description;
      }

      await adminDbController.Models.PartnerSubscriptionPlans.update(updatePayload, {
        where: { plan_id: data.id },
        transaction: t
      });

      // 3. Update features (IMPORTANT)
      if (data.features) {

        // delete old mappings
        await adminDbController.Models.PartnerSubscriptionPlanfeatureMapping.destroy({
          where: { plan_id: data.id },
          transaction: t
        });

        // insert new mappings
        const featureMappings = data.features.map(f => ({
          plan_id: data.id,
          feature_id: f
        }));

        await adminDbController.Models.PartnerSubscriptionPlanfeatureMapping.bulkCreate(featureMappings, {
          transaction: t
        });
      }

      await t.commit();

      if (!plan.razorpay_plan_id) {
        try {
          const fresh =
            await adminDbController.Models.PartnerSubscriptionPlans.findByPk(
              data.id
            );
          await syncPlanToRazorpay(fresh?.toJSON ? fresh.toJSON() : fresh);
        } catch (syncError) {
          console.error(
            "[updatepartnersubscription] Razorpay plan sync failed:",
            syncError?.message || syncError
          );
        }
      }

      return { message: "Plan updated successfully" };

    } catch (error) {
      await t.rollback();
      console.log("🚀 updatepartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to update subscription plan");    }
  },
  deletepartnersubscription: async (id) => {
    try {

      const plan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: id }
      });

      if (!plan) throw new Error("Plan not found");

      await adminDbController.Models.PartnerSubscriptionPlans.update({
        is_active: 0
      }, {
        where: { plan_id: id }
      });

      return { message: "Plan deactivated successfully" };

    } catch (error) {
      console.log("🚀 deletepartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to delete subscription plan");
    }
  },
  getallpartnersubscriptionfeatures: async () => {
  try {
    const Featureplans = await adminDbController.Models.PartnerSubscriptionPlanfeatures.findAll();
    return Featureplans;
  } catch (error) {
    console.log("🚀 getallpartnersubscription error:", error);
    throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
  }
  },
  createSubscription: async (data) => {
    const t = await connection.transaction();
    try {

      const plan = await adminDbController.Models.PartnerSubscriptionPlans.findOne({
        where: { plan_id: data.plan_id }
      });

      if (!plan) throw new Error("Invalid Plan");

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + plan.duration_months);

      const subscription = await adminDbController.Models.PartnerSubscriptions.create({
        salon_id: data.salon_id,
        plan_id: data.plan_id,
        start_date: startDate,
        end_date: endDate,
        amount_paid: plan.price,
        payment_status: 'pending'
      }, { transaction: t });

      // Payment entry
      await adminDbController.Models.PartnerSubscriptionsPayments.create({
        subscription_id: subscription.subscription_id,
        salon_id: data.salon_id,
        amount: plan.price,
        payment_method: data.payment_method,
        payment_status: 'pending'
      }, { transaction: t });

      await t.commit();

      return subscription;

    } catch (error) {
      await t.rollback();
      console.log("🚀 createSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to create subscription");
    }
  },

  // ── Partner Invoice (daily booking summary per salon) ──────────────────

  /**
   * Partners with at least one appointment on the invoice day.
   * Day = appointment booking_date (salon visit day), Asia/Kolkata calendar.
   * Optional data.date (YYYY-MM-DD); defaults to today IST.
   */
  getInvoicePartnersToday: async (data = {}) => {
    try {
      const invoiceDate = resolveInvoiceDate(data?.date);

      let statusFilter = null;
      if (data?.status != null && String(data.status).trim() !== "") {
        statusFilter = String(data.status).trim();
        if (!["completed", "pending"].includes(statusFilter)) {
          throw Error.BadRequest("status must be completed or pending");
        }
      }

      const rows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          d.whatsapp_number AS partner_whatsapp,
          COUNT(DISTINCT a.id) AS booking_count,
          ip.id AS payout_id,
          ip.amount AS payout_amount,
          ip.marked_by AS payout_marked_by,
          ip.paid_at AS payout_paid_at
        FROM appointments a
        INNER JOIN Store d ON a.store_id = d.id
        LEFT JOIN InvoicePayouts ip ON ip.store_id = d.id AND ip.invoice_date = :invoiceDate
        WHERE DATE(a.booking_date) = :invoiceDate
          AND a.status != 'cancelled'
        GROUP BY d.id, d.name, d.phone, d.email, d.whatsapp_number, ip.id, ip.amount, ip.marked_by, ip.paid_at
        ${statusFilter === "completed" ? "HAVING ip.id IS NOT NULL" : ""}
        ${statusFilter === "pending" ? "HAVING ip.id IS NULL" : ""}
        ORDER BY d.name ASC
        `,
        {
          replacements: { invoiceDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      const totalBookings = rows.reduce(
        (sum, row) => sum + Number(row.booking_count || 0),
        0
      );

      return {
        date: invoiceDate,
        total_bookings: totalBookings,
        total_partners: rows.length,
        partners: rows.map((row) => ({
          partner_id: row.partner_id,
          partner_name: row.partner_name,
          partner_phone: row.partner_phone,
          partner_email: row.partner_email,
          partner_whatsapp: row.partner_whatsapp,
          booking_count: Number(row.booking_count || 0),
          payout_status: row.payout_id ? "completed" : "pending",
          payout_amount: row.payout_id ? Number(row.payout_amount || 0) : null,
          payout_marked_by: row.payout_marked_by ?? null,
          payout_paid_at: row.payout_paid_at ?? null,
        })),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoicePartnersToday error:", error);
      throw Error.SomethingWentWrong("Failed to fetch today's invoice partners");
    }
  },

  // Line-item breakdown for one partner's appointments on the invoice day
  // (booking_date). Priced by "important" flag: important → full amount,
  // otherwise discounted when present.
  getInvoiceDetailsForPartner: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const invoiceDate = resolveInvoiceDate(data?.date);

      const storeRows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          d.whatsapp_number AS partner_whatsapp,
          f.addressLine1, f.addressLine2, f.area, f.city, f.district, f.state, f.zipcode
        FROM Store d
        LEFT JOIN PartnerAddress f ON d.address_id = f.id
        WHERE d.id = :partnerId
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      if (!storeRows.length) {
        throw Error.NotFound("Partner not found");
      }

      const itemRows = await adminDbController.connection.query(
        `
        SELECT
          a.id AS appointment_id,
          a.booking_date AS appointment_date,
          a.created_at AS order_time,
          e.\`from\` AS slot_from,
          a.status,
          a.payment_status,
          ai.service_amount AS charged_amount,
          ss.id AS service_id,
          ss.service_name,
          ss.amount AS service_amount,
          ss.important AS service_important,
          cb.id AS combo_id,
          cb.combo AS combo_name,
          cb.amount AS combo_amount
        FROM appointments a
        INNER JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ai.service_id = ss.id
        LEFT JOIN Combo cb ON ai.combo_id = cb.id
        LEFT JOIN Slots e ON a.slot_id = e.id
        WHERE a.store_id = :partnerId
          AND DATE(a.booking_date) = :invoiceDate
          AND a.status != 'cancelled'
        ORDER BY a.booking_date ASC, e.\`from\` ASC, a.id ASC
        `,
        {
          replacements: {
            partnerId: data.partner_id,
            invoiceDate,
          },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      let total = 0;
      let totalDiscount = 0;
      const items = itemRows
        .map((row) => {
          let serviceName;
          let baseAmount;
          let important = false;

          if (row.service_id) {
            serviceName = row.service_name;
            important = !!row.service_important;
            baseAmount = Number(row.service_amount) || 0;
          } else if (row.combo_id) {
            serviceName = row.combo_name;
            baseAmount = Number(row.combo_amount) || 0;
          } else {
            return null;
          }

          // The amount actually billed for this booking — already reflects
          // whichever flat/tiered discount applied at the time it was
          // booked (see appointment_items.service_amount / resolveDiscountedAmount).
          // We do NOT recompute this from the service's current pricing,
          // since that would ignore tiers and drift if prices changed since.
          // Important services are always shown at full price, no discount.
          const amount = important ? baseAmount : (Number(row.charged_amount) || 0);
          const discountApplied = Math.max(0, Number((baseAmount - amount).toFixed(2)));

          total += amount;
          totalDiscount += discountApplied;

          return {
            appointment_id: row.appointment_id,
            // booking_date is date-only (it reads as 05:30 IST), so the real
            // appointment time is the booked slot's start - same as the
            // partner app. null when the booking has no slot.
            booking_time: row.slot_from
              ? buildAppointmentDateTime(row.appointment_date, row.slot_from)
              : null,
            appointment_date: row.appointment_date,
            order_time: row.order_time,
            status: row.status,
            payment_status: row.payment_status,
            service_name: serviceName,
            important,
            base_amount: Number(baseAmount.toFixed(2)),
            discount_applied: discountApplied,
            amount: Number(amount.toFixed(2)),
          };
        })
        .filter(Boolean);

      const store = storeRows[0];

      const payoutRows = await adminDbController.connection.query(
        `
        SELECT id, amount, marked_by, paid_at, subscription_deducted
        FROM InvoicePayouts
        WHERE store_id = :partnerId AND invoice_date = :invoiceDate
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id, invoiceDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const payout = payoutRows[0];

      // Read-only preview of what a manual subscription deduction WOULD be
      // if this day's payout were marked paid right now. Nothing is
      // mutated here — markInvoicePayout does the actual accrual commit.
      //
      // totalDue is EVERYTHING currently owed (can span multiple stacked
      // cycles, see accrueDue) — it is NOT what comes out of this one
      // invoice. Only min(totalDue, thisInvoiceGross) can ever be deducted
      // from a single day; whatever's left over is remainingDebt, carried
      // forward to be deducted from future invoices.
      let totalDue = 0;
      let subscriptionPlanAmount = null;
      let subscriptionGstAmount = null;
      const sub = await adminDbController.app.getActiveManualSubscription(data.partner_id);
      if (sub) {
        totalDue = accrueDue(sub, invoiceDate).due;
        // Per-cycle breakdown (plan + GST), for display next to the
        // deduction — totalDue can be a multiple of this if more than one
        // cycle stacked up (see accrueDue).
        subscriptionPlanAmount = Number(sub.plan_amount);
        subscriptionGstAmount = Number(
          (cycleFee(sub.plan_amount) - subscriptionPlanAmount).toFixed(2)
        );
      }
      const grossAmount = Number(total.toFixed(2));
      const deductionToday = Number(Math.min(totalDue, grossAmount).toFixed(2));
      const remainingDebt = Number((totalDue - deductionToday).toFixed(2));

      return {
        partner: {
          id: store.partner_id,
          name: store.partner_name,
          phone: store.partner_phone,
          whatsapp_number: store.partner_whatsapp,
          email: store.partner_email,
          address: [store.addressLine1, store.addressLine2, store.area, store.city, store.district]
            .filter(Boolean)
            .join(", "),
          state: store.state,
          zipcode: store.zipcode,
        },
        date: invoiceDate,
        items,
        total_bookings: items.length,
        total_amount: grossAmount,
        total_discount: Number(totalDiscount.toFixed(2)),
        subscription_total_due: Number(totalDue.toFixed(2)),
        subscription_deduction_today: deductionToday,
        subscription_remaining_debt: remainingDebt,
        subscription_plan_amount: subscriptionPlanAmount,
        subscription_gst_amount: subscriptionGstAmount,
        net_payout_preview: Number((grossAmount - deductionToday).toFixed(2)),
        payout_status: payout ? "completed" : "pending",
        payout_amount: payout ? Number(payout.amount || 0) : null,
        payout_marked_by: payout?.marked_by ?? null,
        payout_paid_at: payout?.paid_at ?? null,
        payout_subscription_deducted: payout ? Number(payout.subscription_deducted || 0) : null,
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoiceDetailsForPartner error:", error);
      throw Error.SomethingWentWrong("Failed to fetch invoice details");
    }
  },

  // Active PartnerManualSubscriptions row for a partner, or null. Entirely
  // separate from the Razorpay-driven PartnerSubscriptions system.
  getActiveManualSubscription: async (storeId) => {
    try {
      const rows = await adminDbController.connection.query(
        `
        SELECT id, store_id, plan_amount, status, outstanding_due, next_due_date, activated_at
        FROM PartnerManualSubscriptions
        WHERE store_id = :storeId AND status = 'active'
        LIMIT 1
        `,
        {
          replacements: { storeId },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      return rows[0] || null;
    } catch (error) {
      console.log("🚀 ~ getActiveManualSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscription");
    }
  },

  // Mark a partner's daily invoice as paid out. Idempotent upsert keyed on
  // (store_id, invoice_date); snapshots the current invoice total as the
  // paid amount for audit purposes. If the partner has an active manual
  // subscription, this is also where the monthly fee is actually deducted
  // (getInvoiceDetailsForPartner only ever previews it, never commits it).
  markInvoicePayout: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const invoiceDate = resolveInvoiceDate(data?.date);

      const invoice = await adminDbController.app.getInvoiceDetailsForPartner({
        partner_id: data.partner_id,
        date: invoiceDate,
      });

      if (!invoice.total_bookings) {
        throw Error.BadRequest("No bookings found for this partner on this date");
      }

      let payoutAmount = invoice.total_amount;
      let subscriptionDeducted = 0;
      let outstandingBefore = null;
      let nextDueBefore = null;

      const sub = await adminDbController.app.getActiveManualSubscription(data.partner_id);
      if (sub) {
        outstandingBefore = Number(sub.outstanding_due) || 0;
        nextDueBefore = sub.next_due_date;

        const { due, nextDue } = accrueDue(sub, invoiceDate);
        subscriptionDeducted = Number(Math.min(due, invoice.total_amount).toFixed(2));
        const remainingDue = Number((due - subscriptionDeducted).toFixed(2));
        payoutAmount = Number((invoice.total_amount - subscriptionDeducted).toFixed(2));

        await adminDbController.connection.query(
          `UPDATE PartnerManualSubscriptions SET outstanding_due = :remainingDue, next_due_date = :nextDue WHERE id = :id`,
          {
            replacements: { remainingDue, nextDue, id: sub.id },
            type: Sequelize.QueryTypes.UPDATE,
          }
        );
      }

      await adminDbController.connection.query(
        `
        INSERT INTO InvoicePayouts
          (store_id, invoice_date, amount, marked_by, paid_at, subscription_deducted, subscription_outstanding_before, subscription_next_due_before)
        VALUES
          (:partnerId, :invoiceDate, :amount, :markedBy, NOW(), :subscriptionDeducted, :outstandingBefore, :nextDueBefore)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          marked_by = VALUES(marked_by),
          paid_at = NOW(),
          subscription_deducted = VALUES(subscription_deducted),
          subscription_outstanding_before = VALUES(subscription_outstanding_before),
          subscription_next_due_before = VALUES(subscription_next_due_before)
        `,
        {
          replacements: {
            partnerId: data.partner_id,
            invoiceDate,
            amount: payoutAmount,
            markedBy: data.marked_by ?? null,
            subscriptionDeducted,
            outstandingBefore,
            nextDueBefore,
          },
          type: Sequelize.QueryTypes.INSERT,
        }
      );

      return await adminDbController.app.getInvoiceDetailsForPartner({
        partner_id: data.partner_id,
        date: invoiceDate,
      });
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ markInvoicePayout error:", error);
      throw Error.SomethingWentWrong("Failed to mark invoice as paid");
    }
  },

  // Revert a payout (admin mis-click). Deleting a non-existent row is a
  // no-op, so this is safe to call idempotently. If that payout had
  // deducted a manual subscription fee, restores the subscription's
  // outstanding_due/next_due_date back to their exact pre-deduction
  // snapshot — correct as long as this is undoing the most recent
  // subscription-affecting payout for that partner (the normal "oops,
  // undo my last click" use case this button serves).
  undoInvoicePayout: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const invoiceDate = resolveInvoiceDate(data?.date);

      const existingRows = await adminDbController.connection.query(
        `
        SELECT subscription_deducted, subscription_outstanding_before, subscription_next_due_before
        FROM InvoicePayouts
        WHERE store_id = :partnerId AND invoice_date = :invoiceDate
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id, invoiceDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const existing = existingRows[0];

      if (existing && Number(existing.subscription_deducted) > 0) {
        await adminDbController.connection.query(
          `UPDATE PartnerManualSubscriptions SET outstanding_due = :outstandingBefore, next_due_date = :nextDueBefore WHERE store_id = :partnerId`,
          {
            replacements: {
              outstandingBefore: existing.subscription_outstanding_before,
              nextDueBefore: existing.subscription_next_due_before,
              partnerId: data.partner_id,
            },
            type: Sequelize.QueryTypes.UPDATE,
          }
        );
      }

      await adminDbController.connection.query(
        `DELETE FROM InvoicePayouts WHERE store_id = :partnerId AND invoice_date = :invoiceDate`,
        {
          replacements: { partnerId: data.partner_id, invoiceDate },
          type: Sequelize.QueryTypes.DELETE,
        }
      );

      return await adminDbController.app.getInvoiceDetailsForPartner({
        partner_id: data.partner_id,
        date: invoiceDate,
      });
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ undoInvoicePayout error:", error);
      throw Error.SomethingWentWrong("Failed to undo invoice payout");
    }
  },

  // ── Partner Manual Subscriptions (free bookings -> flat monthly fee) ──
  // Entirely separate from the Razorpay-driven PartnerSubscriptions system.

  // Partners who have used up their free bookings (admin-set
  // free_booking_limit, default 15) with no active manual subscription
  // yet — the "needs subscription" list on the admin page.
  getPartnersNeedingManualSubscription: async () => {
    try {
      const { free_booking_limit: limit } = await adminDbController.app.getFreeBookingLimit();
      return await adminDbController.connection.query(
        `
        SELECT d.id AS partner_id, d.name AS partner_name, d.phone AS partner_phone,
               d.email AS partner_email, d.total_booking_count
        FROM Store d
        WHERE d.total_booking_count >= :limit
          AND NOT EXISTS (
            SELECT 1 FROM PartnerManualSubscriptions pms
            WHERE pms.store_id = d.id AND pms.status = 'active'
          )
        ORDER BY d.total_booking_count DESC
        `,
        { replacements: { limit }, type: Sequelize.QueryTypes.SELECT }
      );
    } catch (error) {
      console.log("🚀 ~ getPartnersNeedingManualSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partners needing subscription");
    }
  },

  getAllManualPartnerSubscriptions: async () => {
    try {
      return await adminDbController.connection.query(
        `
        SELECT pms.id, pms.store_id, d.name AS partner_name, d.phone AS partner_phone,
               pms.plan_amount, pms.status, pms.outstanding_due, pms.next_due_date, pms.activated_at
        FROM PartnerManualSubscriptions pms
        INNER JOIN Store d ON d.id = pms.store_id
        ORDER BY pms.status ASC, pms.activated_at DESC
        `,
        { type: Sequelize.QueryTypes.SELECT }
      );
    } catch (error) {
      console.log("🚀 ~ getAllManualPartnerSubscriptions error:", error);
      throw Error.SomethingWentWrong("Failed to fetch partner subscriptions");
    }
  },

  // Creates (or reactivates + resets) a partner's manual subscription. The
  // first cycle's fee becomes due immediately — next_due_date = today, so
  // the very next accrueDue() call (preview or a Payout click) picks it up.
  assignManualPartnerSubscription: async (data) => {
    try {
      if (!data.store_id) throw Error.BadRequest("store_id is required");
      const planAmount = Number(data.plan_amount);
      if (!planAmount || planAmount <= 0) {
        throw Error.BadRequest("plan_amount must be a positive number");
      }

      const today = toIstDatePart(new Date());

      await adminDbController.connection.query(
        `
        INSERT INTO PartnerManualSubscriptions (store_id, plan_amount, status, outstanding_due, next_due_date, activated_at, deactivated_at)
        VALUES (:storeId, :planAmount, 'active', 0, :today, :today, NULL)
        ON DUPLICATE KEY UPDATE
          plan_amount = VALUES(plan_amount),
          status = 'active',
          outstanding_due = 0,
          next_due_date = VALUES(next_due_date),
          activated_at = VALUES(activated_at),
          deactivated_at = NULL
        `,
        {
          replacements: { storeId: data.store_id, planAmount, today },
          type: Sequelize.QueryTypes.INSERT,
        }
      );

      return await adminDbController.app.getActiveManualSubscription(data.store_id);
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ assignManualPartnerSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to assign partner subscription");
    }
  },

  // Updates only the plan amount — applies from the next accrual onward,
  // not retroactively to the current cycle's already-accrued due amount.
  updateManualPartnerSubscription: async (data) => {
    try {
      if (!data.store_id) throw Error.BadRequest("store_id is required");
      const planAmount = Number(data.plan_amount);
      if (!planAmount || planAmount <= 0) {
        throw Error.BadRequest("plan_amount must be a positive number");
      }

      const existing = await adminDbController.app.getActiveManualSubscription(data.store_id);
      if (!existing) {
        throw Error.NotFound("No active subscription found for this partner");
      }

      await adminDbController.connection.query(
        `UPDATE PartnerManualSubscriptions SET plan_amount = :planAmount WHERE store_id = :storeId`,
        {
          replacements: { planAmount, storeId: data.store_id },
          type: Sequelize.QueryTypes.UPDATE,
        }
      );

      return await adminDbController.app.getActiveManualSubscription(data.store_id);
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ updateManualPartnerSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to update partner subscription");
    }
  },

  deactivateManualPartnerSubscription: async (data) => {
    try {
      if (!data.store_id) throw Error.BadRequest("store_id is required");

      // deactivated_at is what lets the dashboard count this subscription
      // as active for the months before today. Only stamped on the
      // active -> inactive transition so a repeat click keeps the real date.
      await adminDbController.connection.query(
        `UPDATE PartnerManualSubscriptions
         SET deactivated_at = IF(status = 'active', :today, deactivated_at), status = 'inactive'
         WHERE store_id = :storeId`,
        {
          replacements: { storeId: data.store_id, today: toIstDatePart(new Date()) },
          type: Sequelize.QueryTypes.UPDATE,
        }
      );

      return { store_id: data.store_id, status: "inactive" };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ deactivateManualPartnerSubscription error:", error);
      throw Error.SomethingWentWrong("Failed to deactivate partner subscription");
    }
  },

  // One-off maintenance action: zeroes User.paid_booking_count for every
  // user, so tiered-discount pricing treats everyone as brand new from
  // this point forward instead of counting their pre-existing booking
  // history (per client decision — history should not count). Manually
  // triggered on demand (e.g. after a Docker rebuild); does not touch the
  // migration that originally backfilled this column, which stays as-is.
  resetAllUserPaidBookingCounts: async () => {
    try {
      // loyalty_status is derived from paid_booking_count, so it's reset
      // alongside it here to avoid the two columns drifting out of sync.
      const [affectedCount] = await adminDbController.Models.User.update(
        { paid_booking_count: 0, loyalty_status: "new_user" },
        { where: {} }
      );
      return { reset_count: affectedCount };
    } catch (error) {
      console.log("🚀 ~ resetAllUserPaidBookingCounts error:", error);
      throw Error.SomethingWentWrong("Failed to reset user booking counts");
    }
  },

  generateInvoicePDFForPartner: async (data) => {
    try {
      const invoice = await adminDbController.app.getInvoiceDetailsForPartner(data);
      const pdfBuffer = await generateInvoicePDF(invoice);
      return pdfBuffer;
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ generateInvoicePDFForPartner error:", error);
      throw Error.SomethingWentWrong("Failed to generate invoice PDF");
    }
  },

  // ── Partner Invoice (monthly booking summary per salon) ─────────────────

  /**
   * Partners with at least one appointment in the invoice month.
   * Month = appointment booking_date month (salon visit day), Asia/Kolkata calendar.
   * Optional data.month (YYYY-MM); defaults to current month IST.
   */
  getInvoicePartnersMonthly: async (data = {}) => {
    try {
      const { month, fromDate, toDate } = resolveInvoiceMonthRange(data?.month);

      const rows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          COUNT(DISTINCT a.id) AS booking_count
        FROM appointments a
        INNER JOIN Store d ON a.store_id = d.id
        WHERE DATE(a.booking_date) BETWEEN :fromDate AND :toDate
          AND a.status != 'cancelled'
        GROUP BY d.id, d.name, d.phone, d.email
        ORDER BY d.name ASC
        `,
        {
          replacements: { fromDate, toDate },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      const totalBookings = rows.reduce(
        (sum, row) => sum + Number(row.booking_count || 0),
        0
      );

      return {
        month,
        from_date: fromDate,
        to_date: toDate,
        total_bookings: totalBookings,
        total_partners: rows.length,
        partners: rows.map((row) => ({
          partner_id: row.partner_id,
          partner_name: row.partner_name,
          partner_phone: row.partner_phone,
          partner_email: row.partner_email,
          booking_count: Number(row.booking_count || 0),
        })),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoicePartnersMonthly error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly invoice partners");
    }
  },

  // Line-item breakdown for one partner's appointments in the invoice month
  // (booking_date). Priced by "important" flag: important → full amount,
  // otherwise discounted when present.
  getInvoiceDetailsForPartnerMonthly: async (data) => {
    try {
      if (!data.partner_id) {
        throw Error.BadRequest("partner_id is required");
      }

      const { month, fromDate, toDate } = resolveInvoiceMonthRange(data?.month);

      const storeRows = await adminDbController.connection.query(
        `
        SELECT
          d.id AS partner_id,
          d.name AS partner_name,
          d.phone AS partner_phone,
          d.email AS partner_email,
          f.addressLine1, f.addressLine2, f.area, f.city, f.district, f.state, f.zipcode
        FROM Store d
        LEFT JOIN PartnerAddress f ON d.address_id = f.id
        WHERE d.id = :partnerId
        LIMIT 1
        `,
        {
          replacements: { partnerId: data.partner_id },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      if (!storeRows.length) {
        throw Error.NotFound("Partner not found");
      }

      const itemRows = await adminDbController.connection.query(
        `
        SELECT
          a.id AS appointment_id,
          a.booking_date AS appointment_date,
          a.created_at AS order_time,
          e.\`from\` AS slot_from,
          a.status,
          a.payment_status,
          ai.service_amount AS charged_amount,
          ss.id AS service_id,
          ss.service_name,
          ss.amount AS service_amount,
          ss.important AS service_important,
          cb.id AS combo_id,
          cb.combo AS combo_name,
          cb.amount AS combo_amount
        FROM appointments a
        INNER JOIN appointment_items ai ON ai.appointment_id = a.id
        LEFT JOIN StoreServices ss ON ai.service_id = ss.id
        LEFT JOIN Combo cb ON ai.combo_id = cb.id
        LEFT JOIN Slots e ON a.slot_id = e.id
        WHERE a.store_id = :partnerId
          AND DATE(a.booking_date) BETWEEN :fromDate AND :toDate
          AND a.status != 'cancelled'
        ORDER BY a.booking_date ASC, e.\`from\` ASC, a.id ASC
        `,
        {
          replacements: {
            partnerId: data.partner_id,
            fromDate,
            toDate,
          },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      let total = 0;
      let totalDiscount = 0;
      const items = itemRows
        .map((row) => {
          let serviceName;
          let baseAmount;
          let important = false;

          if (row.service_id) {
            serviceName = row.service_name;
            important = !!row.service_important;
            baseAmount = Number(row.service_amount) || 0;
          } else if (row.combo_id) {
            serviceName = row.combo_name;
            baseAmount = Number(row.combo_amount) || 0;
          } else {
            return null;
          }

          // Actual billed amount for this booking (already reflects
          // whatever flat/tiered discount applied at booking time) —
          // not recomputed from the service's current pricing.
          // Important services are always shown at full price, no discount.
          const amount = important ? baseAmount : (Number(row.charged_amount) || 0);
          const discountApplied = Math.max(0, Number((baseAmount - amount).toFixed(2)));

          total += amount;
          totalDiscount += discountApplied;

          return {
            appointment_id: row.appointment_id,
            // booking_date is date-only (it reads as 05:30 IST), so the real
            // appointment time is the booked slot's start - same as the
            // partner app. null when the booking has no slot.
            booking_time: row.slot_from
              ? buildAppointmentDateTime(row.appointment_date, row.slot_from)
              : null,
            appointment_date: row.appointment_date,
            order_time: row.order_time,
            status: row.status,
            payment_status: row.payment_status,
            service_name: serviceName,
            important,
            base_amount: Number(baseAmount.toFixed(2)),
            discount_applied: discountApplied,
            amount: Number(amount.toFixed(2)),
          };
        })
        .filter(Boolean);

      const store = storeRows[0];

      return {
        partner: {
          id: store.partner_id,
          name: store.partner_name,
          phone: store.partner_phone,
          email: store.partner_email,
          address: [store.addressLine1, store.addressLine2, store.area, store.city, store.district]
            .filter(Boolean)
            .join(", "),
          state: store.state,
          zipcode: store.zipcode,
        },
        month,
        from_date: fromDate,
        to_date: toDate,
        items,
        total_bookings: items.length,
        total_amount: Number(total.toFixed(2)),
        total_discount: Number(totalDiscount.toFixed(2)),
      };
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ getInvoiceDetailsForPartnerMonthly error:", error);
      throw Error.SomethingWentWrong("Failed to fetch monthly invoice details");
    }
  },

  generateMonthlyInvoicePDFForPartner: async (data) => {
    try {
      const invoice = await adminDbController.app.getInvoiceDetailsForPartnerMonthly(data);
      const pdfBuffer = await generateMonthlyInvoicePDF(invoice);
      return pdfBuffer;
    } catch (error) {
      if (error.status) throw error;
      console.log("🚀 ~ generateMonthlyInvoicePDFForPartner error:", error);
      throw Error.SomethingWentWrong("Failed to generate monthly invoice PDF");
    }
  },

};
