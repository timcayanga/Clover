"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SyncResponse = {
  status?: string;
  error?: string;
  accounts?: number;
  transactions?: { imported?: number };
};

export function LunchFlowConnectButton({
  workspaceId,
  onSynced,
}: {
  workspaceId: string;
  onSynced?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSyncStarted = useRef(false);
  const actionRef = useRef<"connecting" | "syncing" | null>(null);
  const onSyncedRef = useRef(onSynced);
  const [action, setAction] = useState<"connecting" | "syncing" | null>(null);
  const [message, setMessage] = useState("");
  const connectionId = searchParams?.get("lunchflowConnection") ?? undefined;
  const callbackStatus = searchParams?.get("lunchflow") ?? null;

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const sync = useCallback(async (requestedConnectionId?: string) => {
    if (!workspaceId || actionRef.current) return;
    actionRef.current = "syncing";
    setAction("syncing");
    setMessage("Retrieving your connected accounts and transactions…");
    try {
      const response = await fetch("/api/integrations/lunchflow/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, connectionId: requestedConnectionId }),
        cache: "no-store",
      });
      const body = await response.json() as SyncResponse;
      if (!response.ok) throw new Error(body.error || "Unable to sync your bank.");
      await onSyncedRef.current?.();
      const accounts = body.accounts ?? 0;
      const imported = body.transactions?.imported ?? 0;
      setMessage(`Bank synced — ${accounts} account${accounts === 1 ? "" : "s"} and ${imported} new transaction${imported === 1 ? "" : "s"}.`);
      router.replace("/accounts", { scroll: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sync your bank.");
    } finally {
      actionRef.current = null;
      setAction(null);
    }
  }, [router, workspaceId]);

  useEffect(() => {
    if (callbackStatus === "connected" && connectionId && workspaceId && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "cancelled") {
      setMessage("The bank connection was cancelled.");
    } else if (callbackStatus === "error") {
      setMessage("The bank connection could not be completed. Please try again.");
    }
  }, [callbackStatus, connectionId, sync, workspaceId]);

  const connect = async () => {
    if (!workspaceId || actionRef.current) return;
    actionRef.current = "connecting";
    setAction("connecting");
    setMessage("Preparing the secure Lunch Flow connection…");
    try {
      const response = await fetch("/api/integrations/lunchflow/link", {
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
      <button className="button button-secondary button-small accounts-toolbar-add" type="button" onClick={connect} disabled={!workspaceId || action !== null}>
        {action === "connecting" ? "Connecting…" : "Connect bank"}
      </button>
      <button className="button button-secondary button-small accounts-toolbar-add" type="button" onClick={() => void sync()} disabled={!workspaceId || action !== null}>
        {action === "syncing" ? "Syncing…" : "Sync bank"}
      </button>
      {message ? <span className="finverse-connect__status" role="status" aria-live="polite">{message}</span> : null}
    </div>
  );
}
