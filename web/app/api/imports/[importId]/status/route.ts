import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, hasCompatibleTable } from "@/lib/data-engine";
import { recoverStalledImportFiles } from "@/lib/import-recovery";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    await recoverStalledImportFiles(1);

    let importFile = await fetchImportFileCompat(importId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }
    let parsedRowsCount = Number(importFile.parsedRowsCount ?? 0);
    let confirmedTransactionsCount = Number(importFile.confirmedTransactionsCount ?? 0);
    const importAgeMs = Date.now() - importFile.updatedAt.getTime();
    const shouldRecoverStalledImport =
      parsedRowsCount === 0 &&
      confirmedTransactionsCount === 0 &&
      (importFile.status === "queued" || importFile.status === "processing") &&
      importAgeMs > 15_000;

    if (shouldRecoverStalledImport) {
      try {
        const { processImportFileText } = await import("@/workers/import-processor");
        await processImportFileText(importId, { actorUserId: null });
        const recoveredImportFile = await fetchImportFileCompat(importId);
        if (recoveredImportFile) {
          importFile = recoveredImportFile;
          parsedRowsCount = Number(recoveredImportFile.parsedRowsCount ?? parsedRowsCount);
          confirmedTransactionsCount = Number(recoveredImportFile.confirmedTransactionsCount ?? confirmedTransactionsCount);
        }
      } catch {
        // Let the existing status response continue; the UI can retry.
      }
    }

    importFile = (await fetchImportFileCompat(importId)) ?? importFile;
    parsedRowsCount = Number(importFile.parsedRowsCount ?? parsedRowsCount);
    confirmedTransactionsCount = Number(importFile.confirmedTransactionsCount ?? confirmedTransactionsCount);

    const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
        })
      : null;
    const shouldAutoConfirm =
      parsedRowsCount > 0 &&
      confirmedTransactionsCount === 0 &&
      importFile.status === "done" &&
      importFile.processingPhase !== "auto_rerunning" &&
      !importFile.accountId;

    if (shouldAutoConfirm) {
      try {
        const { confirmImportFile } = await import("@/workers/import-processor");
        await confirmImportFile(importId, null);
        importFile = (await fetchImportFileCompat(importId)) ?? importFile;
        parsedRowsCount = Number(importFile.parsedRowsCount ?? parsedRowsCount);
        confirmedTransactionsCount = Number(importFile.confirmedTransactionsCount ?? confirmedTransactionsCount);
      } catch {
        // Let the existing status response continue; the UI can retry confirmation.
      }
    }

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
      importFile: {
        id: importFile.id,
        fileName: importFile.fileName,
        fileType: importFile.fileType,
        status: importFile.status,
        processingPhase: importFile.processingPhase ?? null,
        processingMessage: importFile.processingMessage ?? null,
        processingAttempt: Number(importFile.processingAttempt ?? 0),
        processingTargetScore: importFile.processingTargetScore ?? null,
        processingCurrentScore: importFile.processingCurrentScore ?? null,
        accountId: importFile.accountId,
        confirmedAt: importFile.confirmedAt?.toISOString() ?? null,
        uploadedAt: importFile.uploadedAt.toISOString(),
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
