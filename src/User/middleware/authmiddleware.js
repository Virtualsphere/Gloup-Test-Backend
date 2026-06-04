import require from "requirejs";
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import { messagingFunction } from "../../core/utils/msg91.js";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import { OAuth2Client } from "google-auth-library";
const appleSigninAuth = require("apple-signin-auth");
var CryptoJS = require("crypto-js");
import dotenv from "dotenv";
import { getdeviceId } from "../controller/userauthcontroller.js";
import { appleAuthentication } from "../../core/utils/appleUser.js";
import { mergeFcmTokenRegistration } from "../../core/utils/fcmTokenService.js";
dotenv.config();


const client = new OAuth2Client();


export class userauthmiddleware { }

userauthmiddleware.user = {
  otp_login: async ({ body }) => {
    console.log("🚀 ~ body:", body)
    // const validated = await PayloadCompiler.compile(body, "otpLogin");
    const userFound = await userDbController.auth.checkPhoneExists(body);

    if (userFound != null && userFound != undefined && Object.keys(userFound).length != 0) {
      if (userFound.status === "terminated" || userFound.status === "inactive") {
        const updatedUser = await userDbController.auth.updateUserStatus(userFound.id, "active");
        if (!updatedUser) {
          throw Error.SomethingWentWrong("Failed to reactivate account");
        }
        else {
          userFound.status = "active";
        }
      }
      if (userFound.status === "terminated" || userFound.status === "inactive") {
        throw Error.SomethingWentWrong("Account Terminated");
      } else {

        body.customerId = userFound.id;
        try {

          if (body.phone == "9876543210" || body.phone == "9876543211") {

            var currentDate = Date.now();
            userFound.expiry = Number(currentDate) + Number(300000);
            var updateUserMeta = await userDbController.auth.createOTPExpiry(userFound);
            if (updateUserMeta != null && updateUserMeta != undefined && updateUserMeta[0] == 1) {
              return "Otp Sent Successfully";
            }
          }

          const msgSent = await messagingFunction.sendOTP(userFound);
          console.log("🚀 ~ msgSent:", msgSent)

          if (msgSent.data.type == "success") {
            //otp log
            userFound.type = msgSent.data.type;
            userFound.requestId = msgSent.data.request_id;
            userFound.msgType = "otp";
            await userDbController.auth.createOTPLog(userFound);
            userFound.otpCount = Number(userFound.otpCount);
            userFound.otpCount = Number(userFound.otpCount) + 1;
            var currentDate = Date.now();
            userFound.expiry = Number(currentDate) + Number(300000);
            var updateUserMeta = await userDbController.auth.createOTPExpiry(userFound);
            if (updateUserMeta != null && updateUserMeta != undefined && updateUserMeta[0] == 1) {
              return "Otp Sent Successfully";
            }
          }
        } catch (error) {
          console.log("🚀 ~ error:", error)
          throw Error.SomethingWentWrong("Please Try Again Later!");
        }
      }
    } else {
      const code_1 = "OTP" + Math.floor(1000 + Math.random() * 9000);
      const newUser = await userDbController.auth.createCustomer(body, code_1);
      console.log("🚀 ~ newUser:", newUser);
      if (newUser != null && newUser != undefined && Object.keys(newUser).length != 0) {

        var currentDate = Date.now();
        newUser.expiry = Number(currentDate) + Number(300000);
        var updateUserMeta = await userDbController.auth.createOTPExpiry(newUser);
        const userFound = await userDbController.auth.checkPhoneExists(body);

        const msgSent = await messagingFunction.sendOTP(userFound);
        console.log("🚀 ~ msgSent:", msgSent)

        if (msgSent.data.type == "success") {
          //otp log
          newUser.type = msgSent.data.type;
          newUser.requestId = msgSent.data.request_id;
          newUser.msgType = "otp";
          await userDbController.auth.createOTPLog(newUser);
          newUser.otpCount = Number(newUser.otpCount);
          newUser.otpCount = Number(newUser.otpCount) + 1;
          var currentDate = Date.now();
          newUser.expiry = Number(currentDate) + Number(300000);
          var updateUserMeta = await userDbController.auth.createOTPExpiry(newUser);
          if (updateUserMeta != null && updateUserMeta != undefined && updateUserMeta[0] == 1) {
            return "Otp Sent Successfully";
          }
        }

        //if (updateUserMeta != null && updateUserMeta != undefined && updateUserMeta[0] == 1) {
        //  return "Otp Sent Successfully";
        //}


        // } catch (error) {
        //   throw Error.SomethingWentWrong("Please Try Again Later!");
        // }


      } else {
        throw Error.SomethingWentWrong("Please Try Again Later!");
      }

      // return "User not found";
    }
  },
  googlelogin: async ({ token }, deviceinfo) => {
    console.log("🚀 ~ token:", token)
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return res.status(400).send({ error: 'Invalid token format' });
      }
      // Decode payload
      const payload_1 = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      console.log("🚀 ~ decodedText:", payload_1)
      const passwordSecret = process.env.passwordSecret;
      let ticket
      console.log("🚀 ~ ticket:", ticket)
      try {
        ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID
        });
      } catch (error) {
        try {
          ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID_2,
          });
        } catch (err2) {
          throw new Error("Invalid Google token");
        }
      }
      const payload = ticket.getPayload();
      console.log("🚀 ~ payload:", payload)

      const user = await userDbController.auth.checkuser(payload.email);
      let userId, username, role, name, roleId;
      if (user !== null && user !== undefined) {

        if (user.status === "terminated" || user.status === "inactive") {
          const updatedUser = await userDbController.auth.updateUserStatus(user.id, "active");
          if (!updatedUser) {
            throw Error.SomethingWentWrong("Failed to reactivate account");
          }
          else {
            user.status = "active";
          }
        }

        userId = user.id;
        username = user.username;
        role = user.role;
        name = user.name;
        roleId = user.role_id;

        const findSession = await userDbController.auth.checksession(userId);
        console.log("🚀 ~ findSession:", findSession)

        if (findSession && findSession.status === "active") {
          await userDbController.auth.destroysession(findSession.token);
        }
      }
      else {
        console.log("🚀 ~ payload:", payload)
        const newUser = await userDbController.auth.adduser(
          payload.email,
          payload.name,
          payload.given_name,
          "user"
        );
        console.log("🚀 ~ newUser:", newUser)
        if (!newUser) {
          throw Error.SomethingWentWrong("Failed to create user");
        }
        userId = newUser.id;
        username = newUser.firstname;
      }
      const Token = await authentications.generateUserJWT({
        username: username,
        id: userId,
        status: "active"
      });
      if (!Token) {
        throw Error.SomethingWentWrong("Failed to generate token");
      }
      const encryptedToken = CryptoJS.AES.encrypt(Token, passwordSecret).toString();
      const addSession = await userDbController.auth.insertsession(encryptedToken, userId, deviceinfo);
      if (!addSession || Object.keys(addSession).length === 0) {
        throw Error.SomethingWentWrong("Failed to Create Session");
      }
      return {
        token: encryptedToken,
        role: roleId,
        name: name
      };
    } catch (error) {
      console.log("🚀 ~ authusermiddleware.goooglelogin= ~ error:", error)
      throw Error.SomethingWentWrong(error.message || "Authentication failed");
    }
  },

  appleLogin: async ({ body }, deviceinfo) => {
    console.log("🚀 ~ body:", body)
    try {
      const appleUser = await appleAuthentication.appleLogin(body);
      console.log("🚀 ~ appleUser:", appleUser)
      if (!appleUser || Object.keys(appleUser).length === 0) {
        throw Error.SomethingWentWrong("Invalid Apple login data");
      }
      const user = await userDbController.auth.checkuser(appleUser.email);
      console.log("🚀 ~ user:", user)
      let userId, username, name;
      if (user) {
        if (!user.apple_sub && appleUser.sub) {
          await userDbController.Models.User.update(
            { apple_sub: appleUser.sub },
            { where: { id: user.id } }
          );
        }
        userId = user.id;
        username = user.username || user.firstname;
        name = user.firstname;
        const oldSession = await userDbController.auth.checksession(userId);
        console.log("🚀 ~ oldSession:", oldSession)
        if (oldSession && oldSession.status === "active") {
          await userDbController.auth.destroysession(oldSession.token);
        }
      } else {
        const newUser = await userDbController.auth.adduser1(
          appleUser.email,
          appleUser.name,
          appleUser.given_name,
          "user"
        );
        console.log("🚀 ~ newUser:", newUser)
        if (!newUser) {
          throw Error.SomethingWentWrong("Failed to create user");
        }
        userId = newUser.id;
        username = newUser.firstname;
        name = newUser.firstname;
      }
      const passwordSecret = process.env.passwordSecret;
      console.log("🚀 ~ passwordSecret:", passwordSecret)
      const token = await authentications.generateUserJWT({
        username: username,
        id: userId,
        status: "active",
      });
      console.log("🚀 ~ token:", token)
      if (!token) {
        throw Error.SomethingWentWrong("Failed to generate token");
      }
      const encryptedToken = CryptoJS.AES.encrypt(token, passwordSecret).toString();
      console.log("🚀 ~ encryptedToken:", encryptedToken)
      const addSession = await userDbController.auth.insertsession(
        encryptedToken,
        userId,
        deviceinfo
      );
      console.log("🚀 ~ addSession:", addSession)
      if (!addSession || Object.keys(addSession).length === 0) {
        throw Error.SomethingWentWrong("Failed to create session");
      }
      return {
        token: encryptedToken,
        name: name,
      };
    } catch (error) {
      console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("failed");
    }
  },

  logout: async ({ headers }) => {
    try {
      if (!headers.hasOwnProperty("userauth")) {
        throw Error.AuthenticationFailed();
      }

      const findSession = await userDbController.auth.destroysession(headers.userauth);

      return "Logout Successfully";
    }
    catch (error) {
      //console.log("🚀 ~ error:", error)
      throw Error.SomethingWentWrong("Cannot Logout")
    }

  },

  otp_verify: async ({ body }, device) => {
    console.log("🚀 ~ body:", body)
    const passwordSecret = process.env.passwordSecret;
    const userFound = await userDbController.auth.checkPhoneExists(body);
    if (userFound != null && userFound != undefined && Object.keys(userFound).length != 0) {
      var currentTime = Number(Date.now());
      var expiryMinutes = Number(300000); //5 mins
      var expiryTime = Number(userFound.optExpiration);
      var initiatedTime = expiryTime - expiryMinutes;
      var expired = currentTime - initiatedTime;
      if (expired <= expiryMinutes) {
        //expired should be lessthan or equal to 30,000

        // Real OTP verify via MSG91
        var verifyMsg = await messagingFunction.verifyOTP(body);
        console.log("🚀 [USER-OTP] Verify result:", verifyMsg.data);

        if (verifyMsg.data.type == "success") {
          var updateUserMeta = await userDbController.auth.updateOTPExpiry(userFound);
          //generate jwt token
          const token = await authentications.generateUserJWT({ id: userFound.id, status: "active" });
          if (token) {
            var encryptedToken = CryptoJS.AES.encrypt(token, passwordSecret).toString();
            const addSession = await userDbController.auth.createSession(encryptedToken, device, userFound.id);
            if (addSession != null && addSession != undefined) {
              return { token: encryptedToken, name: userFound.name };
            } else {
              throw Error.SomethingWentWrong();
            }
          } else {
            throw Error.SomethingWentWrong();
          }
        } else if (verifyMsg.data.type == "error") {
          throw Error.SomethingWentWrong(verifyMsg.data.message);
        }
      } else {
        throw Error.SomethingWentWrong("Code Expired");
      }
    } else {
      throw Error.SomethingWentWrong("User Not Found");
    }
  },
  verifyuser: async ({ headers }) => {
    if (headers.hasOwnProperty("userauth")) {
      //check authentication 

      const passwordSecret = process.env.passwordSecret;
      const findSession = await userDbController.auth.findsession(headers.userauth);
      if (findSession != null && findSession != undefined && findSession.status == "active") {
        //decrypt token
        var plain = CryptoJS.AES.decrypt(findSession.token, passwordSecret);

        findSession.Token = plain.toString(CryptoJS.enc.Utf8);

        //decode token
        const decoded = await authentications.verifyUserJWT(findSession.Token);
        if (decoded != null && decoded != undefined && decoded.status == "active") {
          const foundUser = await userDbController.auth.checkUserIdExists(decoded);
          if (foundUser != null && foundUser != undefined && Object.keys(foundUser).length != 0 && foundUser.status === "active") {
            return foundUser;
          } else {
            throw Error.AuthenticationFailed();
          }
        } else {
          //inactive token if expired null || undefined
          const findSession = await userDbController.auth.destroysession(headers.userauth);
          if (findSession[0] == 1) {
            throw Error.AuthenticationFailed("Session Timed Out");
          }

        }
      } else {
        throw Error.AuthenticationFailed();
      }
    } else {
      throw Error.AuthenticationFailed("Session Not Found");
    }
  },
  verifyuserweb: async ({ headers }) => {
    if (headers.hasOwnProperty("userauth")) {
      //check authentication 

      const passwordSecret = process.env.passwordSecret;
      const findSession = await userDbController.auth.findsession(headers.userauth);
      if (findSession != null && findSession != undefined && findSession.status == "active") {
        //decrypt token
        var plain = CryptoJS.AES.decrypt(findSession.token, passwordSecret);

        findSession.Token = plain.toString(CryptoJS.enc.Utf8);

        //decode token
        const decoded = await authentications.verifyUserJWT(findSession.Token);
        if (decoded != null && decoded != undefined && decoded.status == "active") {
          const foundUser = await userDbController.auth.checkUserIdExists(decoded);
          if (foundUser != null && foundUser != undefined && Object.keys(foundUser).length != 0 && foundUser.status === "active") {
            return foundUser;
          } else {
            throw Error.AuthenticationFailed();
          }
        } else {
          //inactive token if expired null || undefined
          const findSession = await userDbController.auth.destroysession(headers.userauth);
          if (findSession[0] == 1) {
            throw Error.AuthenticationFailed("Session Timed Out");
          }

        }
      } else {
        throw Error.AuthenticationFailed();
      }
    } else {
      return null;
    }
  },

  updateprofile: async ({ body, file, user }) => {
    console.log("🚀 ~ body:", body)
    try {
      const pic = file ? file.path : undefined;

      const res = await userDbController.auth.updateprofile(body, pic, user.id);
      if (res === undefined) {
        throw Error.SomethingWentWrong()
      }

      return "profile updated"

    } catch (error) {
      throw Error.SomethingWentWrong("cannot update profile")

    }
  },
  getdeviceId: async ({ body, user }) => {
    try {
      const checkuser = await userDbController.auth.checkUserExists(body, user.id);
      if (!checkuser) {
        throw Error.SomethingWentWrong("User Not Found");
      }
      if (!body.device_id?.trim()) {
        throw Error.BadRequest("device_id is required");
      }
      const tokens = mergeFcmTokenRegistration(
        checkuser.device_id,
        body.device_id.trim()
      );
      await userDbController.auth.addDeviceId(tokens, user.id);
      return "Fcm Token Updated Successfully";
    } catch (error) {
      if (error.status) throw error;
      throw Error.SomethingWentWrong("cannot get device id");
    }
  }
}

