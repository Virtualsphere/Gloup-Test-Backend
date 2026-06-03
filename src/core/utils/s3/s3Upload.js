import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'video/mp4',
    'application/pdf'
  ];

  if (allowedTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    console.warn(`⚠️ [FileFilter] Rejected file with mimetype: ${file.mimetype}`);
    cb(new Error(`Invalid file type (${file.mimetype}). Only JPEG, PNG, WEBP, MP4, and PDF are allowed.`));
  }
};

export const S3upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 }
});

export const uploadToS3 = async (file, folder) => {
  const startTime = Date.now();
  try {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/gif",
      "image/heic",
      "image/heif",
      "application/pdf"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`Unsupported type: ${file.mimetype}. Allowed: JPG, PNG, GIF, HEIC, PDF`);
    }

    const cleanName = file.originalname.replace(/\s+/g, "-");

    const oldkey = `upload/common/${folder}/${file.originalname}`;

    // ✅ delete if already exists
    await deleteIfExists(oldkey);

    const newFileName = `${Date.now()}-${cleanName}`;
    const key = `upload/common/${folder}/${newFileName}`;
    const uploadDirPath = path.resolve(path.join('upload', 'common', folder));
    const filePath = path.join(uploadDirPath, newFileName);

    await fs.promises.mkdir(uploadDirPath, { recursive: true });

    console.log(`[Local Upload] Starting processing for: ${file.originalname} (${file.mimetype})`);

    let processedImage;

    // ✅ Bypass sharp for GIFs, PDFs, and HEIC/HEIF
    if (
      file.mimetype === "image/gif" ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "image/heic" ||
      file.mimetype === "image/heif"
    ) {
      console.log(`[Local Upload] Bypassing Sharp for ${file.mimetype}`);
      processedImage = file.buffer;
    } else {
      console.time(`[Local Upload] Sharp Process: ${file.originalname}`);
      processedImage = await sharp(file.buffer)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .toFormat("jpeg", { quality: 80 })
        .toBuffer();
      console.timeEnd(`[Local Upload] Sharp Process: ${file.originalname}`);
    }

    console.log(`[Local Upload] Saving to disk: ${key}`);
    const uploadStartTime = Date.now();

    await fs.promises.writeFile(filePath, processedImage);

    console.log(`[Local Upload] Success: ${key} (Upload took: ${Date.now() - uploadStartTime}ms, Total took: ${Date.now() - startTime}ms)`);

    return {
      key,
      url: `${process.env.baseUrl || 'http://localhost:' + (process.env.APP_PORT || 5678)}/${key}`,
      fileName: newFileName,
    };
  } catch (error) {
    console.error("Local Upload Error:", error);
    throw new Error(`Upload failed: ${error.message}`);
  }
};


export const deleteIfExists = async (key) => {
  try {
    const filePath = path.resolve(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log("Deleted existing file:", key);
    }
  } catch (err) {
    console.error("Error deleting file:", err);
  }
};