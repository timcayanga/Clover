import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import {
  detectStatementMetadataFromText,
  fetchImportFileCompat,
  insertImportFileCompat,
  loadStatementTemplate,
  mergeStatementMetadataWithTemplate,
  updateImportFileCompat,
  buildStatementFingerprint,
} from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { readImportedFileText } from "@/lib/import-file-text.server";
import { uploadObject } from "@/lib/s3";
import { validateImportFile } from "@/lib/import-file-validation";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  let stage = "initializing";
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const contentType = _request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");
    let allowDuplicateStatement = false;

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
      allowDuplicateStatement =
        String(formData.get("allowDuplicateStatement") ?? formData.get("qaMode") ?? "").toLowerCase() === "true";
      password = typeof formPassword === "string" && formPassword.length > 0 ? formPassword : undefined;

      if (!uploadedFile || typeof uploadedFile !== "object" || typeof (uploadedFile as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
        return NextResponse.json({ error: "Missing uploaded file." }, { status: 400 });
      }

      const file = uploadedFile as File;
      const validationError = validateImportFile({
        fileName: file.name || formFileName || "imported-file",
        fileSize: file.size,
        contentType: file.type || formFileType || null,
      });
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      if (!importFile) {
        if (!formWorkspaceId) {
          return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        stage = "creating import record";
        if (!localDev) {
          await assertWorkspaceAccess(userId, formWorkspaceId);
        }
        importFile = await insertImportFileCompat({
          id: importId,
          workspaceId: formWorkspaceId,
          fileName: formFileName || file.name || "imported-file",
          fileType: formFileType || file.type || "unknown",
          storageKey: buildImportKey(formWorkspaceId, formFileName || file.name || "imported-file"),
          status: "processing",
        });

        if (!importFile) {
          return NextResponse.json({ error: "Unable to create import record." }, { status: 400 });
        }
      } else {
        if (!localDev) {
          await assertWorkspaceAccess(userId, importFile.workspaceId as string);
        }
      }

      stage = "uploading raw file";
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadObject(String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)), bytes, file.type || "application/octet-stream");
      stage = "reading statement metadata";
      let metadata: Record<string, unknown> | null = null;
      let extractedText = "";
      try {
        extractedText = await readImportedFileText(
          {
            storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
            fileType: file.type || "application/octet-stream",
            fileName: file.name || String(importFile.fileName ?? "imported-file"),
          },
          password
        );
        const detectedMetadata = detectStatementMetadataFromText(extractedText);
        const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, file.name || String(importFile.fileName ?? "imported-file"), file.type || "application/octet-stream");
        const template = await loadStatementTemplate({
          workspaceId: String(importFile.workspaceId),
          fingerprint: statementFingerprint,
        });
        metadata = mergeStatementMetadataWithTemplate(detectedMetadata, template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
          ? (template.metadata as Record<string, unknown>)
          : null);
      } catch (error) {
        console.warn("Unable to pre-read statement metadata", { importId, error: summarizeErrorForLog(error) });
      }

      const parsedMetadataConfidence = Number((metadata as { confidence?: unknown } | null)?.confidence ?? 0);
      const hasExtractedText = extractedText.trim().length > 0;
      const shouldProcessInline =
        (hasExtractedText && parsedMetadataConfidence >= 95 && bytes.length <= 8_000_000) ||
        (!hasExtractedText && bytes.length <= 2_500_000);

      if (shouldProcessInline) {
        stage = "processing statement text";
        await updateImportFileCompat(importId, {
          status: "processing",
        });

        const { processImportFileText } = await import("@/workers/import-processor");
        const result = await processImportFileText(importId, {
          text: extractedText,
          password,
          actorUserId: userId,
          qaSource: "import_processing",
          allowDuplicateStatement,
        });

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

      stage = "scheduling background processing";
      try {
        await ensureImportProcessingWorker();
        await enqueueImportProcessing({
          importFileId: importId,
          password,
          allowDuplicateStatement,
        });
      } catch (error) {
        console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
        await updateImportFileCompat(importId, {
          status: "failed",
        });
        return NextResponse.json(
          {
            error: "Unable to queue import processing",
            stage,
          },
          { status: 400 }
        );
      }
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
      allowDuplicateStatement = Boolean(body?.allowDuplicateStatement ?? false);

      if (!text) {
        return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
      }

      stage = "updating import status";
      await updateImportFileCompat(importId, {
        status: "processing",
      });

      stage = "processing statement text";
      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, {
        text,
        password,
        actorUserId: userId,
        qaSource: "import_processing",
        allowDuplicateStatement,
      });

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
    console.error("Import processing failed", { stage, error: summarizeErrorForLog(error) });
    return NextResponse.json(
      {
        error: "Unable to process import",
        stage,
      },
      { status: 400 }
    );
  }
}
