import jwt from "jsonwebtoken";
import * as Error from "../errors/ErrorConstant.js";
import dotenv from "dotenv";
dotenv.config();

export const authentications = {
    generateUserJWT: async (token) => {
        try {
            return jwt.sign(token, process.env.jwtuserSecretKey, {
                algorithm: "HS256",
                // expiresIn: "60d"
            });
        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    verifyUserJWT: async (header) => {
        try {
            return jwt.verify(header, process.env.jwtuserSecretKey);
        } catch (error) {
            return null;
            // throw Error.SomethingWentWrong("Token Expired..!Login Again");
        }
    },
    verifyadminJWT: async (header) => {
        try {
            return jwt.verify(header, process.env.jwtadminSecretkey);
        } catch (error) {
            return null;
            // throw Error.SomethingWentWrong("Token Expired..!Login Again");
        }
    },
    generatePartnerJWt: async (token) => {
        try {
            return jwt.sign(token, process.env.jwtPartnerSecretkey, {
                algorithm: "HS256",
            });
        } catch (error) {
            return null;

        }
    },
    verifyPartnerJWt: async (header) => {
        try {
            return jwt.verify(header, process.env.jwtPartnerSecretkey);
        } catch (error) {
            return null;

        }
    },
    generateEmailToken: async (token) => {
        try {
            return jwt.sign(token, process.env.jwtEmailSecret, {
                algorithm: "HS256",
                expiresIn: "10m"
            });
        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    verifyEmailToken: async (token) => {
        try {
            return jwt.verify(token, process.env.jwtEmailSecret);
        } catch (error) {
            return null;
        }
    },

    generateAdminJWT: async (token) => {
        try {
            return jwt.sign(token, process.env.jwtadminSecretkey, {
                algorithm: "HS256",
                // expiresIn: "30d"

            });
        } catch (error) {
            throw Error.SomethingWentWrong("Unable to Generate Token");
        }
    },
    verifyAdminJWT: async (header) => {
        try {
            return jwt.verify(header, configs.jwtAdminSecret);
        } catch (error) {
            return null;
        }
    },
};