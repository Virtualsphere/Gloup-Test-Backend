import dotenv from "dotenv";
import fs from "fs";
import require from "requirejs";
import shelljs from "shelljs";
const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

const __dirname = path.resolve();
dotenv.config();

const fileStorageEngine = multer.diskStorage({
    //original resource storage
    destination: (req, file, cb) => {
        if (file.fieldname == "image") {
            if (!fs.existsSync(__dirname + "/upload/chats/images")) {
                shelljs.mkdir("-p", __dirname + "/upload/chats/images");
            }
            cb(null, "./upload/Original"); //directory
        }
        if (file.fieldname == "audio") {
            if (!fs.existsSync(__dirname + "/upload/chats/audio")) {
                shelljs.mkdir("-p", __dirname + "/upload/chats/audio");
            }
            cb(null, "./upload/chats/audio"); //directory
        }
    },
    filename: (req, file, cb, next) => {
        if (file.fieldname == "image") {
            const ext = path.extname(file.originalname)?.toLowerCase();
            cb(null, file.originalname);
        }
        if (file.fieldname == "audio") {
            const ext = path.extname(file.originalname)?.toLowerCase();
            var audioName = 'AUD-' + Date.now() + ext;
            cb(null, audioName);
            req.audio = "/upload/chats/audio/" + audioName;
        }
    },
});

const upload = multer({
    storage: fileStorageEngine,
    limits: {
        fileSize: 10 * 1024 * 1024, //10mb
    },
    fileFilter: function (req, file, callback) {
        checkFileType(file, callback);
    },
});
function checkFileType(file, callback) {
    if (file.fieldname == "image") {
        const filetypes = /jpg|jpeg|png/;
        const extname = filetypes.test(
            path.extname(file.originalname)?.toLowerCase()
        );
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype || extname) {
            callback(null, true);
        } else {
            callback("Check your File Type For Image");
        }
    }
    if (file.fieldname == "audio") {
        const filetypes = /aac|mp3|webm|m4a|wav/;
        const extname = filetypes.test(path.extname(file.originalname)?.toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype || extname) {
            callback(null, true);
        } else {
            callback("Check your File Type For audio");
        }
    }
}

export const chatResizer = async (req, res, next) => {
    upload.fields([
        {
            name: "image",
            maxCount: 1,
        },
        {
            name: "audio",
            maxCount: 1,
        },
    ])(req, res, async function (error) {
        if (error) {
            return res.status(400).json({
                Error: error,
            });
        } else {
            if (req.files.image) {
                req.image = req?.files?.image[0]?.path || null;

                if (req.image) {
                    const ext = path.extname(req?.files?.image[0]?.originalname)?.toLowerCase();
                    let imagename = 'IMG-' + Date.now() + ext;
                    let compressedImage = path.join(__dirname, "/upload/chats/images/", imagename);
                    await sharp(req.image).resize(500).png({
                        quality: 80,
                        chromaSubsampling: "4:4:4",
                    }).toFile(compressedImage);

                    const fileCreated = fs.existsSync(path.join(__dirname, "/upload/chats/images/", imagename));
                    if (fileCreated) {
                        req.image = "/upload/chats/images/" + imagename;
                    } else {
                        return "Failed to upload the image";
                    }
                }
            }
        }
        next();
    });
};
