import { authroutes } from "./userauthroutes.js"; 
import { approutes } from "./userapproutes.js";
import { Router } from "express"; 

export const userRouter = Router() 

userRouter.use("/auth",authroutes); 
userRouter.use("/app",approutes);

