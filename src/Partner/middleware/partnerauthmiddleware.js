import require from "requirejs";
import { partnerDbController } from "../../core/database/Controller/partnerDbController.js";
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { mergeFcmTokenRegistration } from "../../core/utils/fcmTokenService.js";
import { error } from "ajv/dist/vocabularies/applicator/dependencies.js";
import { googleloginpartner } from "../controller/partnerauthcontroller.js";
import { messagingFunction } from "../../core/utils/msg91.js";
import { appleAuthentication1 } from "../../core/utils/appleUser.js";
dotenv.config();

const client = new OAuth2Client();


var CryptoJS = require("crypto-js");

export class partnerauthmiddleware { }

partnerauthmiddleware.auth = {

  otp_login: async ({ body }) => {
    console.log("🔍 [DEBUG] Starting otp_login process for body:", body);
    // const validated = await PayloadCompiler.compile(body, "otpLogin");
    const userFound = await partnerDbController.auth.checkPhoneExists(body);
    console.log("🔍 [DEBUG] checkPhoneExists result:", userFound);
    
    if (userFound != null && userFound != undefined && Object.keys(userFound).length != 0) {
      console.log("🔍 [DEBUG] Existing user found. Status:", userFound.status);
      if (userFound.status === "terminated" || userFound.status === "inactive") {
        console.warn("⚠️ [DEBUG] Account Terminated/Inactive for user:", userFound.id);
        throw Error.SomethingWentWrong("Account Terminated");
      } else {
        body.customerId = userFound.id;
        try {
          const msgSent = await messagingFunction.sendOTP(userFound);
          console.log("🚀 [OTP] Send result for existing user:", msgSent.data);
          
          var currentDate = Date.now();
          userFound.expiry = Number(currentDate) + Number(300000); // 5 mins
          var updateUserMeta = await partnerDbController.auth.createOTPExpiry(userFound);
          
          return "Otp Sent Successfully";
        } catch (error) {
          console.error("❌ [OTP] Error sending OTP:", error.message);
          throw Error.SomethingWentWrong("Please Try Again Later!");
        }
      }
    } else {
      console.log("🔍 [DEBUG] User NOT found. Creating new partner record...");
      const code_1 = "OTP" + Math.floor(1000 + Math.random() * 9000);
      const newUser = await partnerDbController.auth.createPartner(body, code_1);
      
      if (newUser != null && newUser != undefined && Object.keys(newUser).length != 0) {
        try {
          var currentDate = Date.now();
          newUser.expiry = Number(currentDate) + Number(300000);
          var updateUserMeta = await partnerDbController.auth.createOTPExpiry(newUser);

          const msgSent = await messagingFunction.sendOTP(newUser);
          console.log("🚀 [OTP] Send result for new user:", msgSent.data);

          return "Otp Sent Successfully";
        } catch (error) {
          console.error("❌ [OTP] Error sending OTP to new user:", error.message);
          throw Error.SomethingWentWrong("Please Try Again Later!");
        }
      } else {
        throw Error.SomethingWentWrong("Please Try Again Later!");
      }
    }
  },

  otp_verify: async ({ body }, device) => {
    console.log("🔍 [DEBUG] Starting otp_verify for body:", body);
    const passwordSecret = process.env.passwordSecret;
    const userFound = await partnerDbController.auth.checkPhoneExists(body);
    console.log("🔍 [DEBUG] checkPhoneExists result:", userFound);

    if (userFound != null && userFound != undefined && Object.keys(userFound).length != 0) {
      console.log("🔍 [DEBUG] User record found. Checking OTP expiry...");
      var currentTime = Number(Date.now());
      var expiryMinutes = Number(300000); // 5 mins
      var expiryTime = new Date(userFound.otpExpiration).getTime();
      var initiatedTime = expiryTime - expiryMinutes;
      var expired = currentTime - initiatedTime;

      console.log(`🔍 [DEBUG] Time Analysis: Current=${currentTime}, Expiry=${expiryTime}, Diff=${expired}`);

      if (expired <= expiryMinutes) {
        console.log("🔍 [DEBUG] OTP is theoretically within time window.");

        // Real OTP verify via MSG91
        let verifyMsg = await messagingFunction.verifyOTP(body);
        console.log("🔍 [OTP] Verify result:", verifyMsg.data);

        if (verifyMsg.data.type == "success") {
          console.log("🔍 [DEBUG] OTP validation successful. Updating expiry...");
          var updateUserMeta = await partnerDbController.auth.updateOTPExpiry(userFound);
          
          console.log("🔍 [DEBUG] Generating JWT for partner ID:", userFound.id);
          const token = await authentications.generatePartnerJWt({ id: userFound.id, status: "active" });

          if (token) {
            console.log("🔍 [DEBUG] JWT generated. Encrypting token...");
            var encryptedToken = CryptoJS.AES.encrypt(token, passwordSecret).toString();
            const isRegister = !!(
              userFound.name ||
              userFound.store_type ||
              userFound.address_id ||
              userFound.docs
            );
            console.log("🔍 [DEBUG] isRegister calculated:", isRegister);

            console.log("🔍 [DEBUG] Creating session record...");
            const addSession = await partnerDbController.auth.createSession(encryptedToken, device, userFound.id);
            console.log("🔍 [DEBUG] createSession result:", addSession);

            if (addSession) {
              console.log("✅ [DEBUG] Login process completed successfully.");
              return {
                token: encryptedToken,
                name: userFound.name,
                isRegister
              };
            } else {
              console.error("❌ [DEBUG] Failed to create session record.");
              throw Error.SomethingWentWrong("Session creation failed");
            }

          } else {
            console.error("❌ [DEBUG] Token generation failed.");
            throw Error.SomethingWentWrong();
          }
        } else if (verifyMsg.data.type == "error") {
          console.error("❌ [DEBUG] Verification returned error:", verifyMsg.data.message);
          throw Error.SomethingWentWrong(verifyMsg.data.message);
        }
      } else {
        console.warn("⚠️ [DEBUG] OTP code expired.");
        throw Error.SomethingWentWrong("Code Expired");
      }
    } else {
      console.warn("⚠️ [DEBUG] User not found during verification.");
      throw Error.SomethingWentWrong("User Not Found");
    }
  },


  emaillogin: async ({ email, password }, deviceinfo) => {
    console.log("🚀 ~ password:", password)
    console.log("🚀 ~ email:", email)
    try {
      let registered = false;
      const user = await partnerDbController.auth.checkuser(email)
      console.log("🚀 ~ user:", user)
      const passwordSecret = process.env.passwordSecret;
      console.log("🚀 ~ passwordSecret:", passwordSecret)

      if (user != null || user != undefined) {

        if (String(user.status).toLowerCase() === "active") {

          const dbpassword = user.password;
          const getaddress = await partnerDbController.auth.getaddress(user.id);


          if (getaddress != null && getaddress != undefined) {
            registered = true;
          }
          const match = await bcrypt.compare(password, dbpassword);
          console.log("🚀 ~ match:", match)
          if (!match) {
            return ("password incorrect");
          }
          const findSession = await partnerDbController.auth.checksession(user.id)
          if (findSession == null || findSession == undefined || findSession.status === "inactive") {
            const token = await authentications.generatePartnerJWt({ username: user.username, id: user.id, role: user.role, status: "active" });
            if (token != null || token != undefined) {
              var encryptedToken = CryptoJS.AES.encrypt(token, passwordSecret).toString();
              const addSession = await partnerDbController.auth.insertsession(encryptedToken, user.id, deviceinfo)
              if (addSession != null && addSession != undefined && Object.keys(addSession).length != 0) {
                return { token: encryptedToken, role: user.role_id, name: user.name, registered: registered };
              } else {
                throw Error.SomethingWentWrong("Failed to Create Session");
              }
            }
          } else if (findSession.status === "active") {
            const destroysession = await partnerDbController.auth.destroysession(findSession.id)
            if (destroysession) {
              const token = await authentications.generatePartnerJWt({ username: user.username, id: user.id, role: user.role, status: "active" });
              if (token != null || token != undefined) {
                var encryptedToken = CryptoJS.AES.encrypt(token, passwordSecret).toString();
                const addSession = await partnerDbController.auth.insertsession(encryptedToken, user.id, deviceinfo);
                return { token: encryptedToken, role: user.role_id, name: user.name, registered: registered };
              }
            }
          }
        } else {
          throw Error.AuthenticationFailed("Account InActive");
        }
      } else {
        // password = "madd1234"; //default password for new user
        const new_password = await bcrypt.hash(password, 10);
        const data = await partnerDbController.auth.adduser(email, new_password);
        if (data === undefined) {
          throw Error.SomethingWentWrong("cannot add user")
        }
        const res = await NodeMailerfunction.Email.getStarted(email, data.id);

        return "verification  mail has been sent to the email "

      }
    } catch (error) {
      console.log("🚀 ~ partnerauthmiddleware.auth.emaillogin= ~ error:", error);
      throw Error.SomethingWentWrong(error.message || "Authentication failed")
    }
  },

  verifyemail: async ({ verifyEmail }) => {
    try {
      const verfieddata = await authentications.verifyEmailToken(verifyEmail);


      const userId = verfieddata.userId;


      const data = await partnerDbController.auth.registerupdateuser(verfieddata.userId);

      return "user has been verified sucssesfully ."

    } catch (error) {
      throw Error.AuthenticationFailed();
    }
  },
  logout: async ({ headers }) => {
    try {
      // const result = await partnerDbController.auth.logout(headers.adminauthtoken);
      const result = await partnerDbController.auth.logout(headers.partnertoken);

      return "logout sucssesfull"
    } catch (error) {
      throw Error.AuthenticationFailed();
    }
  },
  getdeviceId: async ({ body, user }) => {
    try {
      const checkuser = await partnerDbController.auth.checkUserExists(body, user.id);
      if (!checkuser) {
        throw Error.SomethingWentWrong("User Not Found");
      }
      if (!body.device_id?.trim()) {
        throw Error.BadRequest("device_id is required");
      }
      const tokens = mergeFcmTokenRegistration(
        checkuser.deviceId,
        body.device_id.trim()
      );
      await partnerDbController.auth.addDeviceId(tokens, user.id);
      return "Fcm Token Updated Successfully";
    } catch (error) {
      if (error.status) throw error;
      throw Error.SomethingWentWrong("cannot get device id");
    }
  },
  deleteaccount: async ({ body, user }) => {
    try {
      const checkuser = await partnerDbController.auth.checkUserExists(body, user.id);
      if (!checkuser) {
        throw Error.SomethingWentWrong("User Not Found")
      }
      const deleteaccount = await partnerDbController.auth.deleteAccount(user.id);
      if (deleteaccount) {
        return "Account Deleted Successfully";
      } else {
        throw Error.SomethingWentWrong("cannot delete account")
      }
    } catch (error) {
      throw Error.SomethingWentWrong("cannot delete account")
    }
  },
  verifypartner: async ({ headers }) => {
    if (headers.hasOwnProperty("partnertoken")) {
      //check authentication
      const passwordSecret = process.env.passwordSecret;
      const findSession = await partnerDbController.auth.findsession(headers.partnertoken);
      if (findSession != null && findSession != undefined && findSession.status == "active") {

        //decrypt token
        var plain = CryptoJS.AES.decrypt(findSession.token, passwordSecret);

        findSession.token = plain.toString(CryptoJS.enc.Utf8);
        //decode token
        const decoded = await authentications.verifyPartnerJWt(findSession.token);
        if (decoded != null && decoded != undefined && decoded.status == "active") {
          const foundUser = await partnerDbController.auth.checkUserIdExists(decoded);
          if (foundUser != null && foundUser != undefined && Object.keys(foundUser).length != 0) {
            return foundUser;
          } else {
            throw Error.AuthenticationFailed();
          }
        } else {
          //inactive token if expired null || undefined
          const destroySessionResult = await partnerDbController.auth.destroysession(headers.partnertoken);
          if (destroySessionResult) {
            throw Error.AuthenticationFailed("Session Timed Out");
          }

        }
      } else {
        throw Error.AuthenticationFailed();
      }
    } else {
      throw Error.AuthenticationFailed();

    }
  },

  googleloginpartner: async ({ token }, deviceinfo) => {
    try {
      let registered = false;
      const parts = token.split('.');
      if (parts.length !== 3) {
        return res.status(400).send({ error: 'Invalid token format' });
      }
      const payload_1 = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      console.log("🚀 ~ payload_1:", payload_1)
      const passwordSecret = process.env.passwordSecret;
      let ticket
      try {
        ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID_3
        });
      } catch (error) {
        ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID_2
        });
      }
      const payload = ticket.getPayload();
      const user = await partnerDbController.auth.checkuser(payload.email);
      console.log("🚀 ~ user:", user)
      const getaddress = await partnerDbController.auth.getaddress(user?.id);
      if (getaddress != null && getaddress != undefined) {
        registered = true;
      }
      let userId, username, role, name, roleId;
      if (user !== null && user !== undefined) {
        userId = user.id;
        username = user.username;
        role = user.role;
        name = user.name;
        roleId = user.role_id;
        const findSession = await partnerDbController.auth.checksession(userId);
        console.log("🚀 ~ findSession:", findSession)
        if (findSession && findSession.status === "active") {
          await partnerDbController.auth.destroysession(findSession.token);
        }
      } else {
        const newUser = await partnerDbController.auth.adduser_1(
          payload.email
        );
        console.log("🚀 ~ newUser:", newUser)
        if (!newUser) {
          throw Error.SomethingWentWrong("Failed to create user");
        }
        userId = newUser.id;
        username = newUser.firstname;

      }
      const Token = await authentications.generatePartnerJWt({
        username: username,
        id: userId,
        status: "active",
        registered: registered
      });
      if (!Token) {
        throw Error.SomethingWentWrong("Failed to generate token");
      }
      const encryptedToken = CryptoJS.AES.encrypt(Token, passwordSecret).toString();
      const addSession = await partnerDbController.auth.insertsession(encryptedToken, userId, deviceinfo);
      if (!addSession || Object.keys(addSession).length === 0) {
        throw Error.SomethingWentWrong("Failed to Create Session");
      }
      return {
        token: encryptedToken,
        role: roleId,
        name: name,
        registered: registered
      };
    } catch (error) {
      console.log("🚀 ~ authusermiddleware.goooglelogin= ~ error:", error)
      throw Error.SomethingWentWrong(error.message || "Authentication failed");
    }
  },


  // appleLoginPartner: async ({ body }, deviceinfo) => {
  //   try {
  //     console.log("🚀 ~ body:", body);
  //     const appleUser = await appleAuthentication.appleLogin(body.authCode);
  //     console.log("🚀 ~ appleUser:", appleUser);
  //     if (!appleUser || Object.keys(appleUser).length === 0) {
  //       throw Error.SomethingWentWrong("Invalid Apple login data");
  //     }
  //     let registered = false;
  //     const user = await partnerDbController.auth.checkuser(appleUser.email);
  //     console.log("🚀 ~ user:", user);
  //     const getaddress = await partnerDbController.auth.getaddress(user?.id);
  //     if (getaddress != null && getaddress != undefined) {
  //       registered = true;
  //     }
  //     let userId, username, name, roleId = null;

  //     if (user) {
  //       userId = user.id;
  //       name = user.name || null;
  //       username = user.email;
  //       const oldSession = await partnerDbController.auth.checksession(userId);
  //       if (oldSession && oldSession.status === "active") {
  //         await partnerDbController.auth.destroysession(oldSession.token);
  //       }
  //     } else {
  //       const newUser = await partnerDbController.auth.adduser_1(
  //         appleUser.email,
  //         appleUser.name
  //       );
  //       if (!newUser) {
  //         throw Error.SomethingWentWrong("Failed to create user");
  //       }
  //       userId = newUser.id;
  //       username = newUser.email;
  //       name = newUser.name || null;
  //     }
  //     const passwordSecret = process.env.passwordSecret;
  //     const Token = await authentications.generatePartnerJWt({
  //       username,
  //       id: userId,
  //       status: "active",
  //       registered
  //     });
  //     console.log("🚀 ~ Token:", Token);
  //     if (!Token) {
  //       throw Error.SomethingWentWrong("Failed to generate token");
  //     }
  //     const encryptedToken = CryptoJS.AES.encrypt(Token, passwordSecret).toString();
  //     console.log("🚀 ~ encryptedToken:", encryptedToken);
  //     const addSession = await partnerDbController.auth.insertsession(
  //       encryptedToken,
  //       userId,
  //       deviceinfo
  //     );
  //     console.log("🚀 ~ addSession:", addSession);
  //     if (!addSession || Object.keys(addSession).length === 0) {
  //       throw Error.SomethingWentWrong("Failed to Create Session");
  //     }
  //     return {
  //       token: encryptedToken,
  //       name,
  //       registered
  //     };
  //   } catch (error) {
  //     console.log("🚀 ~ appleLoginPartner = ~ error:", error);
  //     throw Error.SomethingWentWrong(error.message || "Authentication failed");
  //   }
  // },

  appleLoginPartner: async ({ body }, deviceinfo) => {
    console.log("🚀 ~ body:", body);
    try {
      let registered = false;
      const appleUser = await appleAuthentication1.appleLogin(body);
      console.log("🚀 ~ appleUser:", appleUser);
      if (!appleUser || Object.keys(appleUser).length === 0) {
        throw Error.SomethingWentWrong("Invalid Apple login data");
      }
      const user = await partnerDbController.auth.checkuser(appleUser.email);
      console.log("🚀 ~ user:", user);
      const getaddress = await partnerDbController.auth.getaddress(user?.id);
      if (getaddress != null && getaddress != undefined) {
        registered = true;
      }
      let userId, username, name;

      if (user) {
        registered = true;
        if (!user.apple_sub && appleUser.sub) {
          await partnerDbController.Models.Store.update(
            { apple_sub: appleUser.sub },
            { where: { id: user.id } }
          );
        }
        userId = user.id;
        name = user.name || null;
        username = user.email;
        const oldSession = await partnerDbController.auth.checksession(userId);
        console.log("🚀 ~ oldSession:", oldSession)
        if (oldSession && oldSession.status === "active") {
          await partnerDbController.auth.destroysession(oldSession.token);
        }
      } else {
        registered = false;
        const newUser = await partnerDbController.auth.adduser_2(
          appleUser.email,
          appleUser.name,
          appleUser.sub
        );
        console.log("🚀 ~ newUser:", newUser);
        if (!newUser) {
          throw Error.SomethingWentWrong("Failed to create user");
        }
        userId = newUser.id;
        username = newUser.email;
        name = newUser.name || null;
      }
      const passwordSecret = process.env.passwordSecret;
      console.log("🚀 ~ passwordSecret:", passwordSecret)
      const token = await authentications.generatePartnerJWt({
        username,
        id: userId,
        status: "active",
        registered: registered
      });
      console.log("🚀 ~ token:", token)
      if (!token) {
        throw Error.SomethingWentWrong("Failed to generate token");
      }
      const encryptedToken = CryptoJS.AES.encrypt(token, passwordSecret).toString();
      console.log("🚀 ~ encryptedToken:", encryptedToken);
      const addSession = await partnerDbController.auth.insertsession(
        encryptedToken,
        userId,
        deviceinfo
      );
      console.log("🚀 ~ addSession:", addSession);
      if (!addSession || Object.keys(addSession).length === 0) {
        throw Error.SomethingWentWrong("Failed to create session");
      }
      return {
        token: encryptedToken,
        name: name,
        registered: registered
      };
    } catch (error) {
      console.log("🚀 ~ appleLoginPartner = ~ error:", error);
      throw Error.SomethingWentWrong(error.message || "Authentication failed");
    }
  }

}


