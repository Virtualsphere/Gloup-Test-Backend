import { GCSUpload, uploadToGCS } from './gcs/gcsUpload.js';

export const chatResizer = async (req, res, next) => {
    GCSUpload.fields([
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
            try {
                if (req.files?.image && req.files.image.length > 0) {
                    const gcsRes = await uploadToGCS(req.files.image[0], 'chats/images');
                    req.image = gcsRes.url;
                }
                
                if (req.files?.audio && req.files.audio.length > 0) {
                    const gcsRes = await uploadToGCS(req.files.audio[0], 'chats/audio');
                    req.audio = gcsRes.url;
                }
                next();
            } catch (err) {
                console.error("Chat upload to GCS failed:", err);
                return res.status(500).json({
                    Error: "Failed to upload file to GCS",
                });
            }
        }
    });
};
