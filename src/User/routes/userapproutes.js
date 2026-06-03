import { Router } from "express";
import require from "requirejs";
const rateLimit = require("express-rate-limit");
import { UserAuthenticate, WebAuthenticate, OptionalUserAuthenticate } from "../controller/userauthcontroller.js";
import { upload, profileimage } from "../../core/utils/imageResizer.js";
import { addfavourites, addreview, addtocart, getAllSalons, toggleFavourite, getFavourites, getTopSalons, getMapMarkersClustered, addwallet, create_order_wallet, createorder, deletefavourites, deletereview, deleteuser, getactiveactivecoupons, getallappoinments, getallcategory, getallreview, getallstores, getbanner, getfavourites, getinvitecode, getnearbystores, getnotification, getprofile, getslotsbydate, getstorebycategory, getstorebyid, getstorebysearch, getstorebyservices, gettransactions, getwalletamount, initiaterefund, paymentsucssess, topsaloons, updatebooking, updaterating, validatecoupon, verifyinvitecode, createInternalOrder, createRazorpayOrder, getnearbystoresv2, getBannerV2, fetchAllCategoryV2, getstoredetailsv2, getactivecouponv2, addGuestDetails, getGuestDetails, getSlotStatusV2, getReviewsV2, updateReviewV2, deleteReviewV2, getProfileV2, updateProfileV2, deleteUserV2, updateGuestDetails, createOrderV2, createRazorpayOrderV2, paymentsuccessV2, getTopCategoryServicesBySex, getStoresByServiceCategory } from "../controller/userappcontroller.js";
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


approutes.post("/getuserprofile", UserAuthenticate, getprofile);
approutes.post("/getallstores", getallstores);
approutes.post("/addfavourites", UserAuthenticate, addfavourites);
approutes.post("/getfavourites", UserAuthenticate, getfavourites);
approutes.post('/deletefavourites', UserAuthenticate, deletefavourites);
approutes.post("/getstorebyid", getstorebyid); // Webauth
approutes.post("/getslotbydate", getslotsbydate);
approutes.post("/addtocart", UserAuthenticate, addtocart);
approutes.post("/createorder", UserAuthenticate, createorder);
// Create Razorpay order
approutes.post("/createinternalorder", UserAuthenticate, createInternalOrder);
// Razorpay order
approutes.post("/createrazorpayorder", UserAuthenticate, createRazorpayOrder);
// Payment success
approutes.post("/paymentsucssess", UserAuthenticate, paymentsucssess);
approutes.post("/getallapointments", UserAuthenticate, getallappoinments);
approutes.post("/getstorebycategory", getstorebycategory);
approutes.post("/getallcategory", getallcategory);
approutes.post("/deletuser", UserAuthenticate, deleteuser);
approutes.post("/topsaloons", topsaloons);
approutes.post("/getactivecoupons", UserAuthenticate, getactiveactivecoupons);
approutes.post('/validatecoupon', UserAuthenticate, validatecoupon);
approutes.post("/getstorebysearch", getstorebysearch);
approutes.post("/getstorebyservices", UserAuthenticate, getstorebyservices);


//wallet
approutes.post("/create_order_wallet", UserAuthenticate, create_order_wallet);
approutes.post("/addwallet", UserAuthenticate, addwallet);
approutes.post("/getwalletamout", UserAuthenticate, getwalletamount);
approutes.post("/getnearbystores", getnearbystores);
// approutes.post()


// approutes.post("/addwallet",UserAuthenticate);


//review
approutes.post("/addreview", UserAuthenticate, addreview);
approutes.post("/getallreview", UserAuthenticate, getallreview);
approutes.post("/updaterating", UserAuthenticate, updaterating);
approutes.post("/deletereview", UserAuthenticate, deletereview);

// approutes.post("/getsaloon")

// invivte code
approutes.post("/getinvitedcode", UserAuthenticate, getinvitecode);
approutes.post("/verifyinvitecode", UserAuthenticate, verifyinvitecode);

//initiate refuund 
approutes.post("/initiaterefund", UserAuthenticate, initiaterefund);
approutes.post('/gettrasactions', UserAuthenticate, gettransactions);
approutes.post('/updatebooking', UserAuthenticate, updatebooking);
approutes.post('/getnotification', WebAuthenticate, getnotification);
approutes.post("/getbanner", getbanner);
// approutes.post('/adddata',)
// approutes.post("/addaminities",UserAuthenticate,addaminities);

// version 2 
approutes.get('/v2/getbanner', getBannerV2);
// store nearby, top store, all stores, store details
approutes.post("/v2/store/nearby", OptionalUserAuthenticate, getnearbystoresv2);
approutes.get("/v2/get-all-stores", OptionalUserAuthenticate, getAllSalons);
approutes.get("/v2/salons/top", OptionalUserAuthenticate, getTopSalons);
approutes.post("/v2/salons/map-markers-clustered", OptionalUserAuthenticate, getMapMarkersClustered);
approutes.post("/v2/store/details", getstoredetailsv2);
approutes.post("/v2/services/top-categories", getTopCategoryServicesBySex);
approutes.post("/v2/stores/by-category", getStoresByServiceCategory);
// Favourites
approutes.post("/v2/favourites", UserAuthenticate, toggleFavourite);
approutes.get("/v2/favourites", UserAuthenticate, getFavourites);
// all category , active coupons
approutes.get("/v2/getallcategory", fetchAllCategoryV2);
approutes.get("/v2/get/activecoupons", UserAuthenticate, getactivecouponv2);
// get slot satus
approutes.get("/v2/getslotstatus", getSlotStatusV2);
// Reviews 
approutes.get("/v2/reviews", UserAuthenticate, getReviewsV2);
approutes.patch("/v2/reviews", UserAuthenticate, updateReviewV2);
approutes.delete("/v2/reviews", UserAuthenticate, deleteReviewV2);

// booking for someone
approutes.post("/v2/guest/add", UserAuthenticate, addGuestDetails);
approutes.get("/v2/guest/all", UserAuthenticate, getGuestDetails);
approutes.patch("/v2/guest/update", UserAuthenticate, updateGuestDetails);
approutes.get('/v2/guest',UserAuthenticate,)

// Profile
approutes.get("/v2/profile", UserAuthenticate, getProfileV2);
approutes.patch("/v2/profile", UserAuthenticate, upload.single("profilePic"), profileimage, updateProfileV2);
approutes.delete("/v2/profile", UserAuthenticate, deleteUserV2);
approutes.post("/v2/createorder", UserAuthenticate, createOrderV2);
approutes.post("/v2/paymentsuccess", UserAuthenticate, paymentsuccessV2);

// Razorpay & Wallet V2
approutes.post("/v2/create-razorpay-order", UserAuthenticate, createRazorpayOrderV2);
