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
import { partnerDbController } from "./partnerDbController.js";
import { uploadToS3, S3upload, deleteIfExists } from "../../utils/s3/s3Upload.js";
import logger from "../../utils/logger.js";
import { logErrorToDB } from "../../utils/loggerDB.js";

const ALLOWED_STATUS_TRANSITIONS = {
  booked: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};



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
      return await adminDbController.Models.User.findAll({
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilepic', 'status'],
        order: [['id', 'DESC']]
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users");
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
  gettopsaloons: async () => {
    try {
      let sql = `SELECT S.id, S.name, S.email, S.phone, S.images, COUNT(A.id) AS total_appointments
                   FROM Store S
                   LEFT JOIN appointments A ON S.id = A.store_id AND A.status = 'completed' || 'booked'
                   WHERE S.status = 'active'
                   GROUP BY S.id
                   ORDER BY total_appointments DESC
                   LIMIT 10`;
      return await adminDbController.connection.query(sql, {
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
  getaverageordervalue: async () => {
    try {
      const totalSales = await adminDbController.Models.appointments.sum('amount', {
        where: {
          status: "completed"
        }
      });
      const totalOrders = await adminDbController.Models.appointments.count({
        where: {
          status: "completed"
        }
      });
      return totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : 0;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch average order value");
    }
  },
  getotalsales: async () => {
    try {
      return await adminDbController.Models.appointments.sum('discounted_amount', {
        where: {
          status: "completed"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total sales");
    }
  },
  getotalsalescount: async () => {
    try {
      return await adminDbController.Models.appointments.count({
        where: {
          status: "completed"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total sales count");
    }
  },
  gettotalpartner: async () => {
    try {
      return await adminDbController.Models.Store.count({
        where: {
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch total partners");
    }
  },
  getsalesbycategory: async () => {
    try {
      let sql = `SELECT c.name as category_name, SUM(a.amount) as total_sales 
              FROM category c 
              LEFT JOIN Store s ON c.id = s.category_id 
              LEFT JOIN appointments a ON s.id = a.store_id 
              GROUP BY c.name 
              ORDER BY total_sales`;
      return await adminDbController.connection.query(sql, { type: Sequelize.QueryTypes.SELECT });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch sales by category");
    }
  },
  getgendersales: async () => {
    try {
      let sql = `SELECT 
         SUM(CASE WHEN u.gender = 'Male' THEN 1 ELSE 0 END) as total_men_count,
         SUM(CASE WHEN u.gender = 'Male' THEN a.discounted_amount ELSE 0 END) as total_men_sales,
         SUM(CASE WHEN u.gender = 'Female' THEN 1 ELSE 0 END) as total_women_count,
         SUM(CASE WHEN u.gender = 'Female' THEN a.discounted_amount ELSE 0 END) as total_women_sales
         FROM appointments a 
         JOIN User u ON a.user_id = u.id 
         WHERE a.status = 'completed'`;
      return await adminDbController.connection.query(sql, { type: Sequelize.QueryTypes.SELECT });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get gender sales");
    }
  },
  getmonthlysales: async (year) => {
    try {
      let sql = `SELECT DATE_FORMAT(a.booking_date, '%Y-%m') as month, SUM(a.discounted_amount) as total_sales
          FROM appointments a
          WHERE a.status = 'completed' 
          AND  YEAR(a.booking_date) = :year  
          GROUP BY month
          ORDER BY month DESC`;
      return await adminDbController.connection.query(sql, {
        replacements: { year: year },
        type: Sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      //////console.log("🚀 ~ getmonthlysales:async ~ error:", error)
      throw Error.SomethingWentWrong("Failed to fetch monthly sales");
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
  
  addnotificationlogsadmin: async (data) => {
    try {
      return await adminDbController.Models.Adminnotificationlogs.create({
        store_id: data?.store_id || null,
        notification_type: data?.notification_type || null,
        sent_to: data?.sent_to || null,
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
  getallusersdeviceId: async () => {
    try {
      const res = await adminDbController.Models.User.findAll({
        where: {
          status: "active",
          device_id: {
            [Op.ne]: null
          }
        },
        attributes: [
          ['device_id', 'device_id'],
          ['id', 'user_id'],
          ['profilePic', 'profilePic']
        ]
      })
      return res;

    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users device ID");
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
  updaterequest: async (data) => {
    try {
      return await adminDbController.Models.refund_requests.update({
        status: data.status,
      }, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update request");
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
        DATE_FORMAT(a.booking_date, '%Y-%m-%d %H:%i') AS booking_datetime,
        a.amount AS service_amount,
        a.discounted_amount AS discount_amount,
        (a.amount - a.discounted_amount) AS subtotal,
        (a.discounted_amount) + ROUND(((a.discounted_amount) * a.gst / 100), 2) AS payable_amount,
        DATE_FORMAT(a.created_at, '%d %b, %Y') AS order_date
      FROM appointments a
      INNER JOIN User c ON a.user_id = c.id
      INNER JOIN Store d ON a.store_id = d.id
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
          DATE_FORMAT(a.booking_date, '%Y-%m-%d %H:%i') AS booking_datetime,
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
        duration: data.duration,
        status: data.status,

        // directly save integer
        priority: priorityValue,

        service_category: Number(data.category),
        service_for: data.service_for,
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
  editService: async (data) => {
    console.log('Edit Service AdminDB: ', data);

    try {
      const store = await adminDbController.Models.StoreServices.update({
        service_name: data.service_name,
        store_id: data.store_id,
        amount: data.amount,
        discounted_amount: data.discounted_amount,
        duration: data.duration,
        status: data.status,
        service_category: data.category,
        priority: data.priority,
        service_for: data.service_for
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
    const st = await adminDbController.Models.Store.update(
      {
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
      },
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
updateRefundBookingStatus: async ({body}) => {
  try {
    const booking =
      await adminDbController.Models.appointments.findOne({
        where: { id: body.bookingId },
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
      { where: { id: body.bookingId } }
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
  getuserdetails: async (body, id) => {
    try {
      return await adminDbController.Models.User.findOne({
        where: {
          status: "active",
          id: id
        },
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilepic', 'status'],
      });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch users");
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
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilePic', 'status', 'device_id','date_of_birth','age','gender']
      });
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to fetch user details");
    }
  },
  gettotalspent: async (id) => {
    try {
      const totalSpent = await adminDbController.Models.appointments.sum('amount', {
        where: {
          user_id: id,
          status: "booked" || "completed",
        }
      });
      return totalSpent || 0;
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

      const plan = await adminDbController.Models.PartnerSubscriptionPlans.create({
        plan_name: data.plan_name,
        price: data.price,
        duration_months: data.duration_months,
        booking_limit: data.booking_limit,
        is_unlimited: data.is_unlimited,
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

      // 2. Update plan
      await adminDbController.Models.PartnerSubscriptionPlans.update({
        plan_name: data.plan_name,
        price: data.price,
        duration_months: data.duration_months,
        booking_limit: data.booking_limit,
        is_unlimited: data.is_unlimited,
        sort_order: plan.sort_order,
        is_active: true
      }, {
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

      return { message: "Plan updated successfully" };

    } catch (error) {
      await t.rollback();
      console.log("🚀 updatepartnersubscription error:", error);
      throw Error.SomethingWentWrong("Failed to update subscription plan");
    }
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

 
  
};
