import { NextResponse } from "next/server";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, fetchParsedTransactionRows, hasCompatibleTable } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importFileId: string }> }) {
  try {
    const { importFileId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const importFile = await fetchImportFileCompat(importFileId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, String(importFile.workspaceId));
    }

    const [run, parsedRows, statementCheckpoint] = await Promise.all([
      prisma.dataQaRun.findFirst({
        where: {
          importFileId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          score: true,
          status: true,
          source: true,
          findingCount: true,
          criticalCount: true,
          parserVersion: true,
          totalDurationMs: true,
          parserDurationMs: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      fetchParsedTransactionRows(importFileId),
      (async () => {
        if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
          return null;
        }

        return prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId },
          select: {
            openingBalance: true,
            endingBalance: true,
            status: true,
            rowCount: true,
          },
        });
      })(),
    ]);

    const parsedRowsCount = Number(importFile.parsedRowsCount ?? parsedRows.length ?? 0);
    const confirmedTransactionsCount = Number(importFile.confirmedTransactionsCount ?? 0);
    const latestScore = run?.score ?? null;
    const processingPhase = importFile.processingPhase ?? null;
    const confirmationStatus =
      importFile.status === "failed"
        ? "failed"
        : confirmedTransactionsCount > 0
          ? "confirmed"
          : importFile.status === "done"
            ? "done"
            : parsedRowsCount > 0
              ? "staged"
              : "processing";

    return NextResponse.json({
      importFileId,
      importFile: {
        id: importFile.id,
        fileName: importFile.fileName,
        fileType: importFile.fileType,
        status: importFile.status,
        parsedRowsCount,
        confirmedTransactionsCount,
        uploadedAt: importFile.uploadedAt.toISOString(),
        updatedAt: importFile.updatedAt.toISOString(),
        workspaceId: importFile.workspaceId,
        processingPhase,
        processingMessage: importFile.processingMessage ?? null,
        processingAttempt: Number(importFile.processingAttempt ?? 0),
        processingTargetScore: importFile.processingTargetScore ?? null,
        processingCurrentScore: importFile.processingCurrentScore ?? latestScore,
        confirmedAt: importFile.confirmedAt?.toISOString() ?? null,
      },
      run: run
        ? {
            ...run,
            createdAt: run.createdAt.toISOString(),
            updatedAt: run.updatedAt.toISOString(),
          }
        : null,
      parsedRows,
      statementCheckpoint: statementCheckpoint
        ? {
            openingBalance: statementCheckpoint.openingBalance?.toString() ?? null,
            endingBalance: statementCheckpoint.endingBalance?.toString() ?? null,
            status: statementCheckpoint.status ?? null,
            rowCount: statementCheckpoint.rowCount ?? null,
          }
        : null,
      confirmationStatus,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load file detail" }, { status: 400 });
  }
}
