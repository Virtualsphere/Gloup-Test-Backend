import { GCSUpload, uploadToGCS, deleteFromGCS } from '../gcs/gcsUpload.js';

export const S3upload = GCSUpload;
export const uploadToS3 = uploadToGCS;
export const deleteIfExists = deleteFromGCS;