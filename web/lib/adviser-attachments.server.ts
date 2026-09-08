import { randomUUID, createHash } from "node:crypto";
import { uploadObject } from "./s3";
import { deleteImportObject } from "./s3-delete";
import { adviserFileProblem } from "./adviser-attachments";
import { prisma } from "./prisma";
import { MAX_ADVISER_ATTACHMENT_TEXT } from "./adviser-attachments";
export async function loadAdviserAttachments(
  ids: string[],
  workspaceId: string,
  actorUserId: string,
) {
  if (!ids.length) return [];
  const records = await prisma.auditLog.findMany({
    where: {
      id: { in: ids },
      workspaceId,
      actorUserId,
      action: "adviser_attachment_added",
    },
    select: { id: true, metadata: true },
  });
  if (records.length !== ids.length)
    throw new Error(
      "An attachment is unavailable in this Profile. Remove it and attach it again.",
    );
  const attachments = ids.map((id) => {
    const row = records.find((row) => row.id === id)!;
    const data = row.metadata as { name?: unknown; text?: unknown };
    if (typeof data?.name !== "string" || typeof data.text !== "string")
      throw new Error("This attachment could not be read.");
    return { id, name: data.name, text: data.text };
  });
  if (
    attachments.reduce((sum, row) => sum + row.text.length, 0) >
    MAX_ADVISER_ATTACHMENT_TEXT
  )
    throw new Error(
      "These files contain too much text for one question. Attach fewer files or a shorter excerpt.",
    );
  return attachments;
}

export async function storeAdviserAttachment(
  file: File,
  workspaceId: string,
  actorUserId: string,
) {
  if (
    !(await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: actorUserId },
      select: { id: true },
    }))
  )
    throw new Error("This Profile is unavailable.");
  const problem = adviserFileProblem(file);
  if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = /\.(txt|md)$/i.test(file.name)
    ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    : await (
        await import("@/lib/import-file-text.server")
      ).readUploadedFileText(file);
  if (!text.trim())
    throw new Error(
      "No readable text was found. Try a clearer image or a text-based file.",
    );
  if (text.length > MAX_ADVISER_ATTACHMENT_TEXT)
    throw new Error(
      "This file is too long for Adviser. Attach a shorter excerpt or use Clover’s statement import.",
    );
  const id = `adviser_file_${randomUUID()}`;
  const name = file.name.replace(/[\u0000-\u001f/\\]/g, "_").slice(0, 180);
  const storageKey = `${workspaceId}/adviser/${id}/${name}`;
  await uploadObject(
    storageKey,
    bytes,
    file.type || "application/octet-stream",
  );
  try {
    await prisma.auditLog.create({
      data: {
        id,
        workspaceId,
        actorUserId,
        action: "adviser_attachment_added",
        entity: "adviser_attachment",
        entityId: id,
        metadata: {
          name,
          size: file.size,
          storageKey,
          text,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      },
    });
  } catch (error) {
    await deleteImportObject(storageKey).catch(() => {});
    throw error;
  }
  return { id, name, size: file.size };
}
