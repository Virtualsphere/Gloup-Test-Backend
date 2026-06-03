import Axios from "axios";
import * as configs from "../../../config/config.js";
import * as Error from "../errors/ErrorConstant.js";






const AppConfig = configs.mode === "production" ? configs.production : configs.development;
const accountNumber = AppConfig.payment.accNumber;
const inAppKey = AppConfig.payment.InAppKey;
var authorization = Buffer.from(AppConfig.payment.id + ':' + AppConfig.payment.secret).toString('base64');

import dotenv from "dotenv";

dotenv.config();

export const service = {

    createContact: async (data) => {
        var requestObj = {
            "name": data.userName,
            "email": data.email,
            "contact": data.phone,
            "type": "customer"
        }
        var endPoint = `https://api.razorpay.com/v1/contacts`;
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        return await Axios.post(endPoint, requestObj, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },


    fetchContactbyId: async (data) => {
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        var endPoint = `https://api.razorpay.com/v1/contacts/${data.id}`;
        return await Axios.get(endPoint, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },


    createFundAccount: async (data, body) => {
        if (body.mode == "upi") {
            var requestObj = {
                "contact_id": data.id,
                "account_type": "vpa",
                "vpa": {
                    "address": body.upiId
                }

            }
        }
        else if (body.mode == "bank") {
            var requestObj = {
                "contact_id": data.id,
                "account_type": "bank_account",
                "bank_account": {
                    "name": body.bankName,
                    "ifsc": body.IFSC,
                    "account_number": body.bankAc
                }
            }
        } else {
            throw Error.SomethingWentWrong('Choose Valid Account Type');
        }

        var endPoint = `https://api.razorpay.com/v1/fund_accounts`;
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        return await Axios.post(endPoint, requestObj, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },


    fetchFundAccountById: async (data) => {
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        var endPoint = `https://api.razorpay.com/v1/fund_accounts/${data.fundAccountId}`;
        return await Axios.get(endPoint, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },


    createPayout: async (data, body) => {
        if (body.mode == "upi") {
            data.mode = "UPI";
        } else {
            // IMPS,NEFT,RTGS
            data.mode = "IMPS";
        }

        var requestObj = {
            "mode": data.mode,
            "account_number": accountNumber,
            "fund_account_id": data.id,
            "amount": Number(body.amount) * 100,
            "currency": "INR",
            "purpose": "payout",
            "queue_if_low_balance": true,
            "narration": "GloUp Wallet Transfer",
        }
        var endPoint = `https://api.razorpay.com/v1/payouts`;
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        return await Axios.post(endPoint, requestObj, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },


    fetchPayoutById: async (data) => {

        //Fetch via PayoutId
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        var endPoint = `https://api.razorpay.com/v1/payouts/${data.payoutId}`;
        return await Axios.get(endPoint, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },

    fetchAllPayouts: async () => {

        //Fetch via Customer Identifier Acc Number
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authorization}`
        }
        var endPoint = `https://api.razorpay.com/v1/payouts?account_number=${accountNumber}`;
        return await Axios.get(endPoint, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong(error);
        });
    },

};


export const inAppService = {

    createPurchase: async (data) => {
        var requestObj = {
            "password": inAppKey,
            "receipt-data": data.receiptData,
            "exclude-old-transactions": false
        }

        //staging endpoint
        var endPoint = `https://sandbox.itunes.apple.com/verifyReceipt`;

        //production endpoint
        // var endPoint = `https://buy.itunes.apple.com/verifyReceipt`;

        var headers = {
            'Content-Type': 'application/json',
        }

        return await Axios.post(endPoint, requestObj, { headers }).then((response) => {
            return response.data;
        }).catch((error) => {
            throw Error.SomethingWentWrong("Unable to Verify InAPP Purchase");
        });
    },


}


