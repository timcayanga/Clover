import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "./env";

let client: S3Client | null = null;

export const getR2Client = () => {
  if (client) return client;
  const env = getEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2/S3 credentials");
  }

  client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return client;
};

export const createUploadUrl = async (key: string, contentType: string) => {
  const env = getEnv();
  if (!env.R2_BUCKET_NAME) {
    throw new Error("Missing bucket name");
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(getR2Client(), command, { expiresIn: 60 * 10 });

  return {
    url,
    key,
    bucket: env.R2_BUCKET_NAME,
    expiresInSeconds: 600,
  };
};
