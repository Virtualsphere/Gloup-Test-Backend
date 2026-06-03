import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import jwkToPem from 'jwk-to-pem';
dotenv.config();

const config = {
    client_id: process.env.CLIENT_ID,
    team_id: process.env.TEAM_ID,
    key_id: process.env.KEY_ID,
    private_key: fs.readFileSync(process.env.PRIVATE_KEY).toString(),
};

async function exchangeAuthCodeForToken(authData) {
    try {
        const code = authData.authorizationCode;
        const clientSecret = jwt.sign(
            {
                iss: config.team_id,
                aud: "https://appleid.apple.com",
                sub: config.client_id,
            },
            config.private_key,
            {
                algorithm: "ES256",
                expiresIn: "10m",
                keyid: config.key_id,
            }
        );
        const params = new URLSearchParams();
        params.append("code", code);
        params.append("client_id", config.client_id);
        params.append("client_secret", clientSecret);
        params.append("grant_type", "authorization_code");

        const tokenResponse = await axios.post(
            "https://appleid.apple.com/auth/token",
            params,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        return tokenResponse.data;
    } catch (error) {
        console.log("🚀 ~ exchangeAuthCodeForToken ~ error:", error);
        throw error;
    }
}

async function getApplePublicKeys() {
    const publicKeyResponse = await axios.get('https://appleid.apple.com/auth/keys');
    return publicKeyResponse.data.keys;
}

async function verifyIdToken(idToken) {
    try {
        const publicKeys = await getApplePublicKeys();
        const decoded = jwt.decode(idToken, { complete: true });

        const kid = decoded.header.kid;
        const applePublicKey = publicKeys.find(key => key.kid === kid);

        if (!applePublicKey) {
            throw new Error('Apple public key not found for the given key ID');
        }

        const publicKey = jwkToPem(applePublicKey);

        const verifiedToken = jwt.verify(idToken, publicKey, {
            algorithms: ['RS256'],
            audience: config.client_id,
            issuer: 'https://appleid.apple.com',
        });

        return verifiedToken;
    } catch (error) {
        console.log("🚀 ~ verifyIdToken ~ error:", error);
        throw error;
    }
}

export const appleAuthentication = {
    appleLogin: async (authData) => {
        try {
            const tokenResponse = await exchangeAuthCodeForToken(authData);
            const idToken = tokenResponse.id_token;
            const verifiedToken = await verifyIdToken(idToken);
            return verifiedToken;
        } catch (error) {
            console.error('Error:', error);
        }
    },
};

const config1 = {
    client_id: process.env.PARTNER_CLIENT_ID,
    team_id: process.env.TEAM_ID,
    key_id: process.env.KEY_ID,
    private_key: fs.readFileSync(process.env.PRIVATE_KEY).toString(),
};

async function exchangePartnerCodeForToken(authData) {
    try {
        const code = authData.authorizationCode;
        const clientSecret = jwt.sign(
            {
                iss: config1.team_id,
                aud: "https://appleid.apple.com",
                sub: config1.client_id,
            },
            config1.private_key,
            {
                algorithm: "ES256",
                expiresIn: "10m",
                keyid: config1.key_id,
            }
        );
        const params = new URLSearchParams();
        params.append("code", code);
        params.append("client_id", config1.client_id);
        params.append("client_secret", clientSecret);
        params.append("grant_type", "authorization_code");

        const tokenResponse = await axios.post(
            "https://appleid.apple.com/auth/token",
            params,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        return tokenResponse.data;
    } catch (error) {
        console.log("🚀 ~ exchangeAuthCodeForToken ~ error:", error);
        throw error;
    }
}

async function getApplePartnerPublicKeys() {
    const publicKeyResponse = await axios.get('https://appleid.apple.com/auth/keys');
    return publicKeyResponse.data.keys;
}

async function verifyPartnerIdToken(idToken) {
    try {
        const publicKeys = await getApplePartnerPublicKeys();
        const decoded = jwt.decode(idToken, { complete: true });

        const kid = decoded.header.kid;
        const applePublicKey = publicKeys.find(key => key.kid === kid);

        if (!applePublicKey) {
            throw new Error('Apple public key not found for the given key ID');
        }

        const publicKey = jwkToPem(applePublicKey);

        const verifiedToken = jwt.verify(idToken, publicKey, {
            algorithms: ['RS256'],
            audience: config1.client_id,
            issuer: 'https://appleid.apple.com',
        });

        return verifiedToken;
    } catch (error) {
        console.log("🚀 ~ verifyIdToken ~ error:", error);
        throw error;
    }
}

export const appleAuthentication1 = {
    appleLogin: async (authData) => {
        try {
            const tokenResponse = await exchangePartnerCodeForToken(authData);
            const idToken = tokenResponse.id_token;
            const verifiedToken = await verifyPartnerIdToken(idToken);
            return verifiedToken;
        } catch (error) {
            console.error('Error:', error);
        }
    },
};


// import jwt from 'jsonwebtoken';
// import axios from 'axios';
// import dotenv from 'dotenv';
// import fs from 'fs';
// import jwkToPem from 'jwk-to-pem';
// dotenv.config();

// const config = {
//   user_client_id: process.env.USER_CLIENT_ID,
//   partner_client_id: process.env.PARTNER_CLIENT_ID,
//   team_id: process.env.TEAM_ID,
//   key_id: process.env.KEY_ID,
//   private_key: fs.readFileSync(process.env.PRIVATE_KEY).toString(),
// };

// async function exchangeAuthCodeForToken(authData, loginType = "user") {
//   try {
//     const code = authData.authorizationCode;
//     const client_id =
//       loginType === "partner"
//         ? config.partner_client_id
//         : config.user_client_id;
//     const clientSecret = jwt.sign(
//       {
//         iss: config.team_id,
//         aud: "https://appleid.apple.com",
//         sub: client_id,
//       },
//       config.private_key,
//       {
//         algorithm: "ES256",
//         expiresIn: "10m", 
//         keyid: config.key_id,
//       }
//     );

//     const params = new URLSearchParams();
//     params.append("code", code);
//     params.append("client_id", client_id);
//     params.append("client_secret", clientSecret);
//     params.append("grant_type", "authorization_code");

//     const tokenResponse = await axios.post(
//       "https://appleid.apple.com/auth/token",
//       params,
//       { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//     );

//     return tokenResponse.data;
//   } catch (error) {
//     console.log("🚀 ~ exchangeAuthCodeForToken ~ error:", error);
//     throw error;
//   }
// }

// async function getApplePublicKeys() {
//   const publicKeyResponse = await axios.get(
//     "https://appleid.apple.com/auth/keys"
//   );
//   return publicKeyResponse.data.keys;
// }

// async function verifyIdToken(idToken) {
//   try {
//     const publicKeys = await getApplePublicKeys();
//     const decoded = jwt.decode(idToken, { complete: true });
//     const kid = decoded.header.kid;
//     const applePublicKey = publicKeys.find((key) => key.kid === kid);
//     if (!applePublicKey) {
//       throw new Error("Apple public key not found for the given key ID");
//     }
//     const publicKey = jwkToPem(applePublicKey);
//     const verifiedToken = jwt.verify(idToken, publicKey, {
//       algorithms: ["RS256"],
//       issuer: "https://appleid.apple.com",
//     });
//     const validAudiences = [
//       config.user_client_id,
//       config.partner_client_id,
//     ];
//     if (!validAudiences.includes(verifiedToken.aud)) {
//       throw new Error("Invalid client ID (audience mismatch)");
//     }
//     return verifiedToken;
//   } catch (error) {
//     console.log("🚀 ~ verifyIdToken ~ error:", error);
//     throw error;
//   }
// }

// export const appleAuthentication = {
//   appleLogin: async (authData, loginType = "user") => {
//     try {
//       const tokenResponse = await exchangeAuthCodeForToken(
//         authData,
//         loginType
//       );
//       const idToken = tokenResponse.id_token;
//       const verifiedToken = await verifyIdToken(idToken);
//       return verifiedToken;
//     } catch (error) {
//       console.error("Error:", error);
//       throw error;
//     }
//   },
// };


// import jwt from 'jsonwebtoken';
// import axios from 'axios';
// import dotenv from 'dotenv';
// import fs from 'fs';
// import jwkToPem from 'jwk-to-pem';

// // Load environment variables
// dotenv.config();

// console.log("PRIVATE KEY PATH:", process.env.PRIVATE_KEY);
// console.log("FILE EXISTS:", fs.existsSync(process.env.PRIVATE_KEY));

// // --- Configuration (Ensure your .env variables are loaded correctly) ---
// const config = {
//     client_id: process.env.CLIENT_ID,
//     team_id: process.env.TEAM_ID,
//     key_id: process.env.KEY_ID,
//     // Safely read the private key file
//     private_key: fs.readFileSync(process.env.PRIVATE_KEY, 'utf8').toString(),
// };

// // --- Helper Functions ---

// /**
//  * Exchanges the Apple Authorization Code for an access token and ID token.
//  * @param {string} authCode The authorization code received from the client.
//  * @returns {Promise<object>} The token response data, including id_token.
//  */
// async function exchangeAuthCodeForToken(authCode) {
//     try {
//         // 1. Generate the Client Secret JWT (used for secure communication with Apple)
//         const clientSecret = jwt.sign({
//             iss: process.env.TEAM_ID,
//             aud: "https://appleid.apple.com",
//             sub: process.env.CLIENT_ID // The bundle ID
//         }, config.private_key, {
//             algorithm: 'ES256',
//             expiresIn: "10m",
//             keyid: config.key_id
//         });

//         // 2. Exchange the code for tokens
//         const tokenResponse = await axios.post('https://appleid.apple.com/auth/token', new URLSearchParams({
//             code: authCode,
//             client_id: config.client_id,
//             client_secret: clientSecret,
//             grant_type: 'authorization_code',
//         }).toString(), {
//             headers: {
//                 "content-type": "application/x-www-form-urlencoded",
//             },
//         });
        
//         return tokenResponse.data;
//     } catch (error) {
//         // Log the detailed error response from Apple if available
//         console.error("🚀 ~ exchangeAuthCodeForToken Error Response:", error.response?.data || error.message);
//         throw new Error("Failed to exchange auth code for tokens.");
//     }
// }

// /**
//  * Fetches Apple's public keys for ID token verification.
//  * @returns {Promise<Array<object>>} An array of Apple's public keys.
//  */
// async function getApplePublicKeys() {
//     try {
//         const publicKeyResponse = await axios.get('https://appleid.apple.com/auth/keys');
//         return publicKeyResponse.data.keys;
//     } catch (error) {
//         console.error("🚀 ~ getApplePublicKeys Error:", error.message);
//         throw new Error("Failed to fetch Apple public keys.");
//     }
// }

// /**
//  * Verifies the integrity and authenticity of the ID token.
//  * @param {string} idToken The token received from Apple.
//  * @returns {Promise<object>} The verified payload of the token.
//  */
// async function verifyIdToken(idToken) {
//     try {
//         const publicKeys = await getApplePublicKeys();
//         const decoded = jwt.decode(idToken, { complete: true });
        
//         if (!decoded || !decoded.header) {
//              throw new Error('Invalid ID token format.');
//         }
        
//         const kid = decoded.header.kid;
//         const applePublicKey = publicKeys.find(key => key.kid === kid);

//         if (!applePublicKey) {
//             throw new Error(`Apple public key not found for key ID: ${kid}`);
//         }
        
//         // Convert the JWK key to PEM format for verification
//         const publicKey = jwkToPem(applePublicKey);

//         // Verify the token
//         const verifiedToken = jwt.verify(idToken, publicKey, {
//             algorithms: ['RS256'],
//             audience: process.env.CLIENT_ID,
//             issuer: 'https://appleid.apple.com'
//         });

//         return verifiedToken;
//     } catch (error) {
//         console.error("🚀 ~ verifyIdToken Error:", error.message);
//         throw new Error(`ID token verification failed: ${error.message}`);
//     }
// }

// // --- Exported Authentication Functions ---
// export const appleAuthentication = {
//     appleLogin: async (authCode) => {
//         const tokenResponse = await exchangeAuthCodeForToken(authCode);
//         const idToken = tokenResponse.id_token;
//         const verifiedToken = await verifyIdToken(idToken);
        
//         // Return the verified payload (containing 'sub', 'email', etc.)
//         return verifiedToken;
//     },
// };





// import jwt from 'jsonwebtoken';
// import axios from 'axios';
// import jwkToPem from 'jwk-to-pem';
// import fs from 'fs';
// import dotenv from 'dotenv';

// dotenv.config();

// const config = {
//     client_id: process.env.SERVICE_ID,           // com.gloup.userapp.service
//     team_id: process.env.TEAM_ID,                // HP59PZAVRP
//     key_id: process.env.KEY_ID,                  // Key ID from .p8
//     private_key: fs.readFileSync(process.env.PRIVATE_KEY).toString(),
// };

// // -------------------------
// // 1️⃣ EXCHANGE AUTH CODE
// // -------------------------
// export async function exchangeAuthCodeForToken(authCode) {
//     try {
//         const clientSecret = jwt.sign(
//             {
//                 iss: config.team_id,
//                 aud: "https://appleid.apple.com",
//                 sub: config.client_id,
//             },
//             config.private_key,
//             {
//                 algorithm: "ES256",
//                 expiresIn: "10m",
//                 keyid: config.key_id,
//             }
//         );

//         const params = new URLSearchParams();
//         params.append("code", authCode);
//         params.append("client_id", config.client_id);
//         params.append("client_secret", clientSecret);
//         params.append("grant_type", "authorization_code");

//         const tokenResponse = await axios.post(
//             "https://appleid.apple.com/auth/token",
//             params.toString(),
//             {
//                 headers: {
//                     "Content-Type": "application/x-www-form-urlencoded",
//                 },
//             }
//         );

//         return tokenResponse.data;

//     } catch (err) {
//         console.log("❌ exchangeAuthCodeForToken Error:", err.response?.data || err.message);
//         throw err;
//     }
// }

// // -------------------------
// // 2️⃣ VERIFY ID TOKEN
// // -------------------------
// async function getApplePublicKeys() {
//     const response = await axios.get("https://appleid.apple.com/auth/keys");
//     return response.data.keys;
// }

// export async function verifyIdToken(idToken) {
//     try {
//         const keys = await getApplePublicKeys();
//         const decodedHeader = jwt.decode(idToken, { complete: true }).header;

//         const appleKey = keys.find(k => k.kid === decodedHeader.kid);
//         if (!appleKey) throw new Error("Apple public key not found");

//         const publicKey = jwkToPem(appleKey);

//         const verifiedToken = jwt.verify(idToken, publicKey, {
//             algorithms: ["RS256"],
//             audience: config.client_id,
//             issuer: "https://appleid.apple.com",
//         });

//         return verifiedToken;

//     } catch (err) {
//         console.log("❌ verifyIdToken Error:", err.message);
//         throw err;
//     }
// }


// export const appleAuthentication = {
//     appleLogin: async (authorizationCode) => {
//         const tokenResponse = await exchangeAuthCodeForToken(authorizationCode);

//         const idToken = tokenResponse.id_token;
//         if (!idToken) throw new Error("Missing id_token");

//         const verifiedUser = await verifyIdToken(idToken);

//         return verifiedUser;
//     }
// };