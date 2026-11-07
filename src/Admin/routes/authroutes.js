import { Router } from "express";
import require from "requirejs";
import { login, logout, verifyadmin, changePassword, forgotPassword, resetPassword } from "../controller/authcontroller.js";
const rateLimit = require("express-rate-limit");

const msg = {
    status:429,
    error:{
      message:"Oops...! Limit Exceeded, Kindly Try Again Later."
    } 
  }
  const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 100,
    message: msg,
    skipFailedRequests: true,
  });
  // Public and sends email, so it stays tight to stop the admin inbox being flooded.
  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: msg,
  });
  const resetPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: msg,
  });


export const adminauthroutes = Router()

adminauthroutes.post("/login",apiLimiter,login);
adminauthroutes.post("/logout",verifyadmin,logout);
adminauthroutes.post("/change-password",verifyadmin,changePassword);
adminauthroutes.post("/forgot-password",forgotPasswordLimiter,forgotPassword);
adminauthroutes.post("/reset-password",resetPasswordLimiter,resetPassword);