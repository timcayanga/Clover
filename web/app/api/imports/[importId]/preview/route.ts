import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, fetchParsedTransactionRows } from "@/lib/data-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();

    const importFile = await fetchImportFileCompat(importId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    const parsedRows = await fetchParsedTransactionRows(importId);

    return NextResponse.json({
      importFile,
      parsedRows,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load preview" }, { status: 400 });
  }
}
