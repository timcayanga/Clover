import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
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

    const job = await enqueueImportProcessing({ importFileId: importId, text });

    return NextResponse.json({
      ok: true,
      queued: true,
      jobId: job.id,
      status: "processing",
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to process import" }, { status: 400 });
  }
}
