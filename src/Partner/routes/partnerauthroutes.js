import { Router } from "express";
import require from "requirejs";
import { appleLoginPartner, deleteaccount, emaillogin, getdeviceId, googleloginpartner, logout, otp_login, otp_verify, verifyemail } from "../controller/partnerauthcontroller.js";
import { partnerauthenticate } from "../controller/partnerauthcontroller.js";
// import { googlelogin } from "../../User/controller/userauthcontroller.js";
const rateLimit = require("express-rate-limit");

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


export const authroutes = Router()

authroutes.post("/sendOTP", apiLimiter, otp_login);
authroutes.post("/verifyOTP", apiLimiter, otp_verify);
authroutes.post("/emailogin", apiLimiter, emaillogin);
authroutes.get("/verifyemail", verifyemail);
authroutes.post("/logout", logout);
authroutes.post("/deviceId", partnerauthenticate, getdeviceId);
authroutes.post("/deleteaccount", partnerauthenticate, deleteaccount);
authroutes.post("/googlelogin", googleloginpartner);
authroutes.post("/appleLogin", appleLoginPartner); 
