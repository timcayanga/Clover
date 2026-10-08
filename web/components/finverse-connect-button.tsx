"use client";
import { ResourceUpgradeNotice } from "./contextual-upgrade";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FinverseBankOption } from "../../shared/finverse-bank-options";
import { CANCEL_BANK_LINK_MESSAGE, type PendingBankConnection } from "../../shared/finverse-pending";
import { FinversePendingChip } from "./finverse-pending-chip";
import { FinverseBankPicker } from "./finverse-bank-picker";
import "./add-entry-methods.css";
import Link from "next/link";
import { notifyInAppNotificationsChanged } from "@/lib/in-app-notifications";
import { useRouter, useSearchParams } from "next/navigation";

type SelectAccount = { id: string; name: string; reserved?: boolean; existingAccountName?: string | null; suggestedAccountId?:string|null; candidates?:{id:string;name:string;last4:string|null}[] };
type SyncResponse = {
  status?: string;
  linkUrl?: string;
  connectionId?: string;
  remaining?: number;
  accounts?: SelectAccount[];
  error?: string;
  reconnectRequired?: boolean;
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
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [banks, setBanks] = useState<FinverseBankOption[]>([]);
  const [linked, setLinked] = useState<{id:string;connectionId:string;name:string;last4:string|null;logoUrl:string;lastSyncedAt:string|null;status:string;syncError:string|null}[]>([]);
  const [pending, setPending] = useState<PendingBankConnection[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [retry, setRetry] = useState<{id?:string;ids?:string[];refresh:boolean}|null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [connectionsError, setConnectionsError] = useState("");
  const [bankStatus, setBankStatus] = useState("Loading banks…");
  const [bankRevision, setBankRevision] = useState(0);
  const [testMode, setTestMode] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSyncStarted = useRef("");
  const activeSyncRef = useRef<AbortController | null>(null);
  const actionRef = useRef<"connecting" | "syncing" | "unlinking" | null>(null);
  const onSyncedRef = useRef(onSynced);
  const [action, setAction] = useState<"connecting" | "syncing" | "unlinking" | null>(null);
  const [selection,setSelection] = useState<{connectionId:string;remaining:number;accounts:SelectAccount[]}|null>(null);
  const [mappings,setMappings]=useState<Record<string,string>>({});
  const [selected,setSelected] = useState<string[]>([]);
  const [unlinkTarget, setUnlinkTarget] = useState<{id:string;name:string;connectionId:string}|null>(null);
  const [message, setMessage] = useState("");
  const connectionId = searchParams?.get("finverseConnection") ?? undefined;
  const callbackStatus = searchParams?.get("finverse") ?? null;

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    if (mode === "sync" && accountId) return;
    const controller = new AbortController();

    setBanksLoaded(false);
    setBanks([]); setBankStatus("Loading banks…");
    void fetch(`/api/integrations/finverse/institutions?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load banks."); return data; })
      .then(data => { if (controller.signal.aborted) return; setBanksLoaded(true); setBanks(data.banks); setTestMode(data.mode === "test"); setBankStatus(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); })
      .catch(error => { if (!controller.signal.aborted) setBankStatus(error.message || "Unable to load banks. Try again."); });
    return () => controller.abort();
  }, [workspaceId, bankRevision, mode, accountId]);

  useEffect(() => {
    setAccess(null);
    const controller = new AbortController();
    setConnectionsLoaded(false); setConnectionsError(""); setLinked([]);
    void fetch(`/api/integrations/finverse/connections?view=picker&workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => { if(!response.ok) throw new Error("Unable to load linked accounts.");return response.json(); })
      .then(data => {if(!controller.signal.aborted){setLinked(data.accounts);setPending(data.pending);setAccess({ workspaceId, upgradeRequired: data.upgradeRequired === true });setConnectionsLoaded(true);}})
      .catch(error => {if(!controller.signal.aborted)setConnectionsError(error.message);});
    return () => controller.abort();
  }, [workspaceId, bankRevision, mode]);

  const clearCallback = () => {
    const url = new URL(window.location.href);
    for (const key of ["finverse", "finverseConnection", "finverseWorkspace"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  };
  const backToBanks = () => {
    activeSyncRef.current?.abort(); clearCallback();
    setProgressOpen(false); setSelection(null); setRetry(null); setReconnect(false); setMessage("");
    setBankRevision(v => v + 1);
  };
  const cancelSetup = async (id: string) => {
    if (actionRef.current || !window.confirm(CANCEL_BANK_LINK_MESSAGE)) return;
    actionRef.current = "unlinking"; setAction("unlinking");
    try {
      const response = await fetch("/api/integrations/finverse/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, connectionId: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to cancel setup.");
      backToBanks(); setMessage(body.message);
      window.dispatchEvent(new Event("finverse-updated")); notifyInAppNotificationsChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to cancel setup."); }
    finally { actionRef.current = null; setAction(null); }
  };

  const sync = useCallback(async (requestedConnectionId?: string, selectedAccountIds?: string[], refresh = false) => {
    if (!allowed || !workspaceId || actionRef.current) return;
    const controller = new AbortController();
    activeSyncRef.current = controller;
    actionRef.current = "syncing";
    setAction("syncing"); setProgressOpen(true); setRetry(null); setReconnect(false);
    setMessage(refresh ? "Syncing your bank transactions…" : selectedAccountIds?.length ? "Linking selected accounts and syncing transactions…" : "Bank authorized. Retrieving your accounts…");
    try {
      for (let attempt = 1; attempt <= FINVERSE_MAX_POLL_ATTEMPTS; attempt += 1) {
        const response = await fetch("/api/integrations/finverse/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, connectionId: requestedConnectionId, selectedAccountIds, accountMappings: Object.fromEntries(Object.entries(mappings).filter(([id,target])=>selectedAccountIds?.includes(id)&&target)), refresh: refresh && attempt === 1 }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as SyncResponse;
        if (controller.signal.aborted) return;
        if (!response.ok) { setReconnect(body.reconnectRequired === true); throw new Error(body.error || "Unable to sync your bank."); }
        if (body.status === "authorize" && body.linkUrl) { window.location.assign(body.linkUrl); return; }
        if(body.status === "select_accounts" && body.connectionId && body.accounts){setSelection({connectionId:body.connectionId,remaining:body.remaining ?? 0,accounts:body.accounts});setSelected([]);setMappings({});setMessage("");setPending(current=>current.some(c=>c.id===body.connectionId)?current:[...current,{id:body.connectionId!,name:"your bank",status:"awaiting_selection"}]);window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged();return;}
        setSelection(null);
        if (body.status === "retrieving") {
          if (attempt === FINVERSE_MAX_POLL_ATTEMPTS) {
            setMessage("Finverse is still retrieving your accounts. You can continue using Clover and return through Finish linking or Notifications.");
            return;
          }
          setMessage("Bank authorized. Retrieving your accounts… This can take up to a minute.");
          await waitForNextPoll(controller.signal);
          continue;
        }

        setPending(current=>current.filter(c=>c.id!==requestedConnectionId));
        await onSyncedRef.current?.();
        const imported = body.transactions?.imported ?? 0;
        setMessage((selectedAccountIds?.length ? `${selectedAccountIds.length} account${selectedAccountIds.length===1?"":"s"} linked. ` : "") + (imported > 0 ? `Bank synced — ${imported} new transaction${imported === 1 ? "" : "s"} ready for review.` : "Already up to date."));
        setBankRevision(v=>v+1);
        window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged();
        if (mode === "connect") router.replace("/accounts", { scroll: false });
        else router.refresh();
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSelection(null); setBankRevision(v => v + 1);
      window.dispatchEvent(new Event("finverse-updated")); notifyInAppNotificationsChanged();
      setRetry({id:requestedConnectionId,ids:selectedAccountIds,refresh});
      setMessage(error instanceof Error ? error.message : "Unable to sync your bank.");
    } finally {
      if (activeSyncRef.current === controller) activeSyncRef.current = null;
      actionRef.current = null;
      setAction(null);
    }
  }, [mappings, allowed, mode, router, workspaceId]);

  useEffect(() => () => activeSyncRef.current?.abort(), []);

  useEffect(() => {
    if (allowed && callbackStatus === "connected" && connectionId && workspaceId && autoSyncStarted.current !== connectionId) {
      autoSyncStarted.current = connectionId;
      clearCallback();
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      clearCallback();
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "cancelled") {
      clearCallback();
      setMessage("Bank connection cancelled. You can try again when you’re ready.");
    } else if (callbackStatus === "error") {
      clearCallback();
      setMessage("The bank connection could not be completed. Please try again.");
    }
  }, [allowed, callbackStatus, connectionId, sync, workspaceId]);

  const unlink = async () => {
    if (!unlinkTarget || actionRef.current) return;
    actionRef.current = "unlinking"; setAction("unlinking");
    try {
      const response = await fetch("/api/integrations/finverse/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, accountId: unlinkTarget.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to unlink.");
      setUnlinkTarget(null); setBankRevision(v => v + 1); setMessage(body.message || "Bank disconnected. Your account and history are preserved.");
      window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged(); await onSyncedRef.current?.();
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

  if (unlinkTarget) return <div role="alertdialog" aria-label="Unlink bank account" className="finverse-connect__selection"><h4>Unlink {unlinkTarget.name}?</h4><p>Your Clover accounts and history will stay. All accounts sharing this bank login will disconnect: {linked.filter(a=>a.connectionId===unlinkTarget.connectionId).map(a=>`${a.name}${a.last4?` •••• ${a.last4}`:""}`).join(", ")}. Reconnection requires bank authentication. Used slots remain reserved until the monthly reset.</p><button type="button" className="button button-secondary" disabled={action !== null} autoFocus onClick={() => setUnlinkTarget(null)}>Keep linked</button><button type="button" className="button button-secondary" disabled={action !== null} onClick={() => void unlink()}>Unlink account</button></div>;
  const selectionPanel = selection ? <fieldset className="finverse-connect__selection"><legend>Select bank accounts</legend><p>Choose which accounts to link. Matching Clover accounts keep their history.</p><p>{selection.remaining} new account slots available. Previously used accounts can be reconnected.</p>{selection.accounts.map(account => {
        const newSelected = selection.accounts.filter(a => selected.includes(a.id) && !a.reserved).length;
        return <label key={account.id}><input type="checkbox" checked={selected.includes(account.id)} disabled={action !== null || (!selected.includes(account.id) && !account.reserved && newSelected >= selection.remaining)} onChange={event => setSelected(current => event.target.checked ? [...current,account.id] : current.filter(id => id !== account.id))}/><span>{account.name}{account.existingAccountName ? <small> · Reuse {account.existingAccountName}; keep all history</small> : null}{account.reserved ? <small> · Already included this period</small> : null}<select aria-label={`Destination for ${account.name}`} disabled={action!==null} value={mappings[account.id]??''} onChange={event=>setMappings(current=>({...current,[account.id]:event.target.value}))}><option value="">{account.suggestedAccountId?'Use matching existing account':'Create a new account card'}</option>{account.candidates?.map(c=><option key={c.id} value={c.id}>Link to {c.name}{c.last4?` •••• ${c.last4}`:''}</option>)}</select></span></label>;
      })}<button type="button" className="button button-primary" disabled={action !== null || selected.length === 0} onClick={() => void sync(selection.connectionId,selected)}>Link selected accounts</button><button className="button button-secondary" type="button" onClick={()=>{setSelection(null);setProgressOpen(false);setBankRevision(v=>v+1);}}>Choose later</button><button type="button" className="finverse-cancel-link" disabled={action!==null} onClick={()=>void cancelSetup(selection.connectionId)}>Cancel linking</button>{message?<p role="status">{message}</p>:null}</fieldset> : null;
  const callbackLoading = callbackStatus === "connected" && connectionId && autoSyncStarted.current !== connectionId && !access && !connectionsError;
  if (progressOpen || callbackLoading) return <section className="finverse-progress" aria-label="Bank connection progress" aria-live="polite">
    {(action === null && !retry && selectionPanel) || <><h4>{action === "syncing" || callbackLoading ? "Bank connection in progress" : retry ? "Bank connection needs attention" : "Bank connection update"}</h4>
      {action === "syncing" || callbackLoading ? <span className="finverse-progress__spinner" aria-hidden="true" /> : null}
      <p role="status">{message || "Bank authorized. Retrieving your accounts…"}</p>
      {retry && !reconnect ? <button type="button" className="button button-primary" onClick={()=>void sync(retry.id,retry.ids,retry.refresh)}>Retry</button> : null}
      {reconnect ? <p>Choose your bank again to start a fresh connection.</p> : null}
      {!retry ? <p>Pending account selections stay under Finish linking in Accounts and Notifications.</p> : null}
      <button type="button" className="button button-secondary" disabled={action === "unlinking"} onClick={backToBanks}>Back to banks</button>
      {retry?.id && !linked.some(a => a.connectionId === retry.id) ? <button type="button" className="button button-secondary" disabled={action !== null} onClick={() => void cancelSetup(retry.id!)}>Cancel linking</button> : null}
      <button type="button" className="button button-secondary" onClick={()=>{setProgressOpen(false);window.dispatchEvent(new Event("finverse-background"));}}>{action === "syncing" || callbackLoading ? "Continue using Clover" : "Done"}</button></>}
  </section>;
  if (mode === "sync" && accountId && (!connectionsLoaded || !linked.some(a=>a.id===accountId))) return null;
  if (access?.workspaceId === workspaceId && access.upgradeRequired && !linked.length) return (
    <div className="finverse-connect finverse-connect--upgrade">
      <ResourceUpgradeNotice resource="linkedBanks" />
      <p>You can still add accounts with Manual or Upload on Free.</p>
    </div>
  );
  if (!connectionsLoaded) return <div role="status">{connectionsError || "Loading linked accounts…"}{connectionsError ? <button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Try again</button> : null}</div>;

  const syncAccounts = linked.filter(a=>!accountId || a.id===accountId);
  if (mode === "sync" && accountId && !syncAccounts.length) return null;
  return (
    <div className="finverse-connect finverse-connect--picker">
      {mode === "connect" ? <ResourceUpgradeNotice resource="linkedBanks" /> : null}


      {pending.length ? <section className="finverse-pending" aria-label="Finish linking">{pending.map(c=><FinversePendingChip key={c.id} connection={c} busy={action!==null} resumeDisabled={!allowed} onResume={()=>void sync(c.id)} onCancel={()=>void cancelSetup(c.id)}/>)}</section> : null}
      {mode === "connect" ? <>{testMode ? <p role="status">Test mode · Only test banks are shown.</p> : null}{banksLoaded && allowed ? <FinverseBankPicker banks={banks} busy={action!==null} onConnect={id=>void connect(id)}/> : <p role="status">{bankStatus}</p>}</> : null}
      {syncAccounts.length ? <section aria-label="Connected accounts"><h4>Connected accounts</h4><div className="finverse-connect__grid">{syncAccounts.map(account=><div key={account.id} className="finverse-connect__sync-card"><img src={account.logoUrl} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src="/assets/account-types/bank.png";}}/><strong>{account.name}</strong><span>{account.last4 ? `•••• ${account.last4}` : "Linked account"}</span><small>{account.status==="disconnect_pending"?"Disconnection pending":account.status==="link_pending"?"Authorization needed":account.syncError || account.status==="error"?"Connection needs attention":account.status==="retrieving"?"Syncing":"Connected"}</small><small>Last Synced · {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Not yet synced"}</small><button className="button button-secondary" type="button" disabled={action !== null || !allowed || account.status==="disconnect_pending"} onClick={()=>void sync(account.connectionId,[],true)}>{action === "syncing" ? "Syncing…" : "↻ Sync"}</button><button type="button" className="finverse-connect__unlink" disabled={action !== null||account.status==="disconnect_pending"} onClick={()=>setUnlinkTarget(account)}>Unlink</button></div>)}</div></section> : mode === "sync" ? <>
      {testMode ? <p role="status">Test mode · Only test banks are shown.</p> : null}
      {banksLoaded ? <FinverseBankPicker key={`${workspaceId}:${bankRevision}`} banks={banks} busy={action !== null} onConnect={id => void connect(id)} /> : <p role="status">{bankStatus}</p>}
      {bankStatus && bankStatus !== "Loading banks…" ? <div role="status"><p>{bankStatus}</p><button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Refresh banks</button></div> : null}
      </> : null}
      {mode === "connect" && !banksLoaded && bankStatus !== "Loading banks…" ? <button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Retry bank list</button> : null}
      {message ? <p className="finverse-connect__inline-status" role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
