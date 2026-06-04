import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
import { adminauthmiddleware } from "../middleware/authmiddleware.js";
import bcrypt from "bcrypt";
import { adminDbController } from "../../core/database/Controller/AdminDbController.js";

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

export const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ status: 400, message: "oldPassword and newPassword are required" });
    }

    try {
        const user = req.user;
        
        // Compare old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ status: 400, message: "Incorrect old password" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in DB
        await adminDbController.auth.updatePassword(user.id, hashedPassword);

        // Invalidate all active sessions for this admin
        await adminDbController.auth.destroyAllSessions(user.id);

        const response = ApplicationResult.forCreated();
        var statuscode = 0;
        ApplicationResponse.success(
            response,
            null,
            (response) => (statuscode = response.status)
        );
        res.json({ status: statuscode, data: "Password changed successfully. Please log in again." });
    } catch (error) {
        ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
        });
    }
};