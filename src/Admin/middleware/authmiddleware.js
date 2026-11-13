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

const ADMIN_RESET_EXPIRY_MINUTES = 30;
// Taken from server config, never from the request's Host/Origin headers, so a
// forged request can't produce a reset email that links to another site.
const adminPanelUrl = () =>
  (process.env.ADMIN_PANEL_URL || process.env.UAT_ADMIN_ORIGIN || "https://admin.gloup.in").replace(/\/+$/, "");


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
  verifyadmin: async ({ headers, query }) => {
    try {
      const adminauth = headers.adminauth || query?.adminauth;
      if (adminauth) {
        //check authentication
        const passwordSecret = process.env.passwordSecret;
        const findSession = await adminDbController.auth.findsession(adminauth);
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
  // The panel has one shared admin account, so the request names no account. With
  // anything other than exactly one active admin there is no way to tell whose
  // password to reset, so this fails instead of guessing.
  forgotPassword: async () => {
    try {
      const admins = await adminDbController.auth.findActiveAdmins();
      if (admins.length !== 1) {
        logger.error(`Admin Forgot Password: expected 1 active admin, found ${admins.length}`);
        throw Error.SomethingWentWrong("Could not send the reset email. Please contact the developers.");
      }
      const [user] = admins;
      const token = authentications.generateAdminResetToken(user, ADMIN_RESET_EXPIRY_MINUTES);
      await NodeMailerfunction.Email.adminPasswordReset({
        adminName: user.username,
        adminEmail: user.email,
        resetUrl: `${adminPanelUrl()}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: ADMIN_RESET_EXPIRY_MINUTES,
      });
      return "A password reset link has been sent to the admin email.";
    } catch (error) {
      logger.error(`Admin Forgot Password Error: ${error.message}`, { stack: error.stack });
      await logErrorToDB({
        module: "AdminAuth",
        functionName: "forgotPassword",
        error,
        requestData: {}
      });
      throw error;
    }
  },
  resetPassword: async ({ token, newPassword }) => {
    // Rules match the login form, which refuses passwords containing spaces.
    // bcrypt ignores everything past 72 bytes.
    if (
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      Buffer.byteLength(newPassword) > 72 ||
      /\s/.test(newPassword)
    ) {
      throw Error.NotValid("password", "Password must be 8 to 72 characters with no spaces");
    }
    // Not AuthenticationFailed: the panel's axios interceptor turns that code into
    // a redirect to /auth, and the admin would never see why the link failed.
    const invalidLink = () =>
      Error.NotValid("reset-link", "This reset link is invalid or has expired. Please request a new one from the login page.");

    if (typeof token !== "string" || !token) throw invalidLink();
    const email = authentications.readAdminResetEmail(token);
    if (!email) throw invalidLink();

    try {
      const user = await adminDbController.auth.checkuser(email);
      if (
        !user ||
        String(user.status).toLowerCase() !== "active" ||
        !authentications.verifyAdminResetToken(token, user)
      ) {
        throw invalidLink();
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await adminDbController.auth.updatePassword(user.id, hashedPassword);
      await adminDbController.auth.destroyAllSessions(user.id);
      return "Password reset successfully. Please log in with your new password.";
    } catch (error) {
      logger.error(`Admin Reset Password Error: ${error.message}`, { stack: error.stack });
      await logErrorToDB({
        module: "AdminAuth",
        functionName: "resetPassword",
        error,
        requestData: { email }
      });
      throw error;
    }
  },
}