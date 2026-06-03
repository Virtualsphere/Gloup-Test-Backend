import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
import { adminauthmiddleware } from "../middleware/authmiddleware.js";
// import {par}

dotenv.config();    


export const login = async(req,res) => {
    const ipv4 = req.socket.remoteAddress?.split("f:")[1];
    const ipv = req.socket.remoteAddress;
    const browser = req.get("User-Agent");
    const deviceInfo = {
        ip: ipv4,
        ipv: ipv,
        userAgent: browser,
    };
    adminauthmiddleware.auth.login(req.body,deviceInfo) 
    .then((data) => {
        const response = ApplicationResult.forCreated();
        var statuscode = 0;
        ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
        );
        res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
        ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
        });
})} 

export const verifyadmin = async(req,res,next) => {
    adminauthmiddleware.auth.verifyadmin(req)
    .then((data) => {
        req.user = data;
        next();
    })
    .catch((error) => {
        ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
        });
    });
} 

export const logout= async(req,res) => {
     adminauthmiddleware.auth.logout(req)
          .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
              response,
              null,
              (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
          })
          .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}