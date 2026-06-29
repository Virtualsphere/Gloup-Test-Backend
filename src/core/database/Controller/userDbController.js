import require from "requirejs";
import * as Error from "../../errors/ErrorConstant.js";
import { connection } from "../connection.js";
import * as Models from "../models/index.js";
import { deleteuser, gettransactions, validatecoupon } from "../../../User/controller/userappcontroller.js";
import { getdeviceId } from "../../../User/controller/userauthcontroller.js";
import redisClient from '../redisClient.js';
import {
  storeGenderCondition,
  storeGenderWhereSql,
} from "../../utils/storeGenderFilter.js";

const { appointments, StoreServices, Stylist, Servicecategory, Store, Languages, StoreLanguages } = Models;
const { Op, Sequelize } = require("sequelize");
var randomize = require('randomatic');

const formatDuration = (duration) => {
  if (!duration) return null;

  const [hours, minutes, seconds] = duration.split(":").map(Number);

  if (hours === 0) {
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} min`;
  }

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} hrs`;
};


export class userDbController { }
userDbController.scope = "defaultScope";
userDbController.Models = Models;
userDbController.connection = connection;
userDbController.defaults = {};

userDbController.auth = {
  oAuthUserLogin: async (data) => {
    try {
      return await userDbController.Models.User.findOne({
        where: {
          email: data.email,
        },
        raw: true,
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.InternalError();
    }
  },

  checkPhoneExists: async (data) => {
    try {
      return await userDbController.Models.User.findOne({
        where: {
          phone: data.phone
        }
      })
    } catch (error) {
      return null;
      // throw Error.InternalError("cannot get user data")
    }
  },
  insertsession: async (encryptedToken, userId, deviceinfo) => {
    //console.log("🚀 ~ encryptedToken:", encryptedToken)
    //console.log("🚀 ~ userId:", userId)
    //console.log("🚀 ~ deviceinfo:", deviceinfo)
    try {
      return await userDbController.Models.UserSession.create({
        user_id: userId,
        token: encryptedToken,
        ipv4: deviceinfo.userAgent,
        status: 'active',
      })
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.InternalError("cannot insert session data")
    }
  },
  adduser: async (email, name, given_name, role) => {
    try {
      return await userDbController.Models.User.create({
        firstname: name || null,
        email: email || null,
        status: "active",
        invited_code: randomize('a', 1) + randomize('0', 6) + email.slice(-3),
      }, {
        returning: true
      })
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError("cannot add user data")
    }
  },
  adduser1: async (email, name, given_name, role, apple_sub) => {
    try {
      return await userDbController.Models.User.create({
        firstname: name || null,
        email: email || null,
        status: "active",
        invited_code: randomize('a', 1) + randomize('0', 6) + email.slice(-3),
        apple_sub: apple_sub,
      }, {
        returning: true
      })
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError("cannot add user data")
    }
  },
  checksession: async (userId) => {
    try {
      return await userDbController.Models.UserSession.findOne({
        where: {
          user_id: userId,
          status: "active"
        }
      })
    } catch (error) {
      throw Error.InternalError("cannot get user session data")
    }
  },
  checkuser: async (data) => {
    try {
      const res = await userDbController.Models.User.findOne({
        where: {
          email: data,
          status: {
            [Op.in]: ["active", "inactive"]
          }
        }
      })
      return res;
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.InternalError("cannot get user data")
    }
  },
  checkUserByAppleSub: async (sub) => {
    try {
      // Query the User table using the new apple_sub column
      const user = await userDbController.Models.User.findOne({
        where: { apple_sub: sub },
      });
      return user ? user.toJSON() : null;
    } catch (error) {
      console.error("Error in checkUserByAppleSub:", error);
      throw error;
    }
  },
  updateUserAppleSub: async (userId, sub) => {
    try {
      await userDbController.Models.User.update(
        { apple_sub: sub },
        { where: { id: userId } }
      );
    } catch (error) {
      console.error("Error in updateUserAppleSub:", error);
      throw error;
    }
  },
  addDeviceId: async (deviceId, id) => {
    try {
      return await userDbController.Models.User.update({
        device_id: JSON.stringify(deviceId)
      }, {
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.InternalError("cannot add device id");
    }
  },
  updateOTPExpiry: async (data) => {
    try {
      return await userDbController.Models.User.update(
        { otp: 0, optExpiration: 0, status: "active" },
        { where: { id: data.id } },
        { plain: true, returning: true }
      );
    } catch (error) {
      throw Error.InternalError();
    }
  },
  createSession: async (token, device, customerId) => {
    try {
      await redisClient.setEx(`session:${token}`, 30 * 24 * 60 * 60, customerId.toString()); // 30 days
      return await userDbController.Models.UserSession.create({
        user_id: customerId,
        token: token,
        ipv4: device.ip || device.ipv,
        userAgent: device.userAgent,
        status: 'active',
      });
    } catch (error) {
      throw Error.InternalError();
    }
  },
  createOTPExpiry: async (data) => {
    try {
      return await userDbController.Models.User.update({
        opt: 0, optExpiration: data.expiry
      }, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      throw Error.InternalError("cannot set expiry ")
    }
  },
  createOTPLog: async (data) => {
    try {
      return await userDbController.Models.OtpLogs.create({
        userId: data.id,
        userName: data.firstname,
        phone: data.phone,
        requestId: data.requestId,
        smsType: data.type,
        msgType: data.msgType,
        userType: "user",
        status: "active",
      });
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.InternalError();
    }
  },
  createCustomer: async (body) => {
    try {
      return await userDbController.Models.User.create({
        phone: body.phone,
        status: "active",
        invited_code: randomize('a', 1) + randomize('0', 6) + body.phone.slice(-3),
      })
    } catch (error) {
      throw Error.InternalError("cannot create customer")
    }
  },
  findsession: async (token) => {
    try {
      const cachedUserId = await redisClient.get(`session:${token}`);
      if (cachedUserId) return { token: token, user_id: cachedUserId, status: 'active' };

      const dbSession = await userDbController.Models.UserSession.findOne({
        where: {
          token: token
        },
        raw: true
      });

      if (dbSession && dbSession.status === 'active') {
         await redisClient.setEx(`session:${token}`, 30 * 24 * 60 * 60, dbSession.user_id.toString());
      }
      return dbSession;
    } catch (error) {
      throw Error.InternalError();
    }
  },
  checkUserIdExists: async (data) => {
    //console.log("🚀 ~ data:", data)
    try {
      return await userDbController.Models.User.findOne({
        where: {
          id: data.id
        },
        raw: true
      })
    } catch (error) {
      //console.log("🚀 ~ error:", error)
      throw Error.InternalError();
    }
  },
  destroysession: async (token) => {
    try {
      await redisClient.del(`session:${token}`);
      return await userDbController.Models.UserSession.update({
        status: "expired"
      }, {
        where: {
          token: token
        },
        raw: true
      })
    } catch (error) {
      throw Error.InternalError();
    }
  },
  updateprofile: async (reqobj, pic, id) => {
    const user = await userDbController.Models.User.findOne({
      attributes: ["phone"],
      where: { id }
    });

    if (!user) throw Error.NotFound("User not found");
    if (user.phone) {
      if (reqobj.phone && String(reqobj.phone) !== String(user.phone)) {
        throw Error.BadRequest("Phone number cannot be updated again");
      }
    }
    const newPhone = user.phone ? user.phone : reqobj.phone;

    return await userDbController.Models.User.update({
      firstname: reqobj.firstname,
      lastname: reqobj.lastname,
      email: reqobj.email,
      phone: newPhone,
      profilePic: pic,
      gender: reqobj.gender,
      country: reqobj.country,
      date_of_birth: reqobj.date_of_birth,
      age: reqobj.age,
      city: reqobj.city || ''
    }, {
      where: { id }
    });
  },
  checkUserExists: async (data, id) => {
    try {
      return await userDbController.Models.User.findOne({
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.InternalError("could not get user data")
    }
  },

  updateUserStatus: async (userId, status) => {
    try {
      // ✅ Update user status
      const res = await userDbController.Models.User.update(
        {
          status: status
        },
        {
          where: { id: userId },
        }
      );

      // ✅ Audit log
      await userDbController.Models.AccountLogs.create({
        user_id: userId,
        action: "ACCOUNT_REACTIVATED",
        date: new Date(),
        description: `User account reactivated to status: ${status}`,
      });

      return res; // [affectedRows]

    } catch (error) {
      console.error("updateUserStatus error:", error);
      throw Error.InternalError("could not update user status");
    }
  },

  getdeviceId: async (data, id) => {
    try {
      return await userDbController.Models.User.findOne({
        where: {
          id: id
        },
        attributes: ['device_id']
      })
    } catch (error) {
      throw Error.InternalError("could not get device id")
    }
  },
  updatedeviceId: async (data, id) => {
    try {
      return await userDbController.Models.User.update({
        device_id: JSON.stringify(data)
      }, {
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.InternalError("could not update device id")
    }
  }
}

userDbController.app = {
  getprofile: async (id) => {
    try {
      return await userDbController.Models.User.findOne({ where: { id: id } })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  gettodayorders: async (date) => {
    try {
      let sql = `SELECT a.*,sl.from ,s.name ,u.* FROM appointments a JOIN Store s ON a.store_id = s.id JOIN Slots sl ON a.slot_id = sl.id JOIN User u ON a.user_id = u.id WHERE a.status = 'booked' AND DATE(a.booking_date) = :date`;

      return await connection.query(sql, { replacements: { date: date }, type: Sequelize.QueryTypes.SELECT });
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get today's orders");
    }
  },
  addusage: async (data, id) => {
    try {
      return await userDbController.Models.DiscountsUsed.create({
        discount_id: data.coupon_id,
        user_id: id
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addUsedCoupons: async (data, id) => {
    try {
      return await userDbController.Models.UsedCoupons.create({
        coupon_id: data,
        user_id: id
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getCouponUsageCount: async (data, id) => {
    try {
      return await userDbController.Models.UsedCoupons.count({
        where: {
          coupon_id: data.id,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getCouponUsageCount1: async (data, id) => {
    try {
      return await userDbController.Models.UsedCoupons.count({
        where: {
          coupon_id: data.coupon_id,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getreview: async (data, id) => {
    try {
      return await userDbController.Models.Reviews.findOne({
        where: {
          store_id: data.store_id,
          user_id: id,
          status: "active"
        },
        attributes: [
          'id',
          'rating',
          'review_description',
          'cretaed_at'
        ]
        //attributes: ['id', 'rating', 'review', 'createdAt']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get review");
    }
  },
  getusagecount: async (data, id) => {
    try {
      return await userDbController.Models.DiscountsUsed.count({
        where: {
          discount_id: data.coupon_id,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  updateaddress: async (id) => {
    try {
      return await userDbController.Models.PartnerAddress.update({
        radius: 3000
      }, {
        where: {
          status: "active",
          store_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update address");
    }
  },
  updatecompletion: async (id) => {
    try {
      return await userDbController.Models.Store.update({
        completion_status: "pending",
      }, {
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update completion percentage");
    }
  },
  updatecompletion_1: async (id) => {
    try {
      return await userDbController.Models.Store.update({
        completion_status: "completed",
      }, {
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to update completion percentage");
    }
  },
  getcompletionpercentage: async (data) => {
    try {
      let sql = `SELECT COUNT(ad.id) AS count, 'address' AS type FROM PartnerAddress ad WHERE ad.store_id = :id AND ad.status = 'active' UNION ALL 
     SELECT COUNT(st.id) AS count, 'store' AS type FROM Store st WHERE st.id = :id AND st.status = 'active' UNION ALL
     SELECT COUNT(s.id) AS count, 'service' AS type FROM StoreServices s WHERE s.store_id = :id AND s.status = 'active' UNION ALL 
     SELECT COUNT(w.id) AS count, 'working_hours' AS type FROM WorkingHours w WHERE w.store_id = :id UNION ALL 
     SELECT COUNT(a.id) AS count, 'aminities' AS type FROM StoreAminities a WHERE a.store_id = :id  UNION ALL 
     SELECT COUNT(p.id) AS count, 'professional' AS type FROM Stylist p WHERE p.store_id = :id AND p.status = 'active'`;

      const result = await connection.query(sql, { replacements: { id: data }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      //////console.log("🚀 ~ getcompletionpercentage: ~ error:", error)
      throw Error.SomethingWentWrong("Failed to get completion percentage");
    }
  },
  activatediscounts: async (date) => {
    try {
      return await userDbController.Models.Coupons.update({
        status: "active"
      }, {
        where: {
          start_date: {
            [Op.gt]: date
          },
          status: "active"
        },
        // returning: true
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to activate expired coupons");
    }
  },
  deactivatesdiscounts: async (date) => {
    try {
      return await userDbController.Models.Coupons.update({
        status: "inactive"
      }, {
        where: {
          end_date: {
            [Op.gt]: date
          },
          status: "inactive"
        },
        // returning: true
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to deactivate expired coupons");
    }
  },
  deactivatesubs: async (date) => {
    try {

      return await userDbController.Models.StoreSubscription.update({
        status: "inactive"
      }, {
        where: {
          end_date: {
            [Op.lt]: date
          },
          status: "active"
        },
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to deactivate expired subscriptions");
    }
  },
  getactiveplans: async (date) => {
    try {
      return await userDbController.Models.StoreSubscription.findAll({
        where: {
          end_date: {
            [Op.lt]: date
          },
          status: "active"
        },

      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to deactivate expired subscriptions");
    }
  },
  validatecoupon: async (data, id) => {
    try {
      const coupon = await userDbController.Models.Coupons.findOne({
        where: {
          code: data.code,
          status: "active",
        }
      })

      if (!coupon) {
        throw Error.BadRequest(`Invalid or inactive coupon code: ${code}`);
      }
      return coupon;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  validatecouponwithid: async (data, id) => {
    try {
      const coupon = await userDbController.Models.Coupons.findOne({
        where: {
          id: data,
          status: "active",
        }
      })

      if (!coupon) {
        throw Error.BadRequest(`Invalid or inactive coupon code: ${code}`);
      }
      return coupon;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getminimumprice: async (id) => {
    try {
      let sql = `SELECT MIN(amount) as minimum_price FROM StoreServices WHERE store_id = :id AND status = 'active'`;
      const result = await connection.query(sql, { replacements: { id: id }, type: Sequelize.QueryTypes.SELECT });
      return result[0] || { minimum_price: 0 }; // Return an object with minimum_price key
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getdiscount: async (couponid) => {
    try {
      return await userDbController.Models.Coupons.findOne({
        where: {
          id: couponid,
          status: "active"
        },
        attributes: ['id', 'usage_limit', 'discount_type', 'discount_value']
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getactivecoupons: async (id) => {
    try {
      return await userDbController.Models.Coupons.findAll({
        where: {
          status: "active",
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getappointmentbyid: async (id) => {
    try {
      return await userDbController.Models.appointments.findOne({
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getallfavourites: async (id) => {
    try {
      return await userDbController.Models.Favourites.findAll({
        where: {
          status: "active",
          user_id: id
        },
        attributes: ['store_id']
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getuser: async (data, id) => {
    try {
      return await userDbController.Models.User.findOne({
        where: {
          id: id
        },
        attributes: ['id', 'firstname', 'lastname', 'email', 'phone', 'profilePic']
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addwalletamount: async (store_id, amount) => {
    try {
      return await userDbController.Models.Store.increment(
        { wallet_remaining: amount }, {
        where:
          { id: store_id }
      }
      )
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getdeviceIdbypartner: async (id) => {
    try {
      return await userDbController.Models.Store.findOne({
        where: {
          id: id
        },
        attributes: ['deviceId']
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  topsaloons: async (data) => {
    try {
      // let sql = `
      // Select s.id as store_id , s.name , s.images , s.category_id,
      // sa.addressLine1, sa.addressLine2, sa.district, sa.city,
      // sa.zipcode, sa.latitude, sa.longitude,sa.location,
      // COUNT (a.id) as total_appointments FROM Store s JOIN PartnerAddress sa ON s.address_id = sa.id
      // LEFT JOIN appointments a ON s.id = a.store_id AND a.status = 'booked'
      // WHERE s.status = 'active' AND s.completion_status = 'completed' AND sa.status = 'active'
      // GROUP BY s.id ORDER BY total_appointments DESC LIMIT 10`;

      // const result = await connection.query(sql, { type: Sequelize.QueryTypes.SELECT });

      let sql = `Select s.id as store_id , s.name , s.images , s.category_id,sa.addressLine1, sa.addressLine2, sa.district, sa.city, sa.zipcode, sa.latitude, sa.longitude,sa.location,COUNT (a.id) as total_appointments,
      ST_Distance_Sphere(
        sa.location,
        ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
      ) AS distance_m
      FROM Store s JOIN PartnerAddress sa ON s.address_id = sa.id LEFT JOIN appointments a ON s.id = a.store_id AND a.status = 'booked' WHERE s.status = 'active' AND s.completion_status = 'completed' AND sa.status = 'active' GROUP BY s.id ORDER BY total_appointments DESC LIMIT 10`;

      const replacements = {
        user_lat: data.latitude,
        user_lng: data.longitude
      };

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      });
      return result
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getactivechairsubs: async (data, id) => {
    try {
      const res = await userDbController.Models.StoreSubscription.findOne({
        where: {
          store_id: data.store_id || data.saloon_id || data.id || id,
          status: "active",
          type: "chairs"
        }
      })
      return res;
    } catch (error) {
      console.error("Error in getactivechairsubs:", error);
      throw Error.SomethingWentWrong();
    }
  },
  getdeviceId: async (id) => {
    try {
      const res = await userDbController.Models.User.findOne({
        where: {
          id: id
        },
        attributes: ['device_id']
      })
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getnearbylocation: async () => {
    try {

    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getnotification: async (id) => {
    //console.log("🚀 ~ getnotification: ~ id:", id)
    try {
      return await userDbController.Models.NotificationLogs.findAll({
        where: {
          user_id: id
        },
        order: [['date', 'DESC']]
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getbanner: async () => {
    try {
      return await userDbController.Models.Banner.findAll({
        where: {
          status: "active"
        }
      })
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  getcombos: async (data) => {
    try {
      return await userDbController.Models.Combo.findAll({
        where: {
          store_id: data.id,
          status: "active"
        }
      })

    } catch (error) {
      throw Error.SomethingWentWrong();

    }
  },
  getstore: async (id) => {
    try {
      const res = await userDbController.Models.Store.findOne({
        where: {
          id: id
        }
      });
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addnotificationlogs: async (notify, userId, store) => {
    try {
      return await userDbController.Models.NotificationLogs.create({
        user_id: userId,
        title: notify.eventTitle,
        description: notify.eventDescription,
        image: store.images,
        status: "active",
        date: new Date()

      })
    } catch (error) {
      ////console.log("🚀 ~ addnotificationlogs: ~ error:", error)
      throw Error.SomethingWentWrong();

    }
  },
  addnotificationlogs_1: async (newdata) => {
    try {
      const sanitizedData = newdata.map(item => {
        // Convert image array to a string if it's an array
        let imageValue = item.image;
        // if (Array.isArray(imageValue)) {
        //   imageValue = imageValue[0]; 
        // }
        return {
          user_id: item.user_id,
          title: item.title,
          description: item.description,
          image: JSON.stringify(imageValue),
          status: item.status,
          date: item.date,
          notification_id: item.notification_id
        };
      });

      return await userDbController.Models.NotificationLogs.bulkCreate(sanitizedData);
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addnotificationlogspartner: async (notify, userId, user, store) => {
    try {
      return await userDbController.Models.PartnerNotificationLogs.create({
        partner_id: store.id,
        title: notify.eventTitle,
        description: notify.eventDescription,
        image: user.profilePic,
        status: "active",
        date: new Date()

      })
    } catch (error) {
      throw Error.SomethingWentWrong();

    }
  },
  addnotificationlogspartner_1: async (newdata) => {
    try {
      // Ensure image field is a single string value for each item
      const sanitizedData = newdata.map(item => ({
        partner_id: item.partner_id,
        title: item.title,
        description: item.description,
        image: item.image,
        status: item.status,
        date: item.date
      }));

      return await userDbController.Models.PartnerNotificationLogs.bulkCreate(sanitizedData);
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getordredetails: async (id) => {
    try {
      const res = await userDbController.Models.appointments.findOne({
        where: {
          razorpay_id: id
        }
      });
      return res;
    } catch (error) {
      throw Error.InternalError()
    }
  },
  getnearbystores: async (latitude, longitude, minLat, maxLat, minLng, maxLng) => {
    try {
      const sql = `
         SELECT
          s.id AS store_id,
          s.name,
          s.images,
          s.category_id,
          s.store_type,

          p.id,
          p.addressLine1,
          p.addressLine2,
          p.district,
          p.city,
          p.zipcode,
          p.latitude,
          p.longitude,

          ST_Distance_Sphere(
            p.location,
            ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
          ) AS distance_m,
          500000 AS allowed_m

        FROM Store s
        LEFT JOIN (
            SELECT *
            FROM PartnerAddress pa
            WHERE pa.id = (
                SELECT pa2.id
                FROM PartnerAddress pa2
                WHERE pa2.store_id = pa.store_id
                  AND pa2.status = 'active'
                ORDER BY pa2.id DESC
                LIMIT 1
            )
        ) p ON p.store_id = s.id

        WHERE
          p.location IS NOT NULL
          AND s.status = 'active'
          AND s.completion_status = 'completed'

          AND ST_X(p.location) BETWEEN :min_lng AND :max_lng
          AND ST_Y(p.location) BETWEEN :min_lat AND :max_lat

          AND ST_Distance_Sphere(
            p.location,
            ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
          ) <= 500000

        ORDER BY distance_m ASC;
              `;

      const replacements = {
        user_lat: latitude,
        user_lng: longitude,
        min_lat: minLat,
        max_lat: maxLat,
        min_lng: minLng,
        max_lng: maxLng
      };

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      });

      return result;
    } catch (error) {
      console.error(error);
      throw Error.SomethingWentWrong();
    }
  },
  //   getnearbystores: async (latitude, longitude, minLat, maxLat, minLng, maxLng) => {
  //   try {
  //     const sql = `
  //       SELECT
  //         s.id          AS store_id,
  //         s.name,
  //         s.images,
  //         s.category_id,
  //         s.store_type,
  //         p.addressLine1,
  //         p.addressLine2,
  //         p.district,
  //         p.city,
  //         p.zipcode,
  //         p.latitude,
  //         p.longitude
  //       FROM PartnerAddress AS p
  //       LEFT JOIN Store AS s
  //         ON p.store_id = s.id
  //       WHERE p.status = 'active'
  //         AND s.status = 'active' 
  //         AND s.completion_status = 'completed'
  //       ORDER BY
  //         s.id DESC
  //     `;

  //     const result = await connection.query(sql, {
  //       type: Sequelize.QueryTypes.SELECT
  //     });

  //     return result;
  //   } catch (error) {
  //     console.error(error);
  //     throw Error.SomethingWentWrong();
  //   }
  // },
  getmaxradius: async (id) => {
    try {
      return await userDbController.Models.PartnerAddress.max('radius', {
        where: {
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getnearbystorebyserach: async (latitude, longitude, minLat, maxLat, minLng, maxLng, search) => {
    console.log("🚀 ~ search:", search)
    try {
      const sql = `
  SELECT
    s.id AS store_id,
    s.name,
    s.images,
    s.category_id,
    s.store_type,
    p.addressLine1,
    p.addressLine2,
    p.district,
    p.city,
    p.zipcode,
    p.latitude,
    p.longitude,
    ST_Distance_Sphere(
      p.location,
      ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
    ) AS distance_m,
    COALESCE(500000, 500000) AS allowed_m
  FROM PartnerAddress AS p
  LEFT JOIN Store AS s
    ON p.store_id = s.id
  WHERE
    p.location IS NOT NULL AND p.status = 'active'
    AND s.status = 'active' AND s.completion_status = 'completed'
    AND s.name LIKE CONCAT('%', :search_term, '%')
    AND ST_X(p.location) BETWEEN :min_lng AND :max_lng
    AND ST_Y(p.location) BETWEEN :min_lat AND :max_lat
    AND ST_Distance_Sphere(
          p.location,
          ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
        ) <= COALESCE(500000, 500000)
  ORDER BY
    (s.id IS NOT NULL) DESC,
    distance_m ASC
`;

      const replacements = {
        user_lat: latitude,
        user_lng: longitude,
        min_lat: minLat,
        max_lat: maxLat,
        min_lng: minLng,
        max_lng: maxLng,
        search_term: search
      };

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      });

      return result;
    } catch (error) {
      console.error(error);
      throw Error.SomethingWentWrong();
    }
  },
  getnearbystoreservice: async (latitude, longitude, minLat, maxLat, minLng, maxLng, service) => {
    try {
      const sql = `
  SELECT
    s.id AS store_id,
    s.name,
    s.images,
    s.category_id,
    s.store_type,
    p.addressLine1,
    p.addressLine2,
    p.district,
    p.city,
    p.zipcode,
    p.latitude,
    p.longitude,
    ss.service_name AS service_name,
    ST_Distance_Sphere(
      p.location,
      ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
    ) AS distance_m,
    COALESCE(p.radius, 500000) AS allowed_m
  FROM PartnerAddress AS p
  JOIN StoreServices AS ss
  ON p.store_id = ss.store_id AND ss.status = 'active'
  LEFT JOIN Store AS s
    ON p.store_id = s.id
  WHERE
    p.location IS NOT NULL AND p.status = 'active'
    AND s.status = 'active' AND s.completion_status = 'completed'
    AND ss.service_name LIKE CONCAT('%', :service, '%')
    AND ST_X(p.location) BETWEEN :min_lng AND :max_lng
    AND ST_Y(p.location) BETWEEN :min_lat AND :max_lat
    AND ST_Distance_Sphere(
          p.location,
          ST_GeomFromText(CONCAT('POINT(', :user_lng, ' ', :user_lat, ')'))
        ) <= COALESCE(p.radius, 500000)
  ORDER BY
    (s.id IS NOT NULL) DESC,
    distance_m ASC
`;

      const replacements = {
        user_lat: latitude,
        user_lng: longitude,
        min_lat: minLat,
        max_lat: maxLat,
        min_lng: minLng,
        max_lng: maxLng,
        service: service
      };

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      });

      return result;
    } catch (error) {
      console.error(error);
      throw Error.SomethingWentWrong();
    }
  },
  getmaxradius: async (id) => {
    try {
      return await userDbController.Models.PartnerAddress.max('radius', {
        where: {
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getallstores: async () => {
    try {

      let sql = `SELECT S.id as store_id,S.store_type, S.name, S.images, S.category_id, S.createdAt, a.addressline1 as addressLine1 , a.addressLine2, a.district, a.city, a.zipcode,a.latitude,a.longitude,c.name AS category_name
          FROM Store S
          JOIN PartnerAddress a ON S.address_id = a.id 
          JOIN category c ON S.category_id = c.id
    WHERE S.status = 'active' AND a.status = 'active' AND S.completion_status = 'completed'`;
      const result = await connection.query(sql, { type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  getstorereviews: async (data) => {
    try {
      return await userDbController.Models.Reviews.findAll({
        where: {
          store_id: data.store_id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addfavourites: async (store_id, id) => {
    try {
      return await userDbController.Models.Favourites.create({
        store_id: store_id,
        user_id: id,
        status: "active"
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getfavourites: async (storeId, userId) => {
    try {
      return await userDbController.Models.Favourites.findAll({
        where: {
          user_id: userId,
          store_id: storeId,
          status: "active"
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  getfavourites_1: async (userId) => {
    try {
      return await userDbController.Models.Favourites.findAll({
        where: {
          user_id: userId,
          status: "active"
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  getstores: async (id) => {
    try {
      let sql = `SELECT S.id as store_id , S.name ,S.images, S.category_id , a.addressline1, a.addressLine2, a.district, a.city, a.zipcode, a.latitude, a.longitude
FROM Store S JOIN PartnerAddress a ON S.address_id = a.id WHERE S.status = 'active' AND a.status = 'active' AND S.id = :id`;
      const result = await connection.query(sql, { replacements: { id: id }, type: Sequelize.QueryTypes.SELECT });

      return result
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  deletefavourites: async (data, id) => {
    try {
      return await userDbController.Models.Favourites.update({
        status: "inactive",
      }, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      throw Error.InternalError();
    }
  },
  deletefavourites_1: async (store_id, user_id) => {
    try {
      return await userDbController.Models.Favourites.update({
        status: "inactive",
      }, {
        where: {
          store_id: store_id,
          user_id: user_id
        }
      })
    } catch (error) {
      throw Error.InternalError();
    }
  },
  getstorebyid: async (data) => {
    try {
      let sql = `SELECT S.name, S.images,S.store_type,S.description,S.store_type, w.from, w.to FROM Store S LEFT JOIN WorkingHours w ON S.id = w.store_id WHERE S.id = :id`;
      const result = await connection.query(sql, { replacements: { id: data.id }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  addreview: async (data, id) => {
    //////console.log("🚀 ~ addreview: ~ data:", data)
    try {
      return await userDbController.Models.Reviews.create({
        user_id: id,
        rating: data.rating,
        store_id: data.store_id,
        cretaed_at: new Date(),
        updated_at: new Date(),
        review_description: data.description,
        status: "active"
      })
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  gettransactions: async (data, id) => {
    try {
      return await userDbController.Models.user_transaction_logs.findAll({
        where: {
          user_id: id
        },
        order: [['date', 'DESC']]
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getservicecategory: async (data, id) => {
    try {
      return await userDbController.Models.Servicecategory.findAll()
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  getaminities: async (data) => {
    try {
      // return await userDbController.Models.StoreAminities.findAll({
      //   where: {
      //     store_id: data.id
      //   }
      // }); 

      let sql = `SELECT a.id AS aminity_id , a.name AS aminity_name , a.icon AS icon FROM Aminities a JOIN  StoreAminities sa ON a.id = sa.aminities_id WHERE sa.store_id = :store_id `;
      const result = await connection.query(sql, { replacements: { store_id: data.id }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      //////console.log("🚀 ~ getaminities: ~ error:", error)
      throw Error.SomethingWentWrong()
    }
  },
  getservices: async (data) => {
    try {
      return await userDbController.Models.StoreServices.findAll({
        where: {
          store_id: data.id,
          status: "active"
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  getallprofessionals: async (data) => {
    try {
      return await userDbController.Models.Stylist.findAll({
        where: {
          store_id: data.id
        }
      });
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  getallstoreratings: async (data) => {
    console.log("🚀 ~ data:", data)
    try {
      //  return await userDbController.Models.Reviews.findAll({
      //   where:{
      //     store_id:data.id
      //   }
      //  }) 
      let slq = `SELECT  r.rating, r.review_description, r.cretaed_at ,r.updated_at , u.firstname, u.lastname, u.profilePic FROM Reviews r JOIN User u ON r.user_id = u.id WHERE r.store_id = :store_id AND r.status = 'active'`;
      const result = await connection.query(slq, { replacements: { store_id: data.id }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      console.log("🚀 ~ error:", error);
      return [];
      // throw Error.InternalError("could not get ratings")
    }
  },
  getpartneraddress: async (data) => {
    console.log("🚀 ~ data:", data)
    try {
      return await userDbController.Models.PartnerAddress.findOne({
        where: {
          store_id: data.id,
          status: "active"
        }
      })
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.InternalError("could not get Address")
    }
  },
  getstoresnearstorses: async (long, lat, id) => {
    try {
      let sql = ` SELECT
          s.id          AS store_id,
          s.name,
          s.images,
          s.category_id,
          p.addressLine1 ,
          p.addressLine2,
          p.district,
          p.city,
          p.zipcode,
          p.latitude,
          p.longitude,
          ST_Distance_Sphere(
            p.location,
            ST_GeomFromText(CONCAT('POINT(', :long, ' ', :lat, ')'))
          ) AS distance_m
          FROM PartnerAddress  p
          JOIN Store s  
          ON p.store_id = s.id
           WHERE  ST_Distance_Sphere(
                p.location,
                ST_GeomFromText(CONCAT('POINT(', :long, ' ', :lat, ')'))
              ) <= COALESCE(3000)
        AND p.status = 'active' AND s.status = 'active' AND s.id != :store_id AND s.completion_status = 'completed'
  
        ORDER BY
          (s.id IS NOT NULL) DESC,
          distance_m ASC
          `

      const result = await connection.query(sql, { replacements: { long: long, lat: lat, store_id: id }, type: Sequelize.QueryTypes.SELECT });

      return result;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getfreeslots: async (data, quantity) => {
    try {
      let sql = `SELECT s.id, s.from, s.to, COUNT(a.id) as total_count 
             FROM Slots s 
             LEFT JOIN appointments a ON a.slot_id = s.id 
             AND DATE(a.booking_date) = :date 
             AND a.store_id = :store_id 
             AND (
               a.status IN ('booked', 'confirmed', 'completed') 
               OR (a.status = 'pending' AND a.created_at >= NOW() - INTERVAL 5 MINUTE)
             )
             WHERE s.status = 'active' AND s.store_id = :store_id
             GROUP BY s.id, s.from, s.to
             HAVING COUNT(a.id) < :quantity`;
      const result = await connection.query(sql, { replacements: { date: data.date, store_id: data.store_id, quantity: quantity }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getbookedslots: async (data, quantity) => {
    try {
      let sql = `SELECT s.id, s.from, s.to, COUNT(a.id) as total_count 
             FROM Slots s 
             LEFT JOIN appointments a ON a.slot_id = s.id 
             AND DATE(a.booking_date) = :date 
             AND a.store_id = :store_id 
             AND (
               a.status IN ('booked', 'confirmed', 'completed') 
               OR (a.status = 'pending' AND a.created_at >= NOW() - INTERVAL 5 MINUTE)
             )
             WHERE s.status = 'active' AND s.store_id = :store_id
             GROUP BY s.id, s.from, s.to
             HAVING COUNT(a.id) >= :quantity`;
      const result = await connection.query(sql, { replacements: { date: data.date, store_id: data.store_id, quantity: quantity }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  getSlotStatusData: async (store_id, date) => {
    try {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[new Date(date).getDay()];

      const sql = `
        SELECT 
          s.id, 
          s.from, 
          s.to, 
          COALESCE(sub.appointment_count, 0) AS appointment_count,
          CASE 
            WHEN b.id IS NOT NULL THEN 1 
            ELSE 0 
          END AS is_blocked
        FROM Slots s
        LEFT JOIN (
          SELECT slot_id, COUNT(id) AS appointment_count
          FROM appointments
          WHERE store_id = :store_id 
            AND DATE(booking_date) = :date 
            AND (
              status IN ('booked', 'confirmed', 'completed') 
              OR (status = 'pending' AND created_at >= NOW() - INTERVAL 5 MINUTE)
            )
          GROUP BY slot_id
        ) sub ON s.id = sub.slot_id
        LEFT JOIN SlotBlockedDates b ON s.id = b.slot_id AND b.blocked_date = :date
        WHERE s.store_id = :store_id 
          AND s.status = 'active'
          AND (s.day = :dayName OR s.day IS NULL)
        ORDER BY s.from ASC;
      `;
      return await connection.query(sql, {
        replacements: { store_id, date, dayName },
        type: Sequelize.QueryTypes.SELECT
      });
    } catch (error) {
      console.log("Error in getSlotStatusData:", error);
      throw Error.SomethingWentWrong();
    }
  },
  gettotal: async (data) => {
    try {
      return await userDbController.Models.StoreServices.findOne({
        where: {
          id: data
        },
        attributes: ["amount", "discounted_amount"]
      });
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  gettotal_combo: async (data) => {
    try {
      return await userDbController.Models.Combo.findOne({
        where: {
          id: data
        },
        attributes: ["amount"]
      });
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  createorder: async (data, id, transaction, razorpay_id, is_combo, total, final_total) => {
    try {
      return await userDbController.Models.appointments.create({
        store_id: data.store_id,
        booking_date: data.booking_date,
        amount: final_total,
        created_at: new Date(),
        updated_at: new Date(),
        is_combo: is_combo,
        status: "booked",
        slot_id: data.slot_id,
        razorpay_id: data.razorpay_order_id || null,
        user_id: id,
        payment_status: "sucssess",
        is_wallet: data.is_wallet,
        discount_id: data?.coupon_id || null,
        discounted_amount: total,
        is_discounted: data?.is_discounted || false,
        gst: 5

      }, { transaction: transaction })
    } catch (error) {
      throw Error.InternalError();
    }
  },
  addserviceitems: async (data, id, item, amount, appointment_id, transaction) => {
    try {
      return await userDbController.Models.appointment_items.create({
        appointment_id: appointment_id,
        service_id: item,
        service_amount: amount
      }, { transaction: transaction })
    } catch (error) {
      throw Error.InternalError()
    }
  },
  addcomboitems: async (data, id, item, amount, appointment_id, transaction) => {
    try {
      return await userDbController.Models.appointment_items.create({
        appointment_id: appointment_id,
        combo_id: item,
        service_amount: amount
      }, { transaction: transaction })
    } catch (error) {
      throw Error.InternalError()
    }
  },
  getservicebyid: async (itemId) => {
    try {
      return await userDbController.Models.StoreServices.findOne({
        where: {
          id: itemId
        },
        attributes: ['id', 'service_name', 'amount', 'discounted_amount', 'duration', 'images']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get service by ID");
    }
  },
  getcombobyid: async (itemId) => {
    try {
      return await userDbController.Models.Combo.findOne({
        where: {
          id: itemId
        },
        attributes: ['id', 'combo', 'amount', 'duration', 'images']
      })
    } catch (error) {
      throw Error.SomethingWentWrong("Failed to get combo by ID");
    }
  },
  updatewallet: async (data, id) => {
    try {
      return await userDbController.Models.User.update({
        wallet: parseInt(data)
      }, {
        where: {
          id: id
        }
      })


    } catch (error) {
      throw Error.InternalError()

    }
  },
  getallapoinments: async (data, id) => {
    try {
      let sql = `SELECT 
  a.id,
  a.booking_date,
  a.created_at,
  a.updated_at,
  a.amount AS total_amount,
  a.discounted_amount as discounted_amount,
  a.status AS appointment_status,
  s.from AS slot_from,
  s.to AS slot_to,
  s.id AS slot_id,
  st.id as store_id,
  st.name,
  st.images,
  ad.addressLine1,
  ad.addressLine2,
  ad.district,
  ad.city,
  ad.zipcode,
  ad.latitude,
  ad.longitude,
  COALESCE(ROUND(AVG(r.rating), 2), 0) AS averagerating
  FROM appointments a
JOIN Slots s ON a.slot_id = s.id
JOIN Store st ON a.store_id = st.id
JOIN PartnerAddress ad ON st.address_id = ad.id
LEFT JOIN Reviews r ON st.id = r.store_id AND r.status = 'active'
WHERE a.user_id = :user_id
  AND ad.status = 'active'
  AND a.payment_status in ('sucssess','success')
GROUP BY a.id, a.booking_date, a.created_at, a.updated_at, a.amount, a.discounted_amount, a.status,
         s.from, s.to, s.id, st.id, st.name, st.images, 
         ad.addressLine1, ad.addressLine2, ad.district, ad.city, ad.zipcode, ad.latitude, ad.longitude
ORDER BY a.booking_date DESC;`;

      const result = await connection.query(sql, { replacements: { user_id: id }, type: Sequelize.QueryTypes.SELECT });

      return result;
    } catch (error) {
      throw Error.InternalError("could not get appointments")
    }
  },
  getservicebyappoinment: async (id) => {
    try {
      let sql = `SELECT 
  ai.service_amount AS amount, 
  ai.service_id AS service_id,
  s.service_name AS service_name,
  s.duration AS service_duration,
  ai.combo_id AS combo_id,
  c.combo AS combo_name,
  c.duration AS combo_duration,
  c.amount as combo_amount
FROM appointment_items ai
LEFT JOIN StoreServices s ON ai.service_id = s.id
LEFT JOIN Combo c ON ai.combo_id = c.id
WHERE ai.appointment_id = :id  ; `
      const result = await connection.query(sql, { replacements: { id: id }, type: Sequelize.QueryTypes.SELECT });
      return result;

    } catch (error) {
      throw Error.InternalError("could not get services by appointment")
    }
  },
  getallstoresbycategory: async (data) => {
    try {
      let sql = `
      SELECT 
  S.id AS store_id, 
  S.name, 
  S.store_type, 
  S.images, 
  S.category_id,
  S.createdAt, 
  A.addressLine1, 
  A.addressLine2, 
  A.district, 
  A.city, 
  A.zipcode, 
  A.latitude, 
  A.longitude
FROM Store S
JOIN PartnerAddress A ON S.address_id = A.id 
JOIN CategoryTable CT ON CT.store_id = S.id
WHERE S.status = 'active' 
  AND A.status = 'active'
  AND CT.category_id = :category_id
    `;

      const replacements = {
        category_id: data.category_id,
        latitude: data.latitude,
        longitude: data.longitude,
      };

      const result = await connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      });

      return result;
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  getallreview: async (data, id) => {
    try {
      let sql = `SELECT u.profilePic, r.rating, r.review_description, r.id as review_id,r.cretaed_at, r.updated_at, s.name AS store_name, s.images AS store_images , a.* FROM Reviews r
         JOIN Store s ON r.store_id = s.id
         JOIN PartnerAddress a ON s.address_id = a.id
         JOIN User u ON r.user_id = u.id
         WHERE r.user_id = :user_id AND r.status = 'active' AND a.status = 'active'`;


      const result = await connection.query(sql, { replacements: { user_id: id }, type: Sequelize.QueryTypes.SELECT });
      return result;
    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  addlogs: async (amount, id, type, description) => {
    try {
      return await userDbController.Models.user_transaction_logs.create({
        user_id: id,
        transaction_amount: amount,
        type: type,
        description: description,
        date: new Date(),
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  addwallet: async (data, id) => {
    try {
      return await userDbController.Models.User.increment({
        wallet: data.amount
      }, { where: { id: id } })

    } catch (error) {
      throw Error.SomethingWentWrong()

    }
  },
  addwallet_1: async (data, id) => {
    try {
      return await userDbController.Models.User.increment({
        wallet: data
      }, { where: { id: id } })

    } catch (error) {
      throw Error.SomethingWentWrong()

    }
  },
  getorder: async (data, id) => {
    try {
      return await userDbController.Models.appointments.findOne({
        where: {
          id: data.id,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  cancelorder: async (data, id) => {
    try {
      return await userDbController.Models.appointments.update({
        status: "cancelled"
      }, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  initiaterefund: async (get_order, data, id) => {
    try {
      return await userDbController.Models.refund_requests.create({
        user_id: id,
        appointment_id: data.id,
        status: "pending",
        created_at: new Date(),
        reason: data.reason,
        is_wallet: get_order.is_wallet,

      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  deleteuser: async (data, id) => {
    try {
      return await userDbController.Models.User.update({
        status: "inactive"
      }, {
        where: {
          id: id
        }
      })
    } catch (error) {
    }
  },
  getallcategory: async (data) => {
    try {
      return await userDbController.Models.category.findAll({
        where: {
          status: "active"
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getwalletamount: async (data, id) => {
    try {
      return await userDbController.Models.User.findOne({
        attributes: ['wallet'],
        where: {
          id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  updaterating: async (data, id) => {
    try {
      return await userDbController.Models.Reviews.update({
        rating: data.rating,
        review_description: data.description,
        cretaed_at: new Date(),
        updated_at: new Date()
      }, {
        where: {
          id: data.store_id
        }
      })
    } catch (error) {
      //////console.log("🚀 ~ updaterating: ~ error:", error)
      throw Error.SomethingWentWrong()
    }
  },
  deletereview: async (data, id) => {
    try {
      return await userDbController.Models.Reviews.update({
        status: "inactive"
      }, {
        where: {
          id: data.id
        }
      })

    } catch (error) {
      throw Error.SomethingWentWrong()
    }
  },
  getinvitecode: async (data, id) => {
    try {
      return await userDbController.Models.User.findOne({
        attributes: ['invited_code'],
        where: {
          id: id
        }
      });

    } catch (error) {
      throw Error.InternalError("could not get invite code");

    }
  },
  verifyinvitecode: async (data, id) => {
    try {
      return await userDbController.Models.User.findOne({
        where: {
          invited_code: data.invite_code,
          status: "active"
        }
      })
    } catch (error) {
      throw Error.InternalError("could not verify invite code")
    }
  },
  updatebooking: async (id, payment_id, razorpaysignature) => {
    try {
      const [rowsAffected] = await userDbController.Models.appointments.update({
        payment_status: "success",
        status: "booked",
        payment_id: payment_id || null,
        razorpay_signature: razorpaysignature || null
      }, {
        where: {
          razorpay_id: id,
          payment_status: {
            [Op.notIn]: ["success", "sucssess"],
          },
        }
      })
      console.log(rowsAffected);
      return rowsAffected;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  updatebookingdate: async (data, id) => {
    try {
      return await userDbController.Models.appointments.update({
        booking_date: data.booking_date,
        slot_id: data.slot_id
      }, {
        where: {
          id: data.id
        }
      })
    } catch (error) {
      ////console.log("🚀 ~ updatebookingdate: ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  getbooking: async (data, id) => {
    try {
      return await userDbController.Models.appointments.findOne({
        where: {
          id: data.id,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }

  },
  getbooking_1: async (data, id) => {
    try {
      return await userDbController.Models.appointments.findOne({
        where: {
          razorpay_id: id,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }

  },
  getbooking_2: async (data, id) => {
    try {
      return await userDbController.Models.appointments.findOne({
        where: {
          razorpay_id: data,
          user_id: id
        }
      })
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  getReviewsV2: async ({ userId, offset, limit }) => {
    try {
      const sql = `
        SELECT 
          r.id,
          r.rating,
          r.review_description,
          r.cretaed_at,
          r.updated_at,
          s.id AS store_id,
          s.name AS store_name,
          s.images AS store_images,
          pa.addressLine1,
          pa.city,
          pa.zipcode
        FROM Reviews r
        INNER JOIN Store s ON r.store_id = s.id
        INNER JOIN PartnerAddress pa ON s.address_id = pa.id
        WHERE r.user_id = :userId 
          AND r.status = 'active'
        ORDER BY r.cretaed_at DESC
        LIMIT :limit OFFSET :offset
      `;

      const countSql = `
        SELECT COUNT(*) as total
        FROM Reviews
        WHERE user_id = :userId AND status = 'active'
      `;

      const [reviews, totalResult] = await Promise.all([
        connection.query(sql, {
          replacements: { userId, limit, offset },
          type: Sequelize.QueryTypes.SELECT
        }),
        connection.query(countSql, {
          replacements: { userId },
          type: Sequelize.QueryTypes.SELECT
        })
      ]);

      return {
        reviews,
        total: totalResult[0].total
      };
    } catch (error) {
      console.error("Error in getReviewsV2:", error);
      throw Error.InternalError("Failed to fetch reviews");
    }
  },

  updateReviewV2: async ({ reviewId, userId, rating, description }) => {
    try {
      const [affectedRows] = await userDbController.Models.Reviews.update({
        rating: rating,
        review_description: description,
        updated_at: new Date()
      }, {
        where: {
          id: reviewId,
          user_id: userId,
          status: 'active'
        }
      });
      return affectedRows;
    } catch (error) {
      console.error("Error in updateReviewV2:", error);
      throw Error.InternalError("Failed to update review");
    }
  },

  deleteReviewV2: async ({ reviewId, userId }) => {
    try {
      const [affectedRows] = await userDbController.Models.Reviews.update({
        status: 'inactive',
        updated_at: new Date()
      }, {
        where: {
          id: reviewId,
          user_id: userId,
          status: 'active'

        }
      });
      return affectedRows;
    } catch (error) {
      console.error("Error in deleteReviewV2:", error);
      throw Error.InternalError("Failed to delete review");
    }
  },

  getNearbyStoresv2: async ({
    latitude,
    longitude,
    gender,
    radius = 10,
    user_id = null,
    limit = 10,
    page = 1
  }) => {
    const cacheKey = `nearby_v4_${parseFloat(latitude).toFixed(3)}_${parseFloat(longitude).toFixed(3)}_${gender||'all'}_${radius}_${limit}_${page}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const offset = (page - 1) * limit;
    const earthRadiusKm = 6371;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius);
    const radiusInMeters = radiusKm * 1000;

    // Latitude delta
    const latDelta = (radiusKm / earthRadiusKm) * (180 / Math.PI);

    // Longitude delta (adjusted by latitude)
    const lngDelta =
      (radiusKm / earthRadiusKm) *
      (180 / Math.PI) /
      Math.cos((lat * Math.PI) / 180);

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    const replacements = {
      latitude: lat,
      longitude: lng,
      user_id,
      minLat,
      maxLat,
      minLng,
      maxLng,
      radiusInMeters,
      limit,
      offset
    };

    const genderCondition = storeGenderWhereSql("S.store_type", gender);

    const sql = `
SELECT 
    S.id,
    S.name,
    S.images,
    S.logo,
    S.salon_image,
    S.is_premium,
    S.store_type,

    PA.latitude,
    PA.longitude,

    ST_Distance_Sphere(
        PA.location,
        POINT(:longitude, :latitude)
    ) / 1000 AS distance,

    IFNULL(R.rating_avg, 0) AS rating,
    IFNULL(R.review_count, 0) AS reviewCount,

    SS.servicePrice,
    SS.serviceName,
    SS.categories,

    L.languageCodes,

    PA.addressLine1,
    PA.addressLine2,
    PA.district,
    PA.city,
    PA.area,
    PA.zipcode,

    IF(F.store_id IS NULL, 0, 1) AS isFavorite

FROM Store S

JOIN PartnerAddress PA 
    ON PA.store_id = S.id
    AND PA.status = 'active'

LEFT JOIN (
    SELECT store_id, AVG(rating) AS rating_avg, COUNT(id) AS review_count 
    FROM Reviews WHERE status = 'active' GROUP BY store_id
) R ON R.store_id = S.id

LEFT JOIN (
    SELECT ss.store_id, 
           MIN(ss.discounted_amount) AS servicePrice, 
           MIN(ss.service_name) AS serviceName,
           GROUP_CONCAT(DISTINCT sc.name) AS categories
    FROM StoreServices ss
    LEFT JOIN Servicecategory sc ON sc.id = ss.service_category
    WHERE ss.status = 'active'
    GROUP BY ss.store_id
) SS ON SS.store_id = S.id

LEFT JOIN (
    SELECT sl.store_id, GROUP_CONCAT(DISTINCT l.code) AS languageCodes
    FROM StoreLanguages sl
    JOIN Languages l ON l.id = sl.language_id AND l.status = 'active'
    GROUP BY sl.store_id
) L ON L.store_id = S.id

LEFT JOIN Favourites F
    ON F.store_id = S.id
    AND F.user_id = :user_id
    AND F.status = 'active'

WHERE 
    S.status = 'active'
    AND S.completion_status = 'completed'
    ${genderCondition}

    -- 1️⃣ Bounding box filter (fast)
    AND PA.latitude BETWEEN :minLat AND :maxLat
    AND PA.longitude BETWEEN :minLng AND :maxLng

    -- 2️⃣ Exact geo filter (precise)
    AND ST_Distance_Sphere(
        PA.location,
        POINT(:longitude, :latitude)
    ) <= :radiusInMeters

ORDER BY distance ASC

LIMIT :limit OFFSET :offset
`;

    const countSql = `
SELECT COUNT(DISTINCT S.id) as total
FROM Store S
JOIN PartnerAddress PA ON PA.store_id = S.id AND PA.status = 'active'
WHERE S.status = 'active'
AND S.completion_status = 'completed'
${genderCondition}
AND PA.latitude BETWEEN :minLat AND :maxLat
AND PA.longitude BETWEEN :minLng AND :maxLng
AND ST_Distance_Sphere(PA.location, POINT(:longitude, :latitude)) <= :radiusInMeters
`;

    const [stores, totalResult] = await Promise.all([
      connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT }),
      connection.query(countSql, { replacements, type: Sequelize.QueryTypes.SELECT })
    ]);

    const result = { rawData: stores, totalRecords: totalResult[0]?.total || 0 };
    await redisClient.setEx(cacheKey, 120, JSON.stringify(result));
    return result;
  },
  getAllSalons: async ({
    page = 1,
    limit = 10,
    gender,
    category,
    lat,
    lng,
    search,
    userId = null
  }) => {
    const cacheKey = `salons_v6_${page}_${limit}_${gender||''}_${category||''}_${search||''}_${lat ? parseFloat(lat).toFixed(3) : ''}_${lng ? parseFloat(lng).toFixed(3) : ''}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const offset = (page - 1) * limit;

    const replacements = { limit, offset, userId };

    const conditions = ["S.status = 'active'", "S.completion_status = 'completed'"];

    const genderCondition = storeGenderCondition("S.store_type", gender);
    if (genderCondition) {
      conditions.push(genderCondition);
    }

    // ✅ Search filter
    if (search) {
      conditions.push(`
      (S.name LIKE :search OR S.id IN (
        SELECT store_id FROM StoreServices 
        WHERE service_name LIKE :search AND status = 'active'
      ))
    `);
      replacements.search = `%${search}%`;
    }

    // ✅ Category filter
    if (category) {
      conditions.push(`EXISTS (
        SELECT 1 FROM StoreServices ss_filter 
        WHERE ss_filter.store_id = S.id 
          AND ss_filter.service_category = :category 
          AND ss_filter.status = 'active'
      )`);
      replacements.category = category;
    }

    // ✅ ALWAYS JOIN address (important)
    let addressJoin = `
    LEFT JOIN PartnerAddress PA 
    ON PA.store_id = S.id AND PA.status = 'active'
  `;

    let distanceSelect = 'NULL AS distance';

    // ✅ GEO LOGIC (NO FILTER — ONLY SORTING)
    if (lat && lng) {
      replacements.latitude = lat;
      replacements.longitude = lng;

      distanceSelect = `
      ST_Distance_Sphere(
        PA.location,
        POINT(:longitude, :latitude)
      ) / 1000 AS distance
    `;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const sql = `
  SELECT 
    S.id,
    S.name,
    S.images,
    S.logo,
    S.salon_image,
    S.is_premium,
    S.store_type,

    IFNULL(R.rating_avg, 0) AS rating,
    IFNULL(R.review_count, 0) AS reviewCount,

    SS.servicePrice,
    SS.serviceName,
    SS.categories,

    L.languageCodes,

    IF(F.store_id IS NULL, 0, 1) AS isFavorite,

    PA.latitude,
    PA.longitude,
    PA.addressLine1,
    PA.city,

    ${distanceSelect}

  FROM Store S

  ${addressJoin}

  LEFT JOIN (
    SELECT store_id, AVG(rating) AS rating_avg, COUNT(id) AS review_count 
    FROM Reviews WHERE status = 'active' GROUP BY store_id
  ) R ON R.store_id = S.id

  LEFT JOIN (
    SELECT ss.store_id, 
           MIN(ss.discounted_amount) AS servicePrice, 
           MIN(ss.service_name) AS serviceName,
           GROUP_CONCAT(DISTINCT sc.name) AS categories
    FROM StoreServices ss
    LEFT JOIN Servicecategory sc ON sc.id = ss.service_category
    WHERE ss.status = 'active'
    GROUP BY ss.store_id
  ) SS ON SS.store_id = S.id

  LEFT JOIN (
    SELECT sl.store_id, GROUP_CONCAT(DISTINCT l.code) AS languageCodes
    FROM StoreLanguages sl
    JOIN Languages l ON l.id = sl.language_id AND l.status = 'active'
    GROUP BY sl.store_id
  ) L ON L.store_id = S.id

  LEFT JOIN Favourites F 
    ON F.store_id = S.id 
    AND F.user_id = :userId 
    AND F.status = 'active'

  ${whereClause}

  ORDER BY ${lat && lng
        ? 'distance IS NULL, distance ASC'
        : 'S.id DESC'
      }

  LIMIT :limit OFFSET :offset
  `;

    const countQuery = `
  SELECT COUNT(DISTINCT S.id) AS total
  FROM Store S

  ${addressJoin}

  ${whereClause}
  `;

    const [stores, totalResult] = await Promise.all([
      connection.query(sql, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      }),
      connection.query(countQuery, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      })
    ]);

    const result = { rawData: stores, totalRecords: totalResult[0].total };
    await redisClient.setEx(cacheKey, 120, JSON.stringify(result));
    return result;
  },
  // getTopSalons: async ({ limit, page, gender, userId, lat, lng }) => {
  //   const offset = (page - 1) * limit;

  //   let genderCondition = "";
  //   const replacements = { limit, offset, userId };

  //   if (gender) {
  //     if (gender === 'male') {
  //       genderCondition = "AND LOWER(S.store_type) = 'male'";
  //     } else if (gender === 'female') {
  //       genderCondition = "AND LOWER(S.store_type) = 'female'";
  //     } else if (gender === 'unisex') {
  //       genderCondition = "AND LOWER(S.store_type) IN ('male', 'female', 'unisex')";
  //     }
  //   }

  //   // Add lat/lng to replacements for distance calculation
  //   let distanceSelect = 'NULL AS distance';
  //   let addressFields = '';
  //   let addressJoin = '';

  //   if (lat && lng) {
  //     replacements.latitude = parseFloat(lat);
  //     replacements.longitude = parseFloat(lng);

  //     distanceSelect = `ST_Distance_Sphere(
  //       PA.location,
  //       POINT(:longitude, :latitude)
  //     ) / 1000 AS distance`;

  //     addressFields = `
  //       PA.latitude,
  //       PA.longitude,
  //       PA.addressLine1,
  //       PA.area,
  //       PA.city,
  //       PA.zipcode,`;

  //     addressJoin = `LEFT JOIN PartnerAddress PA 
  //       ON PA.store_id = S.id 
  //       AND PA.status = 'active'`;
  //   }

  //   const sql = `
  //   SELECT 
  //       S.id,
  //       S.name,
  //       S.images,
  //       S.salon_image,
  //       S.is_premium,
  //       S.store_type,

  //       IFNULL(AVG(R.rating), 0) AS rating,
  //       COUNT(DISTINCT R.id) AS reviewCount,

  //       MIN(SS.discounted_amount) AS servicePrice,
  //       MIN(SS.service_name) AS serviceName,

  //       GROUP_CONCAT(DISTINCT SC.name) AS categories,
  //       GROUP_CONCAT(DISTINCT L.code) AS languageCodes,

  //       IF(F.store_id IS NULL, 0, 1) AS isFavorite,
  //       ${addressFields}
  //       ${distanceSelect}

  //   FROM Store S

  //   ${addressJoin}

  //   LEFT JOIN Reviews R 
  //       ON R.store_id = S.id 
  //       AND R.status = 'active'

  //   LEFT JOIN StoreServices SS 
  //       ON SS.store_id = S.id 
  //       AND SS.status = 'active'

  //   LEFT JOIN Servicecategory SC 
  //       ON SC.id = SS.service_category

  //   LEFT JOIN StoreLanguages SL 
  //       ON SL.store_id = S.id

  //   LEFT JOIN Languages L 
  //       ON L.id = SL.language_id 
  //       AND L.status = 'active'

  //   LEFT JOIN Favourites F
  //       ON F.store_id = S.id
  //       AND F.user_id = :userId

  //   WHERE S.status = 'active'
  //   ${genderCondition}

  //   GROUP BY S.id

  //   ORDER BY 
  //       rating DESC,
  //       reviewCount DESC,
  //       S.is_premium DESC

  //   LIMIT :limit OFFSET :offset
  // `;

  //   const countQuery = `
  //   SELECT COUNT(DISTINCT S.id) AS total
  //   FROM Store S
  //   WHERE S.status = 'active'
  //   ${genderCondition}
  // `;

  //   const [stores, totalResult] = await Promise.all([
  //     connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT }),
  //     connection.query(countQuery, { replacements, type: Sequelize.QueryTypes.SELECT })
  //   ]);

  //   return {
  //     rawData: stores,
  //     totalRecords: totalResult[0].total
  //   };
  // },

  getMapMarkers: async ({ bounds, filters, userId = null }) => {
    const { northEast, southWest } = bounds;
    const { gender, categoryId, isPremium } = filters;

    let whereConditions = [];
    let replacements = { userId };

    // Bounds filtering
    whereConditions.push(`
      PA.latitude BETWEEN :swLat AND :neLat
      AND PA.longitude BETWEEN :swLng AND :neLng
    `);
    replacements.swLat = southWest.lat;
    replacements.neLat = northEast.lat;
    replacements.swLng = southWest.lng;
    replacements.neLng = northEast.lng;

    // Gender filter
    if (gender && gender !== "all") {
      const genderCondition = storeGenderCondition("S.store_type", gender);
      if (genderCondition) {
        whereConditions.push(genderCondition);
      }
    }

    // Category filter
    if (categoryId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM StoreServices SS 
        WHERE SS.store_id = S.id 
        AND SS.service_category = :categoryId 
        AND SS.status = 'active'
      )`);
      replacements.categoryId = categoryId;
    }

    // Premium filter
    if (isPremium === true) {
      whereConditions.push(`S.is_premium = 1`);
    }

    const whereClause = whereConditions.length > 0
      ? `AND ${whereConditions.join(' AND ')}`
      : '';

    const sql = `
      SELECT 
        S.id,
        S.name,
        S.is_premium AS isPremium,
        PA.latitude AS lat,
        PA.longitude AS lng,
        IFNULL(AVG(R.rating), 0) AS rating,
        IF(F.store_id IS NULL, 0, 1) AS isFavorite
      FROM Store S
      INNER JOIN PartnerAddress PA ON PA.store_id = S.id AND PA.status = 'active'
      LEFT JOIN Reviews R ON R.store_id = S.id AND R.status = 'active'
      LEFT JOIN Favourites F ON F.store_id = S.id AND F.user_id = :userId AND F.status = 'active'
      WHERE S.status = 'active'
        AND PA.latitude IS NOT NULL
        AND PA.longitude IS NOT NULL
        ${whereClause}
      GROUP BY S.id, PA.latitude, PA.longitude
      ORDER BY S.is_premium DESC, rating DESC
    `;

    return await connection.query(sql, {
      replacements,
      type: Sequelize.QueryTypes.SELECT
    });
  },

  getTopSalons: async (filters) => {

    const {
      limit,
      offset,
      gender,
      lat,
      lng,
      minRating,
      minPrice,
      maxPrice,
      search,
      sort,
      userId,
      minLat,
      maxLat,
      minLng,
      maxLng
    } = filters;

    const replacements = {
      limit,
      offset,
      gender: gender || null,
      lat: lat ?? null,
      lng: lng ?? null,
      minRating: minRating ?? null,
      minPrice: minPrice ?? null,
      maxPrice: maxPrice ?? null,
      search: search ?? null,
      userId: userId ?? null,

      // ALWAYS define geo boundaries
      minLat: minLat ?? null,
      maxLat: maxLat ?? null,
      minLng: minLng ?? null,
      maxLng: maxLng ?? null
    };

    let orderBy = `
    R.rating_avg DESC,
    R.review_count DESC,
    S.is_premium DESC
  `;

    if (sort === "distance" && lat && lng) {
      orderBy = `distance ASC`;
    } else if (sort === "price_asc") {
      orderBy = `SS.min_price ASC`;
    } else if (sort === "price_desc") {
      orderBy = `SS.min_price DESC`;
    } else if (sort === "review") {
      orderBy = `R.review_count DESC`;
    }

    const sql = `
  SELECT
    S.id,
    S.name,
    S.images,
    S.logo,
    S.salon_image,
    S.store_type,
    S.is_premium,

    IFNULL(R.rating_avg, 0) AS rating,
    IFNULL(R.review_count, 0) AS reviewCount,
    SS.min_price AS servicePrice,
    C.categories,

    IF(F.store_id IS NULL, 0, 1) AS isFavorite,

    PA.latitude,
    PA.longitude,
    PA.addressLine1,
    PA.area,
    PA.city,
    PA.zipcode,

    CASE
  WHEN :lat IS NOT NULL AND :lng IS NOT NULL THEN
    ST_Distance_Sphere(
      POINT(PA.longitude, PA.latitude),
      POINT(:lng, :lat)
    ) / 1000
  ELSE NULL
END AS distance

  FROM Store S

  LEFT JOIN PartnerAddress PA
    ON PA.store_id = S.id
    AND PA.status = 'active'

  LEFT JOIN (
    SELECT store_id,
           AVG(rating) AS rating_avg,
           COUNT(id) AS review_count
    FROM Reviews
    WHERE status = 'active'
    GROUP BY store_id
  ) R ON R.store_id = S.id

  LEFT JOIN (
    SELECT store_id,
           MIN(discounted_amount) AS min_price
    FROM StoreServices
    WHERE status = 'active'
    GROUP BY store_id
  ) SS ON SS.store_id = S.id

  LEFT JOIN (
    SELECT SS.store_id,
           GROUP_CONCAT(DISTINCT SC.name) AS categories
    FROM StoreServices SS
    JOIN Servicecategory SC
      ON SC.id = SS.service_category
    WHERE SS.status = 'active'
    GROUP BY SS.store_id
  ) C ON C.store_id = S.id

  LEFT JOIN Favourites F
    ON F.store_id = S.id
    AND F.user_id = :userId
    AND F.status = 'active'

  WHERE S.status = 'active'
  and S.completion_status = 'completed'

  ${storeGenderWhereSql("S.store_type", gender)}

  AND (
  :lat IS NULL
  OR (
    PA.latitude BETWEEN :minLat AND :maxLat
    AND PA.longitude BETWEEN :minLng AND :maxLng
  )
)

  AND (:minRating IS NULL OR R.rating_avg >= :minRating)
  AND (:minPrice IS NULL OR SS.min_price >= :minPrice)
  AND (:maxPrice IS NULL OR SS.min_price <= :maxPrice)

  AND (
    :search IS NULL
    OR (
      S.name LIKE :search
      OR C.categories LIKE :search
    )
  )

  ORDER BY ${orderBy}

  LIMIT :limit OFFSET :offset
  `;

    const countSql = `
  SELECT COUNT(DISTINCT S.id) AS total
  FROM Store S
  LEFT JOIN PartnerAddress PA
    ON PA.store_id = S.id
    AND PA.status = 'active'
  LEFT JOIN (
    SELECT store_id,
           AVG(rating) AS rating_avg,
           COUNT(id) AS review_count
    FROM Reviews
    WHERE status = 'active'
    GROUP BY store_id
  ) R ON R.store_id = S.id
  LEFT JOIN (
    SELECT store_id,
           MIN(discounted_amount) AS min_price
    FROM StoreServices
    WHERE status = 'active'
    GROUP BY store_id
  ) SS ON SS.store_id = S.id
  LEFT JOIN (
    SELECT SS.store_id,
           GROUP_CONCAT(DISTINCT SC.name) AS categories
    FROM StoreServices SS
    JOIN Servicecategory SC
      ON SC.id = SS.service_category
    WHERE SS.status = 'active'
    GROUP BY SS.store_id
  ) C ON C.store_id = S.id
  WHERE S.status = 'active'
  AND S.completion_status = 'completed'
  ${storeGenderWhereSql("S.store_type", gender)}
  AND (
    :lat IS NULL
    OR (
      PA.latitude BETWEEN :minLat AND :maxLat
      AND PA.longitude BETWEEN :minLng AND :maxLng
    )
  )
  AND (:minRating IS NULL OR R.rating_avg >= :minRating)
  AND (:minPrice IS NULL OR SS.min_price >= :minPrice)
  AND (:maxPrice IS NULL OR SS.min_price <= :maxPrice)
  AND (
    :search IS NULL
    OR (
      S.name LIKE :search
      OR C.categories LIKE :search
    )
  )
  `;

    const [stores, totalResult] = await Promise.all([
      connection.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT }),
      connection.query(countSql, { replacements, type: Sequelize.QueryTypes.SELECT })
    ]);

    return {
      rawData: stores,
      totalRecords: totalResult[0].total
    };
  },
  validateStore: async (storeId) => {
    return await userDbController.Models.Store.findOne({
      where: {
        id: storeId,
        status: "active"
      }
    });
  },

  findByStoreAndUser: async (storeId, userId) => {
    return await userDbController.Models.Favourites.findOne({
      where: { store_id: storeId, user_id: userId }
    });
  },

  findActive: async (storeId, userId) => {
    return await userDbController.Models.Favourites.findOne({
      where: {
        store_id: storeId,
        user_id: userId,
        status: "active"
      }
    });
  },

  create: async (storeId, userId) => {
    return await userDbController.Models.Favourites.create({
      store_id: storeId,
      user_id: userId,
      status: "active"
    });
  },

  updateStatus: async (storeId, userId, status) => {
    return await userDbController.Models.Favourites.update(
      { status },
      {
        where: {
          store_id: storeId,
          user_id: userId
        }
      }
    );
  },
  getUserFavourites: async (userId) => {

    return await connection.query(
      `
    SELECT 
      S.id,
      S.name,
      S.images,
      S.logo,
      S.salon_image,
      S.is_premium,
      S.store_type,
      
      IFNULL(AVG(R.rating), 0) AS rating,
      COUNT(DISTINCT R.id) AS reviewCount,
      
      MIN(SS.discounted_amount) AS servicePrice,
      MIN(SS.service_name) AS serviceName,
      
      GROUP_CONCAT(DISTINCT SC.name) AS categories,
      GROUP_CONCAT(DISTINCT L.code) AS languageCodes,
      
      PA.addressLine1,
      PA.area,
      PA.city,
      PA.zipcode,
      PA.latitude,
      PA.longitude,
      
      1 AS isFavorite
      
    FROM Favourites F
    INNER JOIN Store S ON S.id = F.store_id
    LEFT JOIN PartnerAddress PA ON PA.store_id = S.id AND PA.status = 'active'
    LEFT JOIN Reviews R ON R.store_id = S.id AND R.status = 'active'
    LEFT JOIN StoreServices SS ON SS.store_id = S.id AND SS.status = 'active'
    LEFT JOIN Servicecategory SC ON SC.id = SS.service_category
    LEFT JOIN StoreLanguages SL ON SL.store_id = S.id
    LEFT JOIN Languages L ON L.id = SL.language_id AND L.status = 'active'
    
    WHERE F.user_id = :userId
      AND F.status = 'active'
      AND S.status = 'active'
      
    GROUP BY S.id, PA.id
    ORDER BY S.id DESC
    `,
      {
        replacements: { userId },
        type: Sequelize.QueryTypes.SELECT
      }
    );
  },
  getStoreBasicDetailsv2: async (id) => {
    const sql = `
    SELECT S.*,
           A.addressLine1,
           A.area,
           A.city,
           A.state,
           A.zipcode,
           A.latitude,
           A.longitude
    FROM Store S
    LEFT JOIN PartnerAddress A
      ON A.store_id = S.id
     AND A.status = 'active'
    WHERE S.id = :store_id
      AND S.status = 'active'
      AND S.completion_status = 'completed'
  `;

    const result = await connection.query(sql, {
      replacements: { store_id: id },
      type: Sequelize.QueryTypes.SELECT
    });

    return result[0] || null;
  },
  
  getStoreServicesv2: async (store_id, sex = "unisex") => {

    let genderCondition = "";

    // Male user
    if (sex === "male") {
      genderCondition = `
        AND S.service_for IN ('male', 'unisex')
      `;
    }

    // Female user
    else if (sex === "female") {
      genderCondition = `
        AND S.service_for IN ('female', 'unisex')
      `;
    }

    // Unisex -> show all
    else {
      genderCondition = `
        AND S.service_for IN ('male', 'female', 'unisex')
      `;
    }

    const query = `
      SELECT 
          S.id,
          S.service_name,
          S.store_id,
          S.amount,
          S.discounted_amount,
          S.duration,
          S.status,
          S.priority,
          S.service_for,
          S.service_category,
          C.name AS category_name,

          -- Popular status
          CASE
              WHEN S.priority > 0 THEN true
              ELSE false
          END AS is_popular,

          -- Popular rank
          CASE
              WHEN S.priority > 0 THEN S.priority
              ELSE null
          END AS popular_rank

      FROM StoreServices S

      LEFT JOIN Servicecategory C
          ON C.id = S.service_category

      WHERE S.store_id = :store_id
        AND S.status = 'active'
        ${genderCondition}

      ORDER BY
        CASE
          WHEN S.priority > 0 THEN 0
          ELSE 1
        END,
        S.priority ASC,
        S.id DESC
    `;

    const services = await connection.query(query, {
      replacements: { store_id },
      type: Sequelize.QueryTypes.SELECT,
    });

    return services.map(service => ({
      ...service,
      duration: formatDuration(service.duration),
    }));
  },

  getPopularServices: async (store_id, sex = "unisex") => {

    let genderCondition = "";

    // Male user
    if (sex === "male") {
      genderCondition = `
        AND S.service_for IN ('male', 'unisex')
      `;
    }

    // Female user
    else if (sex === "female") {
      genderCondition = `
        AND S.service_for IN ('female', 'unisex')
      `;
    }

    // Unisex -> return all
    else {
      genderCondition = `
        AND S.service_for IN ('male', 'female', 'unisex')
      `;
    }

    const query = `
      SELECT 
          S.id,
          S.service_name,
          S.store_id,
          S.amount,
          S.discounted_amount,
          S.duration,
          S.status,
          S.priority,
          S.service_for,
          S.service_category,

          C.name AS category_name,

          true AS is_popular,
          S.priority AS popular_rank

      FROM StoreServices S

      LEFT JOIN Servicecategory C
        ON C.id = S.service_category

      WHERE S.store_id = :store_id
        AND S.status = 'active'
        AND S.priority > 0
        ${genderCondition}

      ORDER BY S.priority ASC
    `;

    const services = await connection.query(query, {
      replacements: { store_id },
      type: Sequelize.QueryTypes.SELECT,
    });

    return services;
  },

  getTopCategoryServicesBySex: async (sex = "male") => {

    let categorySuffix = "";

    if (sex === "male") {
      categorySuffix = "-M";
    } 
    else if (sex === "female") {
      categorySuffix = "-F";
    }

    let customOrder = "";

    if (sex === "male") {
      customOrder = `
        CASE
          WHEN ranked.search_category = 'Hair cut -M' THEN 1
          WHEN ranked.search_category = 'Shave -M' THEN 2
          WHEN ranked.search_category = 'Trim -M' THEN 3
          WHEN ranked.search_category = 'De-tan -M' THEN 4
          WHEN ranked.search_category = 'Bleach -M' THEN 5
          ELSE 999
        END
      `;
    }

    if (sex === "female") {
      customOrder = `
        CASE
          WHEN ranked.search_category = 'Eye Brow -F' THEN 1
          WHEN ranked.search_category = 'Facial -F' THEN 2
          WHEN ranked.search_category = 'Clean-Up -F' THEN 3
          WHEN ranked.search_category = 'Hair Cut V -F' THEN 4
          WHEN ranked.search_category = 'Hair Cut U -F' THEN 5
          ELSE 999
        END
      `;
    }

    const query = `
      SELECT
        ranked.category_id,
        ranked.category_name,
        ranked.search_category,
        ranked.discounted_amount,
        CONCAT('https://storage.googleapis.com/gloup-images/', ranked.imageKey) AS image

      FROM (
        SELECT
          S.discounted_amount,

          -- Category ID
          C.id AS category_id,

          -- Original category
          C.name AS search_category,
          C.imageKey AS imageKey,

          -- Clean category
          TRIM(
            REPLACE(
              REPLACE(C.name, '-M', ''),
              '-F',
              ''
            )
          ) AS category_name,

          ROW_NUMBER() OVER (
            PARTITION BY C.id
            ORDER BY
              S.priority ASC,
              S.discounted_amount ASC
          ) AS row_num

        FROM StoreServices S

        INNER JOIN Store ST
          ON ST.id = S.store_id

        INNER JOIN Servicecategory C
          ON C.id = S.service_category

        WHERE
          ST.status = 'active'
          AND S.status = 'active'
          AND S.priority > 0

          ${
            sex === "unisex"
              ? ""
              : `AND C.name LIKE '%${categorySuffix}'`
          }

      ) ranked

      WHERE ranked.row_num = 1

      ORDER BY ${customOrder}
    `;

    const services = await connection.query(query, {
      type: Sequelize.QueryTypes.SELECT,
    });

    return services;
  },

  getStoresByServiceCategory: async ({
  categoryId = null,
  sex = null,
  budget = null,
  rating = null,
  lat = null,
  lng = null,
}) => {

  const replacements = {
    latitude: lat,
    longitude: lng,
  };

  const hasGeo = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

  const distanceSelect = hasGeo
    ? `
      CASE
        WHEN PA.latitude IS NOT NULL AND PA.longitude IS NOT NULL THEN
          ST_Distance_Sphere(
            PA.location,
            POINT(:longitude, :latitude)
          ) / 1000
        ELSE NULL
      END AS distance,`
    : `NULL AS distance,`;

  let whereConditions = `
    ST.status = 'active'
    AND ST.completion_status = 'completed'
    AND S.status = 'active'
  `;


  // Category Filter
  if (categoryId) {
    whereConditions += `
      AND S.service_category = :categoryId
    `;
    replacements.categoryId = categoryId;
  } else {
    whereConditions += `
      AND (
        C.name LIKE '%-M'
        OR C.name LIKE '%-F'
      )
    `;
  }

  // Gender Filter
  if (sex === "male") {
    whereConditions += `
      AND (
        C.name LIKE '%-M'
        OR S.service_for = 'male'
      )
    `;
  }

  if (sex === "female") {
    whereConditions += `
      AND (
        C.name LIKE '%-F'
        OR S.service_for = 'female'
      )
    `;
  }

  // Budget Filter
  if (budget) {
    const [minBudget, maxBudget] =
      budget.split("-").map(Number);

    whereConditions += `
      AND S.discounted_amount
      BETWEEN :minBudget AND :maxBudget
    `;

    replacements.minBudget = minBudget;
    replacements.maxBudget = maxBudget;
  }

  // Rating Filter
  if (rating) {
    whereConditions += `
      AND COALESCE(R.avg_rating,0) >= :rating
    `;

    replacements.rating = rating;
  }

  const query = `
  SELECT *
  FROM (
    SELECT

      -- Store
      ST.id,
      ST.name,
      ST.store_type,
      ST.website,
      ST.images,
      ST.team_size,
      ST.email,
      ST.phone,
      ST.description,
      ST.about,
      ST.salon_image,
      ST.logo,
      ST.is_premium,
      ST.services_provided_for,
      ST.languages,
      ST.referral_id,
      ST.createdAt,
      ST.updatedAt,

      -- Ratings
      COALESCE(R.avg_rating,0) AS rating,
      COALESCE(R.review_count,0) AS review_count,

      -- Address
      PA.id AS address_id,
      PA.addressLine1,
      PA.addressLine2,
      PA.state,
      PA.district,
      PA.city,
      PA.area,
      PA.zipcode,
      PA.landmark,
      PA.latitude,
      PA.longitude,
      PA.radius,

      ${distanceSelect}

      -- Service
      S.id AS service_id,
      S.service_name AS serviceName,
      S.discounted_amount AS servicePrice,
      S.service_category,
      C.name AS category_name,

      ROW_NUMBER() OVER (
        PARTITION BY ST.id
        ORDER BY
          S.priority ASC,
          S.discounted_amount ASC
      ) AS rn

    FROM StoreServices S

    INNER JOIN Store ST
      ON ST.id = S.store_id

    INNER JOIN Servicecategory C
      ON C.id = S.service_category

    LEFT JOIN PartnerAddress PA
      ON PA.store_id = ST.id
      AND PA.status = 'active'

    LEFT JOIN (
      SELECT
        store_id,
        ROUND(AVG(rating),1) AS avg_rating,
        COUNT(*) AS review_count
      FROM Reviews
      WHERE status = 'active'
      GROUP BY store_id
    ) R
      ON R.store_id = ST.id

    WHERE ${whereConditions}

  ) ranked

  WHERE ranked.rn = 1

  ORDER BY
    ${hasGeo ? "ranked.distance IS NULL, ranked.distance ASC," : ""}
    ranked.is_premium DESC,
    ranked.rating DESC,
    ranked.id DESC
`;

  const result = await connection.query(query, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
  });

  return result;
},

  getStylistsv2: async (store_id) => {
    return await Stylist.findAll({
      where: { store_id, status: 'active' },
      raw: true
    });
  },
  getReviewsv2: async (store_id) => {
    return await Models.Reviews.findAll({
      where: { store_id, status: 'active' },
      raw: true
    });
  },
  getRatingSummaryv2: async (store_id) => {
    const sql = `
    SELECT 
      AVG(rating) as avg_rating,
      COUNT(*) as reviewCount
    FROM Reviews
    WHERE store_id = :store_id
      AND status = 'active'
  `;

    const result = await connection.query(sql, {
      replacements: { store_id },
      type: Sequelize.QueryTypes.SELECT
    });

    return result[0];
  },
  getSlotsv2: async (store_id) => {
    return await Models.Slots.findAll({
      where: { store_id, status: 'active' },
      raw: true
    });
  },

  getAmenitiesv2: async (store_id) => {
    return await Models.StoreAminities.findAll({
      where: { store_id },
      raw: true
    });
  },
  getStoreLanguagesv2: async (store_id) => {
    const sql = `
    SELECT L.id,
           L.name,
           L.code
    FROM StoreLanguages SL
    JOIN Languages L
      ON L.id = SL.language_id
    WHERE SL.store_id = :store_id
      AND L.status = 'active'
  `;

    return await connection.query(sql, {
      replacements: { store_id },
      type: Sequelize.QueryTypes.SELECT
    });
  },
  getWorkingHoursv2: async (store_id) => {
    return await Models.WorkingHours.findAll({
      attributes: ["from", "to"],
      where: {
        store_id: store_id
      },
      raw: true
    });
  },

  addGuestDetails: async (data, user_id) => {
    try {
      return await userDbController.Models.GuestDetails.create({
        user_id,
        name: data.name,
        gender: data.gender,
        age: data.age,
        phone: data.phone,
        status: 'active'
      });
    } catch (error) {
      console.error("addGuestDetails Error:", error);
      throw Error.InternalError();
    }
  },

  getGuestDetails: async (user_id) => {
    try {
      return await userDbController.Models.GuestDetails.findAll({
        where: {
          user_id,
          status: 'active'
        },
        attributes: [
          'id', 'name', 'age', 'gender', 'phone', 'status'
        ]
      });
    } catch (error) {
      console.error("getGuestDetails Error:", error);
      throw Error.InternalError();
    }
  },
  updateGuestDetails: async (guestId, data, userId) => {
    try {

      console.log("guestId:", guestId);
      console.log("userId:", userId);

      const guest = await userDbController.Models.GuestDetails.findOne({
        where: {
          id: guestId,
          user_id: userId
        }
      });

      if (!guest) {
        throw Error.NotFound("Guest not found");
      }

      await guest.update({
        name: data.name ?? guest.name,
        gender: data.gender ?? guest.gender,
        age: data.age ?? guest.age,
        phone: data.phone ?? guest.phone,
        status: data.status ?? guest.status
      });

      return { message: "Guest details updated successfully" };

    } catch (error) {
      console.error("updateGuestDetails Error:", error);
      if (error.status) throw error;
      throw Error.InternalError();
    }
  },

  getProfileV2: async (userId) => {
    try {
      return await userDbController.Models.User.findOne({
        where: { id: userId, status: 'active' },
        attributes: [
          'id', 'firstname', 'lastname', 'email', 'phone',
          'profilePic', 'gender', 'age', 'date_of_birth', 'city', 'country'
        ],
        raw: true
      });
    } catch (error) {
      console.error("getProfileV2 error:", error);
      throw Error.InternalError("Failed to fetch user profile");
    }
  },
  updateProfileV2: async (userId, updateData) => {
    try {
      const { firstname, lastname, email, phone, age, gender, dob, city, country, profilePic } = updateData;

      const payload = {};
      if (firstname !== undefined) payload.firstname = firstname;
      if (lastname !== undefined) payload.lastname = lastname;
      if (email !== undefined) payload.email = email;
      if (phone !== undefined) payload.phone = (phone === "" || phone === "null") ? null : phone;
      if (age !== undefined) payload.age = (age === "" || age === "null") ? null : age;
      if (gender !== undefined) payload.gender = gender;
      if (dob !== undefined) payload.date_of_birth = dob;
      if (city !== undefined) payload.city = city;
      if (country !== undefined) payload.country = country;
      if (profilePic !== undefined) payload.profilePic = profilePic;
      console.log(payload);

      if (Object.keys(payload).length > 0) {
        await userDbController.Models.User.update(payload, {
          where: { id: userId, status: 'active' }
        });
      }

      return true;
    } catch (error) {
      console.error("updateProfileV2 error:", error);
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw Error.BadRequest("Email is already in use by another account");
      }
      throw Error.InternalError("Failed to update user profile");
    }
  },
  deleteUserV2: async (userId) => {
    try {
      // Production grade: Soft delete by updating status
      const [affectedRows] = await userDbController.Models.User.update(
        { status: 'deleted' },
        { where: { id: userId } }
      );

      // Log the deletion
      if (affectedRows > 0) {
        await userDbController.Models.AccountLogs.create({
          user_id: userId,
          action: "ACCOUNT_DELETED",
          date: new Date(),
          description: "User account soft-deleted by user",
        });
      }

      return affectedRows > 0;
    } catch (error) {
      console.error("deleteUserV2 error:", error);
      throw Error.InternalError("Failed to delete user account");
    }
  },
  getCouponUsageCountv2: async (couponId, userId) => {
    try {
      return await userDbController.Models.UsedCoupons.count({
        where: {
          coupon_id: couponId,
          user_id: userId
        }
      });
    } catch (error) {
      console.error("getCouponUsageCount ERROR:", error);
      throw error;   // don't hide during debugging
    }
  },

  getStoreServicesByIdsV2: async (serviceIds) => {
    try {
      return await userDbController.Models.StoreServices.findAll({
        where: {
          id: { [Sequelize.Op.in]: serviceIds },
          status: "active"
        },
        attributes: ["id", "service_name", "amount", "discounted_amount", "duration", "service_category"]
      });
    } catch (error) {
      console.error("getStoreServices ERROR:", error);
      throw Error.SomethingWentWrong("Failed to fetch services");
    }
  },

  getCombosByIdsV2: async (comboIds) => {
    try {
      return await userDbController.Models.Combo.findAll({
        where: {
          id: { [Sequelize.Op.in]: comboIds },
          status: "active"
        },
        attributes: ["id", "combo", "amount", "duration", "service_category"]
      });
    } catch (error) {
      console.error("getCombos ERROR:", error);
      throw Error.SomethingWentWrong("Failed to fetch combos");
    }
  },

  createOrderV2: async (orderData, transaction) => {
    try {
      return await userDbController.Models.appointments.create(orderData, { transaction });
    } catch (error) {
      console.error("createOrderV2 Error:", error);
      throw Error.InternalError("Failed to create order: " + (error.message || error));
    }
  },

  addAppointmentItemsV2: async (items, transaction) => {
    try {
      return await userDbController.Models.appointment_items.bulkCreate(items, { transaction });
    } catch (error) {
      console.error("addAppointmentItems Error:", error);
      throw Error.InternalError("Failed to add appointment items");
    }
  }
}
