import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

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

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let timer: ReturnType<typeof setInterval> | null = null;
        let lastSerializedSnapshot = "";
        const close = () => {
          if (closed) {
            return;
          }
          closed = true;
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          controller.close();
        };

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
              importFile,
              promoteFailedVisibleImport: true,
            });

            if (!snapshot) {
              send("error", { error: "Import not found" });
              close();
              return;
            }

            const serialized = JSON.stringify(snapshot);
            if (serialized !== lastSerializedSnapshot) {
              lastSerializedSnapshot = serialized;
              send("snapshot", snapshot);
            }

            const finished =
              snapshot.confirmationStatus === "confirmed" &&
              (!snapshot.finalizationStatus || snapshot.finalizationStatus === "done" || snapshot.finalizationStatus === "failed");

            if (finished) {
              send("complete", snapshot);
              close();
            }
          } catch (error) {
            send("error", {
              error: error instanceof Error ? error.message : "Unable to stream import status",
            });
          }
        };

        send("snapshot", {
          importId,
          phase: "queued",
        });
        void poll();
        timer = setInterval(() => {
          void poll();
        }, 500);

        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {},
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
