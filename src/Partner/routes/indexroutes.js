import { authroutes } from "./partnerauthroutes.js";
import { appRoutes } from "./partnerapproutes.js";
import { Router } from "express";



export const partnerRouter = Router()


partnerRouter.use("/auth", authroutes)
partnerRouter.use("/app", appRoutes)
