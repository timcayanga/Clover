import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();

    const importFile = await fetchImportFileCompat(importId);
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    const snapshot = await loadImportStatusSnapshot(importId, {
      importFile,
      promoteFailedVisibleImport: true,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "Unable to load import status" }, { status: 400 });
  }
}
