import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { processImportFileText } from "@/workers/import-processor";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { detectStatementMetadataFromText } from "@/lib/data-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();
    const importFile = await prisma.importFile.findUnique({ where: { id: importId } });
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    await assertWorkspaceAccess(userId, importFile.workspaceId);
    const body = await _request.json().catch(() => ({}));
    const text = String(body?.text || "");

    if (!text) {
      return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
    }

    const result = await processImportFileText(importId, text);
    const metadata = detectStatementMetadataFromText(text);

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
