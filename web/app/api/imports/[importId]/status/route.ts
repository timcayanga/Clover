import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, hasCompatibleTable } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();

    let importFile = await fetchImportFileCompat(importId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    const parsedRowsCountBefore = Number(importFile.parsedRowsCount ?? 0);
    const confirmedTransactionsCountBefore = Number(importFile.confirmedTransactionsCount ?? 0);
    const updatedAtMs = importFile.updatedAt ? new Date(importFile.updatedAt).getTime() : 0;
    const createdAtMs = importFile.createdAt ? new Date(importFile.createdAt).getTime() : 0;
    const importAgeMs = Math.max(0, Date.now() - Math.max(updatedAtMs, createdAtMs));
    const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
        })
      : null;
    const isImageImport = String(importFile.fileType ?? "").toLowerCase().startsWith("image/");
    const checkpointImportMode =
      statementCheckpoint && typeof statementCheckpoint.sourceMetadata === "object" && statementCheckpoint.sourceMetadata && "importMode" in statementCheckpoint.sourceMetadata
        ? String((statementCheckpoint.sourceMetadata as { importMode?: unknown }).importMode ?? "")
        : "";
    const isDocumentImportMode = checkpointImportMode.length > 0 && checkpointImportMode !== "statement";
    const checkpointRowCount = Number(statementCheckpoint?.rowCount ?? 0);
    const selfHealDelayMs = isImageImport || isDocumentImportMode ? 2_000 : 3_000;
    const hasParsedRows = parsedRowsCountBefore > 0 || checkpointRowCount > 0;
    const hasConfirmedRows = confirmedTransactionsCountBefore > 0 || statementCheckpoint?.status === "reconciled";
    const shouldSelfHeal =
      importAgeMs > selfHealDelayMs &&
      ((parsedRowsCountBefore === 0 && confirmedTransactionsCountBefore === 0 && ((importFile.status === "processing" || importFile.status === "queued") || (importFile.status === "done" && checkpointRowCount === 0))) ||
        (importFile.status === "done" && hasParsedRows && !hasConfirmedRows));

    if (shouldSelfHeal) {
      void (async () => {
        try {
          const { processImportFileText } = await import("@/workers/import-processor");
          await processImportFileText(importId, { actorUserId: null });
        } catch (error) {
          console.warn("Unable to self-heal stalled import status", {
            importId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    }

    let parsedRowsCount = Math.max(Number(importFile.parsedRowsCount ?? 0), checkpointRowCount);
    let confirmedTransactionsCount = Math.max(
      Number(importFile.confirmedTransactionsCount ?? 0),
      statementCheckpoint?.status === "reconciled" ? checkpointRowCount : 0
    );

    const confirmationStatus =
      importFile.status === "failed"
        ? "failed"
        : confirmedTransactionsCount > 0
          ? "confirmed"
          : importFile.status === "done" && hasParsedRows
            ? "staged"
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
