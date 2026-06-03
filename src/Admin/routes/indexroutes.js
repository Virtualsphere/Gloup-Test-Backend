import { Router } from "express"; 
import { adminauthroutes } from "./authroutes.js";  
import { approutes } from "./approutes.js";


export const adminRouter = Router()
adminRouter.use("/auth", adminauthroutes);
adminRouter.use("/app", approutes);