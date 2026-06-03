import { Router } from "express";
import require from "requirejs";
const rateLimit = require("express-rate-limit");
import { applelogin, getdeviceId, googlelogin, logout, UserAuthenticate } from "../controller/userauthcontroller.js";
import { upload, profileimage } from "../../core/utils/imageResizer.js";
import { otpLogin, updateprofile, verifyOTP } from "../controller/userauthcontroller.js";



const msg = {
  status: 429,
  error: {
    message: "Oops...! Limit Exceeded, Kindly Try Again Later."
  }
}

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: msg,
  skipFailedRequests: true,
});



export const authroutes = Router();

authroutes.post("/sendOTP", apiLimiter, otpLogin)
authroutes.post("/verifyOTP", apiLimiter, verifyOTP);
authroutes.post("/deviceId", UserAuthenticate, getdeviceId);
authroutes.post("/updateuser", UserAuthenticate, upload.single("profilepic"), profileimage, updateprofile);
authroutes.post('/googlelogin', googlelogin);
authroutes.post("/appleLogin", applelogin);
authroutes.post("/logout", UserAuthenticate, logout);
