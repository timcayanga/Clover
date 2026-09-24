"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type SyncResponse = {
  status?: string;
  connectionId?: string;
  remaining?: number;
  accounts?: {id:string;name:string}[];
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
  const [access, setAccess] = useState<{ workspaceId: string; upgradeRequired: boolean } | null>(null);
  const allowed = access?.workspaceId === workspaceId && !access.upgradeRequired;
  const [banks, setBanks] = useState<{id:string;name:string}[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [bankStatus, setBankStatus] = useState("Loading banks…");
  const [bankRevision, setBankRevision] = useState(0);
  const [testMode, setTestMode] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSyncStarted = useRef(false);
  const activeSyncRef = useRef<AbortController | null>(null);
  const actionRef = useRef<"connecting" | "syncing" | null>(null);
  const onSyncedRef = useRef(onSynced);
  const [action, setAction] = useState<"connecting" | "syncing" | null>(null);
  const [selection,setSelection] = useState<{connectionId:string;remaining:number;accounts:{id:string;name:string}[]}|null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const connectionId = searchParams?.get("finverseConnection") ?? undefined;
  const callbackStatus = searchParams?.get("finverse") ?? null;

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    const controller = new AbortController();
    setAccess(null);
    setBanks([]); setBankStatus("Loading banks…");
    void fetch(`/api/integrations/finverse/institutions?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load banks."); return data; })
      .then(data => { if (controller.signal.aborted) return; setAccess({ workspaceId, upgradeRequired: data.upgradeRequired === true }); setBanks(data.banks); setTestMode(data.mode === "test"); setBankStatus(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); })
      .catch(error => { if (!controller.signal.aborted) setBankStatus(error.message || "Unable to load banks. Try again."); });
    return () => controller.abort();
  }, [workspaceId, bankRevision]);

  const sync = useCallback(async (requestedConnectionId?: string, selectedAccountIds?: string[]) => {
    if (!allowed || !workspaceId || actionRef.current) return;
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
          body: JSON.stringify({ workspaceId, connectionId: requestedConnectionId, selectedAccountIds }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as SyncResponse;
        if (!response.ok) throw new Error(body.error || "Unable to sync your bank.");
        if(body.status === "select_accounts" && body.connectionId && body.accounts){setSelection({connectionId:body.connectionId,remaining:body.remaining ?? 0,accounts:body.accounts});setSelected([]);setMessage(body.error ?? "Choose bank accounts to link.");return;}
        setSelection(null);
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
  }, [allowed, router, workspaceId]);

  useEffect(() => () => activeSyncRef.current?.abort(), []);

  useEffect(() => {
    if (allowed && callbackStatus === "connected" && connectionId && workspaceId && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "cancelled") {
      setMessage("Bank connection cancelled. You can try again when you’re ready.");
    } else if (callbackStatus === "error") {
      setMessage("The bank connection could not be completed. Please try again.");
    }
  }, [allowed, callbackStatus, connectionId, sync, workspaceId]);

  const connect = async (institutionId: string) => {
    if (!allowed || !workspaceId || actionRef.current) return;
    actionRef.current = "connecting";
    setAction("connecting");
    setMessage("Opening the secure bank connection…");
    try {
      const response = await fetch("/api/integrations/finverse/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, institutionId }),
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

  if (access?.workspaceId === workspaceId && access.upgradeRequired) return (
    <div className="finverse-connect finverse-connect--upgrade">
      <h4>Unlock bank connections</h4>
      <p>Upgrade to Clover Plus or Pro to securely connect your banks through Finverse.</p>
      <Link className="button button-primary" href="/settings/plan">Upgrade plan</Link>
      <p>You can still add accounts with Manual or Upload on Free.</p>
    </div>
  );
  if (!allowed) return <div role="status"><p>{bankStatus}</p>{bankStatus !== "Loading banks…" ? <button type="button" className="button button-secondary" onClick={() => setBankRevision(v => v + 1)}>Try again</button> : null}</div>;

  return (
    <div className="finverse-connect">
      <h4>Connect your bank</h4>
      <p>Choose a bank to securely connect through Finverse. Review the accounts before adding them to Clover.</p>
      {testMode ? <p role="status">Test mode · Only test banks are shown.</p> : null}
      <label className="finverse-connect__search">Find your bank<input type="search" placeholder="Search banks" value={bankQuery} onChange={event => setBankQuery(event.target.value)} /></label>
      <p className="finverse-connect__region">Philippines</p>
      {bankStatus ? <div role="status"><p>{bankStatus}</p>{bankStatus !== "Loading banks…" ? <button type="button" className="button button-secondary" onClick={() => setBankRevision(v => v + 1)}>Refresh bank list</button> : null}</div> : null}
      <div className="finverse-connect__banks">
        {banks.filter(bank => bank.name.toLowerCase().includes(bankQuery.trim().toLowerCase())).map(bank => <button key={bank.id} className="button button-secondary" type="button" disabled={action !== null} onClick={() => void connect(bank.id)}><span>{bank.name}</span><span aria-hidden="true">›</span></button>)}
        {banks.length > 0 && !banks.some(bank => bank.name.toLowerCase().includes(bankQuery.trim().toLowerCase())) ? <p>No matching banks. Try another name or use Manual or Upload.</p> : null}
      </div>
      <p>Can’t find your bank? Use Manual or Upload.</p>
      <p>Authorization happens with Finverse. Clover never asks for your bank password.</p>
      {banks.length > 0 || connectionId ? <button className="button button-secondary" type="button" onClick={() => void sync(connectionId)} disabled={!workspaceId || action !== null}>
        {action === "syncing" ? "Retrieving accounts…" : "Resume bank sync"}
      </button> : null}
      {selection ? <fieldset><legend>Choose up to {selection.remaining} bank accounts</legend>{selection.accounts.map(account=><label key={account.id} style={{display:"block"}}><input type="checkbox" checked={selected.includes(account.id)} disabled={action !== null || (!selected.includes(account.id) && selected.length>=selection.remaining)} onChange={event=>setSelected(current=>event.target.checked?[...current,account.id]:current.filter(id=>id!==account.id))}/>{account.name}</label>)}<button type="button" className="button button-primary" disabled={action !== null || selected.length === 0 || selected.length>selection.remaining} onClick={()=>void sync(selection.connectionId,selected)}>Sync selected accounts</button></fieldset> : null}
      {message ? <span className="finverse-connect__status" role="status" aria-live="polite">{message}</span> : null}
    </div>
  );
}
