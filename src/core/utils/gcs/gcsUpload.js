import { Storage } from "@google-cloud/storage";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { randomUUID } from "crypto";
import multer from "multer";
import sharp from "sharp";
import { getGoogleAccessTokenViaFetch } from "../googleServiceAccountAuth.js";

const GCS_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";
const NETWORK_ERROR_CODES = new Set([
    "ERR_STREAM_PREMATURE_CLOSE",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
]);

const storageOptions = {
    projectId: process.env.GCS_PROJECT_ID,
};

// Inline JSON for CI/CD; otherwise the SDK uses GOOGLE_APPLICATION_CREDENTIALS (ADC).
if (process.env.GCS_CREDENTIALS) {
    try {
        storageOptions.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
    } catch (err) {
        console.error("Failed to parse GCS_CREDENTIALS from env:", err);
    }
}

const storage = new Storage(storageOptions);

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
        "[GCS] Using Application Default Credentials:",
        process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
}

const bucketName = process.env.GCS_BUCKET || "gloup-images";
const bucket = storage.bucket(bucketName);

function resolveGcsBaseUrl() {
    const defaultUrl = `https://storage.googleapis.com/${bucketName}`;
    const configured = process.env.GCS_BASE_URL?.trim().replace(/\/$/, "");

    if (!configured) {
        return defaultUrl;
    }

    if (configured.endsWith(`/${bucketName}`)) {
        return configured;
    }

    // Common misconfiguration: bucket omitted from the public URL.
    if (configured === "https://storage.googleapis.com") {
        console.warn(
            `[GCS] GCS_BASE_URL is missing bucket name; using ${defaultUrl}`
        );
        return defaultUrl;
    }

    return `${configured}/${bucketName}`;
}

const baseUrl = resolveGcsBaseUrl();

async function uploadToGCSViaFetch(buffer, key, contentType) {
    const accessToken = await getGoogleAccessTokenViaFetch(GCS_SCOPE);
    const url =
        `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}` +
        `/o?uploadType=media&name=${encodeURIComponent(key)}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
        },
        body: buffer,
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `GCS fetch upload failed (${response.status}): ${body.slice(0, 200)}`
        );
    }

    return response.json();
}

function shouldUseFetchFallback(error) {
    if (!error) {
        return false;
    }

    const code = error.code || "";
    const message = String(error.message || "");

    return (
        NETWORK_ERROR_CODES.has(code) ||
        message.includes("credential") ||
        message.includes("Could not load the default credentials")
    );
}

async function saveToGCS(buffer, key, contentType) {
    try {
        const tmpPath = path.join(os.tmpdir(), `gcs-upload-${randomUUID()}`);
        await fs.writeFile(tmpPath, buffer);

        try {
            await bucket.upload(tmpPath, {
                destination: key,
                metadata: { contentType },
                resumable: false,
            });
        } finally {
            await fs.unlink(tmpPath).catch(() => {});
        }

        return "sdk";
    } catch (error) {
        if (!shouldUseFetchFallback(error)) {
            throw error;
        }

        console.warn(
            "[GCS Upload] SDK upload failed, retrying via fetch:",
            error.code || error.message
        );

        await uploadToGCSViaFetch(buffer, key, contentType);
        return "fetch";
    }
}

export const uploadToGCS = async (file, folder) => {
    const cleanName = file.originalname.replace(/\s+/g, "-");
    const newFileName = `${Date.now()}-${cleanName}`;
    const key = `${folder}/${newFileName}`;

    console.log(
        `[GCS Upload] Starting processing for: ${file.originalname} (${file.mimetype})`
    );

    let processedBuffer;
    let contentType;

    if (
        file.mimetype === "image/gif" ||
        file.mimetype === "application/pdf" ||
        file.mimetype === "image/heic" ||
        file.mimetype === "image/heif" ||
        file.mimetype.startsWith("video/")
    ) {
        processedBuffer = file.buffer;
        contentType = file.mimetype;
    } else if (file.mimetype.startsWith("image/")) {
        processedBuffer = await sharp(file.buffer)
            .resize(800, 800, { fit: "inside", withoutEnlargement: true })
            .toFormat("jpeg", { quality: 80 })
            .toBuffer();
        contentType = "image/jpeg";
    } else {
        processedBuffer = file.buffer;
        contentType = file.mimetype;
    }

    console.log(`[GCS Upload] Starting upload to GCS for: ${key}`);

    const transport = await saveToGCS(processedBuffer, key, contentType);

    console.log(`[GCS Upload] Success (${transport}): ${key}`);

    return {
        key,
        url: `${baseUrl}/${key}`,
        fileName: newFileName,
    };
};

export const deleteFromGCS = async (key) => {
    try {
        const file = bucket.file(key);
        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
            console.log(`[GCS Delete] Deleted existing file: ${key}`);
        }
    } catch (err) {
        console.error(`[GCS Delete Error] Failed to delete file ${key}:`, err);
    }
};

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/heic",
        "image/heif",
        "video/mp4",
        "application/pdf",
    ];

    if (allowedTypes.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        console.warn(
            `⚠️ [FileFilter] Rejected file with mimetype: ${file.mimetype}`
        );
        cb(
            new Error(
                `Invalid file type (${file.mimetype}). Allowed types: JPG, PNG, WEBP, GIF, HEIC, MP4, PDF`
            )
        );
    }
};

export const GCSUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 },
});
