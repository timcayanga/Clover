import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "./env";

let client: S3Client | null = null;

const getClient = () => {
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

export const deleteImportObject = async (key: string) => {
  const env = getEnv();
  if (!env.R2_BUCKET_NAME) {
    throw new Error("Missing bucket name");
  }

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
};
