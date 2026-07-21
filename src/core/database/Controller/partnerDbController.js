import require from "requirejs";
import * as Error from "../../errors/ErrorConstant.js";
import { connection } from "../connection.js";
import * as Models from "../models/index.js";
import {
  addaminities,
  addcombinations,
  deleteserivice,
  getaminitiesV2,
  getbankdetails,
  getownerprofile,
  getproffesional,
  getSalonDetailsv2,
  listservicecategory,
  listservices,
  updateSalonDetailsv2,
} from "../../../Partner/controller/partnerappcontroller.js";
import { addcategory } from "../../../Admin/controller/adminappcontroller.js";
// import { cat } from "shelljs";
import {
  formatSlotTime,
  buildAppointmentDateTime,
  toIstDatePart,
} from "../../schema/formats.js";
import { error } from "shelljs";
import logger from "../../utils/logger.js";
import { logErrorToDB } from "../../utils/loggerDB.js";
import { uploadToS3, S3upload, deleteIfExists } from "../../utils/s3/s3Upload.js";
import Razorpay from "razorpay";

const { Op, Sequelize } = require("sequelize");
var randomize = require("randomatic");

const razorpay = new Razorpay({
  key_id: process.env.RZ_PAY_ID,
  key_secret: process.env.RZ_PAY_KEY,
});

export class partnerDbController { }
partnerDbController.scope = "defaultScope";
partnerDbController.Models = Models;
partnerDbController.connection = connection;
partnerDbController.defaults = {};

const {
  appointments,
  appointment_items,
  StoreServices,
  User,
  Stylist,
  Servicecategory,
  Store,
  Languages,
  StoreLanguages,
  PartnerSubscriptionPlans,
  PartnerSubscriptionPlanfeatures,
  PartnerSubscriptionPlanfeatureMapping,
  PartnerSubscriptions,
  PartnerSubscriptionsPayments,
  Enquiry,
  Slots,
} = Models;

// appointments → appointment_items
appointments.hasMany(appointment_items, {
  foreignKey: "appointment_id",
});

appointment_items.belongsTo(appointments, {
  foreignKey: "appointment_id",
});

// appointment_items → StoreServices
appointment_items.belongsTo(StoreServices, {
  foreignKey: "service_id",
});

StoreServices.hasMany(appointment_items, {
  foreignKey: "service_id",
});

// appointments → User
appointments.belongsTo(User, {
  foreignKey: "user_id",
});

User.hasMany(appointments, {
  foreignKey: "user_id",
});

// appointments → Stylist
appointments.belongsTo(Stylist, {
  foreignKey: "profesional_id",
  as: "Stylist",
});

Stylist.hasMany(appointments, {
  foreignKey: "profesional_id",
});

// appointments → Slots (real appointment time lives on Slots.from / Slots.to)
appointments.belongsTo(Slots, {
  foreignKey: "slot_id",
  as: "Slot",
});

Slots.hasMany(appointments, {
  foreignKey: "slot_id",
});

// category →  service
StoreServices.belongsTo(Servicecategory, {
  foreignKey: "service_category",
  as: "category",
});

Servicecategory.hasMany(StoreServices, {
  foreignKey: "service_category",
  as: "services",
});

// Store.belongsToMany(Languages, {
//   through: StoreLanguages,
//   foreignKey: "store_id",
//   otherKey: "language_id",
//   as: "languages"
// });

// Languages.belongsToMany(Store, {
//   through: StoreLanguages,
//   foreignKey: "language_id",
//   otherKey: "store_id",
//   as: "stores"
// });

Store.belongsToMany(Languages, {
  through: StoreLanguages,
  foreignKey: "store_id",
  otherKey: "language_id",
  as: "storeLanguages",
});

Languages.belongsToMany(Store, {
  through: StoreLanguages,
  foreignKey: "language_id",
  otherKey: "store_id",
  as: "stores",
});

// PartnerSubscriptionPlans → PartnerSubscriptionPlanfeatureMapping
PartnerSubscriptionPlans.hasMany(PartnerSubscriptionPlanfeatureMapping, {
  foreignKey: "plan_id",
});

PartnerSubscriptionPlanfeatureMapping.belongsTo(
  PartnerSubscriptionPlanfeatures,
  {
    foreignKey: "feature_id",
    as: "feature",
  },
);

((partnerDbController.auth = {
  checkPhoneExists: async (data) => {
    try {
      return await partnerDbController.Models.Store.findOne({
        where: {
          phone: data.phone,
        },
      });
    } catch (error) {
      console.log("🚀 ~ error:", error);
      // return null;
      throw Error.InternalError("cannot get user data");
    }
  },
  createOTPExpiry: async (data) => {
    try {
      return await partnerDbController.Models.Store.update(
        {
          otp: 0,
          otpExpiration: data.expiry,
        },
        {
          where: {
            id: data.id,
          },
        },
      );
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError("cannot set expiry ");
    }
  },
  createOTPLog: async (data) => {
    try {
      return await partnerDbController.Models.OtpLogs.create({
        userId: data.id,
        userName: data.name,
        phone: data.phone,
        requestId: data.requestId,
        smsType: data.type,
        msgType: data.msgType,
        userType: "partner",
        status: "active",
      });
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError();
    }
  },
  createPartner: async (body) => {
    try {
      const tempEmail = `${body.phone}@temp.gloup.app`;
      return await partnerDbController.Models.Store.create({
        phone: body.phone,
        email: tempEmail,
        status: "active",
      });
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError("cannot create customer");
    }
  },
  updateOTPExpiry: async (data) => {
    try {
      return await partnerDbController.Models.Store.update(
        { otp: 0, optExpiration: 0 },
        { where: { id: data.id } },
        { plain: true, returning: true },
      );
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError();
    }
  },
  createSession: async (token, device, customerId) => {
    try {
      return await partnerDbController.Models.StoreSession.create({
        storeId: customerId,
        token: token,
        ipv4: device.ip || device.ipv,
        userAgent: device.userAgent,
        status: "active",
      });
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError();
    }
  },
  checkuser: async (email) => {
    try {
      return await partnerDbController.Models.Store.findOne({
        where: {
          email: email,
        },
      });
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError();
    }
  },
  getaddress: async (id) => {
    try {
      return await partnerDbController.Models.PartnerAddress.findOne({
        where: {
          store_id: id || null,
        },
      });
    } catch (error) {
      throw Error.InternalError();
    }
  },
  checksession: async (id) => {
    try {
      const session = await partnerDbController.Models.StoreSession.findOne({
        where: {
          storeId: id,
        },
      });
      return session;
    } catch (error) {
      throw Error.InternalError();
    }
  },
  addDeviceId: async (data, id) => {
    try {
      return await partnerDbController.Models.Store.update(
        {
          deviceId: JSON.stringify(data),
        },
        {
          where: {
            id: id,
          },
        },
      );
    } catch (error) {
      throw Error.InternalError();
    }
  },
  adduser: async (email, password) => {
    try {
      const res = await partnerDbController.Models.Store.create({
        email: email,
        password: password,
        status: "inactive",
      });
      return res;
    } catch (error) {
      throw Error.InternalError();
    }
  },
  adduser_1: async (email) => {
    try {
      return await partnerDbController.Models.Store.create({
        email: email,
        status: "active",
      });
    } catch (error) {
      throw Error.InternalError();
    }
  },
  adduser_2: async (email, name, apple_sub) => {
    try {
      return await partnerDbController.Models.Store.create({
        email: email,
        name: name || null,
        apple_sub: apple_sub,
        status: "active",
      });
    } catch (error) {
      throw Error.InternalError();
    }
  },
  registerupdateuser: async (id) => {
    try {
      return await partnerDbController.Models.Store.update(
        {
          status: "active",
        },
        {
          where: {
            id: id,
          },
        },
      );
    } catch (error) {
      throw Error.InternalError();
    }
  },
  checkUserExists: async (data, id) => {
    try {
      return await partnerDbController.Models.Store.findOne({
        where: {
          status: "active",
          id: id,
        },
      });
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError();
    }
  },
  deleteAccount: async (id) => {
    try {
      return await partnerDbController.Models.Store.update(
        {
          status: "terminated",
        },
        {
          where: {
            id: id,
          },
        },
      );
    } catch (error) {
      throw Error.InternalError();
    }
  },
  logout: async (token) => {
    try {
      return await partnerDbController.Models.StoreSession.update(
        {
          status: "inactive",
        },
        {
          where: {
            token: token,
          },
        },
      );
    } catch (error) {
      throw Error.InternalError();
    }
  },
  insertsession: async (encryptedToken, userid, deviceinfo) => {
    try {
      const res = await partnerDbController.Models.StoreSession.create({
        storeId: userid,
        token: encryptedToken,
        ipv4: deviceinfo.ipv4 || deviceinfo.ipv || null,
        userAgent: deviceinfo.userAgent,
        status: "active",
      });
      return res;
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.InternalError();
    }
  },
  findsession: async (token) => {
    try {
      return await partnerDbController.Models.StoreSession.findOne({
        where: { token: token },
      });
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  checkUserIdExists: async (data) => {
    try {
      return await partnerDbController.Models.Store.findOne({
        where: {
          id: data.id,
        },
        raw: true,
      });
    } catch (error) {
      console.error(error);
      throw Error.InternalError();
    }
  },
  destroysession: async (id) => {
    try {
      const [rowsaffected] =
        await partnerDbController.Models.StoreSession.update(
          {
            status: "inactive",
          },
          {
            where: {
              id: id,
            },
          },
        );
      return rowsaffected;
      //const res = await partnerDbController.Models.StoreSession.findOne({
      //    where: { token: token }
      //})
      //return res;
    } catch (error) {
      console.error(error);
      throw Error.InternalError();
    }
  },
}),
  (partnerDbController.app = {
    addaddress: async (body, id) => {
      console.log("🚀 ~ body:", body);
      const normalize = (obj) => {
        const normalized = {};
        for (const key in obj) {
          normalized[key.trim()] = obj[key];
        }
        return normalized;
      };
      const normalizedBody = normalize(body);
      try {
        return await partnerDbController.Models.PartnerAddress.create({
          store_id: id,
          addressLine1: normalizedBody.addressLine1,
          addressLine2: normalizedBody.addressLine2,
          district: normalizedBody.district,
          city: normalizedBody.city,
          state: normalizedBody.state,
          area: normalizedBody.area,
          zipcode: normalizedBody.zipcode,
          latitude: normalizedBody.latitude,
          longitude: normalizedBody.longitude,
          location: {
            type: "Point",
            coordinates: [
              parseFloat(normalizedBody.longitude),
              parseFloat(normalizedBody.latitude),
            ],
          },
          status: "active",
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    deletecategory: async (id) => {
      try {
        return await partnerDbController.Models.CategoryTable.destroy({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    addcategory: async (id, userid) => {
      try {
        return await partnerDbController.Models.CategoryTable.create({
          category_id: id,
          store_id: userid,
        });
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    getaddress: async (id) => {
      try {
        return await partnerDbController.Models.PartnerAddress.findOne({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getallaminities: async (body) => {
      try {
        return await partnerDbController.Models.Aminities.findAll();
      } catch (error) {
        throw Error.InternalError();
      }
    },
    add_new_aminities: async (body) => {
      try {
        return await partnerDbController.Models.Aminities.create({
          name: body.name,
          icon: body.icon,
          status: "active",
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getbanner: async (body, id) => {
      try {
        return await partnerDbController.Models.Banner.findAll({
          where: {
            status: "active",
            place: "partner",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getaddressbyid: async (id) => {
      try {
        return await partnerDbController.Models.PartnerAddress.findOne({
          where: {
            id: id || null,
            status: "active",
          },
          raw: true,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getallnotification: async (data, id) => {
      try {
        return await partnerDbController.Models.PartnerNotificationLogs.findAll(
          {
            where: {
              partner_id: id,
            },
            order: [["date", "DESC"]],
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    gettransactionlogs: async (data, id) => {
      try {
        return await partnerDbController.Models.WalletLogs.findAll({
          where: {
            user_id: id,
          },
          order: [["date", "DESC"]],
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addrangeplan: async (data, id) => {
      try {
        return await partnerDbController.Models.PartnerAddress.increment(
          { radius: data },
          {
            where: {
              store_id: id,
            },
          },
        );
      } catch (error) {
        //////console.log("🚀 ~ addrangeplan: ~ error:", error)
        throw Error.InternalError();
      }
    },
    getdetails: async (id) => {
      try {
        return await partnerDbController.Models.SubscriptionPlans.findOne({
          where: {
            id: id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getactiveplans: async (body) => {
      try {
        return await partnerDbController.Models.StoreSubscription.findAll({
          where: {
            store_id: body.id,
            status: "active",
            type: body.type,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addpartner: async (body, images, docs, address_id, id) => {
      const normalize = (obj) => {
        const normalized = {};
        for (const key in obj) {
          normalized[key.trim()] = obj[key];
        }
        return normalized;
      };
      const normalizedBody = normalize(body);
      try {
        return await partnerDbController.Models.Store.update(
          {
            name: normalizedBody.name,
            category_id: JSON.stringify(normalizedBody.category_id),
            website: normalizedBody.website,
            docs: JSON.stringify(docs),
            images: JSON.stringify(images),
            income: normalizedBody.income_level,
            team_size: normalizedBody.team_size,
            address_id: address_id,
            store_type: normalizedBody.type,
            phone: normalizedBody.phone,
            description: normalizedBody.description,
            referral_id: normalizedBody.referral_id,
            status: "active",
          },
          {
            where: {
              type: data.type,
              status: "active",
            },
          },
        );
      } catch (error) {
        throw Error.SomethingWentWrong();
      }
    },
    updateaddress: async (body, addressId, id) => {
      console.log("🚀 ~ addressId:", addressId);
      console.log("🚀 ~ body 1:", body);
      try {
        return await partnerDbController.Models.PartnerAddress.update(
          {
            addressLine1: body.addressLine1,
            // addressLine2: body.addressLine2,
            district: body.district,
            city: body.city,
            state: body.state,
            area: body.area,
            // zipcode: body.zipcode,
            latitude: body.latitude,
            longitude: body.longitude,
            location: {
              type: "Point",
              coordinates: [
                parseFloat(body.latitude),
                parseFloat(body.longitude),
              ],
            },
          },
          {
            where: {
              id: addressId,
            },
          },
        );
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    getstorebyid: async (id) => {
      try {
        return await partnerDbController.Models.Store.findOne({
          where: {
            id: id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getsettlementlogs: async (data, id) => {
      try {
        return await partnerDbController.Models.SettlementLogs.findAll({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getwallet: async (data, id) => {
      try {
        return await partnerDbController.Models.Store.findOne({
          attributes: ["wallet_remaining"],
          where: {
            id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getservicecategory: async (body, id) => {
      try {
        return await partnerDbController.Models.Servicecategory.findAll();
      } catch (error) {
        throw Error.InternalError();
      }
    },
    editservicecategory: async (data) => {
      const transaction = await partnerDbController.connection.transaction();

      try {
        const category = await partnerDbController.Models.Servicecategory.findByPk(
          data.id
        );

        if (!category) {
          throw Error.NotFound("Service category not found");
        }

        let imageKey = category.imageKey;

        // ---------- S3 IMAGE HANDLING ----------
        if (data.image) {
          const folder = `service-category/${data.id}`;

          const uploaded = await uploadToS3(data.image, folder);

          // delete old image
          if (imageKey) {
            await deleteIfExists(imageKey);
          }

          imageKey = "/" + uploaded.key;
        }

        // ---------- UPDATE DB ----------
        await partnerDbController.Models.Servicecategory.update(
          {
            name: data.name ?? category.name,
            status: data.status ?? category.status,
            imageKey: imageKey,
          },
          {
            where: { id: data.id },
            transaction,
          }
        );

        await transaction.commit();

        return "Service category updated successfully";
      } catch (error) {
        await transaction.rollback();

        console.log("DB editservicecategory error:", error);

        throw Error.SomethingWentWrong("Failed to update service category");
      }
    },
    getservicecategorybyid: async (id) => {
      try {
        return await partnerDbController.Models.Servicecategory.findByPk(id);
      } catch (error) {
        throw Error.SomethingWentWrong("Could not fetch service category");
      }
    },
    addownerprofile: async (body, file, id) => {
      try {
        return await partnerDbController.Models.OwnerProfile.create({
          name: body.name,
          email: body.email,
          phone: body.phone,
          profile_pic: file,
          country: body.country,
          country_code: body.country_code,
          Dob: body.Dob,
          store_id: id,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updateownerprofile: async (body, file, user) => {
      try {
        // Update OwnerProfile using body.id
        await partnerDbController.Models.OwnerProfile.update(
          {
            name: body.name,
            email: body.email,
            phone: body.phone,
            profile_pic: file,
            country: body.country,
            country_code: body.country_code,
            Dob: body.Dob,
            store_id: user.id,
          },
          {
            where: { id: body.id },
          },
        );

        // Update Store phone using user.id
        if (body.phone) {
          await partnerDbController.Models.Store.update(
            {
              phone: body.phone,
            },
            {
              where: { id: user.id },
            },
          );
        }

        return true;
      } catch (error) {
        throw Error.InternalError();
      }
    },

    getownerprofile: async (id) => {
      try {
        const [profile, address] = await Promise.all([
          partnerDbController.Models.OwnerProfile.findOne({
            where: { store_id: id },
          }),
          partnerDbController.Models.PartnerAddress.findOne({
            where: { store_id: id },
          }),
        ]);
        if (!profile) return null;
        return { ...profile.toJSON(), city: address?.city || null };
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getownerprofileV2: async (id) => {
      try {
        const [profile, address, activeSubscription, store] = await Promise.all(
          [
            partnerDbController.Models.OwnerProfile.findOne({
              where: { store_id: id },
            }),
            partnerDbController.Models.PartnerAddress.findOne({
              where: { store_id: id },
            }),
            partnerDbController.Models.PartnerSubscriptions.findOne({
              where: {
                salon_id: id,
                is_active: true,
              },
              include: [
                {
                  model: partnerDbController.Models.PartnerSubscriptionPlans,
                  as: "plan",
                },
              ],
              order: [["created_at", "DESC"]],
            }),
            partnerDbController.Models.Store.findOne({
              where: { id: id },
              attributes: ["is_premium"],
            }),
          ],
        );
        if (!profile) return null;

        const plainProfile = profile.get
          ? profile.get({ plain: true })
          : profile;
        const plainAddress =
          address && address.get ? address.get({ plain: true }) : address;
        const plainStore =
          store && store.get ? store.get({ plain: true }) : store;
        const plainSub =
          activeSubscription && activeSubscription.get
            ? activeSubscription.get({ plain: true })
            : activeSubscription;

        return {
          ...plainProfile,
          city: plainAddress?.city || null,
          is_premium: plainStore?.is_premium,
          partnersubscription: plainSub,
          active_plan: plainSub
            ? {
              ...(plainSub.plan || {}),
              start_date: plainSub.start_date,
              end_date: plainSub.end_date,
            }
            : null,
        };
      } catch (error) {
        console.error("❌ [DB Error] getownerprofileV2:", error.message);
        throw Error.InternalError();
      }
    },
    getstoreplan: async (id) => {
      try {
        return await partnerDbController.Models.StoreSubscription.findOne({
          where: {
            subscription_id: id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updateexitingplan: async (planid) => {
      try {
        return await partnerDbController.Models.StoreSubscription.update(
          {
            status: "inactive",
          },
          {
            where: {
              status: "active",
              id: planid,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getactiveplans: async (body) => {
      try {
        return await partnerDbController.Models.StoreSubscription.findAll({
          where: {
            store_id: body.id,
            status: "active",
            type: body.type,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addpartner: async (body, images, docs, address_id, id) => {
      const normalize = (obj) => {
        const normalized = {};
        for (const key in obj) {
          normalized[key.trim()] = obj[key];
        }
        return normalized;
      };
      const normalizedBody = normalize(body);
      try {
        return await partnerDbController.Models.Store.update(
          {
            name: normalizedBody.name,
            category_id: JSON.stringify(normalizedBody.category_id),
            website: normalizedBody.website,
            docs: JSON.stringify(docs),
            images: JSON.stringify(images),
            income: normalizedBody.income_level,
            team_size: normalizedBody.team_size,
            address_id: address_id,
            store_type: normalizedBody.type,
            phone: normalizedBody.phone,
            description: normalizedBody.description,
            status: "active",
          },
          {
            where: {
              id: id,
            },
          },
        );
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    updatepartner: async (body, address_id, id) => {
      const normalize = (obj) => {
        const normalized = {};
        for (const key in obj) {
          normalized[key.trim()] = obj[key];
        }
        return normalized;
      };
      const normalizedBody = normalize(body);
      try {
        return await partnerDbController.Models.Store.update(
          {
            name: normalizedBody.name,
            category_id: JSON.stringify(normalizedBody.category_id),
            website: normalizedBody.website,
            income: normalizedBody.income_level,
            team_size: normalizedBody.team_size,
            address_id: address_id,
            store_type: normalizedBody.type,
            phone: normalizedBody.phone,
            description: normalizedBody.description,
            referral_id: normalizedBody.referral_id,
          },
          {
            where: {
              id: id,
            },
          },
        );
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },

    /**
     * @description Specialized update for v2 store profile.
     * Handles merging/replacing images and partial field updates.
     */
    updatepartnerV2: async (body, images, id) => {
      try {
        const updateData = {};

        // Simple mapping of fields if they exist in body
        if (body.name) updateData.name = body.name;
        if (body.website) updateData.website = body.website;
        if (body.income_level) updateData.income = body.income_level;
        if (body.team_size) updateData.team_size = body.team_size;
        if (body.type) updateData.store_type = body.type;
        if (body.phone) updateData.phone = body.phone;
        if (body.description) updateData.description = body.description;
        if (body.referral_id) updateData.referral_id = body.referral_id;

        // Handle complex fields
        if (body.category_id) {
          updateData.category_id = body.category_id; // Stored as JSON
        }

        if (images) {
          updateData.images = JSON.stringify(images);
        }

        return await partnerDbController.Models.Store.update(updateData, {
          where: { id: id },
          status: "active", // Ensure we only update active stores
        });
      } catch (error) {
        console.error("❌ [DB/updatepartnerV2] Error:", error);
        throw Error.InternalError("Failed to update store in database");
      }
    },
    updatebankdetails: async (data, id) => {
      try {
        return await partnerDbController.Models.Store.update(
          {
            bank_account_holder: data.account_holder_name,
            account_number: data.account_number,
            ifsc_code: data.ifsc_code,
          },
          {
            where: {
              id: id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addstoreservices: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreServices.create({
          service_name: data.service_name,
          duration: data.duration,
          amount: data.amount,
          discounted_amount: data.discounted_amount,
          status: "active",
          store_id: id,
          service_category: data.service_category,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updateservice: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreServices.update(
          {
            service_name: data.service_name,
            duration: data.duration,
            amount: data.amount,
            discounted_amount: data.discounted_amount,
            status: "active",
            store_id: id,
            service_category: data.service_category,
          },
          {
            where: {
              id: data.id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getsubscription: async (data, id) => {
      try {
        return await partnerDbController.Models.SubscriptionPlans.findAll({
          where: {
            status: "active",
            type: data.type,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addstoretimmings: async (data, id) => {
      try {
        return await partnerDbController.Models.WorkingHours.create({
          store_id: id,
          from: data.from,
          to: data.to,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    deletetimmings: async (data, id) => {
      try {
        return await partnerDbController.Models.WorkingHours.destroy({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    listservicecategory: async () => {
      try {
        return await partnerDbController.Models.Servicecategory.findAll();
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getstoreaminities: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreAminities.findAll({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addproffessional: async (data, id, file) => {
      try {
        return await partnerDbController.Models.Stylist.create({
          store_id: id,
          name: data.name,
          profilepic: file,
          email: data.email,
          status: "active",
          address: data.address,
          known_services: data.known_services,
          designation: data.designation,
          employment_id: data.employment_id,
          country: data.country,
          phone: data.phone,
          gender: data.gender,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updateproffessional: async (data, id, file) => {
      try {
        return await partnerDbController.Models.Stylist.update(
          {
            name: data.name,
            profilepic: file,
            email: data.email,
            status: "active",
            address: data.address,
            known_services: data.known_services,
            designation: data.designation,
            employment_id: data.employment_id,
            country: data.country,
            phone: data.phone,
            gender: data.gender,
          },
          {
            where: {
              id: data.id,
              store_id: id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getallcategory: async (data, id) => {
      try {
        return await partnerDbController.Models.category.findAll();
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getstoretimmings: async (data, id) => {
      try {
        return await partnerDbController.Models.WorkingHours.findAll({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    delelteproffesional: async (data, id) => {
      try {
        return await partnerDbController.Models.Stylist.update(
          {
            status: "inactive",
          },
          {
            where: {
              store_id: id,
              id: data.id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getPartnerSlots: async (id) => {
      try {
        let sql = `SELECT * FROM Slots WHERE store_id = :store_id`;

        const res = connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return res;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError(error.message);
      }
    },
    getStoreCompleted: async (id) => {
      try {
        let sql = `
                SELECT completion_status FROM Store
                WHERE id = :store_id AND completion_status = 'completed'
            `;

        const result = await connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get isStoreCompleted");
      }
    },
    getTotalEarnings: async (id) => {
      try {
        let sql = `
                SELECT COUNT(amount) as bookings, COALESCE(SUM(amount), 0) AS total_amount
                FROM appointments
                WHERE store_id = :store_id;
            `;

        const result = await connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get totalEarnings");
      }
    },
    getTodayBookings: async (id) => {
      try {
        let sql = `
                SELECT COUNT(*) AS bookings_today
                FROM appointments
                WHERE store_id = :store_id AND booking_date >= CURDATE()
                AND booking_date < CURDATE() + INTERVAL 1 DAY;
            `;

        const result = await connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get todayBookings");
      }
    },
    getCompletedAppointments: async (id) => {
      try {
        let sql = `
                SELECT COUNT(*) AS appointments_completed
                FROM appointments
                WHERE store_id = :store_id AND status = 'completed'
            `;

        const result = await connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get completedAppointments");
      }
    },
    getPendingAppointments: async (id) => {
      try {
        let sql = `
                SELECT COUNT(*) AS appointments_pending
                FROM appointments
                WHERE store_id = :store_id AND status = 'booked'
            `;

        const result = await connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get pendingAppointments");
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
      a.status AS appointment_status,
      s.from AS slot_from,
      s.to AS slot_to,
      u.firstname,
      u.lastname,
      u.email,
      u.profilepic,
      u.phone,
      sty.id AS stylist_id,
      sty.name AS stylist_name,
      sty.profilepic AS stylist_profilepic  
    FROM appointments a
    LEFT JOIN Slots s ON a.slot_id = s.id
    LEFT JOIN User u ON a.user_id = u.id
    LEFT JOIN Stylist sty ON a.profesional_id = sty.id
    WHERE a.store_id = :store_id
    AND a.payment_status IN ('success', 'sucssess')
    ORDER BY a.booking_date DESC;`;

        const result = await connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get appointments");
      }
    },
    getservicebyappoinment: async (id) => {
      try {
        let sql = `SELECT 
      ai.service_amount AS amount, 
      ai.service_id AS service_id,
      s.service_name AS service_name,
      ai.combo_id AS combo_id,
      c.combo AS combo_name
    FROM appointment_items ai
    LEFT JOIN StoreServices s ON ai.service_id = s.id
    LEFT JOIN Combo c ON ai.combo_id = c.id
    WHERE ai.appointment_id = :id; `;
        const result = await connection.query(sql, {
          replacements: { id: id },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result;
      } catch (error) {
        throw Error.InternalError("could not get services by appointment");
      }
    },
    deleteslots: async (data, id) => {
      try {
        return await partnerDbController.Models.Slots.update(
          {
            status: "inactive",
          },
          {
            where: {
              store_id: id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updatebooking: async (data, id) => {
      try {
        return await partnerDbController.Models.appointments.update(
          {
            status: data?.status,
          },
          {
            where: {
              id: data.id,
            },
          },
        );
      } catch (error) {
        //////console.log("🚀 ~ updatebooking: ~ error:", error)
        throw Error.InternalError();
      }
    },
    updatebooking_1: async (data, id) => {
      try {
        return await partnerDbController.Models.appointments.update(
          {
            profesional_id: data?.profesional_id,
          },
          {
            where: {
              id: data.id,
            },
          },
        );
      } catch (error) {
        //////console.log("🚀 ~ updatebooking: ~ error:", error)
        throw Error.InternalError();
      }
    },
    deleterequest: async (data, id) => {
      try {
        return await partnerDbController.Models.review_delete_requests.create({
          store_id: id,
          user_id: data.user_id,
          review_id: data.review_id,
          reason: data.reason,
          status: "pending",
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updatestoreimages: async (data, id, images) => {
      try {
        return await partnerDbController.Models.Store.update(
          {
            images: JSON.stringify(images),
          },
          {
            where: {
              id: id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addnewaminities: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreAminities.create({
          name: data.name,
          store_id: id,
          status: "active",
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getstorereviews: async (data, id) => {
      try {
        let sql = `SELECT R.*, U.firstname, U.lastname, U.profilepic FROM Reviews R JOIN User U ON R.user_id = U.id WHERE R.store_id = :store_id AND R.status = 'active' ORDER BY R.cretaed_at DESC`;
        const result = await partnerDbController.connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result;
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getotalsales: async (data, id) => {
      try {
        let sql = `SELECT SUM(amount) AS total_sales FROM appointments WHERE store_id = :store_id AND status = 'completed'`;
        const result = await partnerDbController.connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result[0].total_sales || 0;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    getstoredeatils: async (id) => {
      try {
        let sql = `SELECT S.name,
            S.images,
            S.description,
            S.store_type,
            S.category_id,
            S.docs as documents, 
            S.website,
            S.createdAt AS joined_date,
            S.team_size as teamsize ,
            S.income as income_level,
             A.addressLine1,
              A.district,
               A.city, 
               A.state,
               A.area,
                A.latitude, 
                A.longitude
           FROM Store S
           JOIN PartnerAddress A ON S.address_id = A.id
           WHERE S.id = :store_id AND A.status = 'active' AND S.status = 'active'`;

        const result = await partnerDbController.connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result[0] || null;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    getstoredeatilsadmin: async (id) => {
      try {
        let sql = `SELECT S.name,
            S.email,
            S.description,
            S.income,
            S.phone,
            S.images,
            S.bank_account_holder ,
            S.account_number , 
            S.ifsc_code ,
            S.status ,
            S.wallet_remaining  as Wallet, 
            A.addressLine1, 
            A.addressLine2,
            A.state,
            A.district, 
            A.city,
            A.area,
            A.zipcode,
            A.landmark,
            A.latitude,
            A.longitude,
            A.radius,
            S.logo,
            S.services_provided_for,
            S.languages,
            S.is_premium
            FROM Store S
            LEFT JOIN PartnerAddress A ON S.id = A.store_id
            WHERE S.id = :store_id `;
        const result = await partnerDbController.connection.query(sql, {
          replacements: { store_id: id },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result[0] || null;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError();
      }
    },
    gettotalsalesbydate: async (data, id) => {
      try {
        let sql = `SELECT SUM(amount) AS total_sales FROM appointments a WHERE store_id = :store_id AND booking_date BETWEEN :start_date AND :end_date AND status = 'completed'`;
        const result = await partnerDbController.connection.query(sql, {
          replacements: {
            store_id: id,
            start_date: data.start_date,
            end_date: data.end_date,
          },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result && result.length > 0 ? result[0].total_sales || 0 : 0;
      } catch (error) {
        throw Error.InternalError();
      }
    },
    gettotalsalesbydateamount: async (data, id) => {
      try {
        let sql = `SELECT a.amount , a.created_at FROM appointments a WHERE store_id = :store_id AND booking_date BETWEEN :start_date AND :end_date AND  status =  'completed'`;
        const result = await partnerDbController.connection.query(sql, {
          replacements: {
            store_id: id,
            start_date: data.start_date,
            end_date: data.end_date,
          },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result;
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getplan: async (data, id) => {
      try {
        return await partnerDbController.Models.SubscriptionPlans.findOne({
          where: {
            id: data.id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addplan: async (
      data,
      type,
      id,
      end_date,
      planId,
      razorpay_id,
      new_total,
    ) => {
      try {
        return await partnerDbController.Models.StoreSubscription.create({
          subscription_id: planId,
          start_date: new Date(),
          end_date: end_date,
          store_id: id,
          amount: new_total,
          quantity: data.quantity,
          order_id: razorpay_id,
          payment_status: "pending",
          status: "inactive",
          type: type,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    plansuccess: async (razorpay_order_id, razorpay_payment_id) => {
      try {
        return await partnerDbController.Models.StoreSubscription.update(
          {
            payment_status: "completed",
            status: "active",
            payment_id: razorpay_payment_id,
          },
          {
            where: {
              order_id: razorpay_order_id,
              payment_status: "pending",
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getallimages: async (data, id) => {
      try {
        return await partnerDbController.Models.Store.findOne({
          attributes: ["images"],
          where: {
            id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addslots: async (data, id, note) => {
      try {
        return await partnerDbController.Models.Slots.create({
          store_id: id,
          from: data.from,
          to: data.to,
          notes: note,
          status: "active",
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getbankdetails: async (id) => {
      try {
        return await partnerDbController.Models.Store.findOne({
          attributes: ["bank_account_holder", "account_number", "ifsc_code"],
          where: {
            id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getproffesional: async (id) => {
      try {
        return await partnerDbController.Models.Stylist.findAll({
          where: {
            store_id: id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getproffesionalbyid: async (data, id) => {
      try {
        return await partnerDbController.Models.Stylist.findAll({
          where: {
            store_id: id,
            status: "active",
            id: data.id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addaminities: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreAminities.create({
          store_id: id,
          aminities_id: data.aminities_id,
          status: "active",
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getslots: async (data, id) => {
      try {
        return await partnerDbController.Models.Slots.findAll({
          where: {
            store_id: id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getBBSlots: async (data, storeId) => {
      try {
        const { selected_date } = data;
        console.log(selected_date);

        if (!selected_date) {
          throw Error.InternalError("selected_date is required");
        }

        const slots = await partnerDbController.connection.query(
          `
                SELECT
                s.*,
                /* Is Booked (true if there's an appointment) */
                EXISTS (
                    SELECT 1
                    FROM appointments a
                    WHERE a.slot_id = s.id
                    AND a.store_id = s.store_id
                    AND DATE(a.booking_date) = :selected_date
                    AND (
                      a.status IN ('confirmed', 'completed')
                      OR (a.status = 'booked' AND a.payment_status IN ('success', 'sucssess'))
                      OR (a.payment_status = 'pending' AND a.created_at >= NOW() - INTERVAL 5 MINUTE)
                    )
                ) AS is_booked,

                /* Is Blocked */
                EXISTS (
                    SELECT 1
                    FROM SlotBlockedDates sb
                    WHERE sb.slot_id = s.id
                    AND sb.store_id = s.store_id
                    AND sb.blocked_date = :selected_date
                ) AS is_blocked

            FROM Slots s
            WHERE s.store_id = :storeId
            AND s.status = 'active'
            AND (
                /* Show slots that are blocked for this date */
                EXISTS (
                    SELECT 1
                    FROM SlotBlockedDates sb
                    WHERE sb.slot_id = s.id
                    AND sb.store_id = s.store_id
                    AND sb.blocked_date = :selected_date
                )
                OR
                /* OR slots that have appointments for this date */
                EXISTS (
                    SELECT 1
                    FROM appointments a
                    WHERE a.slot_id = s.id
                    AND a.store_id = s.store_id
                    AND DATE(a.booking_date) = :selected_date
                )
            )
            ORDER BY s.from;
                `,
          {
            replacements: {
              storeId,
              selected_date,
            },
            type: partnerDbController.connection.QueryTypes.SELECT,
          },
        );

        return slots;
      } catch (error) {
        console.log(error);
        throw Error.InternalError(error.message);
      }
    },
    blockAndUnblockSlotDB: async (data, storeId) => {
      console.log("body: ", data, storeId);
      const transaction = await partnerDbController.connection.transaction();

      try {
        const { slotId, blocked_date, action, reason } = data;

        if (!slotId || !blocked_date || !action) {
          throw Error.InternalError(
            "slotId, blocked_date and action are required",
          );
        }

        const existingBlock =
          await partnerDbController.Models.SlotBlockedDates.findOne({
            where: {
              slot_id: slotId,
              store_id: storeId,
              blocked_date,
            },
            transaction,
          });

        // ========================
        // BLOCK SLOT
        // ========================
        if (action === "block") {
          if (existingBlock) {
            throw Error.InternalError("Slot already blocked for this date");
          }

          // Check booking exists
          const bookingExists = await partnerDbController.connection.query(
            `SELECT 1
                    FROM appointments
                    WHERE slot_id = :slotId
                    AND store_id = :storeId
                    AND booking_date = :blocked_date
                    AND status NOT IN ('cancelled', 'completed')
                    LIMIT 1`,
            {
              replacements: { slotId, storeId, blocked_date },
              type: partnerDbController.connection.QueryTypes.SELECT,
              transaction,
            },
          );

          if (bookingExists.length > 0) {
            throw Error.InternalError(
              "Slot already booked for this date. Cannot block.",
            );
          }

          const block =
            await partnerDbController.Models.SlotBlockedDates.create(
              {
                slot_id: slotId,
                store_id: storeId,
                blocked_date,
                reason,
              },
              { transaction },
            );

          await transaction.commit();
          return block;
        }

        // ========================
        // UNBLOCK SLOT
        // ========================
        if (action === "unblock") {
          if (!existingBlock) {
            throw Error.InternalError("Slot is not blocked for this date");
          }

          await existingBlock.destroy({ transaction });

          await transaction.commit();
          return { message: "Slot unblocked successfully" };
        }

        throw Error.InternalError("Invalid action. Use block or unblock");
      } catch (error) {
        console.log(error);
        await transaction.rollback();
        throw error;
      }
    },
    deleteaminities: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreAminities.destroy({
          where: {
            store_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addcombinations: async (data, id) => {
      try {
        return await partnerDbController.Models.Combo.create({
          combo: data.combo,
          amount: data.amount,
          store_id: id,
          status: "active",
          duration: data.duration,
          service_category: data.service_category,
          description: data.description,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    updatecombinations: async (data, id) => {
      try {
        return await partnerDbController.Models.Combo.update(
          {
            combo: data.combo,
            amount: data.amount,
            store_id: id,
            status: "active",
            duration: data.duration,
          },
          {
            where: {
              id: data.id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    deletecombos: async (data) => {
      try {
        return await partnerDbController.Models.Combo.update(
          {
            status: "inactive",
          },
          {
            where: {
              id: data.id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },
    // getcombos:async(data,id) => {
    //     try{
    //    let sql = `SELECT C.* ,CT.service_id as service_id ,CT.combo_id as combo_id FROM Combo C JOIN Combinations CT ON C.id = CT.combo_id WHERE C.store_id = :store_id AND C.status = 'active' `;

    //    const result  = await partnerDbController.connection.query(sql, {
    //         replacements: { store_id: id },
    //         type: Sequelize.QueryTypes.SELECT
    //     });

    //     return result
    //     }catch(error){;
    //         throw Error.InternalError();
    //     }
    // },
    getcombos: async (data, id) => {
      try {
        return await partnerDbController.Models.Combo.findAll({
          where: {
            store_id: id,
            status: "active",
            id: data.id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getcombosall: async (data, id) => {
      try {
        return await partnerDbController.Models.Combo.findAll({
          where: {
            store_id: id,
            status: "active",
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getserviceids: async (id) => {
      try {
        return await partnerDbController.Models.Combinations.findAll({
          where: {
            combo_id: id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getservicenames: async (id) => {
      try {
        let sql = `SELECT S.service_name FROM StoreServices S JOIN Combinations C ON S.id = C.service_id WHERE C.combo_id = :id`;

        const result = await partnerDbController.connection.query(sql, {
          replacements: { id: id },
          type: Sequelize.QueryTypes.SELECT,
        });
        return result;
      } catch (error) {
        throw Error.InternalError();
      }
    },
    deletecomboitems: async (data) => {
      try {
        return await partnerDbController.Models.Combinations.destroy({
          where: {
            combo_id: data.id,
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    addcomboitems: async (item, combo_id) => {
      try {
        return await partnerDbController.Models.Combinations.create({
          service_id: item,
          combo_id: combo_id,
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    listservices: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreServices.findAll({
          where: { store_id: id, status: "active" },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    deleteserivice: async (data, id) => {
      try {
        return await partnerDbController.Models.StoreServices.update(
          { status: "inactive" },
          {
            where: {
              id: data.id,
              store_id: id,
            },
          },
        );
      } catch (error) {
        throw Error.InternalError();
      }
    },

    getlocationdetails: async () => {
      try {
        return await partnerDbController.Models.Location.findOne({
          attributes: ["location"],
        });
      } catch (error) {
        throw Error.SomethingWentWrong("Failed to fetch location data");
      }
    },
    // controller method to create a Hire Student record
    createhirestudent: async (body) => {
      try {
        body.created_at = new Date();
        body.updated_at = new Date();
        return await partnerDbController.Models.HireStudent.create(body);
      } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
          throw Error.SomethingWentWrong("Mobile number already exists");
        }
        throw Error.SomethingWentWrong();
      }
    },

    gethirestudents: async (id) => {
      try {
        // 'id' is currently unused but kept for future filtering logic
        return await partnerDbController.Models.HireStudent.findAll();
      } catch (error) {
        throw Error.SomethingWentWrong();
      }
    },

    // controller method to store record by ID.
    getStoreById: async (storeId) => {
      try {
        return await Models.Store.findOne({
          where: { id: storeId },
          attributes: ["id"],
          raw: true,
        });
      } catch (error) {
        throw Error.SomethingWentWrong();
      }
    },

    // this function is get booking details from appointments table
    getTodayBookingsByStoreId: async (storeId) => {
      try {
        const bookings = await appointments.findAll({
          attributes: [
            "id",
            "store_id",
            "user_id",
            "booking_date",
            "slot_id",
            "is_combo",
            "profesional_id",
            "payment_status",
            "status",
            "is_wallet",
            "is_discounted",
            "discounted_amount",
            "discount_id",
            "amount",
          ],
          where: {
            store_id: storeId,
            booking_date: {
              [Op.gte]: Sequelize.literal("CURDATE()"),
              [Op.lt]: Sequelize.literal("CURDATE() + INTERVAL 1 DAY"),
            },
            status: {
              [Op.in]: ["booked", "confirmed"],
            },
          },
          include: [
            {
              model: User,
              attributes: ["firstname", "lastname", "gender", "phone"],
            },
            {
              model: Slots,
              as: "Slot",
              attributes: ["from", "to"],
              required: false,
            },
          ],
          order: [
            [Sequelize.col("Slot.from"), "ASC"],
            ["booking_date", "ASC"],
          ],
        });

        // For each booking, fetch service names via appointment_items → StoreServices
        const result = [];
        for (const booking of bookings) {
          const bookingData = booking.toJSON();
          const items = await appointment_items.findAll({
            where: { appointment_id: bookingData.id },
            attributes: ["service_id", "service_amount"],
            include: [
              {
                model: StoreServices,
                attributes: ["service_name", "amount"],
              },
            ],
          });

          const services = items
            .map((item) => ({
              name:
                item.StoreService?.service_name ||
                item.StoreServices?.service_name,
              price: item.service_amount || item.StoreService?.amount || 0,
            }))
            .filter((s) => s.name); // Filter out services without names if any

          const slotFrom = bookingData.Slot?.from ?? null;
          const slotTo = bookingData.Slot?.to ?? null;
          const slot_from = formatSlotTime(slotFrom);
          const slot_to = formatSlotTime(slotTo);

          // Extract user details
          const user = bookingData.User || {};
          result.push({
            booking: {
              id: bookingData.id,
              store_id: bookingData.store_id,
              user_id: bookingData.user_id,
              // Combined IST datetime (date + slot start) — avoids midnight UTC → 5:30 AM
              booking_date: buildAppointmentDateTime(
                bookingData.booking_date,
                slotFrom,
              ),
              booking_day: toIstDatePart(bookingData.booking_date),
              slot_id: bookingData.slot_id,
              slot_from,
              slot_to,
              is_combo: bookingData.is_combo,
              profesional_id: bookingData.profesional_id,
              payment_status: bookingData.payment_status,
              status: bookingData.status,
              is_wallet: bookingData.is_wallet,
              is_discounted: bookingData.is_discounted,
              discounted_amount: bookingData.discounted_amount,
              discount_id: bookingData.discount_id,
              amount: bookingData.amount,
            },
            user_name:
              [user.firstname, user.lastname].filter(Boolean).join(" ") || null,
            user_gender: user.gender || null,
            user_phone: user.phone || null,
            paid_amount: bookingData.amount || null,
            services: services, // Return array of { name, price } objects
          });
        }

        return result;
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("could not get today bookings by store id");
      }
    },

    /**
     * Get bookings with comprehensive filtering (Date, Status, Search) and Pagination.
     * @param {Object} data - Query parameters { page, limit, month, year, status, search }
     * @param {string} storeId - ID of the store
     */

    getBookings: async (data, storeId) => {
      try {
        const page = parseInt(data.page) || 1;
        const limit = parseInt(data.limit) || 10;
        const offset = (page - 1) * limit;

        const whereClause = {
          store_id: storeId,
          // Paid bookings only (include legacy typo "sucssess")
          payment_status: { [Op.in]: ["success", "sucssess"] },
        };

        const startOfToday = Sequelize.literal("CURDATE()");
        let listMode = null; // upcoming | past | null

        // Date Filter (month/year or exact date)
        if (data.month && data.year) {
          const start = new Date(Number(data.year), Number(data.month) - 1, 1);
          const end = new Date(
            Number(data.year),
            Number(data.month),
            0,
            23,
            59,
            59,
          );

          whereClause.booking_date = {
            [Op.between]: [start, end],
          };
        } else if (data.date) {
          const start = new Date(data.date);
          start.setHours(0, 0, 0, 0);
          const end = new Date(data.date);
          end.setHours(23, 59, 59, 999);

          whereClause.booking_date = {
            [Op.between]: [start, end],
          };
        }

        // Status / tab Filter (Multi Support)
        // App tabs often send: upcoming | pending | past | All
        if (data.status && data.status !== "All") {
          const statuses = data.status
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          const wantsUpcoming = statuses.some((s) =>
            ["upcoming", "upcomming", "pending"].includes(s),
          );
          const wantsPast = statuses.some((s) => s === "past");

          if (wantsUpcoming) {
            listMode = "upcoming";
            whereClause.status = { [Op.in]: ["booked", "confirmed"] };
            // Keep today's + future bookings (old getallbookings used >, which hid today)
            if (!whereClause.booking_date) {
              whereClause.booking_date = { [Op.gte]: startOfToday };
            }
          } else if (wantsPast) {
            listMode = "past";
            whereClause[Op.and] = [
              ...(whereClause[Op.and] || []),
              {
                [Op.or]: [
                  {
                    status: {
                      [Op.in]: ["completed", "cancelled", "refunded"],
                    },
                  },
                  {
                    status: { [Op.in]: ["booked", "confirmed"] },
                    booking_date: { [Op.lt]: startOfToday },
                  },
                ],
              },
            ];
          } else {
            const mappedStatuses = statuses.map((s) => {
              if (s === "done") return "completed";
              return s;
            });
            whereClause.status = { [Op.in]: mappedStatuses };
          }
        }

        // Search — resolve IDs in SQL so JOIN+LIMIT does not drop bookings
        if (data.search) {
          const searchTerm = `%${data.search}%`;
          const searchIds = await connection.query(
            `
            SELECT DISTINCT a.id
            FROM appointments a
            LEFT JOIN User u ON a.user_id = u.id
            LEFT JOIN appointment_items ai ON a.id = ai.appointment_id
            LEFT JOIN StoreServices ss ON ai.service_id = ss.id
            WHERE a.store_id = :storeId
              AND a.payment_status IN ('success', 'sucssess')
              AND (
                u.firstname LIKE :q
                OR u.lastname LIKE :q
                OR ss.service_name LIKE :q
              )
            `,
            {
              replacements: { storeId, q: searchTerm },
              type: Sequelize.QueryTypes.SELECT,
            },
          );
          whereClause.id = searchIds.length
            ? { [Op.in]: searchIds.map((r) => r.id) }
            : { [Op.in]: [-1] };
        }

        // Gender Filter (on include, not broken $ nested syntax with separate)
        const userInclude = {
          model: User,
          attributes: ["firstname", "lastname", "gender", "phone"],
          required: false,
        };

        if (data.gender && data.gender !== "All") {
          const gender = data.gender.toLowerCase();
          userInclude.required = true;
          userInclude.where =
            gender === "unisex"
              ? { gender: { [Op.in]: ["male", "female"] } }
              : { gender: { [Op.eq]: gender } };
        }

        // Price Range Filter
        if (data.minPrice || data.maxPrice) {
          const min = parseFloat(data.minPrice);
          const max = parseFloat(data.maxPrice);

          if (!isNaN(min) || !isNaN(max)) {
            whereClause.amount = {};
            if (!isNaN(min)) whereClause.amount[Op.gte] = min;
            if (!isNaN(max)) whereClause.amount[Op.lte] = max;
          }
        }

        // Sorting — upcoming should be soonest-first
        let sortColumn = "booking_date";
        let sortDirection = listMode === "upcoming" ? "ASC" : "DESC";

        if (data.sort === "lowtohigh") {
          sortColumn = "amount";
          sortDirection = "ASC";
        } else if (data.sort === "hightolow") {
          sortColumn = "amount";
          sortDirection = "DESC";
        } else if (data.sortBy === "date") {
          sortColumn = "booking_date";
          sortDirection =
            data.sortOrder && data.sortOrder.toUpperCase() === "ASC"
              ? "ASC"
              : "DESC";
        }

        // separate: true on hasMany so LIMIT applies to appointments, not item rows
        const { count, rows } = await appointments.findAndCountAll({
          where: whereClause,
          limit,
          offset,
          distinct: true,
          col: "id",
          order: [[sortColumn, sortDirection]],
          include: [
            userInclude,
            {
              model: Stylist,
              as: "Stylist",
              attributes: ["name"],
              required: false,
            },
            {
              model: Slots,
              as: "Slot",
              attributes: ["from", "to"],
              required: false,
            },
            {
              model: appointment_items,
              attributes: ["service_amount"],
              separate: true,
              include: [
                {
                  model: StoreServices,
                  attributes: ["service_name"],
                },
              ],
            },
          ],
        });

        const bookings = rows.map((booking) => {
          const bookingData = booking.toJSON();
          const user = bookingData.User || {};
          const slotFrom = bookingData.Slot?.from ?? null;
          const slotTo = bookingData.Slot?.to ?? null;

          const services = (bookingData.appointment_items || [])
            .map((item) => ({
              name: item.StoreService?.service_name || null,
              price: item.service_amount || 0,
            }))
            .filter((s) => s.name);

          return {
            booking: {
              id: bookingData.id,
              store_id: bookingData.store_id,
              booking_date: buildAppointmentDateTime(
                bookingData.booking_date,
                slotFrom,
              ),
              booking_day: toIstDatePart(bookingData.booking_date),
              slot_id: bookingData.slot_id,
              slot_from: formatSlotTime(slotFrom),
              slot_to: formatSlotTime(slotTo),
              is_combo: bookingData.is_combo,
              profesional_id: bookingData.profesional_id,
              payment_status: bookingData.payment_status,
              status: bookingData.status,
              is_wallet: bookingData.is_wallet,
              is_discounted: bookingData.is_discounted,
              discounted_amount: bookingData.discounted_amount,
              discount_id: bookingData.discount_id,
              amount: bookingData.amount,
            },
            user_id: bookingData.user_id,
            user_name:
              [user.firstname, user.lastname].filter(Boolean).join(" ") || null,
            user_gender: user.gender || null,
            user_phone: user.phone || null,
            paid_amount: bookingData.amount || null,
            services,
          };
        });

        return {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          bookings,
        };
      } catch (error) {
        console.log("getBookings error:", error);
        throw Error.InternalError("Failed to fetch bookings");
      }
    },

    cancelBooking: async (appointmentId, storeId) => {
      try {
        const booking = await appointments.findOne({
          where: {
            id: appointmentId,
            store_id: storeId,
          },
        });

        if (!booking) {
          throw Error.NotFound("Appointment not found");
        }

        // Only allow cancel if currently booked
        if (booking.status !== "booked") {
          throw Error.BadRequest(
            `Cannot cancel booking. Current status is ${booking.status}`,
          );
        }

        booking.status = "cancelled";
        await booking.save();

        return {
          booking: {
            id: booking.id,
            store_id: booking.store_id,
            user_id: booking.user_id,
            booking_date: booking.booking_date,
            slot_id: booking.slot_id,
            is_combo: booking.is_combo,
            profesional_id: booking.profesional_id,
            payment_status: booking.payment_status,
            status: booking.status,
            is_wallet: booking.is_wallet,
            is_discounted: booking.is_discounted,
            discounted_amount: booking.discounted_amount,
            discount_id: booking.discount_id,
            amount: booking.amount,
          },
        };
      } catch (error) {
        throw error;
      }
    },

    // This function retrieves store performance metrics like revenue, bookings, and top services based on time filters.
    // IT uses efficient parallel SQL queries (daily, weekly, monthly) to ensure production-grade performance and data accuracy.
    getOverviewMetrics: async (storeId, filterType) => {
      try {
        let startDate, endDate;
        const now = new Date();
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);

        if (filterType === "daily") {
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
        } else if (filterType === "weekly") {
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
        } else if (filterType === "monthly") {
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 1);
          startDate.setHours(0, 0, 0, 0);
        } else {
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
        }

        const replacements = {
          storeId,
          startDate,
          endDate,
        };

        // Enhanced status filter to include 'booked' and 'confirmed'
        const activeStatuses = "('completed')";

        // Query 1: Main Metrics (Revenue, Bookings)
        const mainMetricsSql = `
                SELECT 
                    COALESCE(SUM(amount), 0) as totalRevenue,
                    COUNT(*) as totalBookings,
                    COALESCE(AVG(amount), 0) as avgRevenue
                FROM appointments
                WHERE store_id = :storeId 
                AND booking_date BETWEEN :startDate AND :endDate 
                AND status IN ${activeStatuses}
            `;

        // Query 2: Top Service
        const topServiceSql = `
                SELECT 
                    ss.service_name as name, 
                    COUNT(ai.id) as serviceCount
                FROM appointment_items ai
                JOIN StoreServices ss ON ai.service_id = ss.id
                JOIN appointments a ON ai.appointment_id = a.id
                WHERE a.store_id = :storeId 
                AND a.booking_date BETWEEN :startDate AND :endDate 
                AND a.status IN ${activeStatuses}
                GROUP BY ai.service_id
                ORDER BY serviceCount DESC
                LIMIT 1
            `;

        // Query 3: Hourly Performance Trend
        const hourlyTrendSql = `
                SELECT 
                    HOUR(booking_date) as hour, 
                    COALESCE(SUM(amount), 0) as revenue
                FROM appointments
                WHERE store_id = :storeId 
                AND booking_date BETWEEN :startDate AND :endDate 
                AND status IN ${activeStatuses}
                GROUP BY HOUR(booking_date)
                ORDER BY hour ASC
            `;

        const [mainMetrics, topService, hourlyTrend] = await Promise.all([
          connection.query(mainMetricsSql, {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          }),
          connection.query(topServiceSql, {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          }),
          connection.query(hourlyTrendSql, {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          }),
        ]);

        return {
          totalRevenue: parseFloat(mainMetrics[0].totalRevenue),
          totalBookings: mainMetrics[0].totalBookings,
          avgRevenue: parseFloat(mainMetrics[0].avgRevenue).toFixed(2),
          topService: topService[0]?.name || "N/A",
          hourlyPerformance: hourlyTrend.map((row) => ({
            time: `${row.hour}:00`,
            revenue: parseFloat(row.revenue),
          })),
        };
      } catch (error) {
        console.error("error in getOverviewMetrics:", error);
        throw Error.InternalError("Failed to fetch overview metrics");
      }
    },

    /**
     * Get Service Breakdown and Top Earners analytics.
     * Service Breakdown: Revenue by service/combo name (falling back to category) for a period.
     * Top Earners: Top 5 services and their total revenue for the selected period.
     */
    getServiceAnalytics: async (storeId, filterType) => {
      try {
        const now = new Date();
        let start = new Date(now);
        let end = new Date(now);

        if (filterType === "daily") {
          start.setHours(0, 0, 0, 0);
        } else if (filterType === "weekly") {
          start.setDate(start.getDate() - 7);
          start.setHours(0, 0, 0, 0);
        } else if (filterType === "monthly") {
          start.setMonth(start.getMonth() - 1);
          start.setHours(0, 0, 0, 0);
        } else {
          start.setHours(0, 0, 0, 0);
        }

        // End of today
        end.setHours(23, 59, 59, 999);

        // Format as YYYY-MM-DD to avoid timezone issues with DATEONLY columns
        const startDate = start.toISOString().split("T")[0];
        const endDate = end.toISOString().split("T")[0];

        const replacements = {
          storeId,
          startDate,
          endDate,
        };

        // Enhanced status filter to include 'booked' and 'confirmed'
        const activeStatuses = "('completed')";

        // Query 1: Service Breakdown (Revenue primarily by Service/Combo Name)
        const breakdownSql = `
                SELECT 
                    COALESCE(ss.service_name, c.combo, sc.name, 'Other') as label,
                    SUM(ai.service_amount) as revenue
                FROM appointments a
                JOIN appointment_items ai ON a.id = ai.appointment_id
                LEFT JOIN StoreServices ss ON ai.service_id = ss.id
                LEFT JOIN Servicecategory sc ON ss.service_category = sc.id
                LEFT JOIN Combo c ON ai.combo_id = c.id
                WHERE a.store_id = :storeId 
                AND a.booking_date BETWEEN :startDate AND :endDate 
                AND a.status IN ${activeStatuses}
                GROUP BY label
                ORDER BY revenue DESC
            `;

        // Query 2: Detailed Performance (Top Earners for the Selected Period)
        const topEarnersSql = `
                SELECT 
                    COALESCE(ss.service_name, c.combo, 'Unknown Service') as name,
                    SUM(ai.service_amount) as revenue
                FROM appointments a
                JOIN appointment_items ai ON a.id = ai.appointment_id
                LEFT JOIN StoreServices ss ON ai.service_id = ss.id
                LEFT JOIN Combo c ON ai.combo_id = c.id
                WHERE a.store_id = :storeId 
                AND a.booking_date BETWEEN :startDate AND :endDate 
                AND a.status IN ${activeStatuses}
                GROUP BY name
                ORDER BY revenue DESC
                LIMIT 5
            `;

        const [breakdown, topEarners] = await Promise.all([
          connection.query(breakdownSql, {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          }),
          connection.query(topEarnersSql, {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          }),
        ]);

        return {
          serviceBreakdown: breakdown.map((row) => ({
            label: row.label,
            revenue: parseFloat(row.revenue) || 0,
          })),
          topEarners: topEarners.map((row) => ({
            name: row.name,
            revenue: parseFloat(row.revenue) || 0,
          })),
        };
      } catch (error) {
        console.error("error in getServiceAnalytics:", error);
        throw Error.InternalError("Failed to fetch service analytics");
      }
    },

    // -------------------------version2 -----------------------------------

    getAllPlans: async () => {
      try {
        const [rows] = await partnerDbController.connection.query(`
      SELECT 
        p.plan_id,
        p.plan_name,
        p.price,
        p.original_price,
        p.discount_price,
        p.price_tag,
        p.duration_months,
        p.booking_limit,
        p.is_unlimited,
        p.sort_order,
        p.description,
        COALESCE(JSON_ARRAYAGG(f.feature_name), JSON_ARRAY()) AS features
      FROM PartnerSubscriptionPlans p
      LEFT JOIN PartnerSubscriptionPlanfeatureMapping pf 
        ON p.plan_id = pf.plan_id
      LEFT JOIN PartnerSubscriptionPlanfeatures f 
        ON pf.feature_id = f.feature_id
      WHERE p.is_active = 1
      GROUP BY p.plan_id
      ORDER BY p.sort_order ASC;
    `);

        return rows;
      } catch (error) {
        console.error("[getAllPlans] DB ERROR:", error.message);
        throw Error.InternalError(error.message || "cannot get plans");
      }
    },
    createSubscription: async (data) => {
      try {
        return await PartnerSubscriptions.create(data);
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("cannot create subscription");
      }
    },
    createSubscriptionRecord: async (data) => {
      return await PartnerSubscriptions.create(data);
    },
    getPartnerSubscription: async (salon_id) => {
      try {
        return await PartnerSubscriptions.findOne({
          where: { salon_id, is_active: true },
          order: [["created_at", "DESC"]],
        });
      } catch (error) {
        console.log("🚀 ~ error:", error);
        throw Error.InternalError("cannot get subscription");
      }
    },
    getOrCreateRazorpayCustomer: async (store) => {
      if (store.razorpay_customer_id) return store.razorpay_customer_id;

      const customer = await razorpay.customers.create({
        name: store.name || `Store-${store.id}`,
        email: store.email,
        contact: store.phone,
        fail_existing: 0, // reuse if a customer with same email/contact already exists
      });

      await partnerDbController.Models.Store.update(
        { razorpay_customer_id: customer.id },
        { where: { id: store.id } }
      );

      return customer.id;
    },
    getActivePlan: async (plan_id) => {
      return await PartnerSubscriptionPlans.findOne({
        where: { plan_id, is_active: 1 },
      });
    },

    getSubscriptionByRzpId: async (razorpay_subscription_id) => {
      return await PartnerSubscriptions.findOne({ where: { razorpay_subscription_id } });
    },

    recordSubscriptionCharge: async (data) => {
      const t = await connection.transaction();
      try {
        await PartnerSubscriptions.update(
          {
            payment_status: "paid",
            is_active: true,
            rzp_status: data.rzp_status,
            current_start: data.current_start,
            current_end: data.current_end,
            charge_at: data.charge_at,
            paid_count: data.paid_count,
          },
          { where: { subscription_id: data.subscription_id }, transaction: t }
        );

        await PartnerSubscriptionsPayments.create({
          subscription_id: data.subscription_id,
          salon_id: data.salon_id,
          amount: data.amount,
          payment_method: "razorpay_autopay",
          payment_status: "success",
          transaction_id: data.payment_id,
          payment_date: new Date(),
        }, { transaction: t });

        // Keep premium in sync on every successful renewal
        await Store.update(
          { is_premium: true },
          { where: { id: data.salon_id }, transaction: t }
        );

        await t.commit();
      } catch (e) {
        await t.rollback();
        throw e;
      }
    },

    markSubscriptionInactive: async (razorpay_subscription_id, status) => {
      if (!razorpay_subscription_id) return null;

      const sub = await PartnerSubscriptions.findOne({
        where: { razorpay_subscription_id },
      });
      if (!sub) {
        console.warn(
          `[markSubscriptionInactive] no local sub for ${razorpay_subscription_id}`
        );
        return null;
      }

      // Keep payment_status as paid for cancel/complete (money was taken);
      // only mark failed when Razorpay halted after charge failures.
      const patch = {
        is_active: false,
        rzp_status: status,
      };
      if (status === "halted") {
        patch.payment_status = "failed";
      }

      await PartnerSubscriptions.update(patch, {
        where: { razorpay_subscription_id },
      });

      // Revoke premium so cancelled/halted partners do not keep benefits
      await Store.update(
        { is_premium: false },
        { where: { id: sub.salon_id } }
      );

      return sub;
    },

    clearStorePremium: async (salon_id) => {
      return await Store.update(
        { is_premium: false },
        { where: { id: salon_id } }
      );
    },

    // partnerDbController.app
    verifyRecurringSubscriptionRecord: async (razorpay_subscription_id, salon_id, sub) => {
      return await PartnerSubscriptions.update(
        {
          payment_status: "paid",
          is_active: true,
          rzp_status: sub.status,
          current_start: sub.current_start ? new Date(sub.current_start * 1000) : null,
          current_end: sub.current_end ? new Date(sub.current_end * 1000) : null,
          charge_at: sub.charge_at ? new Date(sub.charge_at * 1000) : null,
          paid_count: sub.paid_count,
        },
        { where: { razorpay_subscription_id, salon_id } }
      );
    },

    createSubscriptionWithOrder: async ({
      salon_id,
      plan,
      razorpay_order_id,
      amount,
    }) => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(startDate.getMonth() + (plan.duration_months || 1));

      return await PartnerSubscriptions.create({
        salon_id,
        plan_id: plan.plan_id,
        start_date: startDate,
        end_date: endDate,
        amount_paid: amount || plan.discount_price,
        payment_status: "pending",
        is_active: false,
        razorpay_order_id,
      });
    },

    verifySubscriptionPayment: async (subscription_id, salon_id) => {
      try {
        const [updated] = await PartnerSubscriptions.update(
          { payment_status: "paid", is_active: true },
          { where: { subscription_id, salon_id } },
        );
        if (!updated)
          throw Error.BadRequest("Subscription not found or already verified");
        return await PartnerSubscriptions.findOne({
          where: { subscription_id },
        });
      } catch (error) {
        console.error("[verifySubscriptionPayment] DB ERROR:", error.message);
        throw error;
      }
    },

    getPendingSubscription: async (salon_id, plan_id) => {
      try {
        return await PartnerSubscriptions.findOne({
          where: { salon_id, plan_id, payment_status: "pending" },
          order: [["created_at", "DESC"]],
        });
      } catch (error) {
        console.error("[getPendingSubscription] DB ERROR:", error.message);
        throw Error.InternalError("Failed to check existing subscription");
      }
    },
    getSubscription: async (subscription_id, salon_id) => {
      return await PartnerSubscriptions.findOne({
        where: { subscription_id, salon_id },
      });
    },
    activateSubscription: async ({
      subscription_id,
      salon_id,
      razorpay_payment_id,
      razorpay_signature,
    }) => {
      const [updated] = await PartnerSubscriptions.update(
        {
          payment_status: "paid",
          is_active: true,
          razorpay_payment_id,
          razorpay_signature,
        },
        {
          where: { subscription_id, salon_id },
        },
      );

      if (!updated) {
        throw Error.BadRequest("Subscription update failed");
      }

      const subscription = await PartnerSubscriptions.findOne({
        where: { subscription_id, salon_id },
      });

      // Insert payment record into PartnerSubscriptionsPayments
      await PartnerSubscriptionsPayments.create({
        subscription_id,
        salon_id,
        amount: subscription.amount_paid,
        payment_method: "razorpay",
        payment_status: "success",
        transaction_id: razorpay_payment_id,
        payment_date: new Date(),
      });

      return subscription;
    },
    updatestore: async (store_id) => {
      return await Store.update(
        { is_premium: true },
        { where: { id: store_id } },
      );
    },
    listServiceCategoryV2: async (options) => {
      try {
        const { limit, offset, order } = options;

        return await partnerDbController.Models.Servicecategory.findAndCountAll(
          {
            limit,
            offset,
            order,
          },
        );
      } catch (error) {
        console.log("Db error", error.message);
        throw Error.InternalError(error.message);
      }
    },

    /**
     * --- Version 2 Architecture ---
     * Focused on structural integrity, atomicity, and clean error propagation.
     */

    /**
     * @description Specialized update for v2 store profile.
     * Handles merging/replacing images, docs, and logo via atomic transaction.
     * @param {number} storeId - Valid Store primary key.
     * @param {Object} payload - Combined store basic info fields.
     * @param {Object} addressPayload - Address specific fields.
     * @param {Array<number>} categoryIds - Array of service category IDs.
     * @param {Array<string>} images - Array of salon image filenames.
     * @param {Array<string>} docs - Array of document filenames.
     * @param {string} logo - Single logo filename.
     */
    upsertStoreProfile: async (
      storeId,
      payload,
      addressPayload,
      categoryIds,
      images,
      docs,
      logo,
    ) => {
      console.log("🔍 [DEBUG] [DB] Entering upsertStoreProfile for ID:", storeId);
      const t = await partnerDbController.connection.transaction();

      try {
        console.log(`💎 [Transaction Start] Upserting store profile for ID: ${storeId}`);

        // 1. Resolve Store & Address ID
        const store = await partnerDbController.Models.Store.findByPk(storeId, {
          transaction: t,
        });
        if (!store) {
          console.error("❌ [DEBUG] [DB] Store NOT found for ID:", storeId);
          throw Error.BadRequest("Store not found for the given session");
        }

        let addressId = store.address_id;
        console.log("🔍 [DEBUG] [DB] Existing address_id:", addressId);

        // 2. Manage PartnerAddress
        if (!addressId) {
          console.log("📍 [DEBUG] [DB] Creating new address record...");
          const newAddress =
            await partnerDbController.Models.PartnerAddress.create(
              {
                store_id: storeId,
                addressLine1: addressPayload.addressLine1,
                city: addressPayload.city,
                area: addressPayload.area,
                latitude: addressPayload.latitude,
                longitude: addressPayload.longitude,
                district: addressPayload.district || addressPayload.city,
                state: addressPayload.state || "Tamil Nadu", // Default or provided
                location: {
                  type: "Point",
                  coordinates: [
                    parseFloat(addressPayload.longitude) || 0,
                    parseFloat(addressPayload.latitude) || 0,
                  ],
                },
                status: "active",
              },
              { transaction: t },
            );
          addressId = newAddress.id;
          console.log("✅ [DEBUG] [DB] New address created with ID:", addressId);
        } else {
          console.log(`📍 [DEBUG] [DB] Updating existing address record: ${addressId}`);
          await partnerDbController.Models.PartnerAddress.update(
            {
              addressLine1: addressPayload.addressLine1,
              city: addressPayload.city,
              area: addressPayload.area,
              latitude: addressPayload.latitude,
              longitude: addressPayload.longitude,
              district: addressPayload.district || addressPayload.city,
              state: addressPayload.state,
              location: {
                type: "Point",
                coordinates: [
                  parseFloat(addressPayload.longitude) || 0,
                  parseFloat(addressPayload.latitude) || 0,
                ],
              },
            },
            {
              where: { id: addressId },
              transaction: t,
            },
          );
          console.log("✅ [DEBUG] [DB] Address updated.");
        }

        // 3. Manage Category Mappings (Reset & Re-map)
        console.log("📂 [DEBUG] [DB] Processing category mappings...");
        await partnerDbController.Models.CategoryTable.destroy({
          where: { store_id: storeId },
          transaction: t,
        });

        if (categoryIds && categoryIds.length > 0) {
          const mappings = categoryIds.map((catId) => ({
            store_id: storeId,
            category_id: catId,
          }));
          await partnerDbController.Models.CategoryTable.bulkCreate(mappings, {
            transaction: t,
          });
          console.log(`✅ [DEBUG] [DB] Bulk created ${mappings.length} category mappings.`);
        }

        // 4. Update Store Record
        console.log("🏪 [DEBUG] [DB] Committing store details to Store table...");
        const storeUpdateData = {
          name: payload.name,
          phone: payload.phone,
          website: payload.website,
          description: payload.description,
          referral_id: payload.referral_id,
          team_size: payload.team_size,
          income: payload.income_level,
          store_type: payload.type,
          address_id: addressId,
          category_id: JSON.stringify(categoryIds), // For redundancy/legacy support
          status: "active",
          completion_status: "pending",
        };

        if (images) {
          storeUpdateData.images = JSON.stringify(images);
        }

        if (docs) {
          storeUpdateData.docs = JSON.stringify(docs);
        }

        if (logo) {
          storeUpdateData.logo = logo;
        }

        await partnerDbController.Models.Store.update(storeUpdateData, {
          where: { id: storeId },
          transaction: t,
        });
        console.log("✅ [DEBUG] [DB] Store table updated.");

        // 5. Commit Transaction
        await t.commit();
        console.log("🚀 [DEBUG] [DB] Transaction Committed Successfully.");

        // 6. Fetch final synchronized state
        const finalStore =
          await partnerDbController.Models.Store.findByPk(storeId);
        const finalAddress =
          await partnerDbController.Models.PartnerAddress.findByPk(addressId);

        return {
          ...finalStore.toJSON(),
          address: finalAddress ? finalAddress.toJSON() : null,
        };
      } catch (error) {
        console.error("❌ [DEBUG] [DB] Transaction Rolled Back. Error:", error);
        await t.rollback();
        logger.error(`Store Onboarding error: ${error.message}`, {
          stack: error.stack
        });

        // 🧾 DATABASE
        await logErrorToDB({
          module: "Partner-APP",
          functionName: "Store Onboarding",
          error,
          requestData: {
            name: data?.name,
            email: data?.email,
            phone: data?.phone
          }
        });
        throw Error.InternalError(`Transaction failed: ${error.message}`);
      }
    },

    /**
     * @description Clean v2 onboarding implementation.
     * Fixed loopholes:
     * - No hardcoded state fallbacks.
     * - Distinct district and city mapping.
     * - Protection against unauthorized status resets.
     * - Unified transaction returns.
     */
    v2onboardingsalon: async (
      storeId,
      payload,
      addressPayload,
      categoryIds,
      images,
      docs,
      logo,
    ) => {
      console.log("💎 [DB] [v2onboardingsalon] Initiating for ID:", storeId);
      const t = await partnerDbController.connection.transaction();

      try {
        // 1. Resolve Store
        const store = await partnerDbController.Models.Store.findByPk(storeId, {
          transaction: t,
        });
        if (!store) {
          throw Error.BadRequest("Store context missing for session");
        }

        // 2. Manage Address (Cleanly)
        let addressId = store.address_id;
        const addressData = {
          addressLine1: addressPayload.addressLine1,
          city: addressPayload.city,
          area: addressPayload.area,
          latitude: addressPayload.latitude,
          longitude: addressPayload.longitude,
          district: addressPayload.district, // No fallback to city
          state: addressPayload.state, // No hardcoded "Tamil Nadu"
          location: {
            type: "Point",
            coordinates: [
              parseFloat(addressPayload.longitude) || 0,
              parseFloat(addressPayload.latitude) || 0,
            ],
          },
        };

        if (!addressId) {
          const newAddress = await partnerDbController.Models.PartnerAddress.create(
            { ...addressData, store_id: storeId, status: "active" },
            { transaction: t },
          );
          addressId = newAddress.id;
        } else {
          await partnerDbController.Models.PartnerAddress.update(addressData, {
            where: { id: addressId },
            transaction: t,
          });
        }

        // 3. Category Mappings
        await partnerDbController.Models.CategoryTable.destroy({
          where: { store_id: storeId },
          transaction: t,
        });

        if (categoryIds && categoryIds.length > 0) {
          const mappings = categoryIds.map((catId) => ({
            store_id: storeId,
            category_id: catId,
          }));
          await partnerDbController.Models.CategoryTable.bulkCreate(mappings, {
            transaction: t,
          });
        }

        // 4. Update Store
        const storeUpdateData = {
          name: payload.name,
          phone: payload.phone,
          website: payload.website,
          description: payload.description,
          referral_id: payload.referral_id,
          team_size: payload.team_size,
          income: payload.income_level,
          store_type: payload.type,
          address_id: addressId,
          category_id: JSON.stringify(categoryIds),
          status: "active", // Required for onboarding
          completion_status: "pending", // Required for onboarding
        };

        if (images) storeUpdateData.images = JSON.stringify(images);
        if (docs) storeUpdateData.docs = JSON.stringify(docs);
        if (logo) storeUpdateData.logo = logo;

        await partnerDbController.Models.Store.update(storeUpdateData, {
          where: { id: storeId },
          transaction: t,
        });

        await t.commit();

        const [finalStore, finalAddress] = await Promise.all([
          partnerDbController.Models.Store.findByPk(storeId),
          partnerDbController.Models.PartnerAddress.findByPk(addressId),
        ]);

        return {
          ...finalStore.toJSON(),
          address: finalAddress ? finalAddress.toJSON() : null,
        };
      } catch (error) {
        console.error("❌ [DB] [v2onboardingsalon] Error:", error);
        if (t) await t.rollback();
        logger.error(`v2 Onboarding error: ${error.message}`, {
          stack: error.stack
        });

        // 🧾 DATABASE
        await logErrorToDB({
          module: "Partner-APP",
          functionName: "v2 Onboarding",
          error,
          requestData: {
            name: data?.name,
            email: data?.email,
            phone: data?.phone
          }
        });
        throw error.status ? error : Error.InternalError(error.message);
      }
    },
    /**
     * @description Fetched comprehensive Services page data (v2).
     * Returns summary stats, category filters with counts, and a filtered/sorted list of services.
     */
    listServicesV2: async (storeId, options = {}) => {
      try {
        const {
          search,
          category_id,
          sortBy = "id",
          order = "DESC",
          page = 1,
          limit = 10,
        } = options;
        const offset = (page - 1) * limit;

        // 1. Fetch Summary Stats
        const statsSql = `
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
          FROM StoreServices 
          WHERE store_id = :storeId`;

        const statsResult = await partnerDbController.connection.query(
          statsSql,
          {
            replacements: { storeId },
            type: Sequelize.QueryTypes.SELECT,
          },
        );

        // 2. Fetch Categories with Counts (for Filter Bar)
        const categoriesSql = `
          SELECT 
            sc.id, 
            sc.name as name, 
            COUNT(ss.id) as count
          FROM Servicecategory sc
          JOIN StoreServices ss ON sc.id = ss.service_category
          WHERE ss.store_id = :storeId
          GROUP BY sc.id, sc.name`;

        const categoryStats = await partnerDbController.connection.query(
          categoriesSql,
          {
            replacements: { storeId },
            type: Sequelize.QueryTypes.SELECT,
          },
        );

        // 3. Build Service List Query with Filters
        let whereClause = `WHERE ss.store_id = :storeId`;
        const replacements = { storeId, limit, offset };

        if (search) {
          whereClause += ` AND ss.service_name LIKE :search`;
          replacements.search = `%${search}%`;
        }
        if (category_id) {
          whereClause += ` AND ss.service_category = :category_id`;
          replacements.category_id = category_id;
        }

        // Sorting logic
        let orderBy = `ss.${sortBy} ${order}`;
        if (sortBy === "price_low_high") {
          orderBy = `COALESCE(ss.discounted_amount, ss.amount) ASC`;
        }

        const servicesSql = `
          SELECT 
            ss.*, 
            sc.name as category_name 
          FROM StoreServices ss
          LEFT JOIN Servicecategory sc ON ss.service_category = sc.id
          ${whereClause}
          ORDER BY ${orderBy}
          LIMIT :limit OFFSET :offset`;

        const services = await partnerDbController.connection.query(
          servicesSql,
          {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          },
        );

        // Count for pagination
        const totalServicesSql = `SELECT COUNT(*) as count FROM StoreServices ss ${whereClause}`;
        const totalServices = await partnerDbController.connection.query(
          totalServicesSql,
          {
            replacements,
            type: Sequelize.QueryTypes.SELECT,
          },
        );

        return {
          summary: statsResult[0] || { total: 0, active: 0, inactive: 0 },
          categoryStats,
          services,
          total: totalServices[0].count,
        };
      } catch (error) {
        console.error("❌ [Db Error] listServicesV2:", error);
        throw Error.InternalError(error.message);
      }
    },
    /**
     * @description Adds a new service to a store (v2).
     */
    addServiceV2: async (serviceData) => {
      try {
        return await partnerDbController.Models.StoreServices.create(
          serviceData,
        );
      } catch (error) {
        console.error("❌ [Db Error] addServiceV2:", error);
        throw Error.InternalError(error.message);
      }
    },

    /**
     * @description Updates an existing service (v2).
     */
    updateServiceV2: async (id, storeId, updateData) => {
      try {
        const { StoreServices } = partnerDbController.Models;
        const [updatedRows] = await StoreServices.update(updateData, {
          where: { id, store_id: storeId },
        });

        if (updatedRows === 0) {
          throw Error.BadRequest("Service not found or ownership mismatch");
        }

        return await StoreServices.findByPk(id);
      } catch (error) {
        console.error("❌ [Db Error] updateServiceV2:", error);
        throw Error.InternalError(error.message);
      }
    },

    deleteServiceV2: async (id, storeId) => {
      try {
        const { StoreServices } = partnerDbController.Models;
        const deletedRows = await StoreServices.destroy({
          where: { id, store_id: storeId },
        });
        if (deletedRows === 0) {
          throw Error.BadRequest("Service not found or ownership mismatch");
        }
        return "Service deleted successfully";
      } catch (error) {
        console.error("❌ [Db Error] deleteServiceV2:", error);
        throw error.status ? error : Error.InternalError(error.message);
      }
    },

    createEnquiry: async (data) => {
      try {
        const enquiry = await partnerDbController.Models.Enquiry.create(data);
        return enquiry;
      } catch (error) {
        console.error("❌ [Db Error] createEnquiry:", error);
        throw Error.InternalError(error.message);
      }
    },

    /**
     * Get Salon Details by Store ID
     */
    /**
     * ============================================
     * SALON DETAILS DATABASE OPERATIONS (v2)
     * ============================================
     */

    /**
     * Fetch comprehensive salon details with all related entities
     *
     * Retrieves:
     * - Store profile with salon details fields
     * - Active stylists/team members
     * - Operating slots grouped by day
     * - Associated amenities with metadata
     *
     * @param {number} storeId - The store/partner ID
     * @throws {ApplicationError} If store not found or database error
     * @returns {object} Complete salon data structure
     */
    getSalonDetailsv2: async (storeId) => {
      try {
        // Fetch essential data in parallel to avoid N+1 and sequential delays
        const [store, stylists, slots] = await Promise.all([
          Store.findOne({ where: { id: storeId }, raw: true }),
          Stylist.findAll({
            where: { store_id: storeId, status: "active" },
            attributes: [
              "id",
              "name",
              "email",
              "phone",
              "profilepic",
              "designation",
              "known_services",
              "experience_years",
              "status",
            ],
            raw: true,
          }),
          Slots.findAll({
            where: { store_id: storeId, status: "active" },
            raw: true,
          }),
        ]);

        if (!store) {
          throw Error.NotFound("Salon details not found for this partner");
        }

        // Parse raw TEXT fields into JSON objects/arrays (since using raw: true)
        const jsonFields = [
          "images",
          "gallery",
          "social_media",
          "amenities",
          "team_members",
          "operating_hours",
        ];
        for (const field of jsonFields) {
          if (store[field] && typeof store[field] === "string") {
            try {
              store[field] = JSON.parse(store[field]);
            } catch (_err) {
              store[field] =
                field === "social_media" || field === "operating_hours"
                  ? {}
                  : [];
            }
          } else if (!store[field]) {
            store[field] =
              field === "social_media" || field === "operating_hours" ? {} : [];
          }
        }

        // Fetch Amenities Details if any
        let amenityDetails = [];
        const amenityIds = store.amenities;
        if (Array.isArray(amenityIds) && amenityIds.length > 0) {
          amenityDetails = await partnerDbController.connection.query(
            `SELECT id, name, icon FROM Aminities WHERE id IN (:amenityIds)`,
            { replacements: { amenityIds }, type: Sequelize.QueryTypes.SELECT },
          );
        }

        // 🛡️ Backward Compatibility: Check StoreAminities joining table if JSON field is empty
        if (amenityDetails.length === 0) {
          const legacyAmenities = await partnerDbController.connection.query(
            `SELECT a.id, a.name, a.icon 
             FROM Aminities a 
             JOIN StoreAminities sa ON a.id = sa.aminities_id 
             WHERE sa.store_id = :storeId`,
            { replacements: { storeId }, type: Sequelize.QueryTypes.SELECT },
          );
          if (legacyAmenities.length > 0) {
            amenityDetails = legacyAmenities;
            // Map IDs back to store.amenities for consistent response formatting
            store.amenities = legacyAmenities.map((a) => a.id);
          }
        }

        return {
          salonDetails: store,
          stylists,
          getslotsv2: slots,
          amenities: amenityDetails,
        };
      } catch (error) {
        console.error("❌ [DB] getSalonDetailsv2 Error:", error.message);
        throw error.status ? error : Error.InternalError(error.message);
      }
    },

    /**
     * Internal helper to sync StoreAminities table (Non-destructive)
     */
    _syncAmenities: async (storeId, amenityIds) => {
      try {
        let normalizedIds = amenityIds;
        if (typeof normalizedIds === "string") {
          normalizedIds = normalizedIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter(Boolean);
        }

        if (!Array.isArray(normalizedIds)) return;

        // 1. Validate that all provided IDs actually exist in the master Aminities table
        const validMasterAmenities =
          await partnerDbController.Models.Aminities.findAll({
            where: { id: normalizedIds },
            attributes: ["id"],
            raw: true,
          });
        const validMasterIds = validMasterAmenities.map((a) => parseInt(a.id));
        const invalidIds = normalizedIds.filter(
          (id) => !validMasterIds.includes(parseInt(id)),
        );

        if (invalidIds.length > 0) {
          throw Error.BadRequest(
            `Invalid amenity IDs: ${invalidIds.join(", ")}`,
          );
        }

        // 2. Fetch current mappings for this store
        const currentMappings =
          await partnerDbController.Models.StoreAminities.findAll({
            where: { store_id: storeId },
            raw: true,
          });
        const currentIds = currentMappings.map((m) => parseInt(m.aminities_id));

        // 3. Identify changes
        const toAdd = normalizedIds.filter(
          (id) => !currentIds.includes(parseInt(id)),
        );
        const toRemove = currentIds.filter(
          (id) => !normalizedIds.map((nid) => parseInt(nid)).includes(id),
        );

        // 4. Apply changes (Add new)
        if (toAdd.length > 0) {
          await partnerDbController.Models.StoreAminities.bulkCreate(
            toAdd.map((id) => ({ store_id: storeId, aminities_id: id })),
          );
        }

        // 5. Apply changes (Remove old)
        // if (toRemove.length > 0) {
        //   await partnerDbController.Models.StoreAminities.destroy({
        //     where: { store_id: storeId, aminities_id: toRemove }
        //   });
        // }
        console.log(
          `✅ [Amenities Reconcile] Added: ${toAdd.length}, Removed: ${toRemove.length}`,
        );
      } catch (error) {
        console.error("⚠️ [Amenities Sync Error]:", error.message);
        throw error;
      }
    },

    /**
     * Internal helper to sync Stylist table (Non-destructive Reconciliation)
     */
    _syncStylists: async (storeId, teamMembers) => {
      try {
        let members = teamMembers;
        if (typeof members === "string") {
          try {
            members = JSON.parse(members);
          } catch (e) {
            return;
          }
        }

        if (!Array.isArray(members)) return;

        // 1. Fetch current stylists for this store
        const currentStylists =
          await partnerDbController.Models.Stylist.findAll({
            where: { store_id: storeId },
          });

        // 2. Process payload members
        for (const m of members) {
          let stylistInstance = null;

          // Validate ID if provided
          if (m.id) {
            stylistInstance = currentStylists.find(
              (s) => s.id === parseInt(m.id),
            );
            if (!stylistInstance) {
              throw Error.BadRequest(
                `Stylist ID ${m.id} does not exist for this store.`,
              );
            }
          }

          // Fallback: match by name if ID not provided
          if (!stylistInstance && m.name) {
            stylistInstance = currentStylists.find(
              (s) => s.name.toLowerCase() === m.name.toLowerCase(),
            );
          }

          // Prepare partial update payload
          const stylistData = { store_id: storeId };
          if (m.hasOwnProperty("name")) stylistData.name = m.name || "Unknown";
          if (m.hasOwnProperty("designation"))
            stylistData.designation = m.designation || "Stylist";
          if (m.hasOwnProperty("profilepic") || m.hasOwnProperty("profilePic"))
            stylistData.profilepic = m.profilepic || m.profilePic || null;
          if (
            m.hasOwnProperty("experience_years") ||
            m.hasOwnProperty("experienceYears")
          )
            stylistData.experience_years = parseInt(
              m.experience_years || m.experienceYears || 0,
            );
          if (
            m.hasOwnProperty("specialization") ||
            m.hasOwnProperty("known_services")
          )
            stylistData.known_services =
              m.specialization || m.known_services || null;
          if (m.hasOwnProperty("status"))
            stylistData.status = m.status || "active";

          if (stylistInstance) {
            // Update existing with ONLY the provided fields
            await stylistInstance.update(stylistData);
          } else {
            // Create new (if name provided)
            if (m.name) {
              await partnerDbController.Models.Stylist.create({
                ...stylistData,
                name: m.name,
                status: stylistData.status || "active",
              });
            }
          }
        }
        console.log(
          `✅ [Stylist Partial Sync] Processed ${members.length} member updates.`,
        );
      } catch (error) {
        console.error("⚠️ [Stylist Sync Error]:", error.message);
        throw error;
      }
    },

    /**
     * Internal helper to sync Slots table from operating_hours JSON
     */
    _syncSlots: async (storeId, operatingHours) => {
      try {
        if (!operatingHours) return;

        let config = operatingHours;
        if (typeof config === "string") {
          try {
            config = JSON.parse(config);
          } catch (e) {
            return;
          }
        }

        if (typeof config !== "object" || config === null) return;

        // 1. Delete existing slots for this store to prevent duplicates/orphans
        await partnerDbController.Models.Slots.destroy({
          where: { store_id: storeId },
        });

        // 2. Prepare new slots based on the JSON config
        const days = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        const newSlots = [];

        for (const day of days) {
          const dayConfig = config[day];
          // Check if day exists and is NOT marked as closed
          if (dayConfig && !dayConfig.is_closed && !dayConfig.isClosed) {
            newSlots.push({
              store_id: storeId,
              day: day,
              from: dayConfig.from || dayConfig.open || "09:00",
              to: dayConfig.to || dayConfig.close || "21:00",
              status: "active",
            });
          }
        }

        // 3. Bulk insert for efficiency
        if (newSlots.length > 0) {
          await partnerDbController.Models.Slots.bulkCreate(newSlots);
          console.log(
            `✅ [Slots Sync] Synchronized ${newSlots.length} slots for store ${storeId}`,
          );
        }
      } catch (error) {
        console.error("⚠️ [Slots Sync Error]:", error.message);
      }
    },

    /**
     * Create or update salon details (Upsert operation)
     */
    createOrUpdateSalonDetails: async (storeId, payload) => {
      try {
        // Fix string violations (JSON stringify) before create/update
        const jsonFields = [
          "images",
          "gallery",
          "amenities",
          "team_members",
          "operating_hours",
          "social_media",
        ];

        for (const field of jsonFields) {
          if (
            payload[field] !== undefined &&
            typeof payload[field] === "object" &&
            payload[field] !== null
          ) {
            payload[field] = JSON.stringify(payload[field]);
          }
        }

        // ====================
        // 1. PREPARE STORE-SPECIFIC FIELDS
        // ====================
        // Fields for the Store table itself
        const storeFields = [
          "about",
          "phone",
          "email",
          "website",
          "images",
          "social_media",
        ];
        const storePayload = {};
        storeFields.forEach((f) => {
          if (payload.hasOwnProperty(f)) storePayload[f] = payload[f];
        });

        // ====================
        // 1. FIND OR CREATE
        // ====================
        const [store, created] = await Store.findOrCreate({
          where: { id: storeId },
          defaults: {
            id: storeId,
            ...storePayload,
          },
        });

        // ====================
        // 2. UPDATE IF EXISTS
        // ====================
        if (!created && Object.keys(storePayload).length > 0) {
          await store.update(storePayload);
        }

        // ====================
        // 3. SYNC RELATED TABLES (RELATIONAL SYNC)
        // ====================
        // Amenities (StoreAminities table)
        if (payload.amenities) {
          await partnerDbController.app._syncAmenities(
            storeId,
            payload.amenities,
          );
        }

        // Operating Hours (Slots table)
        if (payload.operating_hours) {
          await partnerDbController.app._syncSlots(
            storeId,
            payload.operating_hours,
          );
        }

        // Stylists (Stylist table)
        if (payload.team_members) {
          await partnerDbController.app._syncStylists(
            storeId,
            payload.team_members,
          );
        }

        return store;
      } catch (error) {
        console.error(
          "❌ [DB Error] createOrUpdateSalonDetails:",
          error.message,
        );
        throw Error.InternalError(error.message);
      }
    },

    /**
     * Partial update of salon details (true partial update)
     *
     * Only updates fields that are explicitly provided in payload.
     * All other fields remain untouched (critical for partial updates).
     *
     * @param {number} storeId - The store/partner ID
     * @param {object} payload - Fields to update (only provided fields are written)
     * @throws {ApplicationError} If database error
     * @returns {object} Updated store record
     */
    updateSalonDetailsv2: async (storeId, payload) => {
      try {
        // ====================
        // 1. FETCH EXISTING RECORD
        // ====================
        const store = await Store.findOne({
          where: { id: storeId },
        });

        if (!store) {
          throw Error.NotFound("Salon not found");
        }

        // ====================
        // 2. VALIDATE ALLOWED FIELDS
        // ====================
        // Whitelist of updateable fields prevents accidental column updates
        const ALLOWED_FIELDS = [
          "name",
          "store_type",
          "team_size",
          "income",
          "docs",
          "bank_account_holder",
          "account_number",
          "completion_status",
          "ifsc_code",
          "status",
          "category_id",
          "wallet_remaining",
          "description",
          "deviceId",
          "about",
          "amenities",
          "team_members",
          "operating_hours",
          "phone",
          "email",
          "website",
          "images",
          "social_media",
          "rating",
          "reviews_count",
          "is_verified",
          "logo",
          "salon_image",
          "services_provided_for",
          "languages",
          "referral_id",
        ];

        // ====================
        // 3. BUILD UPDATE OBJECT
        // ====================
        // Preserve existing values for fields not in payload
        // This ensures true partial update semantics
        const updateData = {};
        for (const field of ALLOWED_FIELDS) {
          if (payload.hasOwnProperty(field)) {
            updateData[field] = payload[field];
          }
        }

        // Stringify social_media if sending to Store table
        if (
          updateData.social_media &&
          typeof updateData.social_media === "object"
        ) {
          updateData.social_media = JSON.stringify(updateData.social_media);
        }

        // Stringify images if sending to Store table
        if (updateData.images && Array.isArray(updateData.images)) {
          updateData.images = JSON.stringify(updateData.images);
        }

        // ====================
        // 5. PERSIST STORE CHANGES
        // ====================
        const updatedStore =
          Object.keys(updateData).length > 0
            ? await store.update(updateData)
            : store;

        // ====================
        // 6. SYNC RELATED TABLES (RELATIONAL SYNC)
        // ====================
        // Sync Amenities (StoreAminities table)
        if (payload.amenities) {
          await partnerDbController.app._syncAmenities(
            storeId,
            payload.amenities,
          );
        }

        // Sync Operating Hours (Slots table)
        if (payload.operating_hours) {
          await partnerDbController.app._syncSlots(
            storeId,
            payload.operating_hours,
          );
        }

        // Sync Team Members (Stylist table)
        if (payload.team_members) {
          await partnerDbController.app._syncStylists(
            storeId,
            payload.team_members,
          );
        }

        return updatedStore;
      } catch (error) {
        console.error("❌ [DB Error] updateSalonDetailsv2:", error.message);
        logger.error(`Store update error: ${error.message}`, {
          stack: error.stack
        });

        // 🧾 DATABASE
        await logErrorToDB({
          module: "Partner-APP",
          functionName: "Store update",
          error,
          requestData: {
            name: data?.name,
            email: data?.email,
            phone: data?.phone
          }
        });
        throw Error.InternalError(error.message);
      }
    },
    getactiveplansv2: async (body) => {
      try {
        return await partnerDbController.Models.PartnerSubscriptions.findAll({
          where: {
            salon_id: body.id || body.store_id || body.salon_id,
            status: "active",
            // type: body.type,  // type might not exist in all calls
          },
        });
      } catch (error) {
        throw Error.InternalError();
      }
    },
    getactiveplansV2: async (body) => {
      try {
        const store_id = body.store_id || body.id || body.salon_id;
        if (!store_id) return null;

        const sql = `
          SELECT 
            ps.*, 
            psp.plan_id AS "plan.plan_id", 
            psp.plan_name AS "plan.plan_name", 
            psp.price AS "plan.price", 
            psp.original_price AS "plan.original_price", 
            psp.discount_price AS "plan.discount_price", 
            psp.price_tag AS "plan.price_tag", 
            psp.duration_months AS "plan.duration_months", 
            psp.booking_limit AS "plan.booking_limit", 
            psp.is_unlimited AS "plan.is_unlimited",
            ps.start_date AS "plan.start_date",
            ps.end_date AS "plan.end_date"
          FROM PartnerSubscriptions AS ps
          LEFT JOIN PartnerSubscriptionPlans AS psp ON ps.plan_id = psp.plan_id
          WHERE ps.salon_id = :store_id AND ps.is_active = true
          ORDER BY ps.created_at DESC
          LIMIT 1
        `;

        const result = await connection.query(sql, {
          replacements: { store_id },
          type: Sequelize.QueryTypes.SELECT,
          nest: true,
        });

        return result.length > 0 ? result[0] : null;
      } catch (error) {
        console.error("❌ [DB Error] getactiveplansV2:", error.message);
        throw Error.InternalError();
      }
    },

    getaminitiesV2: async () => {
      try {
        return await partnerDbController.Models.Aminities.findAll({
          attributes: ["id", "name", "icon"],
        });
      } catch (error) {
        console.error("❌ [DB Error] getaminitiesV2:", error.message);
        throw Error.InternalError();
      }
    },

    addbankdetailsv2: async ({ body, store_id }) => {
      try {
        if (!store_id) {
          throw AppError.NotValid("Invalid session: Store ID missing");
        }

        // ✅ Only update fields that are actually sent in the request
        const fieldsToUpdate = {};
        if (body.account_holder_name !== undefined)
          fieldsToUpdate.bank_account_holder = body.account_holder_name;
        if (body.account_number !== undefined)
          fieldsToUpdate.account_number = body.account_number;
        if (body.ifsc_code !== undefined)
          fieldsToUpdate.ifsc_code = body.ifsc_code;

        if (Object.keys(fieldsToUpdate).length === 0) {
          throw new Error("No fields provided to update");
        }

        const [affectedRows] = await partnerDbController.Models.Store.update(
          fieldsToUpdate,
          { where: { id: store_id } },
        );

        if (affectedRows === 0) {
          throw new Error(`No store found with id: ${store_id}`);
        }

        const updatedStore = await partnerDbController.Models.Store.findOne({
          where: { id: store_id },
          attributes: [
            "id",
            "bank_account_holder",
            "account_number",
            "ifsc_code",
          ],
        });

        return updatedStore;
      } catch (error) {
        console.error("❌ [DB Error] addbankdetailsv2:", error.message);
        throw AppError.SomethingWentWrong(
          error.message || "Failed to update bank details",
        );
      }
    },
  }));
