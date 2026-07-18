import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const IMPORT_STATUS_STREAM_POLL_MS = 1_500;
const IMPORT_STATUS_STREAM_MAX_ERRORS = 3;

const formatSseEvent = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function GET(request: Request, { params }: { params: Promise<{ importId: string }> }) {
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

    let closeStream: () => void = () => undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let lastSerializedSnapshot = "";
        let visibleEventSent = false;
        let consecutiveErrors = 0;
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
            const snapshot = await loadImportStatusSnapshot(importId, {
              promoteFailedVisibleImport: true,
            });

            if (!snapshot) {
              send("error", { error: "Import not found" });
              close();
              return;
            }
            consecutiveErrors = 0;

            const serialized = JSON.stringify(snapshot);
            if (serialized !== lastSerializedSnapshot) {
              lastSerializedSnapshot = serialized;
              send("snapshot", snapshot);
            }

            const visible =
              snapshot.visibleImportComplete ||
              Boolean(snapshot.receiptTransaction) ||
              Boolean(snapshot.receiptDocument);

            if (visible && !visibleEventSent) {
              visibleEventSent = true;
              send("visible", snapshot);
            }

            const terminalStatus =
              snapshot.importFile.status === "done" ||
              snapshot.importFile.status === "failed";
            const finished =
              snapshot.confirmationStatus === "confirmed" ||
              visible ||
              terminalStatus;

            if (finished) {
              send(snapshot.importFile.status === "failed" ? "error" : "complete", snapshot);
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
              }, IMPORT_STATUS_STREAM_POLL_MS);
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
