import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { countTransactionsByImportFileCompat, fetchImportFileCompat, hasCompatibleTable, updateImportFileCompat } from "@/lib/data-engine";
import { buildImportTelemetrySnapshot } from "@/lib/import-telemetry";
import { readCheckpointWorkflowStage } from "@/lib/import-workflow";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { getImportEnrichmentJobByImportFileId } from "@/lib/import-enrichment-jobs";
import { prisma } from "@/lib/prisma";
import { getConfiguredPdfJsBaseUrl, isPdfPasswordError } from "@/lib/import-file-text.server";
import { importProcessingLooksActive } from "@/lib/import-resume-policy";
import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const body = await _request.json().catch(() => ({}));
    const password = typeof body?.password === "string" && body.password.trim() ? body.password : undefined;

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
    const parsedRowsCount = Math.max(Number(importFile.parsedRowsCount ?? 0), Number(statementCheckpoint?.rowCount ?? 0));
    const savedTransactionsCount = await countTransactionsByImportFileCompat(importId).catch(() => 0);
    const confirmedTransactionsCount = Math.max(Number(importFile.confirmedTransactionsCount ?? 0), savedTransactionsCount);
    const hasVisibleImportData = confirmedTransactionsCount > 0;
    if (importFile.status === "failed" && hasVisibleImportData) {
      await updateImportFileCompat(importId, {
        status: "done",
        processingPhase: "complete",
        processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
        confirmedTransactionsCount,
      });
      importFile.status = "done";
      importFile.processingPhase = "complete";
      importFile.processingMessage = "Transactions are visible. Clover is cleaning up names and categories in the background.";
      importFile.confirmedTransactionsCount = confirmedTransactionsCount;
    }
    const checkpointRowCount = Number(statementCheckpoint?.rowCount ?? 0);
    const checkpointWorkflowStage = readCheckpointWorkflowStage(statementCheckpoint?.sourceMetadata);
    const confirmationStatus =
      confirmedTransactionsCount > 0
        ? "confirmed"
        : importFile.status === "failed"
          ? "failed"
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

    const enrichmentJob = await getImportEnrichmentJobByImportFileId(importId).catch(() => null);
    const alreadyComplete =
      telemetry.phase === "complete" &&
      confirmedTransactionsCount > 0 &&
      (!enrichmentJob || enrichmentJob.status === "done");
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

    if (
      importProcessingLooksActive({
        status: importFile.status,
        processingPhase: importFile.processingPhase,
        updatedAt: importFile.updatedAt,
      })
    ) {
      return NextResponse.json({
        ok: true,
        queued: true,
        skipped: true,
        alreadyProcessing: true,
        telemetryPhase: telemetry.phase,
        telemetryLabel: telemetry.phaseLabel,
        telemetryMessage: telemetry.message,
        canResume: false,
        resumeReason: "processing_active",
        importFileId: importId,
        accountId: importFile.accountId ?? null,
      });
    }

    if (telemetry.phase === "complete" && confirmedTransactionsCount > 0 && enrichmentJob && enrichmentJob.status !== "done") {
      return NextResponse.json({
        ok: true,
        queued: false,
        skipped: true,
        resumedFromCheckpoint: true,
        resumeStrategy: "visible_import_background_enrichment",
        importFileId: importId,
        accountId: importFile.accountId ?? null,
        telemetryPhase: telemetry.phase,
        telemetryLabel: telemetry.phaseLabel,
        telemetryMessage: "Accounts and transactions are already visible. Clover will keep cleaning names and categories in the background.",
        canResume: false,
        resumeReason: "background_enrichment",
      });
    }

    const passwordUnlock = importFile.processingPhase === "password_required" && Boolean(password);
    if (!telemetry.canResume && !passwordUnlock) {
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

    const hasCheckpointedRows = parsedRowsCount > 0 || checkpointRowCount > 0 || statementCheckpoint?.status === "reconciled";
    const processInline = async (resumeStrategy: string, resumePassword?: string) => {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: `Resuming ${importFile.fileName}...`,
        processingCurrentScore: null,
      });

      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, {
        password: resumePassword,
        actorUserId: userId,
        qaSource: "import_processing",
        pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
      });
      const visibleRows =
        result.status === "done"
          ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
          : Number(result.confirmedTransactionsCount ?? 0);
      const nextTelemetry = buildImportTelemetrySnapshot({
        status: result.status ?? "processing",
        workflowStage: result.status === "done" ? "complete" : "reading_account_details",
        processingPhase: result.status === "done" ? "complete" : "reading_account_details",
        processingMessage:
          result.status === "done"
            ? `Resumed ${importFile.fileName}.`
            : `Clover is resuming ${importFile.fileName}.`,
        parsedRowsCount: Math.max(parsedRowsCount, Number(result.imported ?? 0)),
        confirmedTransactionsCount: Math.max(confirmedTransactionsCount, visibleRows),
        confirmationStatus: result.status === "done" && visibleRows > 0 ? "confirmed" : "processing",
        checkpointStatus: statementCheckpoint?.status ?? null,
      });

      return NextResponse.json({
        ok: true,
        queued: false,
        skipped: false,
        resumedFromCheckpoint: hasCheckpointedRows,
        resumeStrategy,
        importFileId: importId,
        accountId: result.accountId ?? importFile.accountId ?? null,
        importedRows: result.imported ?? 0,
        confirmedTransactionsCount: result.confirmedTransactionsCount ?? visibleRows,
        telemetryPhase: nextTelemetry.phase,
        telemetryLabel: nextTelemetry.phaseLabel,
        telemetryMessage: nextTelemetry.message,
        canResume: nextTelemetry.canResume,
        resumeReason: nextTelemetry.resumeReason,
      });
    };

    if (passwordUnlock) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: `Opening ${importFile.fileName} with the provided password...`,
        processingCurrentScore: null,
      });

      after(async () => {
        try {
          await processInline("password_unlocked", password);
        } catch (error) {
          const passwordMessage = "This password could not open the file. Please check it and try again.";
          await updateImportFileCompat(importId, {
            status: "failed",
            processingPhase: isPdfPasswordError(error) ? "password_required" : "failed",
            processingMessage: isPdfPasswordError(error) ? passwordMessage : "Clover could not resume this import. Please try again.",
          }).catch(() => null);
          console.error("Password import resume failed", { importId, error });
        }
      });

      const nextTelemetry = buildImportTelemetrySnapshot({
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: `Opening ${importFile.fileName} with the provided password...`,
        parsedRowsCount,
        confirmedTransactionsCount,
        confirmationStatus: "processing",
        checkpointStatus: statementCheckpoint?.status ?? null,
        workflowStage: "reading_account_details",
      });

      return NextResponse.json({
        ok: true,
        queued: true,
        skipped: false,
        resumeStrategy: "password_unlocked",
        importFileId: importId,
        accountId: importFile.accountId ?? null,
        telemetryPhase: nextTelemetry.phase,
        telemetryLabel: nextTelemetry.phaseLabel,
        telemetryMessage: nextTelemetry.message,
        canResume: nextTelemetry.canResume,
        resumeReason: nextTelemetry.resumeReason,
      }, { status: 202 });
    }

    if (hasCheckpointedRows) {
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: `Resuming ${importFile.fileName} from checkpoint...`,
        processingCurrentScore: null,
      });

      const { confirmImportFile } = await import("@/workers/import-processor");
      const confirmationResult = (await confirmImportFile(importId, importFile.accountId ?? null)) as {
        imported: number;
        status?: string;
        accountId?: string | null;
        confirmedTransactionsCount?: number | null;
      };

      if (confirmationResult.status === "staged" && confirmationResult.imported === 0) {
        if (!localDev) {
          return processInline("checkpoint_processed_inline");
        }

        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "queued_retry",
          processingMessage: `Clover is re-reading ${importFile.fileName} from the saved checkpoint...`,
          processingCurrentScore: null,
        });

        await ensureImportProcessingWorker();
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

    if (!localDev) {
      return processInline("processed_inline");
    }

    await updateImportFileCompat(importId, {
      status: "processing",
      processingPhase: "queued_retry",
      processingMessage: `Resuming ${importFile.fileName}...`,
      processingCurrentScore: null,
    });

    if (localDev) {
      await ensureImportProcessingWorker();
    }
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
