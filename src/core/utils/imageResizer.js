import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  // destination: (req, file, cb) => {
  //   const uploadDir = path.join(__dirname, '../../../assets/Original');
  //   cb(null, uploadDir);
  // },
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, '../../../upload/Original');
      await fs.promises.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },

  filename: (req, file, cb) => {
    // Remove leading timestamps (digits and dashes) from the original filename
    const cleanedOriginal = file.originalname.replace(/^\d{10,}-/, '');
    const uniqueFilename = `${Date.now()}-${cleanedOriginal}`;
    cb(null, uniqueFilename);
  }
});

const categorystorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, '../../../upload/categoryimage');
      // Check if folder exists
      if (!fs.existsSync(uploadDir)) {
        await fs.promises.mkdir(uploadDir, { recursive: true });
      }
      await fs.promises.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },

  filename: (req, file, cb) => {
    // Remove leading timestamps (digits and dashes) from the original filename
    const cleanedOriginal = file.originalname.replace(/^\d{10,}-/, '');
    const uniqueFilename = `${Date.now()}-${cleanedOriginal}`;
    cb(null, uniqueFilename);
  }
});

const bannerstorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, '../../../upload/bannerimage');
      // Check if folder exists
      if (!fs.existsSync(uploadDir)) {
        await fs.promises.mkdir(uploadDir, { recursive: true });
      }
      await fs.promises.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },

  filename: (req, file, cb) => {
    // Remove leading timestamps (digits and dashes) from the original filename
    const cleanedOriginal = file.originalname.replace(/^\d{10,}-/, '');
    const uniqueFilename = `${Date.now()}-${cleanedOriginal}`;
    cb(null, uniqueFilename);
  }
});

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

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const categoryupload = multer({
  storage: categorystorage,
  fileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024
  }
});

const bannerupload = multer({
  storage: bannerstorage,
  fileFilter,
  limits: {
    fileSize: 4 * 1024 * 1024
  }
});

const imageSizeMiddleware = async (req, res, next) => {
  console.log("✅ imageSizeMiddleware START");


  if (!req.files || Object.keys(req.files).length === 0) {
    console.log("⚠️ No files found, skipping");
    return next();
  }
  try {
    const baseResized = path.join(__dirname, '../../../upload/Resized');
    console.log("🚀 ~ imageSizeMiddleware ~ baseResized:", baseResized)
    const baseDocs = path.join(__dirname, '../../../upload/Docs');
    console.log("🚀 ~ imageSizeMiddleware ~ baseDocs:", baseDocs)

    // ensure your output dirs exist
    await fs.promises.mkdir(path.join(baseResized, 'Images'), { recursive: true });
    await fs.promises.mkdir(baseDocs, { recursive: true });


    // Loop over each field (images, documents, etc.)
    for (const fieldName of Object.keys(req.files)) {
      for (const file of req.files[fieldName]) {
        const { mimetype, path: tmpPath, filename } = file;

        if (mimetype.startsWith('image/')) {
          const outDir = path.join(baseResized, 'Images');
          const outPath = path.join(outDir, filename);

          if (!fs.existsSync(tmpPath)) {
            console.error(`❌ [Sharp] Input file missing: ${tmpPath}`);
            continue;
          }

          try {
            await sharp(tmpPath)
              .resize({ width: 800, fit: 'inside', withoutEnlargement: true })
              .toFormat(mimetype === 'image/png' ? 'png' : 'jpeg', { quality: 80 })
              .toFile(outPath);

            await fs.promises.unlink(tmpPath).catch(() => { });
            file.path = outPath;
            file.filename = filename;
          } catch (sharpError) {
            console.error(`❌ [Sharp Error] Failed to process ${filename}:`, sharpError.message);
          }

        } else if (mimetype === 'application/pdf') {
          // -- move PDFs to Docs folder --
          const outPath = path.join(baseDocs, filename);
          await fs.promises.rename(tmpPath, outPath);
          file.path = outPath;
          file.filename = filename;

        } else if (mimetype.startsWith('video/')) {
          // -- move videos --
          const outDir = path.join(baseResized, 'Videos');
          await fs.promises.mkdir(outDir, { recursive: true });
          const outPath = path.join(outDir, filename);
          await fs.promises.rename(tmpPath, outPath);
          file.path = outPath;
          file.filename = filename;

        } else {
          // remove unexpected file types
          await fs.promises.unlink(tmpPath);
          throw new Error(`Unsupported file type: ${mimetype}`);
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

const profileimage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const processedDir = path.join(__dirname, '../../../upload/profileimage');
    await fs.promises.mkdir(processedDir, { recursive: true });

    for (const file of req.files) {
      const filename = file.filename;
      const filePath = path.join(processedDir, filename);

      if (file.mimetype.startsWith('image/')) {
        const format = file.mimetype === 'image/png' ? 'png' : 'jpeg';

        await sharp(file.path)
          .resize({ width: 800, fit: 'inside', withoutEnlargement: true })
          .toFormat(format, { quality: 80 })
          .toFile(filePath);

        await fs.promises.unlink(file.path).catch(() => { });
        file.path = filePath;
        file.filename = filename;
      } else {
        return next(new Error('Invalid file type for profile image'));
      }
    }

    next();
  } catch (error) {
    console.error('Error processing profile image:', error);
    next(error);
  }
};

const categoryimage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();
  try {
    const processedDir = path.join(__dirname, '../../../upload/categoryimage');
    await fs.promises.mkdir(processedDir, { recursive: true });
    for (const file of req.files) {
      const filename = file.filename;
      const filePath = path.join(processedDir, filename);
      if (file.mimetype.startsWith('image/')) {
        const format = file.mimetype === 'image/png' ? 'png' : 'jpeg';
        await sharp(file.path).resize({ width: 800, fit: 'inside', withoutEnlargement: true })
          .toFormat(format, { quality: 80 })
          .toFile(filePath);
        await fs.promises.unlink(file.path).catch(() => { });
        file.path = filePath;
        file.filename = filename;
      } else {
        return next(new Error('Invalid file type for category image'));
      }
    }
    next();
  } catch (error) {
    console.error('Error processing category image:', error);
    next(error);
  }
};

const bannerimage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const processedDir = path.join(__dirname, '../../../upload/bannerimage');
    await fs.promises.mkdir(processedDir, { recursive: true });

    for (const file of req.files) {
      const filename = file.filename;
      const outputPath = path.join(processedDir, filename);
      const tempPath = path.join(processedDir, `resized-${filename}`);

      if (file.mimetype.startsWith('image/')) {
        const format = file.mimetype === 'image/png' ? 'png' : 'jpeg';

        await sharp(file.path)
          .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
          .toFormat(format, { quality: 80 })
          .toFile(tempPath);

        // remove original file
        await fs.promises.unlink(file.path).catch(() => { });

        // rename resized file
        await fs.promises.rename(tempPath, outputPath);

        file.path = outputPath;
        file.filename = filename;

      } else {
        return next(new Error('Invalid file type for banner image'));
      }
    }

    next();
  } catch (error) {
    console.error('Error processing banner image:', error);
    next(error);
  }
};

// const profileimage = async (req, res, next) => {
//   if (!req.files || req.files.length === 0) {
//     return next();
//   }

//   try {
//     const processedDir = path.join(__dirname, '../../../assets/profileimage');
//     await fs.promises.mkdir(processedDir, { recursive: true });

//     for (let file of req.files) {
//       const filename = file.filename;
//       const filePath = path.join(processedDir, filename);

//       if (!file.mimetype.startsWith('image')) {
//         return next(new Error('Invalid file type for profile image'));
//       }

//       await fs.promises.rename(file.path, filePath);

//       file.path = filePath;
//       file.filename = filename;
//     }

//     next();
//   } catch (error) {
//     next(error);
//   }
// };


export { upload, categoryupload, bannerupload, imageSizeMiddleware, profileimage, categoryimage, bannerimage };