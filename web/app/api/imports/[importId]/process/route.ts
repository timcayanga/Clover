import { requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { detectStatementMetadataFromText, fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { readImportedFileText, readUploadedFileText } from "@/lib/import-file-text.server";
import { processImportFileText } from "@/workers/import-processor";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();
    const contentType = _request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    let importFile = await fetchImportFileCompat(importId);
    let text = "";
    let password: string | undefined;

    if (isMultipart) {
      const formData = await _request.formData();
      const uploadedFile = formData.get("file");
      const formPassword = formData.get("password");
      const formWorkspaceId = typeof formData.get("workspaceId") === "string" ? String(formData.get("workspaceId")) : "";
      const formFileName = typeof formData.get("fileName") === "string" ? String(formData.get("fileName")) : "";
      const formFileType = typeof formData.get("fileType") === "string" ? String(formData.get("fileType")) : "";
      password = typeof formPassword === "string" && formPassword.length > 0 ? formPassword : undefined;

      if (!importFile) {
        if (!formWorkspaceId) {
          return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        await assertWorkspaceAccess(userId, formWorkspaceId);
        importFile = await prisma.importFile.create({
          data: {
            id: importId,
            workspaceId: formWorkspaceId,
            fileName: formFileName || "imported-file",
            fileType: formFileType || "unknown",
            storageKey: buildImportKey(formWorkspaceId, formFileName || "imported-file"),
            status: "processing",
          },
        });
      } else {
        await assertWorkspaceAccess(userId, importFile.workspaceId as string);
      }

      if (
        uploadedFile &&
        typeof uploadedFile === "object" &&
        typeof (uploadedFile as { arrayBuffer?: unknown }).arrayBuffer === "function"
      ) {
        text = await readUploadedFileText(uploadedFile as File, password);
      } else if (importFile.storageKey) {
        text = await readImportedFileText(
          {
            storageKey: String(importFile.storageKey ?? ""),
            fileType: String(importFile.fileType ?? ""),
            fileName: String(importFile.fileName ?? ""),
          },
          password
        );
      } else {
        return NextResponse.json({ error: "Missing uploaded file." }, { status: 400 });
      }
    } else {
      if (!importFile) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }

      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
      const body = await _request.json().catch(() => ({}));
      text = typeof body?.text === "string" ? body.text : "";
      password = typeof body?.password === "string" ? body.password : undefined;

      if (!text) {
        const storageKey = String(importFile.storageKey ?? "");

        if (!storageKey) {
          return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
        }

        text = await readImportedFileText(
          {
            storageKey,
            fileType: String(importFile.fileType ?? ""),
            fileName: String(importFile.fileName ?? ""),
          },
          password
        );
      }
    }

    await updateImportFileCompat(importId, {
      status: "processing",
    });

    const result = await processImportFileText(importId, text);
    const metadata = detectStatementMetadataFromText(text);

    return NextResponse.json({
      ok: true,
      queued: false,
      processed: true,
      importedRows: result.count,
      metadata,
      status: "done",
      importFileId: importId,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process import" }, { status: 400 });
  }
}
