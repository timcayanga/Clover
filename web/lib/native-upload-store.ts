import { NativeInputError } from "./native-input-error";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { prisma } from "./prisma";
import { getEnv } from "./env";
import { getR2Client, uploadObject, getLocalImportObjectPath } from "./s3";
import {
  validateImportFileMetadata,
  validateImportFileBytes,
} from "./import-file-validation";
import { withCompletedNativeUpload } from "./native-upload-validation";
import { withMobileRequestContext } from "./mobile-request-context";
import {
  NATIVE_UPLOAD_MAX_SIZE,
  NATIVE_UPLOAD_PART_SIZE,
  nativeUploadPartBytes,
} from "../../shared/native-upload";

type Upload = {
  response: Record<string, unknown> | null;
  id: string;
  userId: string;
  workspaceId: string;
  fileName: string;
  contentType: string;
  size: number;
  parts: Record<string, string>;
  state: string;
  leaseUntil: Date | null;
  expiresAt: Date;
};
const key = (id: string, index: number) => `native-upload-parts/${id}/${index}`;
const publicState = (row: Upload) => ({
  parts: Object.keys(row.parts).map(Number),
  partSize: NATIVE_UPLOAD_PART_SIZE,
  state: row.state,
  size: row.size,
});
const getPart = async (id: string, index: number) => {
  if (process.env.NODE_ENV !== "production")
    return readFile(getLocalImportObjectPath(key(id, index)));
  const result = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getEnv().R2_BUCKET_NAME,
      Key: key(id, index),
    }),
  );
  if (!result.Body)
    throw new NativeInputError(
      "Upload part is unavailable. Resume the upload.",
    );
  return Buffer.from(await result.Body.transformToByteArray());
};
async function cleanup(row: Upload) {
  // Delete every possible part, including any object written before a lost DB acknowledgement.
  for (let i = 0; i < Math.ceil(row.size / NATIVE_UPLOAD_PART_SIZE); i++) {
    if (process.env.NODE_ENV !== "production")
      await unlink(getLocalImportObjectPath(key(row.id, i))).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    else
      await getR2Client().send(
        new DeleteObjectCommand({
          Bucket: getEnv().R2_BUCKET_NAME,
          Key: key(row.id, i),
        }),
      );
  }
}
export async function cleanupExpiredNativeUploads() {
  const rows = await prisma.$queryRaw<
    Upload[]
  >`SELECT * FROM "NativeUploadSession" WHERE "expiresAt"<CURRENT_TIMESTAMP AND ("leaseUntil" IS NULL OR "leaseUntil"<CURRENT_TIMESTAMP) ORDER BY "expiresAt" LIMIT 5`;
  for (const row of rows) {
    const claimed =
      await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='cancelled' WHERE "id"=${row.id} AND "expiresAt"<CURRENT_TIMESTAMP AND ("leaseUntil" IS NULL OR "leaseUntil"<CURRENT_TIMESTAMP)`;
    if (!claimed) continue;
    await cleanup(row);
    await prisma.$executeRaw`DELETE FROM "NativeUploadSession" WHERE "id"=${row.id} AND "expiresAt"<CURRENT_TIMESTAMP`;
  }
  return rows.length;
}
async function owned(id: string, userId: string, workspaceId: string) {
  const [row] = await prisma.$queryRaw<
    Upload[]
  >`SELECT * FROM "NativeUploadSession" WHERE "id"=${id} AND "userId"=${userId} AND "workspaceId"=${workspaceId}`;
  if (!row || row.expiresAt <= new Date())
    throw new NativeInputError(
      "This upload session expired. Choose the file again.",
    );
  return row;
}
type ImportProcessor = (request: Request, id: string) => Promise<Response>;
const processImport: ImportProcessor = async (request, id) =>
  (await import("@/app/api/imports/[importId]/process/route")).POST(request, {
    params: Promise.resolve({ importId: id }),
  });
export async function nativeUploadRequest(
  request: Request,
  id: string,
  userId: string,
  workspaceId: string,
  action: string,
  processor: ImportProcessor = processImport,
) {
  z.string().uuid().parse(id);
  if (action === "start") {
    const input = z
      .object({
        name: z.string().trim().min(1).max(255),
        mimeType: z.string().max(150),
        size: z.number().int().positive().max(NATIVE_UPLOAD_MAX_SIZE),
      })
      .strict()
      .parse(await request.json());
    const problem = validateImportFileMetadata({
      fileName: input.name,
      contentType: input.mimeType,
    });
    if (problem) throw new NativeInputError(problem);
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`native-upload:${userId}`}))`;
      const [existing] = await tx.$queryRaw<
        Upload[]
      >`SELECT * FROM "NativeUploadSession" WHERE "id"=${id}`;
      if (existing) {
        if (
          existing.userId !== userId ||
          existing.workspaceId !== workspaceId ||
          existing.fileName !== input.name ||
          existing.size !== input.size ||
          existing.contentType !== input.mimeType
        )
          throw new NativeInputError("Upload ID belongs to another file.");
        return existing;
      }
      if (
        await tx.importFile.findUnique({ where: { id }, select: { id: true } })
      )
        throw new NativeInputError(
          "This import ID is already in use. Choose the file again.",
        );
      const [daily] = await tx.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*) AS count FROM "NativeUploadSession" WHERE "userId"=${userId} AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '24 hours'`;
      if (Number(daily.count) >= 100)
        throw new NativeInputError(
          "Too many upload sessions today. Please try again tomorrow.",
        );
      const [count] = await tx.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*) AS count FROM "NativeUploadSession" WHERE "userId"=${userId} AND "state" NOT IN ('done','cancelled') AND "expiresAt">CURRENT_TIMESTAMP`;
      if (Number(count.count) >= 10)
        throw new NativeInputError(
          "Finish or cancel a pending upload before adding another.",
        );
      const [created] = await tx.$queryRaw<
        Upload[]
      >`INSERT INTO "NativeUploadSession" ("id","userId","workspaceId","fileName","contentType","size","expiresAt") VALUES (${id},${userId},${workspaceId},${input.name},${input.mimeType},${input.size},CURRENT_TIMESTAMP + INTERVAL '24 hours') RETURNING *`;
      return created;
    });
    if (row.expiresAt <= new Date() || row.state === "cancelled")
      throw new NativeInputError(
        "This upload expired or was cancelled. Choose the file again.",
      );
    return Response.json(publicState(row));
  }
  if (action === "cancel") {
    const [existing] = await prisma.$queryRaw<
      Upload[]
    >`SELECT * FROM "NativeUploadSession" WHERE "id"=${id}`;
    if (!existing) return Response.json({ ok: true });
  }
  const row = await owned(id, userId, workspaceId);
  if (action === "part") {
    if (Number(request.headers.get("content-length")) > 2_200_000)
      throw new NativeInputError("Upload part is too large.");
    const raw = await request.text();
    if (raw.length > 2_200_000)
      throw new NativeInputError("Upload part is too large.");
    const body = z
      .object({
        index: z.number().int().nonnegative(),
        base64: z
          .string()
          .max(2_097_152)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .strict()
      .parse(JSON.parse(raw));
    const bytes = Buffer.from(body.base64, "base64");
    if (
      bytes.length !== nativeUploadPartBytes(row.size, body.index) ||
      bytes.toString("base64") !== body.base64
    )
      throw new NativeInputError("Upload part size does not match the file.");
    const digest = createHash("sha256").update(bytes).digest("hex");
    await prisma.$transaction(
      async (tx) => {
        const [current] = await tx.$queryRaw<
          Upload[]
        >`SELECT * FROM "NativeUploadSession" WHERE "id"=${id} FOR UPDATE`;
        if (
          !current ||
          current.state !== "uploading" ||
          current.expiresAt <= new Date()
        )
          throw new NativeInputError(
            "This upload is no longer accepting parts.",
          );
        if (current.parts[String(body.index)]) {
          if (current.parts[String(body.index)] !== digest)
            throw new NativeInputError(
              "This part differs from the original upload.",
            );
          return;
        }
        await uploadObject(
          key(id, body.index),
          bytes,
          "application/octet-stream",
        );
        const parts = { ...current.parts, [body.index]: digest };
        await tx.$executeRaw`UPDATE "NativeUploadSession" SET "parts"=${JSON.stringify(parts)}::jsonb WHERE "id"=${id}`;
      },
      { timeout: 30000 },
    );
    return Response.json({ ok: true });
  }
  if (action === "cancel") {
    const changed =
      await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='cancelled' WHERE "id"=${id} AND "state"='uploading'`;
    if (!changed && row.state !== "cancelled")
      throw new NativeInputError(
        "Clover has already received this file. Open the saved import to check its status.",
      );
    await cleanup(row);
    return Response.json({ ok: true });
  }
  if (action !== "complete")
    throw new NativeInputError("Unknown upload action.");
  if (Number(request.headers.get("content-length")) > 2000)
    throw new NativeInputError("Upload details are too large.");
  const { password } = z
    .object({ password: z.string().max(256).optional() })
    .strict()
    .parse(await request.json());
  if (row.state === "done")
    return Response.json(row.response ?? { received: true });
  const saved = await prisma.importFile.findFirst({
    where: { id, workspaceId },
    select: { status: true },
  });
  if (saved?.status === "done") {
    await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='done',"leaseUntil"=NULL WHERE "id"=${id}`;
    await cleanup(row).catch(() => {});
    return Response.json({ received: true, canonicalImportFileId: id });
  }
  const claimed =
    await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='finalizing',"leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '6 minutes' WHERE "id"=${id} AND "expiresAt">CURRENT_TIMESTAMP AND ("state"='uploading' OR ("state"='finalizing' AND "leaseUntil"<CURRENT_TIMESTAMP))`;
  if (!claimed)
    return Response.json(
      { error: "Upload is being finalized. Check its status before retrying." },
      { status: 409 },
    );
  try {
    const parts: Buffer[] = [];
    for (let i = 0; i < Math.ceil(row.size / NATIVE_UPLOAD_PART_SIZE); i++) {
      if (!row.parts[String(i)])
        throw new NativeInputError(
          "Some upload parts are missing. Resume the upload.",
        );
      const bytes = await getPart(id, i);
      if (
        bytes.length !== nativeUploadPartBytes(row.size, i) ||
        createHash("sha256").update(bytes).digest("hex") !==
          row.parts[String(i)]
      )
        throw new NativeInputError(
          "Upload verification failed. Choose the original file again.",
        );
      parts.push(bytes);
    }
    const bytes = Buffer.concat(parts);
    const problem = validateImportFileBytes({
      fileName: row.fileName,
      contentType: row.contentType,
      bytes,
    });
    if (problem) throw new NativeInputError(problem);
    const form = new FormData();
    form.set(
      "file",
      new File([bytes], row.fileName, { type: row.contentType }),
    );
    form.set("workspaceId", workspaceId);
    if (password) form.set("password", password);
    const forwarded = new Request(request.url, { method: "POST", body: form });
    const result = await withMobileRequestContext(userId, forwarded, () =>
      withCompletedNativeUpload(() => processor(forwarded, id)),
    );
    if (result.ok) {
      const fullResponse = await result.clone().json();
      const response = Object.fromEntries(
        [
          "ok",
          "status",
          "queued",
          "duplicate",
          "canonicalImportFileId",
          "confirmedTransactionsCount",
          "visibleImportComplete",
        ]
          .filter((key) => fullResponse[key] !== undefined)
          .map((key) => [key, fullResponse[key]]),
      );
      await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='done',"leaseUntil"=NULL,"response"=${JSON.stringify(response)}::jsonb WHERE "id"=${id}`;
      // Failure to remove temporary parts must not turn a durable acknowledgement into an upload failure.
      await cleanup(row).catch(() => {});
    } else
      await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='uploading',"leaseUntil"=NULL WHERE "id"=${id}`;
    return result;
  } catch (error) {
    await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "state"='uploading',"leaseUntil"=NULL WHERE "id"=${id}`;
    throw error;
  }
}
