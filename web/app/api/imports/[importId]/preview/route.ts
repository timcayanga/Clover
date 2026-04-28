import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, fetchParsedTransactionRows, hasCompatibleTable } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
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
    const parsedRows = await fetchParsedTransactionRows(importId);
    const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
        })
      : null;

    return NextResponse.json({
      importFile,
      parsedRows,
      statementCheckpoint,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load preview" }, { status: 400 });
  }
}
