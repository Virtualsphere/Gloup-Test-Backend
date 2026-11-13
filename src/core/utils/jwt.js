import jwt from "jsonwebtoken";
import * as Error from "../errors/ErrorConstant.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_RESET_PURPOSE = "admin-password-reset";
const adminResetKey = (admin) => `${process.env.jwtEmailSecret}.${admin.password}`;

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

    // Admin password-reset links. The signing key includes the admin's current
    // password hash, so a link stops working as soon as the password changes
    // (single use) without needing a token table.
    generateAdminResetToken: (admin, expiresInMinutes) => {
        return jwt.sign(
            { email: admin.email, purpose: ADMIN_RESET_PURPOSE },
            adminResetKey(admin),
            { algorithm: "HS256", expiresIn: `${expiresInMinutes}m` }
        );
    },
    // Unverified: only says which admin's key to verify the token against.
    readAdminResetEmail: (token) => {
        const email = jwt.decode(token)?.email;
        return typeof email === "string" ? email : null;
    },
    verifyAdminResetToken: (token, admin) => {
        try {
            const payload = jwt.verify(token, adminResetKey(admin), { algorithms: ["HS256"] });
            return payload.purpose === ADMIN_RESET_PURPOSE && payload.email === admin.email;
        } catch {
            return false;
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