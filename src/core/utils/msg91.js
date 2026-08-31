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
    /* =====================================================================
       MARKETING SMS (bulk, static DLT-approved templates)
       ---------------------------------------------------------------------
       Two fixed templates — content is DLT-registered, so it must never be
       edited/personalized here, only the recipient list changes.
       ===================================================================== */
    sendMarketingSMS: async ({ recipients, templateId }) => {
        if (!process.env.AUTHKEY) {
            console.error("[SMS] AUTHKEY not configured, skipping marketing SMS send");
            return {
                skipped: true,
                reason: "AUTHKEY not configured",
                total_recipients_in_sheet: recipients.length,
                valid_numbers: 0,
                invalid_numbers: recipients.length,
                batches_sent: 0,
                batches_failed: 0,
            };
        }

        const SMS_BATCH_SIZE = 100;
        const INDIA_COUNTRY_CODE = "91";

        const formatMobile = (raw) => {
            if (!raw) return null;
            let digits = String(raw).replace(/\D/g, "");
            if (!digits) return null;
            if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
            if (digits.length === 12 && digits.startsWith(INDIA_COUNTRY_CODE)) {
                return /^[6-9]\d{9}$/.test(digits.slice(2)) ? digits : null;
            }
            if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
                return INDIA_COUNTRY_CODE + digits;
            }
            return null;
        };

        const validNumbers = [];
        const invalidNumbers = [];
        recipients.forEach((r) => {
            const formatted = formatMobile(r.phone);
            if (formatted) validNumbers.push(formatted);
            else invalidNumbers.push(r.phone);
        });

        const uniqueNumbers = [...new Set(validNumbers)];

        const batches = [];
        for (let i = 0; i < uniqueNumbers.length; i += SMS_BATCH_SIZE) {
            batches.push(uniqueNumbers.slice(i, i + SMS_BATCH_SIZE));
        }

        let batchesSent = 0;
        let batchesFailed = 0;
        const errors = [];

        for (const batch of batches) {
            const payload = {
                template_id: templateId,
                short_url: "0",
                recipients: batch.map((mobiles) => ({ mobiles })),
            };

            try {
                const response = await axios.post(
                    "https://api.msg91.com/api/v5/flow/",
                    payload,
                    {
                        headers: {
                            authkey: process.env.AUTHKEY,
                            "content-type": "application/json",
                        },
                    }
                );
                batchesSent++;
                console.log(`[SMS Marketing] Sent batch of ${batch.length} numbers`, response.data);
            } catch (error) {
                batchesFailed++;
                const errData = error?.response?.data || error.message;
                errors.push({ batch_size: batch.length, error: errData });
                console.error("[SMS Marketing] Batch failed:", errData);
            }
        }

        return {
            total_recipients_in_sheet: recipients.length,
            valid_numbers: uniqueNumbers.length,
            invalid_numbers: invalidNumbers.length,
            invalid_numbers_sample: invalidNumbers.slice(0, 10),
            batches_sent: batchesSent,
            batches_failed: batchesFailed,
            errors,
        };
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