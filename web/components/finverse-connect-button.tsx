"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type SyncResponse = {
  status?: string;
  error?: string;
  transactions?: { imported?: number };
};

export function FinverseConnectButton({ workspaceId }: { workspaceId: string }) {
  const searchParams = useSearchParams();
  const autoSyncStarted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const connectionId = searchParams?.get("finverseConnection") ?? undefined;
  const callbackStatus = searchParams?.get("finverse") ?? null;

  const sync = async (requestedConnectionId?: string) => {
    if (!workspaceId || busy) return;
    setBusy(true);
    setMessage("Checking your connected bank…");
    try {
      const response = await fetch("/api/integrations/finverse/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, connectionId: requestedConnectionId }),
      });
      const body = await response.json() as SyncResponse;
      if (!response.ok) throw new Error(body.error || "Unable to sync your bank.");
      if (body.status === "retrieving") {
        setMessage("Bank connected. Finverse is securely retrieving your data; try Sync bank again shortly.");
        return;
      }
      const imported = body.transactions?.imported ?? 0;
      setMessage(imported > 0 ? `Bank synced — ${imported} new transaction${imported === 1 ? "" : "s"} ready for review.` : "Bank is up to date.");
      window.setTimeout(() => window.location.assign("/accounts"), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sync your bank.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (callbackStatus === "connected" && connectionId && workspaceId && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "error") {
      setMessage("The bank connection could not be completed. Please try again.");
    }
  // sync intentionally runs once after the Finverse redirect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackStatus, connectionId, workspaceId]);

  const connect = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <div className="finverse-connect">
      <button className="button button-secondary button-small" type="button" onClick={connect} disabled={!workspaceId || busy}>
        {busy ? "Please wait…" : "Connect bank"}
      </button>
      <button className="button button-secondary button-small" type="button" onClick={() => void sync()} disabled={!workspaceId || busy}>
        Sync bank
      </button>
      {message ? <span className="finverse-connect__status" role="status">{message}</span> : null}
    </div>
  );
}
