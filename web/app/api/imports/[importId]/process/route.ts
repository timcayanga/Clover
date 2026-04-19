import { requireAuth } from "@/lib/auth";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { detectStatementMetadataFromText, fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
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
    const text = String(body?.text || "");

    if (!text) {
      return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
    }

    const metadata = detectStatementMetadataFromText(text);
    await updateImportFileCompat(importId, {
      status: "queued",
    });
    const job = await enqueueImportProcessing({ importFileId: importId, text });

    return NextResponse.json({
      ok: true,
      queued: true,
      processed: false,
      jobId: job.id,
      importedRows: 0,
      metadata,
      status: "queued",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process import" }, { status: 400 });
  }
}
