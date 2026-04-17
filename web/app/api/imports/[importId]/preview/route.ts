import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchParsedTransactionRows } from "@/lib/data-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();

    const importFile = await prisma.importFile.findUnique({
      where: { id: importId },
    });

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, importFile.workspaceId);
    const parsedRows = await fetchParsedTransactionRows(importId);

    return NextResponse.json({
      importFile,
      parsedRows,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load preview" }, { status: 400 });
  }
}
