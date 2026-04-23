import { requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import { detectStatementMetadataFromText, fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { readImportedFileText } from "@/lib/import-file-text.server";
import { uploadObject } from "@/lib/s3";
import { prisma } from "@/lib/prisma";
import { NextResponse, after } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  let stage = "initializing";
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();
    const contentType = _request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    let importFile = await fetchImportFileCompat(importId);
    let password: string | undefined;
    let queued = false;

    if (isMultipart) {
      stage = "reading multipart form";
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

        stage = "creating import record";
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

      if (!uploadedFile || typeof uploadedFile !== "object" || typeof (uploadedFile as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
        return NextResponse.json({ error: "Missing uploaded file." }, { status: 400 });
      }

      stage = "uploading raw file";
      const file = uploadedFile as File;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadObject(String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)), bytes, file.type || "application/octet-stream");
      stage = "reading statement metadata";
      let metadata = null;
      try {
        const text = await readImportedFileText(
          {
            storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
            fileType: file.type || "application/octet-stream",
            fileName: file.name || String(importFile.fileName ?? "imported-file"),
          },
          password
        );
        metadata = detectStatementMetadataFromText(text);
      } catch (error) {
        console.warn("Unable to pre-read statement metadata", { importId, error });
      }
      stage = "scheduling background processing";
      after(async () => {
        try {
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, { password });
        } catch (error) {
          console.error("Background import processing failed", { importId, error });
          await updateImportFileCompat(importId, {
            status: "failed",
          });
        }
      });
      queued = true;
      return NextResponse.json({
        ok: true,
        queued,
        processed: false,
        importedRows: 0,
        duplicate: false,
        status: "queued",
        importFileId: importId,
        metadata,
      });
    } else {
      stage = "loading import record";
      if (!importFile) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }

      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
      stage = "reading json body";
      const body = await _request.json().catch(() => ({}));
      const text = typeof body?.text === "string" ? body.text : "";
      password = typeof body?.password === "string" ? body.password : undefined;

      if (!text) {
        return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
      }

      stage = "updating import status";
      await updateImportFileCompat(importId, {
        status: "processing",
      });

      stage = "processing statement text";
      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, { text, password });

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.imported,
        duplicate: Boolean(result.duplicate),
        status: "done",
        importFileId: importId,
        metadata: result.metadata,
      });
    }
  } catch (error) {
    console.error("Import processing failed", { stage, error });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process import",
        stage,
      },
      { status: 400 }
    );
  }
}
