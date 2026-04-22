import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  countParsedTransactionRows,
  countTransactionsByImportFileCompat,
  fetchImportFileCompat,
  hasCompatibleTable,
} from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
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
    const parsedRowsCount = await countParsedTransactionRows(importId);
    const confirmedTransactionsCount = await countTransactionsByImportFileCompat(importId);
    const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
        })
      : null;
    const confirmationStatus =
      importFile.status === "failed"
        ? "failed"
        : confirmedTransactionsCount > 0
          ? "confirmed"
          : parsedRowsCount > 0
            ? "staged"
            : "processing";

    return NextResponse.json({
      importFile: {
        id: importFile.id,
        fileName: importFile.fileName,
        fileType: importFile.fileType,
        status: importFile.status,
        accountId: importFile.accountId,
        confirmedAt: importFile.confirmedAt?.toISOString() ?? null,
        uploadedAt: importFile.uploadedAt.toISOString(),
        deletedAt: importFile.deletedAt?.toISOString() ?? null,
        updatedAt: importFile.updatedAt.toISOString(),
      },
      parsedRowsCount,
      confirmedTransactionsCount,
      confirmationStatus,
      statementCheckpoint,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load import status" }, { status: 400 });
  }
}
