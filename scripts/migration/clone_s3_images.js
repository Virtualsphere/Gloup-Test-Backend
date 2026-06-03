import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const bucketName = process.env.AWS_BUCKET;
const exportDir = path.join(process.cwd(), 'exports', 'images');

if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

async function downloadFile(key) {
  const filePath = path.join(exportDir, key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  try {
    const response = await client.send(command);
    
    // Convert ReadableStream to file
    const writeStream = fs.createWriteStream(filePath);
    response.Body.pipe(writeStream);
    
    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  } catch (error) {
    console.error(`Failed to download ${key}: ${error.message}`);
  }
}

async function cloneImages() {
  console.log(`Starting image clone from bucket: ${bucketName}`);
  let isTruncated = true;
  let continuationToken = undefined;

  let count = 0;
  while (isTruncated) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken,
    });

    try {
        const response = await client.send(command);
        for (const item of response.Contents || []) {
        if (item.Key.endsWith('/')) continue; // Skip directories
        console.log(`Downloading ${item.Key}...`);
        await downloadFile(item.Key);
        count++;
        }

        isTruncated = response.IsTruncated;
        continuationToken = response.NextContinuationToken;
    } catch (e) {
        console.error("Error listing objects:", e);
        break;
    }
  }
  console.log(`Finished downloading ${count} images.`);
}

cloneImages().catch(console.error);
