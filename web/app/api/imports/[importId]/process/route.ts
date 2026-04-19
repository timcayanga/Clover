import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { detectStatementMetadataFromText, fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { readImportedFileText } from "@/lib/import-file-text.server";
import { processImportFileText } from "@/workers/import-processor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();
    const importFile = await fetchImportFileCompat(importId);
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    const body = await _request.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";
    const password = typeof body?.password === "string" ? body.password : undefined;

    if (!text) {
      const storageKey = String(importFile.storageKey ?? "");

      if (!storageKey) {
        return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
      }

      const fileText = await readImportedFileText(
        {
          storageKey,
          fileType: String(importFile.fileType ?? ""),
          fileName: String(importFile.fileName ?? ""),
        },
        password
      );

      await updateImportFileCompat(importId, {
        status: "processing",
      });

      const result = await processImportFileText(importId, fileText);
      const metadata = detectStatementMetadataFromText(fileText);

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.count,
        metadata,
        status: "done",
      });
    }
    const metadata = detectStatementMetadataFromText(text);
    await updateImportFileCompat(importId, {
      status: "processing",
    });
    const result = await processImportFileText(importId, text);

    return NextResponse.json({
      ok: true,
      queued: false,
      processed: true,
      importedRows: result.count,
      metadata,
      status: "done",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process import" }, { status: 400 });
  }
}
