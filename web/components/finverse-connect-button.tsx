"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SyncResponse = {
  status?: string;
  error?: string;
  transactions?: { imported?: number };
};

const FINVERSE_POLL_INTERVAL_MS = 3_000;
const FINVERSE_MAX_POLL_ATTEMPTS = 30;

const waitForNextPoll = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Sync cancelled", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, FINVERSE_POLL_INTERVAL_MS);
    signal.addEventListener("abort", handleAbort, { once: true });
  });

export function FinverseConnectButton({
  workspaceId,
  onSynced,
}: {
  workspaceId: string;
  onSynced?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSyncStarted = useRef(false);
  const activeSyncRef = useRef<AbortController | null>(null);
  const actionRef = useRef<"connecting" | "syncing" | null>(null);
  const onSyncedRef = useRef(onSynced);
  const [action, setAction] = useState<"connecting" | "syncing" | null>(null);
  const [message, setMessage] = useState("");
  const connectionId = searchParams?.get("finverseConnection") ?? undefined;
  const callbackStatus = searchParams?.get("finverse") ?? null;

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const sync = useCallback(async (requestedConnectionId?: string) => {
    if (!workspaceId || actionRef.current) return;
    const controller = new AbortController();
    activeSyncRef.current = controller;
    actionRef.current = "syncing";
    setAction("syncing");
    setMessage("Bank connected. Retrieving your accounts and transactions…");
    try {
      for (let attempt = 1; attempt <= FINVERSE_MAX_POLL_ATTEMPTS; attempt += 1) {
        const response = await fetch("/api/integrations/finverse/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, connectionId: requestedConnectionId }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as SyncResponse;
        if (!response.ok) throw new Error(body.error || "Unable to sync your bank.");
        if (body.status === "retrieving") {
          if (attempt === FINVERSE_MAX_POLL_ATTEMPTS) {
            setMessage("Finverse is still retrieving your bank data. You can leave this page and use Sync bank again later.");
            return;
          }
          setMessage("Bank connected. Retrieving your accounts and transactions… This can take up to a minute.");
          await waitForNextPoll(controller.signal);
          continue;
        }

        await onSyncedRef.current?.();
        const imported = body.transactions?.imported ?? 0;
        setMessage(imported > 0 ? `Bank synced — ${imported} new transaction${imported === 1 ? "" : "s"} ready for review.` : "Bank synced — your accounts are now up to date.");
        router.replace("/accounts", { scroll: false });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Unable to sync your bank.");
    } finally {
      if (activeSyncRef.current === controller) activeSyncRef.current = null;
      actionRef.current = null;
      setAction(null);
    }
  }, [router, workspaceId]);

  useEffect(() => () => activeSyncRef.current?.abort(), []);

  useEffect(() => {
    if (callbackStatus === "connected" && connectionId && workspaceId && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "error") {
      setMessage("The bank connection could not be completed. Please try again.");
    }
  }, [callbackStatus, connectionId, sync, workspaceId]);

  const connect = async () => {
    if (!workspaceId || actionRef.current) return;
    actionRef.current = "connecting";
    setAction("connecting");
    setMessage("Opening the secure bank connection…");
    try {
      const response = await fetch("/api/integrations/finverse/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = await response.json() as { linkUrl?: string; error?: string };
      if (!response.ok || !body.linkUrl) throw new Error(body.error || "Unable to connect a bank.");
      window.location.assign(body.linkUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect a bank.");
      actionRef.current = null;
      setAction(null);
    }
  };

  return (
    <div className="finverse-connect">
      <button className="button button-secondary button-small" type="button" onClick={connect} disabled={!workspaceId || action !== null}>
        {action === "connecting" ? "Opening…" : "Connect bank"}
      </button>
      <button className="button button-secondary button-small" type="button" onClick={() => void sync()} disabled={!workspaceId || action !== null}>
        {action === "syncing" ? "Syncing…" : "Sync bank"}
      </button>
      {message ? <span className="finverse-connect__status" role="status" aria-live="polite">{message}</span> : null}
    </div>
  );
}
