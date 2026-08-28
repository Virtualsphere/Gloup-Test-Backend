import multer from "multer";

const EXCEL_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
];

const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
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

  if (file.fieldname === "video") {
    if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(
      new Error(
        `Invalid file type for video upload (${file.mimetype}). Allowed types: MP4, MOV, WEBM`
      )
    );
  }

  return cb(new Error(`Unexpected field: ${file.fieldname}`));
};

// WhatsApp's own media limit for video messages is 16MB — sized to match,
// since anything larger would just be rejected by MSG91/WhatsApp anyway.
export const marketingVideoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 16 * 1024 * 1024,
  },
});
