import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat, hasCompatibleTable, updateImportFileCompat } from "@/lib/data-engine";
import { buildImportTelemetrySnapshot } from "@/lib/import-telemetry";
import { readCheckpointWorkflowStage } from "@/lib/import-workflow";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { prisma } from "@/lib/prisma";
import { getConfiguredPdfJsBaseUrl } from "@/lib/import-file-text.server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
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

    const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
        })
      : null;
    const parsedRowsCount = Number(importFile.parsedRowsCount ?? 0);
    const confirmedTransactionsCount = Number(importFile.confirmedTransactionsCount ?? 0);
    const checkpointRowCount = Number(statementCheckpoint?.rowCount ?? 0);
    const checkpointWorkflowStage = readCheckpointWorkflowStage(statementCheckpoint?.sourceMetadata);
    const confirmationStatus =
      importFile.status === "failed"
        ? "failed"
        : confirmedTransactionsCount > 0
          ? "confirmed"
          : importFile.status === "done"
            ? parsedRowsCount > 0
              ? "staged"
              : "done"
            : parsedRowsCount > 0
              ? "staged"
              : "processing";
    const telemetry = buildImportTelemetrySnapshot({
      status: importFile.status,
      processingPhase: importFile.processingPhase,
      processingMessage: importFile.processingMessage,
      parsedRowsCount,
      confirmedTransactionsCount,
      confirmationStatus,
      checkpointStatus: statementCheckpoint?.status ?? null,
      workflowStage: checkpointWorkflowStage,
    });

    const alreadyComplete = telemetry.phase === "complete" && confirmedTransactionsCount > 0;
    if (alreadyComplete) {
      return NextResponse.json({
        ok: true,
        queued: false,
        skipped: true,
        telemetryPhase: telemetry.phase,
        telemetryLabel: telemetry.phaseLabel,
        telemetryMessage: telemetry.message,
        canResume: telemetry.canResume,
        resumeReason: telemetry.resumeReason,
        importFileId: importId,
        accountId: importFile.accountId ?? null,
      });
    }

    if (!telemetry.canResume) {
      return NextResponse.json(
        {
          error: "This import cannot be resumed right now.",
          telemetryPhase: telemetry.phase,
          telemetryLabel: telemetry.phaseLabel,
          telemetryMessage: telemetry.message,
          canResume: telemetry.canResume,
          resumeReason: telemetry.resumeReason,
        },
        { status: 400 }
      );
    }

    if (!localDev) {
      await ensureImportProcessingWorker();
    }

    const hasCheckpointedRows = parsedRowsCount > 0 || checkpointRowCount > 0 || statementCheckpoint?.status === "reconciled";

    if (hasCheckpointedRows) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: `Resuming ${importFile.fileName} from checkpoint...`,
        processingCurrentScore: null,
      });

      const { confirmImportFile } = await import("@/workers/import-processor");
      const confirmationResult = await confirmImportFile(importId, importFile.accountId ?? null);

      if (confirmationResult.status === "staged" && confirmationResult.imported === 0) {
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "queued_retry",
          processingMessage: `Clover is re-reading ${importFile.fileName} from the saved checkpoint...`,
          processingCurrentScore: null,
        });

        await enqueueImportProcessing({
          importFileId: importId,
          actorUserId: userId,
          pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
        });
      }

      const nextTelemetry = buildImportTelemetrySnapshot({
        status: confirmationResult.status ?? "processing",
        workflowStage: confirmationResult.status === "done" ? "complete" : "reconciling",
        processingPhase: confirmationResult.status === "done" ? "complete" : "reconciling",
        processingMessage:
          confirmationResult.status === "done"
            ? `Resumed ${importFile.fileName} from the saved checkpoint.`
            : `Clover is reconciling the saved checkpoint for ${importFile.fileName}.`,
        parsedRowsCount,
        confirmedTransactionsCount: Math.max(confirmedTransactionsCount, confirmationResult.confirmedTransactionsCount ?? 0),
        confirmationStatus: confirmationResult.status === "done" ? "confirmed" : "staged",
        checkpointStatus: statementCheckpoint?.status ?? null,
      });

      return NextResponse.json({
        ok: true,
        queued: false,
        skipped: false,
        resumedFromCheckpoint: true,
        resumeStrategy: confirmationResult.status === "done" ? "checkpoint_confirmed" : "checkpoint_requeued",
        importFileId: importId,
        accountId: confirmationResult.accountId ?? importFile.accountId ?? null,
        telemetryPhase: nextTelemetry.phase,
        telemetryLabel: nextTelemetry.phaseLabel,
        telemetryMessage: nextTelemetry.message,
        canResume: nextTelemetry.canResume,
        resumeReason: nextTelemetry.resumeReason,
      });
    }

    await updateImportFileCompat(importId, {
      status: "processing",
      processingPhase: "queued_retry",
      processingMessage: `Resuming ${importFile.fileName}...`,
      processingCurrentScore: null,
    });

    await enqueueImportProcessing({
      importFileId: importId,
      actorUserId: userId,
      pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
    });

    const nextTelemetry = buildImportTelemetrySnapshot({
      status: "processing",
      processingPhase: "queued_retry",
      processingMessage: `Resuming ${importFile.fileName}...`,
      parsedRowsCount,
      confirmedTransactionsCount,
      confirmationStatus: "processing",
      checkpointStatus: statementCheckpoint?.status ?? null,
      workflowStage: checkpointWorkflowStage,
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      skipped: false,
      importFileId: importId,
      accountId: importFile.accountId ?? null,
      telemetryPhase: nextTelemetry.phase,
      telemetryLabel: nextTelemetry.phaseLabel,
      telemetryMessage: nextTelemetry.message,
      canResume: nextTelemetry.canResume,
      resumeReason: nextTelemetry.resumeReason,
    });
  } catch {
    return NextResponse.json({ error: "Unable to resume import" }, { status: 400 });
  }
}
