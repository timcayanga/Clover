"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { finverseCountries } from "../../shared/finverse-countries";
import "./add-entry-methods.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type SelectAccount = { id: string; name: string; reserved?: boolean; existingAccountName?: string | null };
type SyncResponse = {
  status?: string;
  linkUrl?: string;
  connectionId?: string;
  remaining?: number;
  accounts?: SelectAccount[];
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
  mode = "connect",
  accountId,
}: {
  workspaceId: string;
  mode?: "connect" | "sync";
  accountId?: string;
  onSynced?: () => Promise<void> | void;
}) {
  const [access, setAccess] = useState<{ workspaceId: string; upgradeRequired: boolean } | null>(null);
  const allowed = access?.workspaceId === workspaceId && !access.upgradeRequired;
  const [banks, setBanks] = useState<{id:string;name:string;countries:string[];logoUrl:string;logoUrls?:Record<string,string>}[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [linked, setLinked] = useState<{id:string;connectionId:string;name:string;last4:string|null;logoUrl:string;lastSyncedAt:string|null}[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [connectionsError, setConnectionsError] = useState("");
  const [bankStatus, setBankStatus] = useState("Loading banks…");
  const [bankRevision, setBankRevision] = useState(0);
  const [testMode, setTestMode] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSyncStarted = useRef("");
  const activeSyncRef = useRef<AbortController | null>(null);
  const actionRef = useRef<"connecting" | "syncing" | null>(null);
  const onSyncedRef = useRef(onSynced);
  const [action, setAction] = useState<"connecting" | "syncing" | null>(null);
  const [selection,setSelection] = useState<{connectionId:string;remaining:number;accounts:SelectAccount[]}|null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [unlinkTarget, setUnlinkTarget] = useState<{id:string;name:string}|null>(null);
  const [message, setMessage] = useState("");
  const connectionId = searchParams?.get("finverseConnection") ?? undefined;
  const callbackStatus = searchParams?.get("finverse") ?? null;

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    const controller = new AbortController();
    setAccess(null);
    setBanks([]); setCountry(null); setBankStatus("Loading banks…");
    void fetch(`/api/integrations/finverse/institutions?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load banks."); return data; })
      .then(data => { if (controller.signal.aborted) return; setAccess({ workspaceId, upgradeRequired: data.upgradeRequired === true }); setBanks(data.banks); setTestMode(data.mode === "test"); setBankStatus(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); })
      .catch(error => { if (!controller.signal.aborted) setBankStatus(error.message || "Unable to load banks. Try again."); });
    return () => controller.abort();
  }, [workspaceId, bankRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setConnectionsLoaded(false); setConnectionsError(""); setLinked([]);
    void fetch(`/api/integrations/finverse/connections?workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => { if(!response.ok) throw new Error("Unable to load linked accounts.");return response.json(); })
      .then(data => {if(!controller.signal.aborted){setLinked(data.accounts);setConnectionsLoaded(true);}})
      .catch(error => {if(!controller.signal.aborted)setConnectionsError(error.message);});
    return () => controller.abort();
  }, [workspaceId, bankRevision]);

  const sync = useCallback(async (requestedConnectionId?: string, selectedAccountIds?: string[], refresh = false) => {
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
          body: JSON.stringify({ workspaceId, connectionId: requestedConnectionId, selectedAccountIds, refresh: refresh && attempt === 1 }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as SyncResponse;
        if (!response.ok) throw new Error(body.error || "Unable to sync your bank.");
        if (body.status === "authorize" && body.linkUrl) { window.location.assign(body.linkUrl); return; }
        if(body.status === "select_accounts" && body.connectionId && body.accounts){setSelection({connectionId:body.connectionId,remaining:body.remaining ?? 0,accounts:body.accounts});setSelected([]);setMessage("");window.dispatchEvent(new Event("finverse-updated"));return;}
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
        setBankRevision(v=>v+1);
        window.dispatchEvent(new Event("finverse-updated"));
        if (mode === "connect") router.replace("/accounts", { scroll: false });
        else router.refresh();
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
  }, [allowed, mode, router, workspaceId]);

  useEffect(() => () => activeSyncRef.current?.abort(), []);

  useEffect(() => {
    if (allowed && callbackStatus === "connected" && connectionId && workspaceId && autoSyncStarted.current !== connectionId) {
      autoSyncStarted.current = connectionId;
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "cancelled") {
      setMessage("Bank connection cancelled. You can try again when you’re ready.");
    } else if (callbackStatus === "error") {
      setMessage("The bank connection could not be completed. Please try again.");
    }
  }, [allowed, callbackStatus, connectionId, sync, workspaceId]);

  const unlink = async () => {
    if (!unlinkTarget || actionRef.current) return;
    actionRef.current = "syncing"; setAction("syncing");
    try {
      const response = await fetch("/api/integrations/finverse/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, accountId: unlinkTarget.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to unlink.");
      setUnlinkTarget(null); setBankRevision(v => v + 1); setMessage("Bank unlinked. Your account and history are preserved.");
      window.dispatchEvent(new Event("finverse-updated")); await onSyncedRef.current?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to unlink."); }
    finally { actionRef.current = null; setAction(null); }
  };

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

  if (mode === "sync" && accountId && (!connectionsLoaded || !linked.some(a=>a.id===accountId))) return null;
  if (access?.workspaceId === workspaceId && access.upgradeRequired && !(mode === "sync" && linked.length)) return (
    <div className="finverse-connect finverse-connect--upgrade">
      <h4>Unlock bank connections</h4>
      <p>Upgrade to Clover Plus or Pro to securely connect your banks through Finverse.</p>
      <Link className="button button-primary" href="/settings/plan">Upgrade plan</Link>
      <p>You can still add accounts with Manual or Upload on Free.</p>
    </div>
  );
  if (!allowed && !(access?.upgradeRequired && mode === "sync" && linked.length)) return <div role="status"><p>{bankStatus}</p>{bankStatus !== "Loading banks…" ? <button type="button" className="button button-secondary" onClick={() => setBankRevision(v => v + 1)}>Try again</button> : null}</div>;

  if (mode === "sync" && !connectionsLoaded) return <div role="status">{connectionsError || "Loading linked accounts…"}{connectionsError ? <button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Try again</button> : null}</div>;
  const syncAccounts = linked.filter(a=>!accountId || a.id===accountId);
  if (mode === "sync" && accountId && !syncAccounts.length) return null;
  return (
    <div className="finverse-connect finverse-connect--picker">
      {unlinkTarget ? <div role="alertdialog" aria-label="Unlink bank account" className="finverse-connect__selection"><h4>Unlink {unlinkTarget.name}?</h4><p>Your Clover account and transaction history will stay. This account still uses a slot until your monthly allowance resets. Reconnecting the same account uses no extra slot.</p><button type="button" className="button button-secondary" disabled={action !== null} onClick={() => setUnlinkTarget(null)}>Keep linked</button><button type="button" className="button button-secondary" disabled={action !== null} onClick={() => void unlink()}>Unlink account</button></div> : null}
      {selection ? <fieldset className="finverse-connect__selection"><legend>Select bank accounts</legend><p>{selection.remaining} new account slots available. Previously used accounts can be reconnected.</p>{selection.accounts.map(account => {
        const newSelected = selection.accounts.filter(a => selected.includes(a.id) && !a.reserved).length;
        return <label key={account.id}><input type="checkbox" checked={selected.includes(account.id)} disabled={action !== null || (!selected.includes(account.id) && !account.reserved && newSelected >= selection.remaining)} onChange={event => setSelected(current => event.target.checked ? [...current,account.id] : current.filter(id => id !== account.id))}/><span>{account.name}{account.existingAccountName ? <small> · Reuse {account.existingAccountName}; keep all history</small> : null}{account.reserved ? <small> · Already included this period</small> : null}</span></label>;
      })}<button type="button" className="button button-primary" disabled={action !== null || selected.length === 0} onClick={() => void sync(selection.connectionId,selected)}>Link selected accounts</button></fieldset> : null}
      {mode === "sync" && syncAccounts.length ? <div className="finverse-connect__grid">{syncAccounts.map(account=><div key={account.id} className="finverse-connect__sync-card"><img src={account.logoUrl} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src="/assets/account-types/bank.png";}}/><strong>{account.name}</strong><span>{account.last4 ? `•••• ${account.last4}` : "Linked account"}</span><small>Last Synced · {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Not yet synced"}</small><button className="button button-secondary" type="button" disabled={action !== null || !allowed} onClick={()=>void sync(account.connectionId,[],true)}>{action === "syncing" ? "Syncing…" : "↻ Sync"}</button><button className="button button-secondary" type="button" disabled={action !== null} onClick={() => setUnlinkTarget(account)}>Unlink</button></div>)}</div> : <>
      {testMode ? <p role="status">Test mode · Only test banks are shown.</p> : null}
      {country ? <button className="button button-secondary" type="button" onClick={()=>setCountry(null)}>‹ Countries · {finverseCountries(banks).find(c=>c.code===country)?.name}</button> : null}
      {!country ? <div className="finverse-connect__grid" aria-label="Countries">{finverseCountries(banks).map(c=><button key={c.code} className="finverse-connect__tile" type="button" onClick={()=>setCountry(c.code)}><span className="finverse-connect__flag" aria-hidden="true">{c.flagSrc ? <img src={c.flagSrc} alt="" /> : c.flag}</span><span>{c.name}</span></button>)}</div> : <div className="finverse-connect__grid" aria-label="Banks">{banks.filter(bank=>bank.countries.includes(country)).map(bank=><button key={bank.id} className="finverse-connect__tile" type="button" disabled={action !== null} onClick={()=>void connect(bank.id)}><img src={bank.logoUrls?.[country] || bank.logoUrl} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src="/assets/account-types/bank.png";}}/><span>{bank.name}</span></button>)}{!banks.some(bank=>bank.countries.includes(country)) ? <p>No {testMode ? "test " : ""}banks are available here yet.</p> : null}</div>}
      {bankStatus && bankStatus !== "Loading banks…" ? <div role="status"><p>{bankStatus}</p><button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Refresh banks</button></div> : null}
      </>}
      {message ? <p className="finverse-connect__inline-status" role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
