import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import * as Error from "../errors/ErrorConstant.js";
import { authentications } from "./jwt.js";
import require from "requirejs"
import { SendMailClient } from "zeptomail";
var CryptoJS = require("crypto-js");

// Zepto Mail Configs
const url = "api.zeptomail.in/";
const token = "Zoho-enczapikey PHtE6r0ME+q92GIn9UNR5vHrE5GtMYl8/r82LggSt4dLXvIHFk0B+d55kTfiqRh8B/URRfScwdlp4++esuiCdGa+PDpEDmqyqK3sx/VYSPOZsbq6x00VtVoTf0zUV4bne9Zj1CzQuNreNA==";

import dotenv from "dotenv";
dotenv.config();

const __dirname = path.resolve();
// export class NodeMailerfunction { }


const mailTemplatefolder = path.join(__dirname, "./src/core/utils/mailTemplate/");



const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// transporter.verify((error, success) => {
//   if (error) {
//     console.error('Connection error:', error);
//   } else {
//   }
// });

export class NodeMailerfunction { }

NodeMailerfunction.Email = {
  getStarted: async (email, id) => {
    const baseURL = process.env.baseUrl;
    const receiverEmail = email;
    const userId = id;
    // // const userName = username;
    // const userStatus = status;
    // const store_name = storename;
    // const store_mail = socialinks.email

    // generate jwt token for verification link
    const verifyToken = await authentications.generateEmailToken({
      userId: userId,
    });

    const verifyUrl = `${baseURL}/partner/auth/verifyemail?verifyEmail=${verifyToken}`;


    if (!receiverEmail) {
      throw Error.SomethingWentWrong();
    }

    try {
      const htmlBody = await new Promise((resolve, reject) => {
        ejs.renderFile(
          path.join(mailTemplatefolder, "getStarted.ejs"),
          { username: "partner", verify: verifyUrl, app_name: "Glow_up", main_email: "madhavasrinivasan44@gmail.com" },
          (err, str) => {
            if (err) reject(err);
            else resolve(str);
          }
        );
      });

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM_ADDRESS,
        to: receiverEmail,
        subject: `Welcome to ${process.env.APP_NAME} 🛍️`,
        html: htmlBody,
      });

      return info;
    } catch (err) {
      throw Error.SomethingWentWrong("could not send mail");
    }
  },
//       getStarted: async (email, id) => {
//         const baseURL = process.env.baseUrl;
//     const recieverEmail = email;
//     const userId = id;

//     try {
//         // Generate jwt token for verification link
//         const verifyToken = await authentications.generateEmailToken({
//             userId: userId,
//         });

//         const verifyUrl = `${baseURL}/partner/auth/verifyemail?verifyEmail=${verifyToken}`;
        
//         if (!recieverEmail || recieverEmail.length === 0) {
//             throw Error.SomethingWentWrong();
//         }

//         // Convert ejs.renderFile to Promise for proper async handling
//         const welcome = await new Promise((resolve, reject) => {
//             ejs.renderFile(
//                 mailTemplatefolder + "/getStarted.ejs", 
//                 { 
//                     username: "partner", 
//                     verify: verifyUrl, 
//                     app_name: "GloUp", 
//                     main_email: "booking@gloup.in" 
//                 }, 
//                 function (err, result) {
//                     if (err) {
//                         reject(err);
//                     } else {
//                         resolve(result);
//                     }
//                 }
//             );
//         });

//         // Create Zepto Mail client and send email
//         let client = new SendMailClient({ url, token });
        
//         const emailResult = await client.sendMail({
//             "bounce_address": "noreply@gloup.in",
//             "from": {
//                 "address": "noreply@gloup.in",
//                 "name": "GloUp"
//             },
//             "to": [
//                 {
//                     "email_address": {
//                         "address": recieverEmail,
//                     }
//                 }
//             ],
//             "subject": `Welcome to ${process.env.APP_NAME} 🛍️`,
//             "htmlbody": welcome,
//         });

//         //console.log("Email sent successfully:", emailResult);
//         return emailResult;

//     } catch (error) {
//         //console.log("🚀 ~ getStarted: ~ error:", error);
//         throw Error.SomethingWentWrong();
//     }
// },
  orderPlaced: async (products, address, customer, orderid) => {
    const recieverEmail = customer.email;
    const baseURL = process.env.baseUrl;

    const url = `${baseURL}/Invoice/${orderid}`


    if (!recieverEmail) {
      throw Error.SomethingWentWrong();
    }
    try {
      const htmlBody = await new Promise((resolve, reject) => {
        ejs.renderFile(
          path.join(mailTemplatefolder, "delivered.ejs"),
          { orders: products, address: address, customer: customer},
          (err, str) => {
            if (err) reject(err);
            else resolve(str);
          }
        );
      });

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM_ADDRESS,
        to: recieverEmail,
        subject: `Order Placed Successfully 🛍️`,
        html: htmlBody,
      });

      return info;
    } catch (error) {
      console.error("Email send error", error);
      throw Error.SomethingWentWrong();
    }
  },  
  notifycompanyofcontact: async (formData, email) => {
    const companyEmail = email || "yourcompany@example.com";

    if (!companyEmail) {
      console.error("Company notification email address is not configured.");
      return null;
    }

    try {
      const htmlBody = await new Promise((resolve, reject) => {
        ejs.renderFile(
          path.join(mailTemplatefolder, "sendinfo.ejs"),
          {
            formData: formData,

          },
          (err, str) => {
            if (err) reject(err);
            else resolve(str);
          }
        );
      });


      const subjectLine = `New Contact Form Submission: ${`from ${formData.name}`}`;

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM_ADDRESS,
        to: companyEmail,
        subject: subjectLine,
        html: htmlBody,

        replyTo: formData.email
      });

      return info;
    } catch (error) {
      console.error("Internal contact notification email send error", error);
      return null;
    }
  },
  resetpassword: async (username, email, status, id, storename, socialinks, passowrd) => {
    const baseURL = process.env.baseUrl;
    const receiverEmail = email;
    const userId = id;
    const userName = username;
    const userStatus = status;
    const store_name = storename;
    const store_mail = socialinks.email


    const verifyToken = await authentications.generateEmailToken({
      userId: userId,
      userName: userName,
      status: userStatus,
      password: passowrd
    });

    const verifyUrl = `${baseURL}/user/auth/resetpassword?verifyEmail=${verifyToken}`;


    if (!receiverEmail) {
      throw Error.SomethingWentWrong();
    }

    try {
      const htmlBody = await new Promise((resolve, reject) => {
        ejs.renderFile(
          path.join(mailTemplatefolder, "passwordreset.ejs"),
          { username: userName, verify: verifyUrl, app_name: store_name, main_email: store_mail },
          (err, str) => {
            if (err) reject(err);
            else resolve(str);
          }
        );
      });

      const info = await transporter.sendMail({
        from: store_mail,
        to: receiverEmail,
        subject: `Welcome to ${process.env.APP_NAME} 🛍️`,
        html: htmlBody,
      });

      return info;
    } catch (err) {
      console.error("Email send error", err);
      throw Error.SomethingWentWrong();
    }
  }
}