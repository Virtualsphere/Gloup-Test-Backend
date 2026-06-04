import express from 'express';
import { GCSUpload, uploadToGCS } from './gcs/gcsUpload.js';

const upload = GCSUpload;
const categoryupload = GCSUpload;
const bannerupload = GCSUpload;

const imageSizeMiddleware = async (req, res, next) => {
  console.log("✅ imageSizeMiddleware START");

  if (!req.files || Object.keys(req.files).length === 0) {
    console.log("⚠️ No files found, skipping");
    return next();
  }
  
  try {
    for (const fieldName of Object.keys(req.files)) {
      for (let i = 0; i < req.files[fieldName].length; i++) {
        const file = req.files[fieldName][i];
        
        // determine the folder based on mimetype
        let folder = 'common';
        if (file.mimetype.startsWith('image/')) {
          folder = 'Resized/Images';
        } else if (file.mimetype === 'application/pdf') {
          folder = 'Docs';
        } else if (file.mimetype.startsWith('video/')) {
          folder = 'Resized/Videos';
        }
        
        const gcsRes = await uploadToGCS(file, folder);
        
        // Set path to GCS url so downstream can use it
        req.files[fieldName][i].path = gcsRes.url;
        req.files[fieldName][i].filename = gcsRes.fileName;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

const profileimage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    // Also check req.file because upload.single creates req.file
    if (req.file) {
      try {
        const gcsRes = await uploadToGCS(req.file, 'profileimage');
        req.file.path = gcsRes.url;
        req.file.filename = gcsRes.fileName;
        return next();
      } catch (err) {
        return next(err);
      }
    }
    return next();
  }

  try {
    for (let i = 0; i < req.files.length; i++) {
      const gcsRes = await uploadToGCS(req.files[i], 'profileimage');
      req.files[i].path = gcsRes.url;
      req.files[i].filename = gcsRes.fileName;
    }
    next();
  } catch (error) {
    console.error('Error processing profile image:', error);
    next(error);
  }
};

const categoryimage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    if (req.file) {
      try {
        const gcsRes = await uploadToGCS(req.file, 'categoryimage');
        req.file.path = gcsRes.url;
        req.file.filename = gcsRes.fileName;
        return next();
      } catch (err) {
        return next(err);
      }
    }
    return next();
  }
  
  try {
    for (let i = 0; i < req.files.length; i++) {
      const gcsRes = await uploadToGCS(req.files[i], 'categoryimage');
      req.files[i].path = gcsRes.url;
      req.files[i].filename = gcsRes.fileName;
    }
    next();
  } catch (error) {
    console.error('Error processing category image:', error);
    next(error);
  }
};

const bannerimage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    if (req.file) {
      try {
        const gcsRes = await uploadToGCS(req.file, 'bannerimage');
        req.file.path = gcsRes.url;
        req.file.filename = gcsRes.fileName;
        return next();
      } catch (err) {
        return next(err);
      }
    }
    return next();
  }

  try {
    for (let i = 0; i < req.files.length; i++) {
      const gcsRes = await uploadToGCS(req.files[i], 'bannerimage');
      req.files[i].path = gcsRes.url;
      req.files[i].filename = gcsRes.fileName;
    }
    next();
  } catch (error) {
    console.error('Error processing banner image:', error);
    next(error);
  }
};

export { upload, categoryupload, bannerupload, imageSizeMiddleware, profileimage, categoryimage, bannerimage };