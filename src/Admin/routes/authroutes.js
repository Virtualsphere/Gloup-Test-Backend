import { Router } from "express";
import require from "requirejs";
import { login, logout, verifyadmin } from "../controller/authcontroller.js";
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


export const adminauthroutes = Router()

adminauthroutes.post("/login",apiLimiter,login);
adminauthroutes.post("/logout",verifyadmin,logout);