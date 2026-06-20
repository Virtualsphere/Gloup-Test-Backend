import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("../../../config/firebase.json");

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL =
    serviceAccount.token_uri || "https://oauth2.googleapis.com/token";

let cachedToken = null;
let tokenExpiresAt = 0;

function base64url(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function createSignedJwt() {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: serviceAccount.client_email,
        scope: FCM_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
    };

    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = crypto
        .createSign("RSA-SHA256")
        .update(unsigned)
        .sign(serviceAccount.private_key, "base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    return `${unsigned}.${signature}`;
}

/** OAuth via fetch — works when google-auth-library https fails in Docker on Windows. */
export async function getFcmAccessTokenViaFetch() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
        return cachedToken;
    }

    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: createSignedJwt(),
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Google OAuth failed (${response.status}): ${body.slice(0, 200)}`
        );
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return cachedToken;
}

export function getFirebaseProjectId() {
    return serviceAccount.project_id;
}
