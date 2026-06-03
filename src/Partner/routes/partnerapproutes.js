import { Router } from "express";
import require from "requirejs";
import { partnerauthenticate } from "../controller/partnerauthcontroller.js";
const rateLimit = require("express-rate-limit");
import {
  imageSizeMiddleware,
  profileimage,
  upload,
} from "../../core/utils/imageResizer.js";
import {
  addaminities,
  addbankdetails,
  updateSalonDetailsv2,
  getSalonDetailsv2,
  addcombinations,
  AddNewAminities,
  addnewaminities,
  addownerprofile,
  addplans,
  addprofessional,
  addslots,
  addstoreservices,
  addstoretimmings,
  createhirestudent,
  createstore,
  deletecombos,
  deleteproffesional,
  deletereviews,
  deleteserivice,
  getactivesubs,
  getallaminities,
  getallbookings,
  getallcategory,
  getallcombos,
  getallimages,
  getallnotification,
  getbankdetails,
  getbanner,
  getcombos,
  getDashboardData,
  gethirestudents,
  getlocation,
  getotalsales,
  getownerprofile,
  getproffesional,
  getproffesionalbyid,
  getservicecategory,
  editServiceCategory,
  getslots,
  getstoreaminities,
  getstoredetails,
  getstoretimmings,
  getsubscription,
  gettransactionlogs,
  listservicecategory,
  listservices,
  plansuccess,
  reviewdetailspage,
  totalpayouts,
  updatebookings,
  updatecombinations,
  updateproffesional,
  updateservice,
  updateStore,
  updatestoreimages,
  getBannerWithColor,
  getTodayBookings,
  getBookings,
  cancelBooking,
  blockAndUnblockSlot,
  getBBslots,
  getOverview,
  getServiceAnalytics,
  getPlans,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  listServiceCategoryV2,
  createStoreV2,
  updateStoreV2,
  listServicesV2,
  addServiceV2,
  updateServiceV2,
  createEnquiry,
  getownerprofileV2,
  deleteServiceV2,
  getaminitiesV2,
  addbankdetailsv2,
  onboardingsalon,
} from "../controller/partnerappcontroller.js";
import { approutes } from "../../User/routes/userapproutes.js";
import { partnerDbController } from "../../core/database/Controller/partnerDbController.js";

import { S3upload } from "../../core/utils/s3/s3Upload.js";
// const fs = require('fs');
// const path = require('path');

export const appRoutes = Router();

// appRoutes.post("/createstore", (req, res, next) => {
//   console.log("➡️ /createstore HIT");
//   next();
// }, partnerauthenticate, upload.fields([
//   { name: 'images', maxCount: 4 },
//   { name: 'documents', maxCount: 1 }
// ]), imageSizeMiddleware, createstore);

// const uploadDir = path.join(__dirname, '../assets/Original');

// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }
appRoutes.post(
  "/createstore",
  partnerauthenticate,
  upload.fields([
    { name: "images", maxCount: 6 },
    { name: "documents", maxCount: 1 },
  ]),
  imageSizeMiddleware,
  createstore,
);
appRoutes.post("/updateStore", partnerauthenticate, updateStore);

appRoutes.post("/addbankdetails", partnerauthenticate, addbankdetails);

appRoutes.post("/addstoreservices", partnerauthenticate, addstoreservices);
appRoutes.post("/addaminities", partnerauthenticate, addaminities);
appRoutes.post("/addcombos", partnerauthenticate, addcombinations);
appRoutes.post("/updatecombos", partnerauthenticate, updatecombinations);
appRoutes.post("/deletecombos", partnerauthenticate, deletecombos);
appRoutes.post("/getcombosbyid", partnerauthenticate, getcombos);
appRoutes.post("/getallcombos", partnerauthenticate, getallcombos);
appRoutes.post("/listservices", partnerauthenticate, listservices);
appRoutes.post("/deleteservice", partnerauthenticate, deleteserivice);
appRoutes.post("/updateservice", partnerauthenticate, updateservice);
appRoutes.post("/addstoretimmings", partnerauthenticate, addstoretimmings);
appRoutes.post("/getstoretimmings", partnerauthenticate, getstoretimmings);
appRoutes.post("/addslots", partnerauthenticate, addslots);
appRoutes.post(
  "/listservicecategories",
  partnerauthenticate,
  listservicecategory,
);

appRoutes.post(
  "/blockAndUnblockSlots",
  partnerauthenticate,
  blockAndUnblockSlot,
);

appRoutes.post("/getstoreaminities", partnerauthenticate, getstoreaminities);
appRoutes.post(
  "/addprofessional",
  partnerauthenticate,
  upload.single("profilepic"),
  profileimage,
  addprofessional,
);
appRoutes.post("/getbanketails", partnerauthenticate, getbankdetails);
appRoutes.post("/getslots", partnerauthenticate, getslots);
appRoutes.post("/getBBslots", partnerauthenticate, getBBslots);
appRoutes.post("/getproffesional", partnerauthenticate, getproffesional);
appRoutes.post(
  "/getprofessionalbyid",
  partnerauthenticate,
  getproffesionalbyid,
);
appRoutes.post(
  "/updateproffesional",
  partnerauthenticate,
  upload.single("profilepic"),
  profileimage,
  updateproffesional,
);
appRoutes.post("/getallcategory", partnerauthenticate, getallcategory);
appRoutes.post("/deleteproffesional", partnerauthenticate, deleteproffesional);

appRoutes.get("/getLocation", getlocation);

appRoutes.post("/getallbookings", partnerauthenticate, getallbookings);
appRoutes.post("/updatebookings", partnerauthenticate, updatebookings);
appRoutes.post("/deletereview", partnerauthenticate, deletereviews);
appRoutes.post("/reviewdetailspage", partnerauthenticate, reviewdetailspage);
appRoutes.post(
  "/updatepics",
  partnerauthenticate,
  upload.fields([{ name: "images", maxCount: 4 }]),
  imageSizeMiddleware,
  updatestoreimages,
);
appRoutes.post("/addaminities", partnerauthenticate, addnewaminities);
appRoutes.post("/gettotalsales", partnerauthenticate, getotalsales);
appRoutes.post("/addplans", partnerauthenticate, addplans);
appRoutes.post("/plansuccess", partnerauthenticate, plansuccess);
appRoutes.post("/getallimages", partnerauthenticate, getallimages);
appRoutes.post("/getsubscription", partnerauthenticate, getsubscription);
appRoutes.post(
  "/addownerprofile",
  partnerauthenticate,
  upload.single("profilepic"),
  profileimage,
  addownerprofile,
);
appRoutes.post("/getownerprofile", partnerauthenticate, getownerprofile);
appRoutes.post("/getservicecategory", partnerauthenticate, getservicecategory);
appRoutes.post("/editservicecategory", S3upload.single("image"), editServiceCategory);
appRoutes.post("/totalpayouts", partnerauthenticate, totalpayouts);
appRoutes.post("/getallnotification", partnerauthenticate, getallnotification);
appRoutes.post("/getactivesubs", partnerauthenticate, getactivesubs);
appRoutes.post("/gettransactionlogs", partnerauthenticate, gettransactionlogs);

appRoutes.post("/getstoresdetails", partnerauthenticate, getstoredetails);
appRoutes.post("/AddNewAminities", partnerauthenticate, AddNewAminities);
appRoutes.post("/getallaminities", partnerauthenticate, getallaminities);
appRoutes.post("/getbanner", getbanner);
// New route for fetching banner with color
appRoutes.get("/banner-with-color", getBannerWithColor);
appRoutes.post("/gethirestudents", partnerauthenticate, gethirestudents);
appRoutes.post("/createhirestudent", partnerauthenticate, createhirestudent);
appRoutes.post("/getDashboardData", getDashboardData);
// New route for today's bookings
appRoutes.post("/today-bookings", getTodayBookings);
// New route for bookings with filters
appRoutes.get("/getbookings", partnerauthenticate, getBookings);
appRoutes.patch("/cancel-booking", partnerauthenticate, cancelBooking);

// Overview metrics endpoint
appRoutes.post("/getOverview", partnerauthenticate, getOverview);
appRoutes.post(
  "/getServiceAnalytics",
  partnerauthenticate,
  getServiceAnalytics,
);

// appRoutes.post("/getallservices",partnerauthenticate,)

// -------------------------- version 2 ----------------------------

appRoutes.get("/getplans", partnerauthenticate, getPlans);

// Subscription Order Flow (v2)
appRoutes.post(
  "/v2/subscription/createorder",
  partnerauthenticate,
  createSubscriptionOrder,
);
appRoutes.post(
  "/v2/subscription/verifypayment",
  partnerauthenticate,
  verifySubscriptionPayment,
);
appRoutes.get(
  "/v2/service-categories",
  partnerauthenticate,
  listServiceCategoryV2,
);

// --- v2 Store APIs ---
appRoutes.post(
  "/v2/createstore",
  partnerauthenticate,
  S3upload.fields([
    { name: "images", maxCount: 6 },
    { name: "documents", maxCount: 1 },
    { name: "logo", maxCount: 1 },
  ]),
  createStoreV2,
);
appRoutes.post(
  "/v2/onboardingsalon",
  partnerauthenticate,
  S3upload.fields([
    { name: "images", maxCount: 6 },
    { name: "documents", maxCount: 1 },
    { name: "logo", maxCount: 1 },
  ]),
  onboardingsalon,
);

appRoutes.post(
  "/v2/updatestore",
  partnerauthenticate,
  S3upload.fields([
    { name: "images", maxCount: 6 },
    { name: "documents", maxCount: 1 },
    { name: "logo", maxCount: 1 },
  ]),
  updateStoreV2,
);

// Salon details endpoints
appRoutes.patch(
  "/v2/store/update",
  partnerauthenticate,
  upload.fields([
    { name: "images", maxCount: 6 },
    { name: "gallery", maxCount: 12 },
    { name: "stylist_images", maxCount: 10 },
  ]),
  imageSizeMiddleware,
  updateSalonDetailsv2,
);
appRoutes.get("/v2/store-details", partnerauthenticate, getSalonDetailsv2);

appRoutes.get("/v2/services", partnerauthenticate, listServicesV2);
appRoutes.post("/v2/addservices", partnerauthenticate, addServiceV2);
appRoutes.patch("/v2/updateservices", partnerauthenticate, updateServiceV2);
appRoutes.delete("/v2/deleteservices", partnerauthenticate, deleteServiceV2);
appRoutes.post("/v2/enquiry", createEnquiry);
appRoutes.get("/v2/getownerprofile", partnerauthenticate, getownerprofileV2);

appRoutes.get("/v2/getaminities", partnerauthenticate, getaminitiesV2);
appRoutes.patch("/v2/addbankdetails", partnerauthenticate, addbankdetailsv2);
