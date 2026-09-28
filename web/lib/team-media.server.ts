import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "./prisma";
import { z } from "zod";

export const mediaRequestSchema = z.object({
  contentType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "video/webm",
  ]),
  size: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
});
function storage() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    CLOVER_TEAM_MEDIA_BUCKET,
    R2_BUCKET_NAME,
  } = process.env;
  // Use Clover’s private statement bucket, or an explicitly configured private studio bucket.
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !(CLOVER_TEAM_MEDIA_BUCKET || R2_BUCKET_NAME)
  )
    throw new Error("STORAGE_UNAVAILABLE");
  return {
    bucket: (CLOVER_TEAM_MEDIA_BUCKET || R2_BUCKET_NAME)!,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    }),
  };
}
export async function prepareTeamUpload(
  ownerId: string,
  input: z.infer<typeof mediaRequestSchema>,
) {
  const { bucket, client } = storage();
  const recent = await prisma.teamStudioMedia.count({
    where: { ownerId, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= 30) throw new Error("UPLOAD_LIMIT");
  const id = randomUUID();
  const stagingKey = `team-staging/${ownerId}/${id}`;
  const row = await prisma.teamStudioMedia.create({
    data: {
      id,
      ownerId,
      stagingKey,
      storageKey: `team-media/${ownerId}/${id}`,
      ...input,
    },
  });
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: stagingKey,
      ContentType: input.contentType,
      ContentLength: input.size,
    }),
    { expiresIn: 300 },
  );
  return { id: row.id, url };
}
export function matchesMediaSignature(type: string, bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (type === "image/png")
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg")
    return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (type === "image/webp")
    return (
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  if (type === "video/mp4") return b.toString("ascii", 4, 8) === "ftyp";
  if (type === "video/webm")
    return b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  return false;
}
export async function completeTeamUpload(ownerId: string, id: string) {
  const row = await prisma.teamStudioMedia.findFirst({
    where: { id, ownerId },
  });
  if (!row) throw new Error("MEDIA_NOT_FOUND");
  if (row.ready) return { id };
  if (Date.now() - row.createdAt.getTime() > 3600_000)
    throw new Error("INVALID_MEDIA");
  const { bucket, client } = storage();
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: row.stagingKey }),
  );
  if (
    head.ContentLength !== row.size ||
    head.ContentType !== row.contentType ||
    !head.ETag
  )
    throw new Error("INVALID_MEDIA");
  const signature = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: row.stagingKey,
      Range: "bytes=0-31",
      IfMatch: head.ETag,
    }),
  );
  if (
    !signature.Body ||
    !matchesMediaSignature(
      row.contentType,
      await signature.Body.transformToByteArray(),
    )
  )
    throw new Error("INVALID_MEDIA");
  // A fresh final key per completion prevents a racing/replayed upload from overwriting approved media.
  const finalKey = `team-media/${ownerId}/${randomUUID()}`;
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: finalKey,
      CopySource: `${bucket}/${row.stagingKey}`,
      CopySourceIfMatch: head.ETag,
      MetadataDirective: "REPLACE",
      ContentType: row.contentType,
      CacheControl: "private, no-store",
    }),
  );
  let retained = false;
  try {
    const changed = await prisma.teamStudioMedia.updateMany({
      where: { id, ownerId, ready: false },
      data: { ready: true, storageKey: finalKey },
    });
    retained = changed.count === 1;
  } finally {
    if (!retained)
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: finalKey }))
        .catch(() => {});
  }
  await client
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: row.stagingKey }))
    .catch(() => {});
  return { id };
}
export async function teamMediaReadUrl(ownerId: string, id: string) {
  const row = await prisma.teamStudioMedia.findFirst({
    where: { id, ownerId, ready: true },
  });
  if (!row) throw new Error("MEDIA_NOT_FOUND");
  const { bucket, client } = storage();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: row.storageKey,
      ResponseCacheControl: "private, no-store",
      ResponseContentType: row.contentType,
    }),
    { expiresIn: 300 },
  );
}
