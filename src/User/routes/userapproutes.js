import { Router } from "express";
import require from "requirejs";
const rateLimit = require("express-rate-limit");
import { UserAuthenticate, WebAuthenticate, OptionalUserAuthenticate } from "../controller/userauthcontroller.js";
import { upload, profileimage } from "../../core/utils/imageResizer.js";
import { addfavourites, addreview, addtocart, getAllSalons, toggleFavourite, getFavourites, getTopSalons, getMapMarkersClustered, addwallet, create_order_wallet, createorder, deletefavourites, deletereview, deleteuser, getactiveactivecoupons, getallappoinments, getallcategory, getallreview, getallstores, getbanner, getfavourites, getinvitecode, getnearbystores, getnotification, getprofile, getslotsbydate, getstorebycategory, getstorebyid, getstorebysearch, getstorebyservices, gettransactions, getwalletamount, initiaterefund, paymentsucssess, topsaloons, updatebooking, updaterating, validatecoupon, verifyinvitecode, createInternalOrder, createRazorpayOrder, getnearbystoresv2, getBannerV2, fetchAllCategoryV2, getstoredetailsv2, getactivecouponv2, addGuestDetails, getGuestDetails, getSlotStatusV2, getStoreHolidaysV2, getReviewsV2, updateReviewV2, deleteReviewV2, getProfileV2, updateProfileV2, deleteUserV2, updateGuestDetails, createOrderV2, createRazorpayOrderV2, paymentsuccessV2, cancelPendingOrderV2, getTopCategoryServicesBySex, getStoresByServiceCategory, userHeartbeat, saveLocationV2, getPendingReviewsV2, saveAppEventsV2, saveAttributionV2, saveFeedbackV2 } from "../controller/userappcontroller.js";
import { trackScreen } from "../../core/utils/appUsageTracker.js";
import { appRoutes } from "../../Partner/routes/partnerapproutes.js";
import { User } from "../../core/database/models/User.js";
import { addaminities } from "../../Partner/controller/partnerappcontroller.js";

// getstorebyid - image is only file-name
// distance_m only 0 value
// favourites - only true

// Install Git

// Clone backend server api:
// git clone --branch DEV https://github.com/GloupDev/Gloup-Backend.git

// If it asks for your account, try following the steps it shows or search online.
// Use the account that we added into Gloup organization.

// Clone frontend admin panel application:
// git clone --branch DEV https://github.com/GloupDev/Gloup-AdminPanel.git

// You do not need to test the API to see if it works, just upload the backend API to AWS and inform in group with the access url.
// To get the AWS credentials go to aws console and login with root email - gloupdevelopers@gmail.com and ask/msg me for authentication code.

// If you really want to test the API, just run the AdminPanel app and login with - gloup@gmail.com && Gloup@2025 as pass

export const approutes = Router();

// trackScreen(name) logs a screen view for the logged-in user after the
// response (admin Click & Interaction / Behavior analytics). It changes
// nothing about the route itself. The salon list doubles as search.
const searchOrList = (req) => (req.query?.search ? "search" : "salon_list");



approutes.post("/getuserprofile", UserAuthenticate, trackScreen("profile"), getprofile);
approutes.post("/getallstores", trackScreen("salon_list"), getallstores);
approutes.post("/addfavourites", UserAuthenticate, addfavourites);
approutes.post("/getfavourites", UserAuthenticate, getfavourites);
approutes.post('/deletefavourites', UserAuthenticate, deletefavourites);
approutes.post("/getstorebyid", OptionalUserAuthenticate, trackScreen("salon_details"), getstorebyid); // Webauth
approutes.post("/getslotbydate", trackScreen("slots"), getslotsbydate);
approutes.post("/addtocart", UserAuthenticate, addtocart);
approutes.post("/createorder", UserAuthenticate, trackScreen("checkout"), createorder);
// Create Razorpay order
approutes.post("/createinternalorder", UserAuthenticate, trackScreen("checkout"), createInternalOrder);
// Razorpay order
approutes.post("/createrazorpayorder", UserAuthenticate, trackScreen("payment"), createRazorpayOrder);
// Payment success
approutes.post("/paymentsucssess", UserAuthenticate, trackScreen("payment_success"), paymentsucssess);
approutes.post("/getallapointments", UserAuthenticate, trackScreen("bookings"), getallappoinments);
approutes.post("/getstorebycategory", trackScreen("salon_list"), getstorebycategory);
approutes.post("/getallcategory", trackScreen("home"), getallcategory);
approutes.post("/deletuser", UserAuthenticate, deleteuser);
approutes.post("/topsaloons", trackScreen("home"), topsaloons);
approutes.post("/getactivecoupons", UserAuthenticate, trackScreen("offers"), getactiveactivecoupons);
approutes.post('/validatecoupon', UserAuthenticate, validatecoupon);
approutes.post("/getstorebysearch", trackScreen("search"), getstorebysearch);
approutes.post("/getstorebyservices", UserAuthenticate, trackScreen("salon_list"), getstorebyservices);


//wallet
approutes.post("/create_order_wallet", UserAuthenticate, create_order_wallet);
approutes.post("/addwallet", UserAuthenticate, addwallet);
approutes.post("/getwalletamout", UserAuthenticate, trackScreen("wallet"), getwalletamount);
approutes.post("/getnearbystores", trackScreen("home"), getnearbystores);
// approutes.post()


// approutes.post("/addwallet",UserAuthenticate);


//review
approutes.post("/addreview", UserAuthenticate, addreview);
approutes.post("/getallreview", UserAuthenticate, trackScreen("reviews"), getallreview);
approutes.post("/updaterating", UserAuthenticate, updaterating);
approutes.post("/deletereview", UserAuthenticate, deletereview);

// approutes.post("/getsaloon")

// invivte code
approutes.post("/getinvitedcode", UserAuthenticate, getinvitecode);
approutes.post("/verifyinvitecode", UserAuthenticate, verifyinvitecode);

//initiate refuund 
approutes.post("/initiaterefund", UserAuthenticate, initiaterefund);
approutes.post('/gettrasactions', UserAuthenticate, trackScreen("wallet"), gettransactions);
approutes.post('/updatebooking', UserAuthenticate, updatebooking);
approutes.post('/getnotification', WebAuthenticate, trackScreen("notifications"), getnotification);
approutes.post("/getbanner", trackScreen("home"), getbanner);
// approutes.post('/adddata',)
// approutes.post("/addaminities",UserAuthenticate,addaminities);

// version 2 
approutes.get('/v2/getbanner', trackScreen("home"), getBannerV2);
// store nearby, top store, all stores, store details
approutes.post("/v2/store/nearby", OptionalUserAuthenticate, trackScreen("home"), getnearbystoresv2);
approutes.get("/v2/get-all-stores", OptionalUserAuthenticate, trackScreen(searchOrList), getAllSalons);
approutes.get("/v2/salons/top", OptionalUserAuthenticate, trackScreen("home"), getTopSalons);
approutes.post("/v2/salons/map-markers-clustered", OptionalUserAuthenticate, trackScreen("map"), getMapMarkersClustered);
approutes.post("/v2/store/details", OptionalUserAuthenticate, trackScreen("salon_details"), getstoredetailsv2);
approutes.post("/v2/services/top-categories", trackScreen("home"), getTopCategoryServicesBySex);
approutes.post("/v2/stores/by-category", trackScreen("salon_list"), getStoresByServiceCategory);
// Favourites
approutes.post("/v2/favourites", UserAuthenticate, toggleFavourite);
approutes.get("/v2/favourites", UserAuthenticate, trackScreen("favourites"), getFavourites);
// all category , active coupons
approutes.get("/v2/getallcategory", trackScreen("home"), fetchAllCategoryV2);
approutes.get("/v2/get/activecoupons", UserAuthenticate, trackScreen("offers"), getactivecouponv2);
// get slot satus
approutes.get("/v2/getslotstatus", trackScreen("slots"), getSlotStatusV2);
approutes.get("/v2/store/holidays", getStoreHolidaysV2);
// Reviews 
approutes.get("/v2/reviews", UserAuthenticate, trackScreen("reviews"), getReviewsV2);
approutes.get("/v2/pending-reviews", UserAuthenticate, getPendingReviewsV2);
approutes.patch("/v2/reviews", UserAuthenticate, updateReviewV2);
approutes.delete("/v2/reviews", UserAuthenticate, deleteReviewV2);

// booking for someone
approutes.post("/v2/guest/add", UserAuthenticate, addGuestDetails);
approutes.get("/v2/guest/all", UserAuthenticate, getGuestDetails);
approutes.patch("/v2/guest/update", UserAuthenticate, updateGuestDetails);
approutes.get('/v2/guest', UserAuthenticate,)

// Profile
approutes.get("/v2/profile", UserAuthenticate, trackScreen("profile"), getProfileV2);
approutes.patch("/v2/profile", UserAuthenticate, upload.single("profilePic"), profileimage, updateProfileV2);
approutes.delete("/v2/profile", UserAuthenticate, deleteUserV2);
approutes.post("/v2/createorder", UserAuthenticate, trackScreen("checkout"), createOrderV2);
approutes.post("/v2/paymentsuccess", UserAuthenticate, trackScreen("payment_success"), paymentsuccessV2);
approutes.post("/v2/cancel-pending-order", UserAuthenticate, cancelPendingOrderV2);

// Razorpay & Wallet V2
approutes.post("/v2/create-razorpay-order", UserAuthenticate, trackScreen("payment"), createRazorpayOrderV2);

// Heartbeat — app lifecycle tracking for active-user counts
approutes.post("/v2/heartbeat", UserAuthenticate, userHeartbeat);

// Location — live GPS or a manually picked place; bookings snapshot it.
// Body: { lat, lng, source: "live" | "manual" }
approutes.post("/v2/location", UserAuthenticate, saveLocationV2);

// App analytics (Flutter). Headers X-App-Version / X-Platform are read too.
// Body: { events: [{ type, screen, element, x, y, at, ... }] } - up to 200 per batch
approutes.post("/v2/events", UserAuthenticate, saveAppEventsV2);
// Body: { source, medium, campaign, referrer } - first report per user wins
approutes.post("/v2/attribution", UserAuthenticate, saveAttributionV2);
// Body: { type: checkout_exit | account_delete | cancel_booking | other, reason, note, appointment_id, store_id }
approutes.post("/v2/feedback", UserAuthenticate, saveFeedbackV2);
