import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileStatusCompat } from "@/lib/data-engine";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const IMPORT_STATUS_STREAM_POLL_MS = 2_500;
const IMPORT_STATUS_STREAM_ACTIVE_RECEIPT_POLL_MS = 1_000;
const IMPORT_STATUS_STREAM_NEAR_VISIBLE_POLL_MS = 500;
const IMPORT_STATUS_STREAM_MAX_ERRORS = 3;

const formatSseEvent = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const compactImportSnapshot = (snapshot: Awaited<ReturnType<typeof loadImportStatusSnapshot>>) => {
  if (!snapshot) return null;

  return {
    importFile: snapshot.importFile,
    parsedRowsCount: snapshot.parsedRowsCount,
    confirmedTransactionsCount: snapshot.confirmedTransactionsCount,
    visibleImportComplete: snapshot.visibleImportComplete,
    settledImportComplete: snapshot.settledImportComplete,
    settlementIssues: snapshot.settlementIssues,
    accountDetailOnlyImport: snapshot.accountDetailOnlyImport,
    accountSummaries: snapshot.accountSummaries,
    confirmationStatus: snapshot.confirmationStatus,
    receiptTransaction: snapshot.receiptTransaction
      ? {
          id: snapshot.receiptTransaction.id,
          accountId: snapshot.receiptTransaction.accountId,
        }
      : null,
    finalizationStatus: snapshot.finalizationStatus,
    finalizationPhase: snapshot.finalizationPhase,
    finalizationProcessedRows: snapshot.finalizationProcessedRows,
    finalizationTotalRows: snapshot.finalizationTotalRows,
  };
};

export async function GET(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();

    const importFile = await fetchImportFileStatusCompat(importId);
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    let closeStream: () => void = () => undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let lastSerializedSnapshot = "";
        let visibleEventSent = false;
        let fullSnapshotLoaded = false;
        let lastFullSnapshotStatus: string | null = null;
        let nextFinalizationCheckAt = 0;
        let consecutiveErrors = 0;
        let nextPollMs = IMPORT_STATUS_STREAM_POLL_MS;
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          controller.close();
        };
        closeStream = close;

        const send = (event: string, data: unknown) => {
          if (closed) {
            return;
          }
          controller.enqueue(formatSseEvent(event, data));
        };

        const poll = async () => {
          if (closed) {
            return;
          }

          try {
            const progress = await fetchImportFileStatusCompat(importId);
            if (!progress) {
              send("error", { error: "Import not found" });
              close();
              return;
            }
            consecutiveErrors = 0;

            const progressSnapshot = {
              importFile: {
                id: progress.id,
                status: progress.status,
                processingPhase: progress.processingPhase,
                processingMessage: progress.processingMessage,
                processingAttempt: progress.processingAttempt,
                processingTargetScore: progress.processingTargetScore,
                processingCurrentScore: progress.processingCurrentScore,
                accountId: progress.accountId,
                updatedAt: progress.updatedAt,
              },
              parsedRowsCount: Number(progress.parsedRowsCount ?? 0),
              confirmedTransactionsCount: Number(progress.confirmedTransactionsCount ?? 0),
              visibleImportComplete: Number(progress.confirmedTransactionsCount ?? 0) > 0,
            };
            nextPollMs =
              progress.processingPhase === "reconciling" || Number(progress.confirmedTransactionsCount ?? 0) > 0
                ? IMPORT_STATUS_STREAM_NEAR_VISIBLE_POLL_MS
                : progress.processingPhase === "reading_receipt_vision"
                  ? IMPORT_STATUS_STREAM_ACTIVE_RECEIPT_POLL_MS
                  : IMPORT_STATUS_STREAM_POLL_MS;
            const serialized = JSON.stringify(progressSnapshot);
            if (serialized !== lastSerializedSnapshot) {
              lastSerializedSnapshot = serialized;
              send("snapshot", progressSnapshot);
            }

            const shouldFinalize =
              progress.status === "failed" ||
              (!fullSnapshotLoaded && Number(progress.confirmedTransactionsCount ?? 0) > 0) ||
              (progress.status === "done" &&
                (lastFullSnapshotStatus !== "done" || Date.now() >= nextFinalizationCheckAt));
            if (!shouldFinalize) {
              return;
            }

            // Load account summaries and settlement checks once at handoff,
            // not on every progress heartbeat.
            const snapshot = await loadImportStatusSnapshot(importId, {
              promoteFailedVisibleImport: true,
            });
            fullSnapshotLoaded = true;
            lastFullSnapshotStatus = progress.status;
            nextFinalizationCheckAt = Date.now() + 5_000;
            if (!snapshot) {
              send("error", { error: "Import not found" });
              close();
              return;
            }
            const compactSnapshot = compactImportSnapshot(snapshot);
            const visible = snapshot.settledImportComplete || Boolean(snapshot.receiptTransaction);

            if (visible && !visibleEventSent) {
              visibleEventSent = true;
              send("visible", compactSnapshot);
            }

            const failed = progress.status === "failed";
            const finished = visible || failed;

            if (finished) {
              send(snapshot.importFile.status === "failed" ? "error" : "complete", compactSnapshot);
              close();
            }
          } catch (error) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= IMPORT_STATUS_STREAM_MAX_ERRORS) {
              send("error", {
                error: error instanceof Error ? error.message : "Unable to stream import status",
              });
              close();
            }
          } finally {
            if (!closed) {
              timer = setTimeout(() => {
                void poll();
              }, nextPollMs);
            }
          }
        };

        send("snapshot", {
          importId,
          phase: "queued",
        });
        void poll();

        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        closeStream();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to stream import status" }, { status: 400 });
  }
}
