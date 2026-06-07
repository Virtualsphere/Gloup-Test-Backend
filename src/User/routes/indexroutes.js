import { authroutes } from "./userauthroutes.js"; 
import { approutes } from "./userapproutes.js";
import { razorpayWebhook } from "../controller/webhookController.js";
import { Router } from "express"; 

export const userRouter = Router() 

userRouter.use("/auth",authroutes); 
userRouter.use("/app",approutes);

// Razorpay Webhook — no auth middleware, raw body parsed by express.raw() in app.js
userRouter.post("/webhook/razorpay", razorpayWebhook);

