import require from "requirejs";
import * as Error from "../../core/errors/ErrorConstant.js";
import { SchemaError } from "../../core/errors/SchemaError.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { partnerDbController } from "../../core/database/Controller/partnerDbController.js";
import {
  updateFormatSalonResponseV2,
  formatSalonDetailsV2,
  formatOwnerProfileV2,
} from "../../core/services/ResponseFormatter.js";
import Razorpay from "razorpay";
import { connection } from "../../core/database/connection.js";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import { helperfunction } from "../../core/utils/helperfunctions.js";
import { Op, Sequelize } from "sequelize";
import { uploadToS3 } from "../../core/utils/s3/s3Upload.js";
import {
  ensurePlanSyncedToRazorpay,
  resolveRazorpayPlanId,
  linkRazorpayPlanIdToDb,
} from "../../core/utils/syncRazorpayPlans.js";


// import { error } from "ajv/dist/vocabularies/applicator/dependencies.js";
// import { addaminities, addcombinations, deleteproffesional, getallbookings, getstoretimmings } from "../controller/partnerappcontroller.js";
// import { partnerauthenticate } from "../controller/partnerauthcontroller.js";
dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RZ_PAY_ID,
  key_secret: process.env.RZ_PAY_KEY,
});
const crypto = require("crypto");

export class partnerappmiddleware {}

partnerappmiddleware.addstore = {
  createstore: async ({ body, user, files }) => {
    console.log("🚀 ~ body:", body);
    try {
      const addproduct = await partnerDbController.app.getstorebyid(user.id);
      console.log("🚀 ~ addproduct:", addproduct);
      const images = files.images.map((item) => item.filename);
      const docs = files.documents.map((item) => item.filename);

      const getaddress = await partnerDbController.app.getaddressbyid(
        addproduct?.address_id,
      );
      console.log("🚀 ~ getaddress:", getaddress);

      let address = null;
      if (getaddress === null || getaddress === undefined) {
        address = await partnerDbController.app.addaddress(body, user.id);
        console.log("🚀 ~ address:", address);
      } else {
        address = await partnerDbController.app.updateaddress(
          body,
          getaddress.id,
          user.id,
        );
        console.log("🚀 ~ address:", address);
        if (address === null || address === undefined) {
          throw Error.SomethingWentWrong("Failed to update address");
        }
      }
      const deletecategory = await partnerDbController.app.deletecategory(
        user.id,
      );
      // if(body.category_id > 1 ){
      // body.category_id = JSON.parse(body.category_id);
      // }else{
      //    body.category_id = body.category_id;
      // }
      let categoryIds = body.category_id;

      // 1️⃣ If it's a string → convert to array
      if (typeof categoryIds === "string") {
        categoryIds = categoryIds
          .split(",") // split by comma
          .map((id) => id.trim()) // remove spaces
          .filter(Boolean); // remove empty values
      }

      // 2️⃣ If it's a number → wrap in array
      if (typeof categoryIds === "number") {
        categoryIds = [categoryIds];
      }

      // 3️⃣ If it's already an array → keep it
      if (!Array.isArray(categoryIds)) {
        throw Error.BadRequest("Invalid category_id format");
      }

      console.log("🚀 normalized categoryIds:", categoryIds);

      for (const id of categoryIds) {
        const addcategory = await partnerDbController.app.addcategory(
          id,
          user.id,
        );
        console.log("🚀 ~ addcategory:", addcategory);
      }
      const addfiledata = await partnerDbController.app.addpartner(
        body,
        images,
        docs[0],
        address.id,
        user.id,
      );
      console.log("🚀 ~ addfiledata:", addfiledata);
      if (addfiledata === null || addfiledata === undefined) {
        throw Error.SomethingWentWrong();
      }

      return "Store Created Successfully";
    } catch (error) {
      console.log("🚀 ~ updatestore: ~ error:", error);
      throw Error.SomethingWentWrong();
    }
  },

  updateStore: async ({ body, user }) => {
    console.log("🚀 ~ body:", body);
    try {
      const addproduct = await partnerDbController.app.getstorebyid(user.id);
      console.log("🚀 ~ addproduct:", addproduct);

      const getaddress = await partnerDbController.app.getaddressbyid(
        addproduct?.address_id,
      );
      console.log("🚀 ~ getaddress:", getaddress);

      let address = await partnerDbController.app.updateaddress(
        body,
        getaddress.id,
        user.id,
      );
      console.log("🚀 ~ address:", address);
      if (address === null || address === undefined) {
        throw Error.SomethingWentWrong("Failed to update address");
      }
      const deletecategory = await partnerDbController.app.deletecategory(
        user.id,
      );
      // if(body.category_id > 1 ){
      body.category_id = JSON.parse(body.category_id);
      // }else{
      //    body.category_id = body.category_id;
      // }

      console.log("🚀 ~ body.category_id:", body.category_id);

      for (const id of body.category_id) {
        const addcategory = await partnerDbController.app.addcategory(
          id,
          user.id,
        );
        console.log("🚀 ~ addcategory:", addcategory);
      }
      const addfiledata = await partnerDbController.app.updatepartner(
        body,
        address.id,
        user.id,
      );
      console.log("🚀 ~ addfiledata:", addfiledata);
      if (addfiledata === null || addfiledata === undefined) {
        throw Error.SomethingWentWrong();
      }

      return "Store Created Successfully";
    } catch (error) {
      console.log("🚀 ~ updatestore: ~ error:", error);
      throw Error.SomethingWentWrong();
    }
  },

  /**
   * @description Structural implementation for creating a store (v2).
   * Validates the payload and delegates the atomic transaction to the DB layer.
   */
  createStoreV2: async ({ body, user, files }) => {
    console.log("🔍 [DEBUG] [v2/createStore] Initiating store creation for user:", user?.id);
    const totalStartTime = Date.now();
    try {
      if (!user?.id) throw Error.BadRequest("User ID missing from request context");

      // 1. Structural Validation
      const requiredFields = ["name", "addressLine1", "city", "area"];
      const missing = requiredFields.filter((field) => !body[field]);
      if (missing.length > 0) {
        console.warn("⚠️ [DEBUG] Incomplete registration data. Missing fields:", missing);
        throw Error.BadRequest(
          `Incomplete registration data. Missing: ${missing.join(", ")}`,
        );
      }

      // 2. Parallel S3 Upload for Images and Documents
      // Referring to AdminDbController.js editpartner pattern
      const baseFolder = `store/${user.id}`;
      
      const imageUploadPromises = (files?.images || []).map(file => 
        uploadToS3(file, `${baseFolder}/images`).then(res => res.url)
      );

      const docUploadPromises = (files?.documents || []).map(file => 
        uploadToS3(file, `${baseFolder}/docs`).then(res => res.url)
      );

      // Handle logo upload
      let logoPromise = Promise.resolve(null);
      if (files?.logo && files.logo.length > 0) {
        logoPromise = uploadToS3(files.logo[0], `${baseFolder}/logo`).then(res => res.url);
      }

      // Execute all uploads concurrently. If any fails, the error will be thrown and handled by the catch block.
      console.log("🔍 [DEBUG] Starting S3 Upload Phase...");
      console.time("⏱️ [createStoreV2] S3 Upload Phase");
      const [uploadedImages, uploadedDocs, uploadedLogo] = await Promise.all([
        Promise.all(imageUploadPromises),
        Promise.all(docUploadPromises),
        logoPromise
      ]);
      console.timeEnd("⏱️ [createStoreV2] S3 Upload Phase");

      const images = uploadedImages;
      const docs = uploadedDocs;
      const logo = uploadedLogo;

      console.log("🔍 [DEBUG] S3 Uploaded - Images:", images.length, "Docs:", docs.length, "Logo:", logo ? "Yes" : "No");

      // 3. Payload Normalization
      let categoryIds = [];
      if (body.category_id) {
        categoryIds =
          typeof body.category_id === "string"
            ? body.category_id
                .split(",")
                .map((id) => parseInt(id.trim()))
                .filter(Boolean)
            : Array.isArray(body.category_id)
              ? body.category_id.map((id) => parseInt(id))
              : [parseInt(body.category_id)];
      }

      console.log("🔍 [DEBUG] Normalized Categories:", categoryIds);

      // 4. Delegate to Atomic DB Service
      console.log("🔍 [DEBUG] Calling partnerDbController.app.upsertStoreProfile...");
      console.time("⏱️ [createStoreV2] DB Persistence Phase");
      const result = await partnerDbController.app.upsertStoreProfile(
        user.id,
        body, // Store basic info
        body, // Address info
        categoryIds,
        images,
        docs,
        logo,
      );
      console.timeEnd("⏱️ [createStoreV2] DB Persistence Phase");

      console.log(`✅ [createStoreV2] COMPLETED in ${Date.now() - totalStartTime}ms`);
      return result;
    } catch (error) {
      console.error("❌ [DEBUG] [v2/createStore] Error:", error);
      throw error.status ? error : Error.SomethingWentWrong(error.message || "Failed to create store");
    }
  },

  /**
   * @description Specialized onboarding endpoint logic.
   * Ensures clean separation of concerns and robust error reporting.
   */
  onboardingsalon: async ({ body, user, files }) => {
    console.log("🚀 [v2/onboardingsalon] Onboarding user:", user?.id);
    console.log("📦 [v2/onboardingsalon] Payload:", JSON.stringify(body, null, 2));

    try {
      if (!user?.id) throw Error.BadRequest("Unauthorized or User session missing");

      // 1. Validation
      const requiredFields = ["name", "addressLine1", "city", "area", "phone"];
      const missing = requiredFields.filter((field) => !body[field]);
      if (missing.length > 0) {
        throw Error.BadRequest(`Required fields missing: ${missing.join(", ")}`);
      }

      // 2. Parallel S3 Upload for Images and Documents
      const baseFolder = `store/${user.id}`;
      
      const imageUploadPromises = (files?.images || []).map(file => 
        uploadToS3(file, `${baseFolder}/images`).then(res => res.url)
      );

      const docsToUpload = [
        ...(files?.docs || []),
        ...(files?.documents || []),
      ];

      const docUploadPromises = docsToUpload.map(file => 
        uploadToS3(file, `${baseFolder}/docs`).then(res => res.url)
      );

      // Handle logo upload
      let logoPromise = Promise.resolve(null);
      if (files?.logo && files.logo.length > 0) {
        logoPromise = uploadToS3(files.logo[0], `${baseFolder}/logo`).then(res => res.url);
      }

      // Execute all uploads concurrently. Fails if any individual upload fails.
      const [uploadedImages, uploadedDocs, uploadedLogo] = await Promise.all([
        Promise.all(imageUploadPromises),
        Promise.all(docUploadPromises),
        logoPromise
      ]);

      const images = uploadedImages;
      const docs = uploadedDocs;
      const logo = uploadedLogo;

      console.log("🔍 [DEBUG] [v2/onboardingsalon] S3 Uploaded - Images:", images.length, "Docs:", docs.length, "Logo:", logo ? "Yes" : "No");

      // 3. Category Normalization
      let categoryIds = [];
      if (body.category_id) {
        categoryIds = typeof body.category_id === "string"
          ? body.category_id.split(",").map((id) => parseInt(id.trim())).filter(Boolean)
          : Array.isArray(body.category_id)
            ? body.category_id.map((id) => parseInt(id))
            : [parseInt(body.category_id)];
      }

      // 4. DB Execution
      console.log("🔍 [DEBUG] partnerDbController.app calling v2onboardingsalon...");
      const result = await partnerDbController.app.v2onboardingsalon(
        user.id,
        body,
        body,
        categoryIds,
        images,
        docs,
        logo,
      );

      console.log("✅ [v2/onboardingsalon] Onboarding Successful for ID:", user.id);
      return result;
    } catch (error) {
      console.error("❌ [v2/onboardingsalon] Catch-all Error:", error);
      throw error.status ? error : Error.SomethingWentWrong(error.message || "Onboarding failed");
    }
  },

  /**
   * @description Structural implementation for updating a store (v2).
   * Handles partial updates and image reconciliation via the atomic DB service.
   */
  updateStoreV2: async ({ body, user, files }) => {
    console.log(
      "⚡ [v2/updateStore] Initiating structural update for user:",
      user.id,
    );

    try {
      const store = await partnerDbController.app.getstorebyid(user.id);
      if (!store) throw Error.NotFound("Store Profile");

      const baseFolder = `store/${user.id}`;

      // 1. Image & Document S3 Upload and Reconciliation Logic
      let finalImages = store.images ? JSON.parse(store.images) : [];
      if (files?.images && files.images.length > 0) {
        const imageUploadPromises = files.images.map(file => 
          uploadToS3(file, `${baseFolder}/images`).then(res => res.url)
        );
        const newUploadedImages = await Promise.all(imageUploadPromises);
        finalImages =
          body.append_images === "true"
            ? [...finalImages, ...newUploadedImages]
            : newUploadedImages;
      }

      let finalDocs = store.docs ? JSON.parse(store.docs) : [];
      if (files?.documents && files.documents.length > 0) {
        const docUploadPromises = files.documents.map(file => 
          uploadToS3(file, `${baseFolder}/docs`).then(res => res.url)
        );
        const newUploadedDocs = await Promise.all(docUploadPromises);
        finalDocs =
          body.append_documents === "true"
            ? [...finalDocs, ...newUploadedDocs]
            : newUploadedDocs;
      }

      // Handle logo upload
      let finalLogo = store.logo;
      if (files?.logo && files.logo.length > 0) {
        finalLogo = await uploadToS3(files.logo[0], `${baseFolder}/logo`).then(res => res.url);
      } else if (body.remove_logo === "true") {
        finalLogo = null;
      }

      // 2. Category Normalization
      let categoryIds = null;
      if (body.category_id) {
        categoryIds =
          typeof body.category_id === "string"
            ? body.category_id
                .split(",")
                .map((id) => parseInt(id.trim()))
                .filter(Boolean)
            : Array.isArray(body.category_id)
              ? body.category_id.map((id) => parseInt(id))
              : [parseInt(body.category_id)];
      }

      // 3. Delegate to Atomic DB Service
      const result = await partnerDbController.app.upsertStoreProfile(
        user.id,
        body, // Partial Store fields
        body, // Partial Address fields
        categoryIds,
        finalImages,
        finalDocs,
        finalLogo,
      );

      return result;
    } catch (error) {
      console.error("❌ [v2/updateStore] Standardized Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  AddNewAminities: async ({ body, user }) => {
    try {
      const aminities = await partnerDbController.app.add_new_aminities(body);

      return "aminities added sucssesfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getallaminities: async ({ body, user }) => {
    try {
      const aminities = await partnerDbController.app.getallaminities(
        body,
        user.id,
      );

      if (aminities === null || aminities === undefined) {
        throw Error.SomethingWentWrong("No Aminities Found");
      }

      return aminities;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getbanner: async ({ body }) => {
    console.log("🚀 ~ body:", body);
    try {
      const getbanner = await partnerDbController.app.getbanner(body);
      console.log("🚀 ~ getbanner:", getbanner);
      const banner = [];
      if (getbanner === null || getbanner === undefined) {
        return [];
      }
      for (const bannerItem of getbanner) {
        banner.push(bannerItem.image);
      }
      return banner;
    } catch (error) {
      console.log("🚀 ~ error:", error);
      throw Error.SomethingWentWrong();
    }
  },

  getownerprofile: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getownerprofile(user.id);

      // If owner profile exists, return it (city already included by DB controller)
      if (res) {
        return res;
      }

      // If owner profile doesn't exist, return available data from Store table
      const [storeData, address] = await Promise.all([
        partnerDbController.app.getstorebyid(user.id),
        partnerDbController.Models.PartnerAddress.findOne({
          where: { store_id: user.id },
        }),
      ]);

      if (storeData) {
        return {
          id: null,
          name: storeData.name || "",
          email: storeData.email || "",
          phone: storeData.phone || "",
          profile_pic: null,
          country: "",
          country_code: "",
          Dob: null,
          store_id: storeData.id,
          city: address?.city || null,
          createdAt: storeData.createdAt || null,
          updatedAt: storeData.updatedAt || null,
        };
      }

      // If even store data doesn't exist, return empty structure
      return {
        id: null,
        name: "",
        email: "",
        phone: "",
        profile_pic: null,
        country: "",
        country_code: "",
        Dob: null,
        store_id: user.id,
        city: null,
        createdAt: null,
        updatedAt: null,
      };
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  getBannerWithColor: async () => {
    try {
      return await partnerDbController.Models.Banner.findAll({
        where: {
          status: "active",
          place: "partner",
        },
        attributes: ["image", "color"],
        raw: true,
      });
    } catch (error) {
      throw error;
    }
  },

  getallnotification: async ({ body, user }) => {
    try {
      const notifications = await partnerDbController.app.getallnotification(
        body,
        user.id,
      );

      if (
        notifications === undefined ||
        notifications.length === 0 ||
        notifications === null
      ) {
        return [];
      }

      if (notifications === null || notifications === undefined) {
        throw Error.SomethingWentWrong("No Notifications Found");
      }

      return notifications;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getstoredetails: async ({ body, user }) => {
    try {
      const storedeatials = await partnerDbController.app.getstoredeatils(
        user.id,
      );
      console.log("🚀 ~ storedeatials:", storedeatials);

      // If store details not found, return basic user info instead of throwing error
      if (storedeatials === null || storedeatials === undefined) {
        // Get basic store info from Store table
        const basicStoreInfo = await partnerDbController.app.getstorebyid(
          user.id,
        );

        if (basicStoreInfo) {
          return {
            name: basicStoreInfo.name || "",
            store_type: basicStoreInfo.store_type || "",
            description: basicStoreInfo.description || "",
            website: basicStoreInfo.website || "",
            images: basicStoreInfo.images
              ? JSON.parse(basicStoreInfo.images)
              : [],
            documents: basicStoreInfo.docs
              ? JSON.parse(basicStoreInfo.docs)
              : [],
            category_id: basicStoreInfo.category_id
              ? JSON.parse(basicStoreInfo.category_id)
              : [],
            teamsize: basicStoreInfo.team_size || "",
            income_level: basicStoreInfo.income || "",
            joined_date: basicStoreInfo.createdAt || "",
            addressLine1: "",
            district: "",
            city: "",
            state: "",
            area: "",
            latitude: "",
            longitude: "",
            isSetupComplete: false,
          };
        }

        // If even basic info not found, return empty structure
        return {
          name: "",
          store_type: "",
          description: "",
          website: "",
          images: [],
          documents: [],
          category_id: [],
          teamsize: "",
          income_level: "",
          joined_date: "",
          addressLine1: "",
          district: "",
          city: "",
          state: "",
          area: "",
          latitude: "",
          longitude: "",
          isSetupComplete: false,
        };
      }

      storedeatials.images = JSON.parse(storedeatials.images);
      storedeatials.documents = JSON.parse(storedeatials.documents);
      storedeatials.isSetupComplete = true;

      return storedeatials;
    } catch (error) {
      console.log("🚀 ~ getstoredetails error:", error);
      throw Error.SomethingWentWrong(
        error.message || "Failed to retrieve store details",
      );
    }
  },
  getactivesubs: async ({ body, user }) => {
    try {
      const getsubs = await partnerDbController.app.getsubs(body, user.id);
      ////console.log("🚀 ~ getactivesubs: ~ getsubs:", getsubs)

      if (getsubs === undefined || getsubs === null) {
        return null;
      }

      const getdetails = await partnerDbController.app.getdetails(
        getsubs?.subscription_id,
      );
      ////console.log("🚀 ~ getactivesubs: ~ getdetails:", getdetails)

      const data = {
        getsubs,
        plan_days: getdetails.days,
        price: getdetails.price,
      };

      return data;
    } catch (error) {
      ////console.log("🚀 ~ getactivesubs: ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  addbankdetails: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.updatebankdetails(
        body,
        user.id,
      );

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return "Bank Details Added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  gettransactionlogs: async ({ body, user }) => {
    try {
      const wallet_amount = await partnerDbController.app.getwallet(
        body,
        user.id,
      );
      const res = await partnerDbController.app.gettransactionlogs(
        body,
        user.id,
      );

      return {
        logs: res || [],
        wallet:
          wallet_amount.wallet_remaining === null
            ? 0
            : wallet_amount.wallet_remaining,
      };
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addstoreervices: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.addstoreservices(body, user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return "Service added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addaminities: async ({ body, user }) => {
    try {
      const deleteaminities = await partnerDbController.app.deleteaminities(
        body,
        user.id,
      );

      for (const id of body.aminities_id) {
        const res = await partnerDbController.app.addaminities(
          { aminities_id: id },
          user.id,
        );
        if (!res) {
          throw Error.SomethingWentWrong();
        }
      }

      return "Aminities added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addownerprofile: async ({ body, file, user }) => {
    console.log("🚀 ~ user:", user);
    console.log("🚀 ~ file:", file);
    console.log("🚀 ~ body:", body);
    try {
      if (body.id !== undefined && body.id !== null && body.id !== "") {
        const files = file != undefined ? file.filename : null;
        const res = await partnerDbController.app.updateownerprofile(
          body,
          files,
          user,
        );
        console.log("🚀 ~ res:", res);
        if (!res) {
          throw Error.SomethingWentWrong();
        }

        return "Owner profile added Successfully";
      } else {
        const files = file != undefined ? file.filename : null;
        const res = await partnerDbController.app.addownerprofile(
          body,
          files,
          user.id,
        );
        if (!res) {
          throw Error.SomethingWentWrong();
        }
        return "Owner profile updated Successfully";
      }
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getownerprofile: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getownerprofile(user.id);

      // If owner profile exists, return it
      if (res) {
        return res;
      }

      // If owner profile doesn't exist, return available data from Store table
      // const storeData = await partnerDbController.app.getstorebyid(user.id);
      const [storeData, address] = await Promise.all([
        partnerDbController.app.getstorebyid(user.id),
        partnerDbController.Models.PartnerAddress.findOne({
          where: { store_id: user.id },
        }),
      ]);

      if (storeData) {
        return {
          id: null,
          name: storeData.name || "",
          email: storeData.email || "",
          phone: storeData.phone || "",
          profile_pic: null,
          country: "",
          country_code: "",
          Dob: null,
          store_id: storeData.id,
          city: address?.city || null,
          createdAt: storeData.createdAt || null,
          updatedAt: storeData.updatedAt || null,
        };
      }

      // If even store data doesn't exist, return empty structure
      return {
        id: null,
        name: "",
        email: "",
        phone: "",
        profile_pic: null,
        country: "",
        city: null,
        country_code: "",
        Dob: null,
        store_id: user.id,
        createdAt: null,
        updatedAt: null,
      };
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getservicecategory: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getservicecategory(user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  editServiceCategory: async ({ body, file, user }) => {
    try {
      const categoryId = body.id;

      const category =
        await partnerDbController.app.getservicecategorybyid(categoryId);

      if (!category) {
        throw Error.NotFound("Service category not found");
      }

      const payload = {
        id: categoryId,
        name: body.name,
        status: body.status,
        image: file || null,
        oldImageKey: body.oldImageKey || null,
      };

      return await partnerDbController.app.editservicecategory(payload);
    } catch (error) {
      console.log("middleware editServiceCategory error:", error);
      throw Error.SomethingWentWrong("Failed to process service category edit");
    }
  },
  totalpayouts: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getwallet(body, user.id);

      const getdata = await partnerDbController.app.getsettlementlogs(
        body,
        user.id,
      );
      if (!getdata) {
        throw Error.SomethingWentWrong();
      }

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return { wallet: res === null ? 0 : res, settlement: getdata };
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addcombinations: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.addcombinations(body, user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      const combo_id = res.id;

      for (const item of body.services) {
        const additems = await partnerDbController.app.addcomboitems(
          item,
          combo_id,
        );
      }

      return "Combo created Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  updatecombinations: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.updatecombinations(
        body,
        user.id,
      );

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      const delelteitems = await partnerDbController.app.deletecomboitems(body);

      for (const item of body.services) {
        const additems = await partnerDbController.app.addcomboitems(
          item,
          body.id,
        );
      }

      return "Combo updated Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  deletecombos: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.deletecombos(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      const deletecombo = await partnerDbController.app.deletecomboitems(body);

      return "Combo deleted Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getcombos: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getcombos(body, user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      // const combo ={}

      // for(const item of res){
      //     if(combo[item.id] === undefined){
      //       combo[item.id] = {
      //          id:item.id,
      //          name:item.combo,
      //          amount:item.amount,
      //          duration:item.duration,
      //          services:[]
      //       }
      //       if(!combo[item.id].services.includes(item.service_id)){
      //          combo[item.id].services.push(item.service_id)
      //       }
      //     }
      // }

      const result = [];

      for (const item of res) {
        const res = await partnerDbController.app.getserviceids(item.id);
        const data = {
          id: item.id,
          name: item.combo,
          amount: item.amount,
          duration: item.duration,
          services: res.map((item) => item.service_id),
        };
        result.push(data);
      }

      return result;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getallcombos: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getcombosall(body, user.id);

      const result = [];

      for (const item of res) {
        const res = await partnerDbController.app.getservicenames(item.id);
        const data = {
          id: item.id,
          name: item.combo,
          amount: item.amount,
          duration: item.duration,
          services: res.map((item) => item.service_name),
        };
        result.push(data);
      }

      return result;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  listservices: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.listservices(body, user.id);

      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  deleteservice: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.deleteserivice(body, user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return "Service deleted Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  updateservice: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.updateservice(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return "Service updated Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addstoretimmings: async ({ body, user }) => {
    try {
      const deletetimmings = await partnerDbController.app.deletetimmings(
        body,
        user.id,
      );

      const res = await partnerDbController.app.addstoretimmings(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return "Store timings added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getstoretimmings: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getstoretimmings(body, user.id);
      if (!res || res.length <= 0) {
        return {};
      }

      return res[0];
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addslots: async ({ body, user }) => {
    console.log("🚀 ~ body:", body);
    try {
      const deletetimmings = await partnerDbController.app.deleteslots(
        body,
        user.id,
      );
      console.log("🚀 ~ deletetimmings:", deletetimmings);

      for (const item of body.slots) {
        console.log("🚀 ~ item:", item);
        const res = await partnerDbController.app.addslots(
          item,
          user.id,
          body?.note,
        );
        console.log("🚀 ~ res:", res);
        if (!res) {
          throw Error.SomethingWentWrong();
        }
      }

      return "slots added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  listservicecategory: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.listservicecategory(
        body,
        user.id,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getstoreaminities: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getstoreaminities(
        body,
        user.id,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addprofessional: async ({ body, user, file }) => {
    try {
      const res = await partnerDbController.app.addproffessional(
        body,
        user.id,
        file.filename,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Professional added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong("unable to add professional");
    }
  },
  updateprofessional: async ({ body, user, file }) => {
    try {
      const res = await partnerDbController.app.updateproffessional(
        body,
        user.id,
        file.filename,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Professional updated Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong("unable to add professional");
    }
  },
  getallcategory: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getallcategory(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  deleteproffesional: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.delelteproffesional(
        body,
        user.id,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Professional deleted Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  getDashboardData: async ({ body }) => {
    try {
      console.log(body.id);

      const isStoreCompleted = await partnerDbController.app.getStoreCompleted(
        body.id,
      );
      console.log(isStoreCompleted.length);
      // if (isStoreCompleted.length === 0)
      //    return null

      const totalEarnings = await partnerDbController.app.getTotalEarnings(
        body.id,
      );
      const todayBookings = await partnerDbController.app.getTodayBookings(
        body.id,
      );
      const completedAppointments =
        await partnerDbController.app.getCompletedAppointments(body.id);
      const pendingAppointments =
        await partnerDbController.app.getPendingAppointments(body.id);

      console.log(
        "GetDashboardData: ",
        totalEarnings,
        todayBookings,
        completedAppointments,
        pendingAppointments,
      );
      return {
        totalEarnings: totalEarnings[0].total_amount,
        totalBookings: totalEarnings[0].bookings,
        todayBookings: todayBookings[0].bookings_today,
        completedAppointments: completedAppointments[0].appointments_completed,
        pendingAppointments: pendingAppointments[0].appointments_pending,
      };
    } catch (error) {
      throw Error.SomethingWentWrong(`Get Dashboard Data ${error}`);
    }
  },

  getallbookings: async ({ body, user }) => {
    try {
      let data = [];

      const appoinments = await partnerDbController.app.getallapoinments(
        body,
        user.id,
      );

      //    appoinments.forEach((item) => {
      //     item.profilepic = JSON.parse(item.profilepic);
      //     item.stylist_profilepic = JSON.parse(item.stylist_profilepic);
      //  })

      const upcomming = [];
      const past = [];

      for (const item of appoinments) {
        if (
          new Date(item.booking_date).setHours(0, 0, 0, 0) >=
          new Date().setHours(0, 0, 0, 0)
        ) {
          item.status = "upcomming";
        } else {
          item.status = "past";
        }
      }

      for (const item of appoinments) {
        const getservices =
          await partnerDbController.app.getservicebyappoinment(item.id);
        const new_data = {
          common_data: item,
          items: getservices,
        };
        if (new_data.common_data.status === "upcomming") {
          upcomming.push(new_data);
        } else {
          past.push(new_data);
        }
      }

      return { upcomming: upcomming, past: past };
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  // this function returns the data based on shop id
  getBookings: async ({ body, query, user }) => {
    try {
      if (!user || !user.id) {
        throw new Error("Unauthorized: storeId missing");
      }

      const storeId = user.id;
      return await partnerDbController.app.getBookings(query, storeId);
    } catch (error) {
      console.error("Middleware Error:", error);
      throw error;
    }
  },

  updatebooking: async ({ body, user }) => {
    try {
      if (
        body.status !== undefined ||
        body.status !== null ||
        body.status !== ""
      ) {
        //////console.log("🚀 ~ updatebooking: ~ body:", body)

        const res = await partnerDbController.app.updatebooking(body, user.id);
        if (!res) {
          throw Error.SomethingWentWrong();
        }
        return "Booking updated Successfully";
      } else {
        const res = await partnerDbController.app.updatebooking_1(
          body,
          user.id,
        );
        if (!res) {
          throw Error.SomethingWentWrong();
        }
        return "Booking updated Successfully";
      }
    } catch (error) {
      //////console.log("🚀 ~ updatebooking: ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  deletereviews: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.deleterequest(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Delete request sent Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  updatestoreimages: async ({ body, user, files }) => {
    try {
      const images = files.images.map((item) => item.filename);

      const res = await partnerDbController.app.updatestoreimages(
        body,
        user.id,
        images,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Store images updated Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  addnewaminities: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.addnewaminities(body, user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Aminities added Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getotalsales: async ({ body, user }) => {
    // try {
    const getstordetails = await partnerDbController.app.getstoredeatils(
      user.id,
    );
    console.log("🚀 ~ getstordetails:", getstordetails);

    await helperfunction.validations.updtaesubscription();

    const res = await helperfunction.validations.updatecopletionpercentage(
      user.id,
    );
    console.log("🚀 ~ res:", res);
    //////console.log("🚀 ~ getotalsales: ~ res:", res)

    if (!getstordetails) {
      throw Error.SomethingWentWrong("Store details not found");
    }

    getstordetails.images = JSON.parse(getstordetails.images);

    if (body.start_date === undefined || body.end_date === undefined) {
      const get_totalsales = await partnerDbController.app.getotalsales(
        body,
        user.id,
      );
      console.log("🚀 ~ get_totalsales:", get_totalsales);

      return {
        get_totalsales: get_totalsales,
        store_details: getstordetails,
        perecentage: res,
      };
    } else {
      const getstordetails = await partnerDbController.app.getstoredeatils(
        user.id,
      );
      console.log("🚀 ~ getstordetails:", getstordetails);

      getstordetails.images = JSON.parse(getstordetails.images);

      if (!getstordetails) {
        throw Error.SomethingWentWrong("Store details not found");
      }

      const get_totalsales = await partnerDbController.app.gettotalsalesbydate(
        body,
        user.id,
      );
      console.log("🚀 ~ get_totalsales:", get_totalsales);
      if (!get_totalsales) {
        return {
          get_totalsales: 0,
          store_details: getstordetails,
          details: [],
        };
      }

      const date_amount =
        await partnerDbController.app.gettotalsalesbydateamount(body, user.id);
      console.log("🚀 ~ date_amount:", date_amount);
      if (!date_amount) {
        throw Error.SomethingWentWrong();
      }

      return {
        get_totalsales: get_totalsales,
        store_details: getstordetails,
        details: date_amount,
        perecentage: res,
      };
    }

    // } catch (error) {
    //    throw Error.SomethingWentWrong();
    // }
  },
  addplans: async ({ body, user }) => {
    try {
      if (body.quantity && body.quantity !== undefined) {
        const plan = await partnerDbController.app.getplan(body, user.id);
        if (!plan) {
          throw Error.SomethingWentWrong("Plan not found");
        } else if (plan.status === "active") {
          const storeplan = await partnerDbController.app.getstoreplan(plan.id);
          if (storeplan && storeplan !== undefined && storeplan !== null) {
            const update_existing_plan =
              await partnerDbController.app.updateexitingplan(storeplan.id);
            if (!update_existing_plan) {
              throw Error.SomethingWentWrong();
            }

            const new_total = parseInt(plan.price) * parseInt(body.quantity);

            const amount = parseInt(new_total) * 100;
            const currency = "INR";
            const res = await razorpay.orders.create({ amount, currency });
            const razorpay_id = res.id;

            const end_date = new Date();
            end_date.setDate(end_date.getDate() + parseInt(plan.days));

            const addplan = await partnerDbController.app.addplan(
              body,
              plan.type,
              user.id,
              end_date,
              plan.id,
              razorpay_id,
              new_total,
            );

            if (!addplan) {
              throw Error.SomethingWentWrong();
            }

            if (!res) {
              throw Error.SomethingWentWrong();
            }

            return { order_id: razorpay_id };
          } else {
            const new_total = parseInt(plan.price) * parseInt(body.quantity);

            const amount = parseInt(new_total) * 100;
            const currency = "INR";
            const res = await razorpay.orders.create({ amount, currency });
            const razorpay_id = res.id;

            const end_date = new Date();
            end_date.setDate(end_date.getDate() + parseInt(plan.days));

            const addplan = await partnerDbController.app.addplan(
              body,
              plan.type,
              user.id,
              end_date,
              plan.id,
              razorpay_id,
              new_total,
            );
            if (plan.type === "range") {
              const new_range = body.quantity * 1000;
              const addrange = await partnerDbController.app.addrangeplan(
                new_range,
                user.id,
              );
            }

            if (!addplan) {
              throw Error.SomethingWentWrong();
            }

            if (!res) {
              throw Error.SomethingWentWrong();
            }

            return { order_id: razorpay_id };
          }
        }
      } else {
        throw Error.SomethingWentWrong("Quantity is required");
      }
    } catch (error) {
      //console.log("🚀 ~ addplans: ~ error:", error)
      throw Error.SomethingWentWrong();
    }
  },
  plansuccess: async ({ body, user }) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        body.response;

      const res = await partnerDbController.app.plansuccess(
        razorpay_order_id,
        razorpay_payment_id,
      );

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      return "Plan purchased Successfully";
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getallimages: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getallimages(body, user.id);
      const new_images = JSON.parse(res.images);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return new_images;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getsubscription: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getsubscription(body, user.id);

      if (!res) {
        throw Error.SomethingWentWrong();
      }

      if (body.type === "range") {
        const getaddress = await partnerDbController.app.getaddress(user.id);

        return { subs: res, address: getaddress };
      }

      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  reviewdetailspage: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getstorereviews(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }

      const total_rating = res.reduce((acc, item) => acc + item.rating, 0);
      const average_rating = total_rating / res.length || 0;
      const review_count = res.length;

      const data = {
        ratings: res,
        average_rating: average_rating,
        review_count: review_count,
      };

      return data;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getbankdetails: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getbankdetails(user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getprofessional: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getproffesional(user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      res.forEach((item) => {
        item.known_services = JSON.parse(item.known_services);
      });

      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  getprofessionalbyid: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getproffesionalbyid(
        body,
        user.id,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      res.forEach((item) => {
        item.known_services = JSON.parse(item.known_services);
      });

      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getslots: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getslots(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getBBslots: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getBBSlots(body, user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  blockAndunblockSlot: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.blockAndUnblockSlotDB(
        body,
        user.id,
      );
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },
  getlocation: async ({ body, user }) => {
    try {
      const result = await partnerDbController.app.getlocationdetails();

      if (!result) {
        throw Error.SomethingWentWrong("Location details not found");
      }
      const locationData = JSON.parse(result.location);

      return locationData;
    } catch (error) {
      console.log("🚀 ~ getlocationdetails:async ~ error:", error);
      throw Error.SomethingWentWrong("Failed to fetch location details");
    }
  },

  // Retrieves students for the given user
  gethirestudents: async ({ body, user }) => {
    try {
      // Passing user.id for future proofing (e.g., filtering by partner preferences)
      const res = await partnerDbController.app.gethirestudents(user.id);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return res;
    } catch (error) {
      throw Error.SomethingWentWrong();
    }
  },

  // Validates the request payload, creates a hire student record in the database
  createhirestudent: async ({ body, user }) => {
    try {
      await PayloadCompiler.compile(body, "createHireStudent");
      const res = await partnerDbController.app.createhirestudent(body);
      if (!res) {
        throw Error.SomethingWentWrong();
      }
      return "Student added successfully";
    } catch (error) {
      if (error instanceof SchemaError) {
        const validationError = error.errors[0];
        let message = `${validationError.instancePath || validationError.dataPath || "Field"} ${validationError.message}`;

        // Custom error message for mobile_number pattern validation
        if (
          (validationError.instancePath === "/mobile_number" ||
            validationError.dataPath === "/mobile_number") &&
          validationError.keyword === "pattern"
        ) {
          message = "Please enter a valid 10-digit mobile number.";
        }

        throw Error.SomethingWentWrong(message);
      }
      throw Error.SomethingWentWrong(error.message);
    }
  },

  //  This function retrieves the bookings for the current day based on the partner's ID.
  //  It first finds the store associated with the partner, then queries the appointments for that store where the booking date is today and the status is either "booked" or "confirmed".
  // The results are ordered by booking date in ascending order.

  getTodayBookingsByStore: async (storeId) => {
    const store = await partnerDbController.app.getStoreById(storeId);

    if (!store) {
      throw new Error("Store not found for this partner");
    }

    return await partnerDbController.app.getTodayBookingsByStoreId(store.id);
  },

  cancelBooking: async ({ query, user }) => {
    try {
      const { appointmentId } = query;

      if (!appointmentId) {
        throw Error.AlreadyExists("appointmentId is required");
      }

      const updated = await partnerDbController.app.cancelBooking(
        appointmentId,
        user.id,
      );

      return updated;
    } catch (error) {
      throw error;
    }
  },

  //This middleware function validates the overview request and calls the database controller for metrics.
  // It extracts the store ID from the authenticated user and ensures a filter type is provided.
  getOverview: async ({ body, user }) => {
    try {
      const { filterType } = body;
      const storeId = user.id;

      if (!filterType) {
        throw Error.BadRequest(
          "filterType (daily, weekly, monthly) is required",
        );
      }

      const metrics = await partnerDbController.app.getOverviewMetrics(
        storeId,
        filterType,
      );

      return metrics;
    } catch (error) {
      console.error("Middleware Error in getOverview:", error);
      throw error;
    }
  },

  // This middleware function fetches service analytics data (breakdown and top earners).
  // It extracts the store ID from the authenticated user and validates the filter type.
  getServiceAnalytics: async ({ body, user }) => {
    try {
      const { filterType } = body;
      const storeId = user.id;

      if (!filterType) {
        throw Error.BadRequest(
          "filterType (daily, weekly, monthly) is required",
        );
      }

      const analytics = await partnerDbController.app.getServiceAnalytics(
        storeId,
        filterType,
      );

      return analytics;
    } catch (error) {
      console.error("Middleware Error in getServiceAnalytics:", error);
      throw error;
    }
  },

  // -------------------------- version 2 ----------------------------

  // version2
  getPlans: async ({ user }) => {
    try {
      // Ensure authenticated user exists
      if (!user || !user.id) {
        throw new Error("Unauthorized access in middleware");
      }

      const plans = await partnerDbController.app.getAllPlans();

      return plans.map((plan) => {
        const isJoiningFee = partnerDbController.app.isJoiningFeePlan(plan);
        return {
          plan_id: plan.plan_id,
          plan_name: plan.plan_name,
          plan_description: plan.description,
          original_price: parseFloat(plan.original_price),
          discount_price: parseFloat(plan.discount_price),
          price_tag: plan.price_tag,
          duration_months: plan.duration_months,
          booking_limit: plan.booking_limit,
          is_unlimited: Boolean(plan.is_unlimited),
          sort_order: plan.sort_order,
          is_joining_fee: isJoiningFee,
          // All plans (Joining Fee, Growth, Premium) use Razorpay Subscriptions autopay.
          supports_autopay: true,
          include_joining_fee_default: false,
          features:
            typeof plan.features === "string"
              ? JSON.parse(plan.features)
              : Array.isArray(plan.features)
                ? plan.features
                : [],
        };
      });
    } catch (error) {
      console.error("Middleware Error in getPlans:", error);
      throw error;
    }
  },

  /**
   * ============================================
   * SALON DETAILS ENDPOINTS (v2)
   * ============================================
   *
   * These endpoints manage comprehensive salon information including:
   * - About section, amenities, team members
   * - Operating hours, slots, images, gallery
   * - Social media links, rating, verification status
   *
   * All fields are optional for PATCH updates (partial updates supported)
   */

  /**
   * Helper: Parse JSON fields that may come as strings or objects
   * Safely converts JSON strings to objects for consistency
   *
   * @param {string|object|undefined} value - The value to parse
   * @returns {object|array|undefined} Parsed value or undefined if invalid
   */
  _parseJsonField: (value) => {
    // Return undefined for null/empty values (optional field handling)
    if (value === undefined || value === null || value === "") return undefined;

    // Already an object, return as-is
    if (typeof value === "object") return value;

    // Optional: If it looks like a comma-separated string (no [ or {)
    // but contains commas, don't try to JSON.parse it if it's likely just IDs
    if (
      typeof value === "string" &&
      !value.includes("[") &&
      !value.includes("{") &&
      value.includes(",")
    ) {
      return value; // _syncAmenities will split this later
    }

    // Try to parse JSON string
    try {
      return JSON.parse(value);
    } catch (_err) {
      // If parsing fails, return the original value (might be a simple string or single ID)
      return value;
    }
  },

  /**
   * Helper: Build clean payload by removing undefined fields
   * Ensures only provided fields are sent to the database
   *
   * @param {object} payload - The data object to clean
   * @returns {object} Cleaned payload with no undefined values
   */
  _buildCleanPayload: (payload) => {
    const cleanPayload = {};
    Object.keys(payload).forEach((key) => {
      if (payload[key] !== undefined) {
        cleanPayload[key] = payload[key];
      }
    });
    return cleanPayload;
  },

  /**
   * GET /v2/store-details
   * Fetch complete salon details with all related data
   *
   * Returns:
   * - Basic salon info (about, phone, email, social media, etc.)
   * - Amenities with details
   * - Active stylists/team members
   * - Operating slots grouped by day
   * - Images and gallery
   *
   * @param {object} req - Express request object containing user info
   * @throws {ApplicationError} If store not found or unauthorized
   * @returns {object} Formatted salon details response
   */
  getSalonDetailsv2: async ({ user }) => {
    try {
      // ====================
      // 1. VALIDATE USER
      // ====================
      const storeId = user?.id;
      if (!storeId) {
        throw Error.Unauthorized("Invalid partner authentication");
      }

      // ====================
      // 2. DATABASE CALL
      // ====================
      // All database logic (fetching, joining, filtering) is handled by the DB controller
      // Middleware is only responsible for orchestration and passing to controller
      const result = await partnerDbController.app.getSalonDetailsv2(storeId);

      // ====================
      // 3. RETURN FORMATTED RESPONSE
      // ====================
      // Return structured data using the v2 formatter to remove extra DB fields (otp, password, etc)
      return formatSalonDetailsV2(result);
    } catch (error) {
      console.error("❌ [Middleware] getSalonDetailsv2:", error.message);
      throw error;
    }
  },

  /**
   * POST /v2/store-details
   * Create or initialize salon details (first-time setup)
   *
   * Handles:
   * - Multipart form data with images and gallery
   * - JSON field parsing for complex objects
   * - File management through existing middleware
   *
   * @param {object} req - Express request with body, user, files
   * @throws {ApplicationError} If validation fails or DB error
   * @returns {object} Created salon details
   */
  createSalonDetailsv2: async ({ body, user, files }) => {
    try {
      // ====================
      // 1. VALIDATE USER
      // ====================
      const storeId = user?.id;
      if (!storeId) {
        throw Error.Unauthorized("Invalid partner authentication");
      }

      // ====================
      // 2. BUILD PAYLOAD
      // ====================
      // Parse all JSON fields and handle file uploads
      const payload = {
        about: body.about,
        amenities: partnerappmiddleware.addstore._parseJsonField(
          body.amenities,
        ),
        team_members: partnerappmiddleware.addstore._parseJsonField(
          body.team_members,
        ),
        operating_hours: partnerappmiddleware.addstore._parseJsonField(
          body.operating_hours,
        ),
        phone: body.phone,
        email: body.email,
        website: body.website,
        social_media: partnerappmiddleware.addstore._parseJsonField(
          body.social_media,
        ),
        rating: body.rating !== undefined ? parseFloat(body.rating) : undefined,
        reviews_count:
          body.reviews_count !== undefined
            ? parseInt(body.reviews_count, 10)
            : undefined,
        is_verified:
          body.is_verified !== undefined
            ? Boolean(body.is_verified)
            : undefined,
      };

      // ====================
      // 3. HANDLE FILE UPLOADS
      // ====================
      // Images from multipart upload
      if (files?.images) {
        payload.images = files.images.map((file) => file.filename);
      } else if (body.images) {
        const parsedImages = partnerappmiddleware.addstore._parseJsonField(
          body.images,
        );
        if (Array.isArray(parsedImages)) payload.images = parsedImages;
      }

      // Gallery images from multipart upload
      if (files?.gallery) {
        payload.gallery = files.gallery.map((file) => file.filename);
      } else if (body.gallery) {
        const parsedGallery = partnerappmiddleware.addstore._parseJsonField(
          body.gallery,
        );
        if (Array.isArray(parsedGallery)) payload.gallery = parsedGallery;
      }

      // ====================
      // 4. CLEAN PAYLOAD & PERSIST
      // ====================
      // Remove undefined fields before passing to DB
      const cleanPayload =
        partnerappmiddleware.addstore._buildCleanPayload(payload);

      // Delegate to DB controller (create or update)
      const result = await partnerDbController.app.createOrUpdateSalonDetails(
        storeId,
        cleanPayload,
      );

      return result;
    } catch (error) {
      console.error("❌ [Middleware] createSalonDetailsv2:", error.message);
      throw error;
    }
  },

  /**
   * PATCH /v2/store/update
   * Partial update of salon details (all fields optional)
   *
   * Key Features:
   * - Only provided fields are updated
   * - Existing data remains unchanged if not provided
   * - Images replace (not append) - send full list for replacement
   *
   * @param {object} req - Express request with body, user, files
   * @throws {ApplicationError} If validation fails or DB error
   * @returns {object} Updated salon details
   */
  updateSalonDetailsv2: async ({ body, user, files }) => {
    try {
      // ====================
      // 1. VALIDATE USER
      // ====================
      const storeId = user?.id;
      if (!storeId) {
        throw Error.Unauthorized("Invalid partner authentication");
      }

      // ====================
      // 2. BUILD PARTIAL PAYLOAD
      // ====================
      // Only parse fields that are actually provided (for true partial updates)
      const payload = {
        name: body.name,
        store_type: body.store_type,
        team_size: body.team_size,
        income: body.income,
        docs: body.docs,
        bank_account_holder: body.bank_account_holder,
        account_number: body.account_number,
        completion_status: body.completion_status,
        ifsc_code: body.ifsc_code,
        status: body.status,
        category_id: partnerappmiddleware.addstore._parseJsonField(
          body.category_id,
        ),
        wallet_remaining: body.wallet_remaining,
        description: body.description,
        deviceId: body.deviceId,
        about: body.about,
        amenities:
          body.amenities !== undefined
            ? partnerappmiddleware.addstore._parseJsonField(body.amenities)
            : undefined,
        team_members:
          body.team_members !== undefined
            ? partnerappmiddleware.addstore._parseJsonField(body.team_members)
            : undefined,
        operating_hours:
          body.operating_hours !== undefined
            ? partnerappmiddleware.addstore._parseJsonField(
                body.operating_hours,
              )
            : undefined,
        phone: body.phone,
        email: body.email,
        website: body.website,
        social_media:
          body.social_media !== undefined
            ? partnerappmiddleware.addstore._parseJsonField(body.social_media)
            : undefined,
        rating: body.rating !== undefined ? parseFloat(body.rating) : undefined,
        reviews_count:
          body.reviews_count !== undefined
            ? parseInt(body.reviews_count, 10)
            : undefined,
        is_verified:
          body.is_verified !== undefined
            ? Boolean(body.is_verified)
            : undefined,
        logo: body.logo,
        salon_image: body.salon_image,
        services_provided_for: partnerappmiddleware.addstore._parseJsonField(
          body.services_provided_for,
        ),
        languages: partnerappmiddleware.addstore._parseJsonField(
          body.languages,
        ),
        referral_id: body.referral_id,
      };

      // ====================
      // 3. HANDLE FILE UPLOADS (REPLACE MODE)
      // ====================
      // New images replace old ones (not append)
      if (files?.images) {
        payload.images = files.images.map((file) => file.filename);
      } else if (body.images) {
        const parsedImages = partnerappmiddleware.addstore._parseJsonField(
          body.images,
        );
        if (Array.isArray(parsedImages)) payload.images = parsedImages;
      }

      // Handle Stylist Image Uploads (File mapping)
      // If team_members is a JSON string/array, match provided profilepic to uploaded files
      if (
        payload.team_members &&
        Array.isArray(payload.team_members) &&
        files?.stylist_images
      ) {
        payload.team_members = payload.team_members.map((member) => {
          if (member.profilepic || member.profilePic) {
            const requestedFile = member.profilepic || member.profilePic;
            // Check if this member's profilepic matches an original filename in uploaded files
            const uploadedFile = files.stylist_images.find(
              (f) => f.originalname === requestedFile,
            );
            if (uploadedFile) {
              member.profilepic = `/upload/profileimage/${uploadedFile.filename}`;
              member.profilePic = `/upload/profileimage/${uploadedFile.filename}`;
            }
          }
          return member;
        });
      }

      // New gallery replaces old (not append)
      if (files?.gallery) {
        payload.gallery = files.gallery.map((file) => file.filename);
      } else if (body.gallery) {
        const parsedGallery = partnerappmiddleware.addstore._parseJsonField(
          body.gallery,
        );
        if (Array.isArray(parsedGallery)) payload.gallery = parsedGallery;
      }

      // 4. CLEAN & PERSIST
      const cleanPayload =
        partnerappmiddleware.addstore._buildCleanPayload(payload);

      // Delegate to DB controller (partial update)
      await partnerDbController.app.updateSalonDetailsv2(storeId, cleanPayload);

      // 5. FETCH COMPLETE FRESH DATA
      // Fetch full details (stylists, slots, amenities) to avoid N+1 issues
      // and ensure the response is comprehensive.
      const freshDetails =
        await partnerDbController.app.getSalonDetailsv2(storeId);

      // Return structured data using the v2 formatter to remove extra DB fields
      return formatSalonDetailsV2(freshDetails);
    } catch (error) {
      console.error("❌ [Middleware] updateSalonDetailsv2:", error.message);
      throw error;
    }
  },

  // POST /partner/app/v2/subscription/createorder
  createSubscriptionOrder: async ({ body, user }) => {
    try {
      const { plan_id } = body;
      const salon_id = user.id;

      if (!plan_id) throw Error.BadRequest("plan_id is required");

      const plan = await partnerDbController.app.getActivePlan(plan_id);
      console.log(
        "📦 [createOrder] Plan fetched:",
        plan?.plan_id,
        "discount_price:",
        plan?.discount_price,
      );

      if (!plan) throw Error.BadRequest("Invalid or inactive plan");

      const activeSub =
        await partnerDbController.app.getPartnerSubscription(salon_id);

      if (
        activeSub &&
        activeSub.plan_id === plan_id &&
        activeSub.payment_status === "paid"
      ) {
        throw Error.BadRequest("Already subscribed");
      }

      const existingPending =
        await partnerDbController.app.getPendingSubscription(salon_id, plan_id);

      // Plan prices are GST-inclusive (UI: "Includes 18% GST").
      // Do not add 18% again — that caused ₹99 → ₹116.82.
      const totalAmount = parseFloat(plan.discount_price || 0);
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw Error.BadRequest("Invalid plan price");
      }
      const gstRate = 0.18;
      const basePrice = parseFloat((totalAmount / (1 + gstRate)).toFixed(2));
      const taxAmount = parseFloat((totalAmount - basePrice).toFixed(2));

      const amountPaise = Math.round(totalAmount * 100);
      console.log(
        "💰 [createOrder] inclusive total:",
        totalAmount,
        "base (ex-GST):",
        basePrice,
        "tax (included):",
        taxAmount,
        "paise:",
        amountPaise,
      );

      if (existingPending) {
        if (
          Math.abs(parseFloat(existingPending.amount_paid) - totalAmount) < 0.01
        ) {
          return existingPending;
        }
      }

      const rzpOrder = await razorpay.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: `sub_${salon_id}_${plan_id}_${Date.now()}`,
      });
      console.log("✅ [createOrder] Razorpay order created:", rzpOrder.id);

      const newSub = await partnerDbController.app.createSubscriptionWithOrder({
        salon_id,
        plan,
        razorpay_order_id: rzpOrder.id,
        amount: totalAmount,
      });

      return {
        ...(newSub.toJSON ? newSub.toJSON() : newSub),
        total_tax: taxAmount,
        total_amount: totalAmount,
        base_price: basePrice,
      };
    } catch (error) {
      console.error("❌ [createOrder] Error:", error.message || error);
      throw error;
    }
  },

  // middleware
  createRecurringSubscription: async ({ body, user }) => {
    try {
      const { plan_id } = body;
      const salon_id = user.id;

      if (!plan_id) throw Error.BadRequest("plan_id is required");
      if (!process.env.RZ_PAY_ID || !process.env.RZ_PAY_KEY) {
        throw Error.SomethingWentWrong(
          "Payment provider is not configured. Please try again later."
        );
      }

      let plan = await partnerDbController.app.getActivePlan(plan_id);
      if (!plan) throw Error.BadRequest("Invalid or inactive plan");

      const plainPlan = plan.toJSON ? plan.toJSON() : plan;

      // Prefer dashboard plan ids from env (Joining/Growth/Premium), else sync/create.
      let razorpayPlanId = resolveRazorpayPlanId(plainPlan);
      try {
        if (razorpayPlanId) {
          await linkRazorpayPlanIdToDb(plainPlan, razorpayPlanId);
        } else {
          razorpayPlanId = await ensurePlanSyncedToRazorpay(plainPlan);
          plan = await partnerDbController.app.getActivePlan(plan_id);
        }
      } catch (syncError) {
        console.error(
          "[createRecurring] plan sync failed:",
          syncError?.message || syncError
        );
        throw Error.SomethingWentWrong(
          "Unable to prepare subscription plan for payments. Please try again later."
        );
      }

      const syncedPlan = plan.toJSON ? plan.toJSON() : plan;
      razorpayPlanId =
        razorpayPlanId ||
        resolveRazorpayPlanId(syncedPlan) ||
        syncedPlan.razorpay_plan_id;
      if (!razorpayPlanId) {
        throw Error.BadRequest(
          "Plan not synced to Razorpay. Set GROWTH/PREMIUM/JOINING_FEE_RAZORPAY_PLAN_ID or run plan sync."
        );
      }

      const activeSub =
        await partnerDbController.app.getPartnerSubscription(salon_id);
      if (
        activeSub &&
        activeSub.is_active &&
        activeSub.payment_status === "paid" &&
        activeSub.razorpay_subscription_id
      ) {
        throw Error.BadRequest("Already subscribed to an active auto-pay plan");
      }

      const store = await partnerDbController.app.getstorebyid(salon_id);
      if (!store) throw Error.BadRequest("Store not found");

      let customerId;
      try {
        customerId =
          await partnerDbController.app.getOrCreateRazorpayCustomer(store);
      } catch (customerError) {
        console.error(
          "[createRecurring] Razorpay customer error:",
          customerError?.message || customerError
        );
        throw Error.SomethingWentWrong(
          "Unable to create payment customer. Please try again later."
        );
      }

      // Reuse a pending Created subscription instead of spamming new ones
      const existingPending =
        await partnerDbController.app.getPendingSubscription(
          salon_id,
          syncedPlan.plan_id
        );
      if (existingPending?.razorpay_subscription_id) {
        try {
          const existingRzp = await razorpay.subscriptions.fetch(
            existingPending.razorpay_subscription_id
          );
          if (existingRzp?.status === "created") {
            console.log(
              `[createRecurring] Reusing pending sub ${existingRzp.id}`
            );
            return {
              subscription_id: existingRzp.id,
              razorpay_key: process.env.RZ_PAY_ID,
              razorpay_customer_id: customerId,
              db_record_id: existingPending.subscription_id,
            };
          }
        } catch (fetchError) {
          console.warn(
            "[createRecurring] pending sub fetch failed, creating new:",
            fetchError?.message || fetchError
          );
        }
      }

      const subscriptionPayload = {
        plan_id: razorpayPlanId,
        customer_id: customerId,
        customer_notify: 1,
        total_count: 120, // Razorpay requires a cap; partner can cancel anytime
        quantity: 1,
      };

      let rzpSubscription;
      try {
        rzpSubscription =
          await razorpay.subscriptions.create(subscriptionPayload);
      } catch (rzpError) {
        console.error(
          "[createRecurring] Razorpay subscriptions.create failed:",
          rzpError?.error || rzpError?.message || rzpError
        );
        throw Error.SomethingWentWrong(
          rzpError?.error?.description ||
            "Failed to create auto-pay subscription. Please try again."
        );
      }

      const baseAmount = parseFloat(
        syncedPlan.discount_price ?? syncedPlan.price ?? 0
      );
      const record = await partnerDbController.app.createSubscriptionRecord({
        salon_id,
        plan_id: syncedPlan.plan_id,
        razorpay_subscription_id: rzpSubscription.id,
        razorpay_customer_id: customerId,
        rzp_status: rzpSubscription.status, // "created"
        total_count: rzpSubscription.total_count,
        payment_status: "pending",
        is_active: false,
        amount_paid: baseAmount,
      });

      return {
        subscription_id: rzpSubscription.id, // pass this to Razorpay Checkout on the frontend
        razorpay_key: process.env.RZ_PAY_ID,
        razorpay_customer_id: customerId,
        db_record_id: record.subscription_id,
      };
    } catch (error) {
      if (error?.status) throw error;
      console.error(
        "[createRecurring] unexpected error:",
        error?.message || error
      );
      throw Error.SomethingWentWrong(
        error?.message || "Failed to create recurring subscription"
      );
    }
  },

  // POST /partner/app/v2/subscription/verifypayment
  verifySubscriptionPayment: async ({ body, user }) => {
    try {
      const {
        subscription_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = body;
      const salon_id = user.id;

      if (!subscription_id || !razorpay_order_id) {
        throw Error.BadRequest(
          "subscription_id and razorpay_order_id are required",
        );
      }

      const subscription = await partnerDbController.app.getSubscription(
        subscription_id,
        salon_id,
      );

      if (!subscription) throw Error.BadRequest("Subscription not found");

      if (subscription.payment_status === "paid") {
        return { success: true, message: "Already verified", is_premium: true };
      }

      if (subscription.razorpay_order_id !== razorpay_order_id) {
        throw Error.BadRequest("Order ID mismatch");
      }

      // Verify Razorpay signature when payment fields are present (production clients send them)
      if (razorpay_payment_id && razorpay_signature) {
        if (!process.env.RZ_PAY_KEY) {
          throw Error.SomethingWentWrong("Payment verification is not configured");
        }
        const expected = crypto
          .createHmac("sha256", process.env.RZ_PAY_KEY)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest("hex");
        if (expected !== razorpay_signature) {
          throw Error.BadRequest("Invalid payment signature");
        }
      } else {
        throw Error.BadRequest(
          "razorpay_payment_id and razorpay_signature are required"
        );
      }

      // ✅ Activate subscription + insert payment record
      const updatedSubscription =
        await partnerDbController.app.activateSubscription({
          subscription_id,
          salon_id,
          razorpay_payment_id,
          razorpay_signature,
        });
      console.log(
        "✅ [verifyPayment] Subscription activated:",
        subscription_id,
      );

      // ✅ Update store is_premium
      const updatedStore = await partnerDbController.app.updatestore(salon_id);
      console.log("✅ [verifyPayment] Store is_premium updated:", updatedStore);

      return {
        success: true,
        data: updatedSubscription,
        is_premium: true,
        message: "Payment marked as successful",
      };
    } catch (error) {
      console.error("❌ [verifyPayment] Error:", error.message || error);
      throw error;
    }
  },
  verifyRecurringSubscription: async ({ body, user }) => {
    try {
      const {
        razorpay_payment_id,
        razorpay_subscription_id,
        razorpay_signature,
      } = body;

      if (
        !razorpay_payment_id ||
        !razorpay_subscription_id ||
        !razorpay_signature
      ) {
        throw Error.BadRequest(
          "razorpay_payment_id, razorpay_subscription_id and razorpay_signature are required"
        );
      }

      if (!process.env.RZ_PAY_KEY) {
        throw Error.SomethingWentWrong("Payment verification is not configured");
      }

      const expected = crypto
        .createHmac("sha256", process.env.RZ_PAY_KEY)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest("hex");

      if (expected !== razorpay_signature) {
        throw Error.BadRequest("Invalid subscription signature");
      }

      const local = await partnerDbController.app.getSubscriptionByRzpId(
        razorpay_subscription_id
      );
      if (!local || Number(local.salon_id) !== Number(user.id)) {
        throw Error.BadRequest("Subscription not found");
      }

      // Idempotent: already activated (e.g. webhook raced ahead)
      if (local.payment_status === "paid" && local.is_active) {
        await partnerDbController.app.updatestore(user.id);
        return {
          success: true,
          already_verified: true,
          is_premium: true,
        };
      }

      let sub;
      try {
        sub = await razorpay.subscriptions.fetch(razorpay_subscription_id);
      } catch (fetchError) {
        console.error(
          "[verifyRecurring] fetch failed:",
          fetchError?.message || fetchError
        );
        throw Error.SomethingWentWrong(
          "Unable to confirm subscription with payment provider"
        );
      }

      await partnerDbController.app.verifyRecurringSubscriptionRecord(
        razorpay_subscription_id,
        user.id,
        sub
      );
      await partnerDbController.app.updatestore(user.id);

      return { success: true, is_premium: true };
    } catch (error) {
      if (error?.status) throw error;
      console.error(
        "[verifyRecurring] unexpected error:",
        error?.message || error
      );
      throw Error.SomethingWentWrong(
        error?.message || "Failed to verify recurring subscription"
      );
    }
  },
  listServiceCategoryV2: async (req) => {
    try {
      const query = req.query || {};
      const user = req.user;
      // Ensure authenticated user exists
      if (!user || !user.id) {
        throw Error.AuthenticationFailed("Unauthorized access in middleware");
      }

      // pagination
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 10, 50);
      const offset = (page - 1) * limit;

      const order = [["id", "DESC"]];

      const { rows, count } =
        await partnerDbController.app.listServiceCategoryV2({
          limit,
          offset,
          order,
        });
      console.log(rows);

      return {
        meta: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
        items: rows,
      };
    } catch (error) {
      console.log("middleware error", error.message);
      throw Error.SomethingWentWrong(error.message);
    }
  },

  /**
   * @description Fetches the services list for the partner (v2).
   * Supports optional search, category filters, and sorting.
   */
  listServicesV2: async ({ query, user }) => {
    console.log("⚡ [v2/listServices] Fetching services for user:", user.id);

    try {
      // 1. Basic pagination and filter setup
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 12, 50);

      const options = {
        search: query.search || null,
        category_id: query.category_id || null,
        sortBy: query.sortBy || "id",
        order: query.order || "DESC",
        page,
        limit,
      };

      // 2. Fetch data from logic-heavy DB service
      const data = await partnerDbController.app.listServicesV2(
        user.id,
        options,
      );

      // 3. Transform data using structural ResponseFormatter
      const { formatServicesListV2 } =
        await import("../../core/services/ResponseFormatter.js");

      return formatServicesListV2({
        summary: data.summary,
        categoryStats: data.categoryStats,
        services: data.services,
        pagination: {
          total: data.total,
          page,
          limit,
          totalPages: Math.ceil(data.total / limit),
        },
      });
    } catch (error) {
      console.error("❌ [v2/listServices] Standardized Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  /**
   * @description Adds a new service (v2).
   * Handles duration conversion and strict validation.
   */
  addServiceV2: async ({ body, user }) => {
    console.log("⚡ [v2/addService] Request for user:", user.id);

    try {
      // 1. Mandatory Validation
      const requiredFields = [
        "service_name",
        "service_category",
        "amount",
        "duration",
        "service_for",
      ];
      for (const field of requiredFields) {
        if (!body[field]) {
          throw Error.BadRequest(`Missing mandatory field: ${field}`);
        }
      }

      // 2. Duration Conversion (e.g., "1.5h" -> "01:30:00")
      const convertDuration = (dur) => {
        if (!dur) return "00:30:00";
        dur = dur.toLowerCase().trim();
        if (dur.includes("h")) {
          const hours = parseFloat(dur.replace("h", ""));
          const h = Math.floor(hours);
          const m = Math.round((hours - h) * 60);
          return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
        } else if (dur.includes("m")) {
          const mins = parseInt(dur.replace("m", ""));
          return `00:${mins.toString().padStart(2, "0")}:00`;
        }
        return dur; // Already in format?
      };

      // 3. Payload preparation
      const servicePayload = {
        store_id: user.id, // Assuming user.id corresponds to store_id in this context
        service_name: body.service_name,
        service_category: parseInt(body.service_category),
        amount: parseFloat(body.amount),
        discounted_amount: body.discounted_amount
          ? parseFloat(body.discounted_amount)
          : null,
        duration: convertDuration(body.duration),
        service_for: body.service_for, // 'male', 'female', 'unisex'
        status:
          body.status !== undefined
            ? body.status
              ? "active"
              : "inactive"
            : "active",
      };

      // 4. Persistence
      const newService =
        await partnerDbController.app.addServiceV2(servicePayload);

      return newService;
    } catch (error) {
      console.error("❌ [v2/addService] Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  /**
   * @description Updates an existing service (v2).
   * Supports partial updates and handles duration conversion.
   */
  updateServiceV2: async ({ body, user }) => {
    console.log(
      "⚡ [v2/updateService] Request for user:",
      user.id,
      "Service ID:",
      body.id,
    );

    try {
      // 1. Mandatory ID
      if (!body.id) {
        throw Error.BadRequest("Missing service ID for update");
      }

      // 2. Duration Conversion Helper
      const convertDuration = (dur) => {
        if (!dur) return null;
        dur = dur.toLowerCase().trim();
        if (dur.includes("h")) {
          const hours = parseFloat(dur.replace("h", ""));
          const h = Math.floor(hours);
          const m = Math.round((hours - h) * 60);
          return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
        } else if (dur.includes("m")) {
          const mins = parseInt(dur.replace("m", ""));
          return `00:${mins.toString().padStart(2, "0")}:00`;
        }
        return dur;
      };

      // 3. Build partial update payload
      const updatePayload = {};
      if (body.service_name) updatePayload.service_name = body.service_name;
      if (body.service_category)
        updatePayload.service_category = parseInt(body.service_category);
      if (body.amount) updatePayload.amount = parseFloat(body.amount);
      if (body.discounted_amount !== undefined)
        updatePayload.discounted_amount = body.discounted_amount
          ? parseFloat(body.discounted_amount)
          : null;
      if (body.duration)
        updatePayload.duration = convertDuration(body.duration);
      if (body.service_for) updatePayload.service_for = body.service_for;
      if (body.status !== undefined)
        updatePayload.status = body.status ? "active" : "inactive";

      // 4. Persistence
      return await partnerDbController.app.updateServiceV2(
        body.id,
        user.id,
        updatePayload,
      );
    } catch (error) {
      console.error("❌ [v2/updateService] Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  createEnquiry: async ({ body }) => {
    try {
      const { name, state, email, phone, message } = body;
      console.log("Received enquiry:", body);
      if (!name || !email) {
        throw Error.BadRequest("Name and email are required");
      }
      return await partnerDbController.app.createEnquiry({
        name,
        state,
        email,
        phone,
        message,
      });
    } catch (error) {
      console.error("❌ [Middleware Error] createEnquiry:", error);
      throw error;
    }
  },

  // POST /partner/app/v2/subscription/verifypayment
  verifySubscriptionPayment: async ({ body, user }) => {
    try {
      const {
        subscription_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = body;
      const salon_id = user.id;

      if (!subscription_id || !razorpay_order_id) {
        throw Error.BadRequest(
          "subscription_id and razorpay_order_id are required",
        );
      }

      // Get subscription
      const subscription = await partnerDbController.app.getSubscription(
        subscription_id,
        salon_id,
      );

      if (!subscription) throw Error.BadRequest("Subscription not found");

      if (subscription.payment_status === "paid") {
        return { success: true, message: "Already verified" };
      }

      // 🔒 Basic validation (don’t skip this even in dev)
      if (subscription.razorpay_order_id !== razorpay_order_id) {
        throw Error.BadRequest("Order ID mismatch");
      }

      // ❌ SKIPPED: signature verification (crypto removed)
      // const generatedSignature = crypto
      //    .createHmac("sha256", process.env.RZ_PAY_KEY)
      //    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      //    .digest("hex");

      // if (generatedSignature !== razorpay_signature) {
      //    throw Error("Invalid signature");
      // }
      // ✅ Directly activate
      const updatedSubscription =
        await partnerDbController.app.activateSubscription({
          subscription_id,
          salon_id,
          razorpay_payment_id: razorpay_payment_id,
          razorpay_signature: razorpay_signature,
        });

      return {
        success: true,
        data: updatedSubscription,
        message: "Payment marked as successful",
      };
    } catch (error) {
      console.log(error.message);
      throw error.message;
    }
  },
  listServiceCategoryV2: async (req) => {
    try {
      const query = req.query || {};
      const user = req.user;
      // Ensure authenticated user exists
      if (!user || !user.id) {
        throw Error.AuthenticationFailed("Unauthorized access in middleware");
      }

      // pagination
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 10, 50);
      const offset = (page - 1) * limit;

      const order = [["id", "DESC"]];

      const { rows, count } =
        await partnerDbController.app.listServiceCategoryV2({
          limit,
          offset,
          order,
        });
      console.log(rows);

      return {
        meta: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
        items: rows,
      };
    } catch (error) {
      console.log("middleware error", error.message);
      throw Error.SomethingWentWrong(error.message);
    }
  },

  /**
   * @description Fetches the services list for the partner (v2).
   * Supports optional search, category filters, and sorting.
   */
  listServicesV2: async ({ query, user }) => {
    console.log("⚡ [v2/listServices] Fetching services for user:", user.id);

    try {
      // 1. Basic pagination and filter setup
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 12, 50);

      const options = {
        search: query.search || null,
        category_id: query.category_id || null,
        sortBy: query.sortBy || "id",
        order: query.order || "DESC",
        page,
        limit,
      };

      // 2. Fetch data from logic-heavy DB service
      const data = await partnerDbController.app.listServicesV2(
        user.id,
        options,
      );

      // 3. Transform data using structural ResponseFormatter
      const { formatServicesListV2 } =
        await import("../../core/services/ResponseFormatter.js");

      return formatServicesListV2({
        summary: data.summary,
        categoryStats: data.categoryStats,
        services: data.services,
        pagination: {
          total: data.total,
          page,
          limit,
          totalPages: Math.ceil(data.total / limit),
        },
      });
    } catch (error) {
      console.error("❌ [v2/listServices] Standardized Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  /**
   * @description Adds a new service (v2).
   * Handles duration conversion and strict validation.
   */
  addServiceV2: async ({ body, user }) => {
    console.log("⚡ [v2/addService] Request for user:", user.id);

    try {
      // 1. Mandatory Validation
      const requiredFields = [
        "service_name",
        "service_category",
        "amount",
        "duration",
        "service_for",
      ];
      for (const field of requiredFields) {
        if (!body[field]) {
          throw Error.BadRequest(`Missing mandatory field: ${field}`);
        }
      }

      // 2. Duration Conversion (e.g., "1.5h" -> "01:30:00")
      const convertDuration = (dur) => {
        if (!dur) return "00:30:00";
        dur = dur.toLowerCase().trim();
        if (dur.includes("h")) {
          const hours = parseFloat(dur.replace("h", ""));
          const h = Math.floor(hours);
          const m = Math.round((hours - h) * 60);
          return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
        } else if (dur.includes("m")) {
          const mins = parseInt(dur.replace("m", ""));
          return `00:${mins.toString().padStart(2, "0")}:00`;
        }
        return dur; // Already in format?
      };

      // 3. Payload preparation
      const servicePayload = {
        store_id: user.id, // Assuming user.id corresponds to store_id in this context
        service_name: body.service_name,
        service_category: parseInt(body.service_category),
        amount: parseFloat(body.amount),
        discounted_amount: body.discounted_amount
          ? parseFloat(body.discounted_amount)
          : null,
        duration: convertDuration(body.duration),
        service_for: body.service_for, // 'male', 'female', 'unisex'
        status:
          body.status !== undefined
            ? body.status
              ? "active"
              : "inactive"
            : "active",
      };

      // 4. Persistence
      const newService =
        await partnerDbController.app.addServiceV2(servicePayload);

      return newService;
    } catch (error) {
      console.error("❌ [v2/addService] Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  /**
   * @description Updates an existing service (v2).
   * Supports partial updates and handles duration conversion.
   */
  updateServiceV2: async ({ body, user }) => {
    console.log(
      "⚡ [v2/updateService] Request for user:",
      user.id,
      "Service ID:",
      body.id,
    );

    try {
      // 1. Mandatory ID
      if (!body.id) {
        throw Error.BadRequest("Missing service ID for update");
      }

      // 2. Duration Conversion Helper
      const convertDuration = (dur) => {
        if (!dur) return null;
        dur = dur.toLowerCase().trim();
        if (dur.includes("h")) {
          const hours = parseFloat(dur.replace("h", ""));
          const h = Math.floor(hours);
          const m = Math.round((hours - h) * 60);
          return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
        } else if (dur.includes("m")) {
          const mins = parseInt(dur.replace("m", ""));
          return `00:${mins.toString().padStart(2, "0")}:00`;
        }
        return dur;
      };

      // 3. Build partial update payload
      const updatePayload = {};
      if (body.service_name) updatePayload.service_name = body.service_name;
      if (body.service_category)
        updatePayload.service_category = parseInt(body.service_category);
      if (body.amount) updatePayload.amount = parseFloat(body.amount);
      if (body.discounted_amount !== undefined)
        updatePayload.discounted_amount = body.discounted_amount
          ? parseFloat(body.discounted_amount)
          : null;
      if (body.duration)
        updatePayload.duration = convertDuration(body.duration);
      if (body.service_for) updatePayload.service_for = body.service_for;
      if (body.status !== undefined)
        updatePayload.status = body.status ? "active" : "inactive";

      // 4. Persistence
      return await partnerDbController.app.updateServiceV2(
        body.id,
        user.id,
        updatePayload,
      );
    } catch (error) {
      console.error("❌ [v2/updateService] Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  deleteServiceV2: async ({ body, user }) => {
    console.log(
      "⚡ [v2/deleteService] Request for user:",
      user.id,
      "Service ID:",
      body.id,
    );
    try {
      if (!body.id) {
        throw Error.BadRequest("Missing service ID");
      }
      return await partnerDbController.app.deleteServiceV2(body.id, user.id);
    } catch (error) {
      console.error("❌ [v2/deleteService] Error:", error.message);
      throw error.status ? error : Error.SomethingWentWrong(error.message);
    }
  },

  createEnquiry: async ({ body }) => {
    try {
      const { name, state, email, phone, message } = body;
      console.log("Received enquiry:", body);
      if (!name || !email) {
        throw Error.BadRequest("Name and email are required");
      }
      return await partnerDbController.app.createEnquiry({
        name,
        state,
        email,
        phone,
        message,
      });
    } catch (error) {
      console.error("❌ [Middleware Error] createEnquiry:", error);
      throw error;
    }
  },

  getownerprofileV2: async ({ body, user }) => {
    console.log("🔍 [Middleware] user:", user);
    try {
      const res = await partnerDbController.app.getownerprofileV2(user.id);

      // If owner profile exists, return it (formatted to clean data)
      if (res) {
        return formatOwnerProfileV2(res);
      }

      // If owner profile doesn't exist yet, return available data from Store, Address, and Subscriptions
      const [storeData, address, activeSubscription] = await Promise.all([
        partnerDbController.app.getstorebyid(user.id),
        partnerDbController.Models.PartnerAddress.findOne({
          where: { store_id: user.id },
        }),
        partnerDbController.app.getactiveplansV2({ store_id: user.id }),
      ]);

      if (storeData) {
        const rawData = {
          id: storeData.id,
          name: storeData.name || "",
          email: storeData.email || "",
          phone: storeData.phone || "",
          profile_pic: null,
          country: "",
          country_code: "",
          Dob: null,
          store_id: storeData.id,
          city: address?.city || null,
          is_premium: storeData.is_premium,
          partnersubscription: activeSubscription,
          active_plan: activeSubscription
            ? {
                ...(activeSubscription.plan?.get
                  ? activeSubscription.plan.get({ plain: true })
                  : activeSubscription.plan),
                start_date: activeSubscription.start_date,
                end_date: activeSubscription.end_date,
              }
            : null,
          createdAt: storeData.createdAt,
          updatedAt: storeData.updatedAt,
        };
        return formatOwnerProfileV2(rawData);
      }

      // If even store data doesn't exist, return empty structure with possible subscription info
      const emptyData = {
        id: null,
        name: "",
        email: "",
        phone: "",
        profile_pic: null,
        country: "",
        city: null,
        country_code: "",
        Dob: null,
        store_id: user.id,
        // partnersubscription: activeSubscription,
        // active_plan: activeSubscription ? {
        //   ...(activeSubscription.plan?.get ? activeSubscription.plan.get({ plain: true }) : activeSubscription.plan),
        //   start_date: activeSubscription.start_date,
        //   end_date: activeSubscription.end_date
        // } : null,
        // createdAt: null,
        // updatedAt: null,
      };
      return formatOwnerProfileV2(emptyData);
    } catch (error) {
      console.error("❌ [Middleware] getownerprofileV2 Error:", error);
      throw Error.SomethingWentWrong(error.message);
    }
  },
  getaminitiesV2: async ({ body, user }) => {
    try {
      const res = await partnerDbController.app.getaminitiesV2();
      return res;
    } catch (error) {
      console.error("❌ [Middleware] getaminitiesV2 Error:", error);
      throw Error.SomethingWentWrong(error.description || error.message);
    }
  },

  addbankdetailsv2: async ({ body, store_id }) => {
    try {
      const res = await partnerDbController.app.addbankdetailsv2({
        body,
        store_id,
      });
      console.log("✅ [Middleware] addbankdetailsv2 Result:", res);
      return res.JSON ? res.JSON() : res;
    } catch (error) {
      console.error("❌ [Middleware] addbankdetailsV2 Error:", error);
      throw Error.SomethingWentWrong(error.description || error.message);
    }
  },
};
