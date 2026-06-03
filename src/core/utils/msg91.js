// import jwt from "jsonwebtoken";
import axios from "axios";
import capitalize from 'lodash/capitalize.js';
import * as Error from "../errors/ErrorConstant.js";


export const messagingFunction = {
    sendOTP: async (data) => {
        console.log("🔍 [DEBUG] [MSG91] Mocking sendOTP for:", data.phone);

        var userName = capitalize(data.firstname);
        var phone = '91' + data.phone;
        const endPoint = `https://api.msg91.com/api/v5/otp?template_id=${process.env.LoginTemplateID}&mobile=${phone}&authkey=${process.env.AUTHKEY}`;
        try {
            return await axios.post(endPoint, { NAME: userName }, {
                headers: { 'Access-Control-Allow-Origin': '*' },
                withCredentials: false,
                timeout: 10000
            });
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong();
        }

        // console.log("✅ [DEBUG] [MSG91] Mock sendOTP returning success.");
        // return { data: { type: "success", request_id: "STATIC_REQ_ID" } };
    },
    verifyOTP: async (data) => {
        console.log("🔍 [DEBUG] [MSG91] Mocking verifyOTP for:", data.phone, "with code:", data.otp);

        try {
            var phone = "91" + data.phone;
            var endPoint = `https://api.msg91.com/api/v5/otp/verify?authkey=${process.env.AUTHKEY}&mobile=${phone}&otp=${data.otp}`;
            return await axios.get(endPoint);
        } catch (error) {
            throw Error.SomethingWentWrong();
        }

        // if (data.otp === "123456") {
        //     console.log("✅ [DEBUG] [MSG91] Mock verifyOTP matched static code.");
        //     return { data: { type: "success" } };
        // } else {
        //     console.warn("❌ [DEBUG] [MSG91] Mock verifyOTP failed (Code != 123456).");
        //     return { data: { type: "error", message: "Invalid OTP (Static 123456 only)" } };
        // }
    },
    purchaseLead: async (data) => {
        try {
            var headers = {
                headers: {
                    "authkey": process.env.AUTHKEY,
                    "content-type": "application/JSON"
                }
            };
            var body = {
                "flow_id": process.env.PurchaseTemplateID,
                "sender": "MYBYER",
                "short_url": "0",
                "mobiles": '91' + data.smsTo,
                "LEADID": "MYBYER" + data.leadId,
                "CONTACT": data.buyerContact,
                "CATEGORY": data.categoryName,
                "BUDGET": data.budgetRange
            };
            var endPoint = `https://api.msg91.com/api/v5/flow/`;
            return await axios.post(endPoint, body, headers);
        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
};