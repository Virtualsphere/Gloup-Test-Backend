import require from "requirejs";
import { adminDbController } from "../../core/database/Controller/AdminDbController.js";
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { error } from "ajv/dist/vocabularies/applicator/dependencies.js";
import { adminSession } from "../../core/database/models/Admin.js";
import { helperfunction } from "../../core/utils/helperfunctions.js";
import logger from "../../core/utils/logger.js";
import { logErrorToDB } from "../../core/utils/loggerDB.js";

dotenv.config();


var CryptoJS = require("crypto-js");


export class adminauthmiddleware { }

adminauthmiddleware.auth = {
  login: async ({ email, password }, deviceinfo) => {
    try {
      const user = await adminDbController.auth.checkuser(email)
      if (user != null || user != undefined) {

        await helperfunction.validations.updtaesubscription();


        if (String(user.status).toLowerCase() === "active") {

          const dbpassword = user.password;

          const match = await bcrypt.compare(password, dbpassword);
          if (!match) {
            throw Error.AuthenticationFailed("password incorrect");
          }
          const findSession = await adminDbController.auth.checksession(user.id)
          console.log("🚀 ~ findSession:", findSession)
          if (findSession[0] == null || findSession[0] == undefined || findSession[0].status === "inactive") {
            const token = await authentications.generateAdminJWT({ username: user.username, id: user.id, role: user.role, status: "active" });
            console.log("🚀 ~ token:", token)
            if (token != null || token != undefined) {
              var encryptedToken = CryptoJS.AES.encrypt(token, process.env.passwordSecret).toString();
              console.log("🚀 ~ encryptedToken:", encryptedToken)
              const addSession = await adminDbController.auth.insertsession(encryptedToken, user.id, deviceinfo)
              console.log("🚀 ~ addSession:", addSession)
              if (addSession != null && addSession != undefined && Object.keys(addSession).length != 0) {
                return { token: encryptedToken, role: user.role_id, name: user.username };
              } else {
                throw Error.SomethingWentWrong("Failed to Create Session");
              }
            }
          } else if (findSession[0].status === "active") {
            // const destroysession = await adminDbController.auth.destroysession(findSession[0].id)
            // console.log("🚀 ~ destroysession:", destroysession)
            // if (destroysession) {
            const token = await authentications.generateAdminJWT({ username: user.username, id: user.id, role: user.role, status: "active" });
            console.log("🚀 ~ token 1:", token)
            if (token != null || token != undefined) {
              var encryptedToken = CryptoJS.AES.encrypt(token, process.env.passwordSecret).toString();
              console.log("🚀 ~ encryptedToken 1:", encryptedToken)
              const addSession = await adminDbController.auth.insertsession(encryptedToken, user.id, deviceinfo)
              console.log("🚀 ~ addSession 1:", addSession)
              if (addSession != null && addSession != undefined && Object.keys(addSession).length != 0) {
                return { token: encryptedToken, name: user.username };
              } else {
                throw Error.SomethingWentWrong("Failed to Create Session");
              }
              // }
            }
          }
        } else {
          throw Error.AuthenticationFailed("Account InActive");
        }
      } else {
        throw Error.AuthenticationFailed("User Not Found");
      }
    } catch (error) {

      // 🧾 File + Console Logging
      logger.error(`Admin Login Error: ${error.message}`, {
        stack: error.stack
      });

      // 🧾 DB Logging
      await logErrorToDB({
        module: "AdminAuth",
        functionName: "login",
        error,
        requestData: {
          email
        }
      });

      throw error;
    }
  },
  verifyadmin: async ({ headers }) => {
    try {
      if (headers.hasOwnProperty("adminauth")) {
        //check authentication
        const passwordSecret = process.env.passwordSecret;
        const findSession = await adminDbController.auth.findsession(headers.adminauth);
        if (findSession != null && findSession != undefined && findSession.status == "active") {
          //decrypt token
          var plain = CryptoJS.AES.decrypt(findSession.token, passwordSecret);

          findSession.Token = plain.toString(CryptoJS.enc.Utf8);

          //decode token
          const decoded = await authentications.verifyadminJWT(findSession.Token);

          if (decoded != null && decoded != undefined && decoded.status == "active") {
            const foundUser = await adminDbController.auth.checkUserIdExists(decoded);
            if (foundUser != null && foundUser != undefined && Object.keys(foundUser).length != 0) {
              return foundUser;
            } else {
              throw Error.AuthenticationFailed();
            }
          } else {
            //inactive token if expired null || undefined
            const findSession = await adminDbController.auth.destroysession_1(headers.userauth);
            if (findSession[0] == 1) {
              throw Error.AuthenticationFailed("Session Timed Out");
            }

          }
        } else {
          throw Error.AuthenticationFailed();
        }
      } else {
        throw Error.AuthenticationFailed();
      }
    } catch (error) {

      logger.error(`Verify Admin Error: ${error.message}`, {
        stack: error.stack
      });

      await logErrorToDB({
        module: "AdminAuth",
        functionName: "verifyadmin",
        error,
        requestData: {
          headers
        }
      });

      throw Error.AuthenticationFailed();
    }
  },
  logout: async ({ headers }) => {
    try {
      const result = await adminDbController.auth.logout(headers.adminauth);
      return "logout successful";
    } catch (error) {

      logger.error(`Logout Error: ${error.message}`, {
        stack: error.stack
      });

      await logErrorToDB({
        module: "AdminAuth",
        functionName: "logout",
        error,
        requestData: {}
      });

      throw Error.AuthenticationFailed();
    }
  },
}