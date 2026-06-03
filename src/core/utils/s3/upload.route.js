import express from "express";
import { uploadToS3 } from "./s3Upload.js";

const router = express.Router();

router.post("/upload", uploadToS3, (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      url: req.file.location,
      key: req.file.key
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;