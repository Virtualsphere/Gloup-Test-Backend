import { Storage } from '@google-cloud/storage';
import path from 'path';
import multer from 'multer';

// Initialize GCS client with flexible credential loading options
const storageOptions = {
  projectId: process.env.GCS_PROJECT_ID
};

if (process.env.GCS_CREDENTIALS) {
  try {
    storageOptions.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
  } catch (err) {
    console.error("Failed to parse GCS_CREDENTIALS from env:", err);
  }
} else if (process.env.GCS_KEY_FILE) {
  storageOptions.keyFilename = path.resolve(process.env.GCS_KEY_FILE);
}

const storage = new Storage(storageOptions);

const bucketName = process.env.GCS_BUCKET || 'gloup-images';
const bucket = storage.bucket(bucketName);
const baseUrl = process.env.GCS_BASE_URL || `https://storage.googleapis.com/${bucketName}`;

import sharp from 'sharp';

export const uploadToGCS = async (file, folder) => {
  const cleanName = file.originalname.replace(/\s+/g, "-");
  const newFileName = `${Date.now()}-${cleanName}`;
  const key = `${folder}/${newFileName}`; 
  const gcsFile = bucket.file(key);

  console.log(`[GCS Upload] Starting processing for: ${file.originalname} (${file.mimetype})`);

  let processedBuffer;
  if (
    file.mimetype === "image/gif" ||
    file.mimetype === "application/pdf" ||
    file.mimetype === "image/heic" ||
    file.mimetype === "image/heif" ||
    file.mimetype.startsWith("video/")
  ) {
    processedBuffer = file.buffer;
  } else if (file.mimetype.startsWith("image/")) {
    processedBuffer = await sharp(file.buffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .toFormat("jpeg", { quality: 80 })
      .toBuffer();
  } else {
    processedBuffer = file.buffer; // Fallback
  }

  console.log(`[GCS Upload] Starting upload to GCS for: ${key}`);

  await gcsFile.save(processedBuffer, {
    metadata: {
      contentType: file.mimetype.startsWith("image/") && !["image/gif", "image/heic", "image/heif"].includes(file.mimetype) 
        ? "image/jpeg" 
        : file.mimetype
    },
    resumable: false
  });

  console.log(`[GCS Upload] Success: ${key}`);

  return {
    key,
    url: `${baseUrl}/${key}`,
    fileName: newFileName
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
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'application/pdf'
  ];

  if (allowedTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    console.warn(`⚠️ [FileFilter] Rejected file with mimetype: ${file.mimetype}`);
    cb(new Error(`Invalid file type (${file.mimetype}). Allowed types: JPG, PNG, WEBP, GIF, HEIC, MP4, PDF`));
  }
};

export const GCSUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});
