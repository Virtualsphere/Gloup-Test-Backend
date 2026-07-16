import multer from "multer";

const EXCEL_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
];

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "excel") {
    if (EXCEL_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(
      new Error(
        `Invalid file type for excel upload (${file.mimetype}). Allowed types: XLS, XLSX`
      )
    );
  }

  if (file.fieldname === "image") {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(
      new Error(
        `Invalid file type for image upload (${file.mimetype}). Allowed types: JPG, PNG, WEBP, GIF, HEIC`
      )
    );
  }

  return cb(new Error(`Unexpected field: ${file.fieldname}`));
};

export const marketingUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});