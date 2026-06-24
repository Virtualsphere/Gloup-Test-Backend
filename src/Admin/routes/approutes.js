import { Router } from "express";
import require from "requirejs";
const rateLimit = require("express-rate-limit");
import { verifyadmin } from "../controller/authcontroller.js";
import { upload, categoryupload, bannerupload, bannerimage, profileimage, imageSizeMiddleware, categoryimage } from "../../core/utils/imageResizer.js";
import { addbanner, bookingSSE, addcategory, addcoupons, addnotification, sendTargetedNotification, getnotificationbyid, addpayouts, addsubscription, createPartner, createService, deletebanner, deletecategory, deletePartner, deletereviewrequest, editPartner, editService,getAdvancedSearch, getallcategory, getallcoupons, getallnotification, getallpartner, getallpartnerdetails, getallsubscription, getalluserbooking, getallusers, getbanner,getBookings, getCancelledOrders, getCategoryRevenue, getCustomers, getdashboard,getFilteredStores, getFilterReport, getMonthlyReport, getpayoutlogs, getrefundrequests, getRegisteredStore, getRevenueCategory, getRevenueCategoryGrowth, getreviewrequest,getSalons, getservices, getStoreBySearch, getStoresByStatus, getTopPerformingSalon, updatecoupons, updateMultiplePartner, updateMultipleStore, updatepartner, updaterefundrequests,updatereviewrequest, updateSalon, updatesubscription, updateuser, getverifyPartnerlist,verifypartnerdetails, getBookingsDetails, getBookingsDetailsById, updatebookingstatus, downloadBookingPDF,updaterefundBooking, getservicecategorylist, updateservicecategoryimage, createdefaulttimeslot, blockAndUnblockSlot, getBlockedSlots,getlanguage, getserviceprovidedfor, getallpartnersubscription, getpartnersubscriptionbyid, updatepartnersubscription, deletepartnersubscription, addpartnersubscription, getallpartnersubscriptionfeatures, deleteservice } from "../controller/adminappcontroller.js";
import { getservicecategory } from "../../Partner/controller/partnerappcontroller.js";
import { S3upload } from "../../core/utils/s3/s3Upload.js";
import { broadcastNewBooking } from "../../core/utils/sseManager.js";




export const approutes = Router();

approutes.post("/getallusers", verifyadmin, getallusers);
approutes.post("/addsubscription", verifyadmin, addsubscription);
approutes.post("/updateuser", verifyadmin, updateuser);
approutes.post("/getalluserdeatils", verifyadmin, getalluserbooking);
approutes.post("/getallpartner", verifyadmin, getallpartner);
approutes.post("/getallpartnerdetails", verifyadmin, getallpartnerdetails);
approutes.post("/getrefundrequets", verifyadmin, getrefundrequests);

//maddy
approutes.post("/updatesubscription", verifyadmin, updatesubscription);
approutes.post("/updatepartner", verifyadmin, updatepartner);
approutes.post("/updateMultiplePartner", verifyadmin, updateMultiplePartner);
approutes.post("/deletePartner", verifyadmin, deletePartner);
//approutes.post("/createpartner", verifyadmin, upload.fields([{ name: 'images', maxCount: 6 }, { name: 'documents', maxCount: 2 }, { name: "logo", maxCount: 1 }]), imageSizeMiddleware, createPartner);
// approutes.post('/editpartner', verifyadmin, upload.fields([{ name: 'images', maxCount: 6 }, { name: 'documents', maxCount: 2 }, { name: "logo", maxCount: 1 }]), imageSizeMiddleware, editPartner);
approutes.post("/createpartner", verifyadmin, S3upload.fields([{ name: 'images', maxCount: 15 }, { name: 'documents', maxCount: 5 }, { name: "logo", maxCount: 1 }]), createPartner);
approutes.post('/editpartner', verifyadmin, S3upload.fields([{ name: 'images', maxCount: 15 }, { name: 'documents', maxCount: 5 }, { name: "logo", maxCount: 1 }]), editPartner);
approutes.post('/getpartnerverification/:id', verifyadmin, verifypartnerdetails);
approutes.post('/getverifypartner', verifyadmin, getverifyPartnerlist);

// services
approutes.post('/createservice', verifyadmin, createService);
approutes.post('/editservice', verifyadmin, editService);
approutes.post('/getservicecategorylist', verifyadmin, getservicecategorylist);
approutes.post('/updateservicecategoryimage', verifyadmin, S3upload.single('image'), updateservicecategoryimage);
approutes.post("/getservices", verifyadmin, getservices);
approutes.post("/deleteservice", verifyadmin, deleteservice);

// TimeSlot
approutes.post('/generateDefaultSlots', verifyadmin, createdefaulttimeslot);
approutes.post('/blockandunblockslot', verifyadmin, blockAndUnblockSlot);
approutes.post('/getblockedslots', verifyadmin, getBlockedSlots);
approutes.post('/getlanguagelist', verifyadmin, getlanguage);
approutes.post('/getserviceprovidedforoptions', verifyadmin, getserviceprovidedfor);

approutes.post('/updaterefundrequest', verifyadmin, updaterefundrequests);
// approutes.post('/getallsubscription',verifyadmin,getallsubscription);

approutes.post('/getallsubscriptions', verifyadmin, getallsubscription);

// approutes.post("/getpost",)
approutes.post('/addpayout', verifyadmin, addpayouts);

// banner 
approutes.post('/addbanner', verifyadmin, S3upload.array('image', 10), addbanner);
approutes.post('/getactivebanner', verifyadmin, getbanner);
approutes.post('/deletebanner', verifyadmin, deletebanner);

// category  
approutes.post("/addcategory", verifyadmin, S3upload.single('image'), categoryimage, addcategory);
//approutes.post("/addcategory", verifyadmin, addcategory);
approutes.post("/getallcategory", verifyadmin, getallcategory);
approutes.post("/deletecategory", verifyadmin, deletecategory);

//notification 
approutes.post('/addnotification', verifyadmin, addnotification);
approutes.post('/send-targeted-notification', verifyadmin, sendTargetedNotification);
approutes.post('/getalnotification', verifyadmin, getallnotification);
approutes.post('/getnotificationbyid', verifyadmin, getnotificationbyid);

//reviews 
// approutes.post('/getrefundrequestrequest',verifyadmin,deletereviewrequest);
approutes.post('/getreviewrequest', verifyadmin, getreviewrequest);
approutes.post('/updatereviewrequest', verifyadmin, updatereviewrequest);

// Partner subscription
approutes.post('/getallpartnersubscription', verifyadmin, getallpartnersubscription);
approutes.post('/getpartnersubscriptionbyid', verifyadmin, getpartnersubscriptionbyid);
approutes.post('/updatepartnersubscription', verifyadmin, updatepartnersubscription);
approutes.post('/deletepartnersubscription', verifyadmin, deletepartnersubscription);
approutes.post('/addpartnersubscription', verifyadmin, addpartnersubscription);
approutes.post('/getallpartnersubscriptionfeatures',verifyadmin, getallpartnersubscriptionfeatures);


approutes.post('/getpayoutlogs', verifyadmin, getpayoutlogs);

// approutes.post('/getall') 

approutes.post('/getdashborad', verifyadmin, getdashboard);
// approutes.post('/getallcoupons',verifyadmin,getallcoupons);
approutes.post("/addcoupons", verifyadmin, addcoupons);
approutes.post("/getallcoupons", verifyadmin, getallcoupons);
approutes.post('/deletecoupons', verifyadmin, updatecoupons);

approutes.post("/getBookings", verifyadmin, getBookings);
approutes.post("/getBookingsDetails", verifyadmin, getBookingsDetails);
approutes.post("/getBookingsDetailsById", verifyadmin, getBookingsDetailsById);
approutes.get("/bookings/sse", verifyadmin, bookingSSE);
// TEMP — remove before production
approutes.get("/bookings/sse/test", verifyadmin, (req, res) => {
  broadcastNewBooking({
    id: Math.floor(Math.random() * 1000),
    payable_amount: 850,
    status: "booked",
  });
  res.json({ success: true, message: "Test booking broadcasted" });
});
approutes.post("/updateBookingStatus", verifyadmin, updatebookingstatus);
approutes.post("/downloadBookingPDF/:id", verifyadmin, downloadBookingPDF);
approutes.post("/refundbookings", verifyadmin, updaterefundBooking);

approutes.post("/getCancelledOrders", verifyadmin, getCancelledOrders);
approutes.post("/getTopSaloon", verifyadmin, getTopPerformingSalon);
approutes.post("/getReports", verifyadmin, getFilterReport);
approutes.post("/getMonthlyReports", verifyadmin, getMonthlyReport); //Get Monthly Revenue & Appointments
approutes.post("/getFilteredStores", verifyadmin, getFilteredStores); // Get Store By Category Filter
approutes.post("/getCategoryRevenue", verifyadmin, getCategoryRevenue); //Get Revenue By Category, Month, Year
approutes.post("/getStores", verifyadmin, getStoreBySearch); // Get Store by City Name
approutes.post("/getStoreByStatus", verifyadmin, getStoresByStatus);
approutes.post("/getSalons/:id", verifyadmin, getSalons);
approutes.post("/getRevenueCategory", verifyadmin, getRevenueCategory); //Get Total Revenue & Appointment Count
approutes.post("/getRevenueGrowth", verifyadmin, getRevenueCategoryGrowth); //Get Revenue % By Category
approutes.post("/updateMultipleSalon", verifyadmin, updateMultipleStore);
approutes.post("/advancedSearch", verifyadmin, getAdvancedSearch); //Get Store By Phone, Name, Email
approutes.post("/updateSalon", verifyadmin, upload.fields([{ name: 'images', maxCount: 4 }, { name: 'documents', maxCount: 1 }]), imageSizeMiddleware, updateSalon);
approutes.post("/getCustomers", verifyadmin, getCustomers); // Get Customer % of New and Old Customers
approutes.post("/getStoresByDate", verifyadmin, getRegisteredStore); //Get Store By Registration Date Filter
