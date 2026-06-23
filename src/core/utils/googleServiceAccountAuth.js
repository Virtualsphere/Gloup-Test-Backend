import crypto from "crypto";
import fs from "fs";
import path from "path";

let cachedServiceAccount = null;
let cachedServiceAccountPath = null;

function isServiceAccountFile(filePath) {
    try {
        const account = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return (
            account?.type === "service_account" &&
            typeof account.private_key === "string" &&
            typeof account.client_email === "string"
        );
    } catch {
        return false;
    }
}

function resolveServiceAccountPath() {
    const candidates = [
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        path.resolve("config/firebase.json"),
        process.env.GCS_KEY_FILE,
        path.resolve("config/gcs-credentials.json"),
    ].filter(Boolean);

    for (const keyFile of candidates) {
        const resolved = path.isAbsolute(keyFile)
            ? keyFile
            : path.resolve(keyFile);
        if (fs.existsSync(resolved) && isServiceAccountFile(resolved)) {
            return resolved;
        }
    }

    return null;
}

function normalizePrivateKey(privateKey) {
    if (!privateKey || typeof privateKey !== "string") {
        throw new Error("Service account private_key is missing or invalid");
    }

    return privateKey.includes("\\n")
        ? privateKey.replace(/\\n/g, "\n")
        : privateKey;
}

function loadServiceAccount() {
    const accountPath = resolveServiceAccountPath();
    if (!accountPath) {
        throw new Error("No Google service account credentials file found");
    }

    if (cachedServiceAccount && cachedServiceAccountPath === accountPath) {
        return cachedServiceAccount;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(accountPath, "utf8"));
    serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
    cachedServiceAccount = serviceAccount;
    cachedServiceAccountPath = accountPath;
    return cachedServiceAccount;
}

function base64url(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function createSignedJwt(serviceAccount, scope) {
    const now = Math.floor(Date.now() / 1000);
    const tokenUrl =
        serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
        iss: serviceAccount.client_email,
        scope,
        aud: tokenUrl,
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

    return { jwt: `${unsigned}.${signature}`, tokenUrl };
}

const tokenCache = new Map();

/** OAuth via fetch — works when google-auth-library https fails in Docker on Windows. */
export async function getGoogleAccessTokenViaFetch(scope) {
    const cacheKey = `${scope}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - 60_000) {
        return cached.accessToken;
    }

    const serviceAccount = loadServiceAccount();
    const { jwt, tokenUrl } = createSignedJwt(serviceAccount, scope);

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `Google OAuth failed (${response.status}): ${body.slice(0, 200)}`
        );
    }

    const data = await response.json();
    tokenCache.set(cacheKey, {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    });

    return data.access_token;
}
