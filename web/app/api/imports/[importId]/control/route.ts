import { after, NextResponse } from "next/server";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { ImportUserControlError, setImportUserControl } from "@/lib/import-user-control";
import { getConfiguredPdfJsBaseUrl } from "@/lib/import-file-text.server";
import { isUnauthorizedDataError } from "@/lib/transient-data";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const file = await fetchImportFileCompat(importId);
    if (!file) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    if (!localDev) await assertWorkspaceAccess(userId, String(file.workspaceId));
    const body = await request.json().catch(() => null);
    if (!body || !["pause", "resume", "cancel"].includes(body.action)) return NextResponse.json({ error: "Choose pause, resume, or cancel." }, { status: 400 });
    const result = await setImportUserControl(importId, userId, body.action);
    if (result.restart) after(async () => {
      try {
        const { processImportFileText } = await import("@/workers/import-processor");
        await processImportFileText(importId, { actorUserId: userId, qaSource: "import_processing", pdfJsBaseUrl: getConfiguredPdfJsBaseUrl() });
      } catch (error) {
        if (!(error instanceof ImportUserControlError)) console.error("[import-control] Resume failed", { importId });
      }
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (isUnauthorizedDataError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update import" }, { status: 409 });
  }
}
