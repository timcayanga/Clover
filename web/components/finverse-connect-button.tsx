"use client";
import { publishWorkspaceDataChange, getAffectedWorkspaceDataDomains } from "@/lib/workspace-data-sync";
import { SignupTrialSummary } from "./signup-trial-summary";
import type { SignupTrialSnapshot } from "../../shared/signup-trial";
import { ResourceUpgradeNotice } from "./contextual-upgrade";

import { capturePostHogClientEvent } from "./posthog-analytics";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { BankLinkPreview } from "../../shared/bank-link-preview";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FinverseBankOption } from "../../shared/finverse-bank-options";
import type { PendingBankConnection } from "../../shared/finverse-pending";
import { bankLinkPresentation, bankSyncDate, bankUnlinkMessage, type BankLinkCard } from "../../shared/bank-link-presentation";
import { FinversePendingChip } from "./finverse-pending-chip";
import { FinverseBankPicker } from "./finverse-bank-picker";
import "./add-entry-methods.css";
import Link from "next/link";
import { notifyInAppNotificationsChanged } from "@/lib/in-app-notifications";
import { useRouter, useSearchParams } from "next/navigation";

type SelectAccount = { id: string; name: string; reserved?: boolean; existingAccountName?: string | null; suggestedAccountId?:string|null; candidates?:{id:string;name:string;last4:string|null}[] };
type SyncResponse = {
  status?: string;
  message?: string;
  linkUrl?: string;
  connectionId?: string;
  remaining?: number;
  accounts?: SelectAccount[];
  error?: string;
  reconnectRequired?: boolean;
  transactions?: { imported?: number };
  preview?: BankLinkPreview | null;
};

function setupReturnPath(connectionId: string | undefined) {
  if (!connectionId) return "/accounts";
  try {
    const saved = sessionStorage.getItem(`finverse-return:${connectionId}`);
    if (saved && /^\/(?:accounts|transactions|home|onboarding)(?:\/|\?|$)/.test(saved) && !saved.startsWith("/accounts/link")) return saved;
  } catch { /* Browser storage is optional. */ }
  return "/accounts";
}

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
  setup = false,
}: {
  workspaceId: string;
  mode?: "connect" | "sync";
  accountId?: string;
  setup?: boolean;
  onSynced?: () => Promise<void> | void;
}) {
  const [access, setAccess] = useState<{ workspaceId: string; upgradeRequired: boolean; trial?: SignupTrialSnapshot | null } | null>(null);
  const allowed = access?.workspaceId === workspaceId && !access.upgradeRequired;
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [banks, setBanks] = useState<FinverseBankOption[]>([]);
  const [linked, setLinked] = useState<BankLinkCard[]>([]);
  const [pending, setPending] = useState<PendingBankConnection[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [retry, setRetry] = useState<{id?:string;ids?:string[];refresh:boolean}|null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [connectionsError, setConnectionsError] = useState("");
  const [bankStatus, setBankStatus] = useState("Loading banks…");
  const [bankRevision, setBankRevision] = useState(0);
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
    if (setup || (mode === "sync" && accountId)) return;
    const controller = new AbortController();

    setBanksLoaded(false);
    setBanks([]); setBankStatus("Loading banks…");
    void fetch(`/api/integrations/finverse/institutions?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load banks."); return data; })
      .then(data => { if (controller.signal.aborted) return; setBanksLoaded(true); setBanks(data.banks); setBankStatus(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); })
      .catch(error => { if (!controller.signal.aborted) setBankStatus(error.message || "Unable to load banks. Try again."); });
    return () => controller.abort();
  }, [workspaceId, bankRevision, mode, accountId, setup]);

  useEffect(() => {
    setAccess(null);
    const controller = new AbortController();
    setConnectionsLoaded(false); setConnectionsError(""); setLinked([]);
    void fetch(`/api/integrations/finverse/connections?view=picker&workspaceId=${encodeURIComponent(workspaceId)}${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ""}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => { if(!response.ok) throw new Error("Unable to load linked accounts.");return response.json(); })
      .then(data => {if(!controller.signal.aborted){setLinked(data.accounts);setPending(data.pending);setAccess({ workspaceId, upgradeRequired: data.upgradeRequired === true, trial: data.trial });setConnectionsLoaded(true);}})
      .catch(error => {if(!controller.signal.aborted)setConnectionsError(error.message);});
    return () => controller.abort();
  }, [workspaceId, bankRevision, mode, accountId]);

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
    if (actionRef.current === "unlinking" || actionRef.current === "connecting") return;
    activeSyncRef.current?.abort();
    activeSyncRef.current = null;
    actionRef.current = "unlinking"; setAction("unlinking");
    try {
      const response = await fetch("/api/integrations/finverse/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, connectionId: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to cancel setup.");
      setPending(current => current.filter(bank => bank.id !== id));
      if (setup) router.replace(setupReturnPath(id));
      else backToBanks();
      setMessage(body.message);
      window.dispatchEvent(new Event("finverse-updated")); notifyInAppNotificationsChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to cancel setup."); }
    finally { actionRef.current = null; setAction(null); }
  };

  const [preview, setPreview] = useState<{ workspaceId: string; connectionId: string; row: BankLinkPreview } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const visiblePreview = preview?.workspaceId === workspaceId ? preview : null;
  useEffect(() => {
    const node = previewRef.current;
    if (!visiblePreview || !node || typeof IntersectionObserver === "undefined") return;
    let reported = false;
    const report = () => {
      if (reported || document.visibilityState !== "visible") return;
      const rect = node.getBoundingClientRect();
      if (rect.right <= 0 || rect.left >= window.innerWidth) return;
      if (rect.height <= 0 || Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0) < rect.height / 2) return;
      reported = true;
      const { workspaceId, connectionId, row } = visiblePreview;
      void fetch("/api/integrations/finverse/displayed", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, connectionId, kind: row.kind }),
      }).then(response => { if (!response.ok) reported = false; }).catch(() => { reported = false; });
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) report();
    }, { threshold: 0.5 });
    observer.observe(node);
    document.addEventListener("visibilitychange", report);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", report); };
  }, [visiblePreview]);
  const [progressConnection, setProgressConnection] = useState<string>();
  const sync = useCallback(async (requestedConnectionId?: string, selectedAccountIds?: string[], refresh = false) => {
    if (!allowed || !workspaceId || actionRef.current) return;
    const controller = new AbortController();
    activeSyncRef.current = controller;
    actionRef.current = "syncing";
    setProgressConnection(requestedConnectionId);
    setPreview(null);
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
        if(body.status === "select_accounts" && body.connectionId && body.accounts){setSelection({connectionId:body.connectionId,remaining:body.remaining ?? 0,accounts:body.accounts});setSelected([]);setMappings({});setMessage("");setBankRevision(v=>v+1);window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged();return;}
        setSelection(null);
        if (body.status === "retrieving") {
          if (attempt === FINVERSE_MAX_POLL_ATTEMPTS) {
            setMessage("Finverse is still retrieving your accounts. You can continue using Clover and return through Finish linking or Notifications.");
            return;
          }
          setMessage("Bank authorized. Retrieving your accounts… Your bank may take a few minutes.");
          await waitForNextPoll(controller.signal);
          continue;
        }

        if (body.status !== "ready") throw new Error("Bank sync has not completed. Please retry from Finish linking.");
        setPending(current=>current.filter(c=>c.id!==requestedConnectionId));
        publishWorkspaceDataChange({ workspaceId, source: "transactions", affected: getAffectedWorkspaceDataDomains("transactions"), path: "/api/integrations/finverse/sync", revision: Date.now() });
        await onSyncedRef.current?.();
        if (controller.signal.aborted) return;
        const imported = body.transactions?.imported ?? 0;
        setMessage(body.message || (selectedAccountIds?.length ? `${selectedAccountIds.length} account${selectedAccountIds.length===1?"":"s"} linked. ` : "") + (imported > 0 ? `Bank synced — ${imported} new transaction${imported === 1 ? "" : "s"} ready for review.` : "Already up to date."));
        setBankRevision(v=>v+1);
        window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged();
        if (body.preview && body.connectionId) setPreview({ workspaceId, connectionId: body.connectionId, row: body.preview });
        else if (setup) router.replace(setupReturnPath(requestedConnectionId));
        else if (mode === "connect") router.replace("/accounts", { scroll: false });
        else router.refresh();
        return;
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setSelection(null); setBankRevision(v => v + 1);
      window.dispatchEvent(new Event("finverse-updated")); notifyInAppNotificationsChanged();
      setRetry({id:requestedConnectionId,ids:selectedAccountIds,refresh});
      setMessage(error instanceof Error ? error.message : "Unable to sync your bank.");
    } finally {
      if (activeSyncRef.current === controller) {
        activeSyncRef.current = null;
        actionRef.current = null;
        setAction(null);
      }
    }
  }, [mappings, allowed, mode, router, setup, workspaceId]);

  useEffect(() => () => activeSyncRef.current?.abort(), []);

  useEffect(() => {
    if (allowed && callbackStatus === "connected" && connectionId && workspaceId && (!setup || !pending.some(bank => bank.id === connectionId && bank.status === "link_pending")) && autoSyncStarted.current !== connectionId) {
      autoSyncStarted.current = connectionId;
      if (!setup) clearCallback();
      else try { sessionStorage.removeItem(`finverse-sign-in:${connectionId}`); } catch { /* Optional storage. */ }
      void sync(connectionId);
    } else if (callbackStatus === "invalid_callback") {
      if (!setup) clearCallback();
      setMessage("The bank connection expired. Please start again.");
    } else if (callbackStatus === "cancelled") {
      if (!setup) clearCallback();
      if (setup) router.replace(setupReturnPath(connectionId));
      else setMessage("Bank connection cancelled. You can try again when you’re ready.");
    } else if (callbackStatus === "error") {
      if (!setup) clearCallback();
      setMessage("The bank connection could not be completed. Please try again.");
    }
  }, [allowed, callbackStatus, connectionId, pending, router, setup, sync, workspaceId]);

  const unlink = async () => {
    if (!unlinkTarget || actionRef.current) return;
    actionRef.current = "unlinking"; setAction("unlinking");
    try {
      const response = await fetch("/api/integrations/finverse/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, accountId: unlinkTarget.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to unlink.");
      setUnlinkTarget(null); setBankRevision(v => v + 1); setMessage(bankUnlinkMessage(body.status));
      window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged(); await onSyncedRef.current?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to unlink."); }
    finally { actionRef.current = null; setAction(null); }
  };

  const connect = async (institutionId?: string) => {
    if (!allowed || !workspaceId || actionRef.current) return;
    capturePostHogClientEvent("bank_link_stage", { stage: "picker_selection", surface: "bank_picker" });
    actionRef.current = "connecting";
    setAction("connecting");
    setMessage("Opening the secure bank connection…");
    let requestStatus = 0;
    try {
      const response = await fetch("/api/integrations/finverse/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, institutionId, setup: true }),
      });
      const body = await response.json() as { linkUrl?: string; connectionId?: string; error?: string };
      requestStatus = response.status;
      if (!response.ok || !body.linkUrl) throw new Error(body.error || "Unable to connect a bank.");
      if (body.connectionId) {
        try {
          sessionStorage.setItem(`finverse-return:${body.connectionId}`, window.location.pathname + window.location.search);
          sessionStorage.setItem(`finverse-sign-in:${body.connectionId}`, body.linkUrl);
          router.push(`/accounts/link?finverse=signin&finverseConnection=${encodeURIComponent(body.connectionId)}&finverseWorkspace=${encodeURIComponent(workspaceId)}`);
          return;
        }
        catch { /* Return to Accounts when storage is unavailable. */ }
      }
      window.location.assign(body.linkUrl);
    } catch (error) {
      capturePostHogClientEvent("bank_link_stage", { stage: "link_request_failed", status: requestStatus, surface: "bank_picker" });
      setMessage(error instanceof Error ? error.message : "Unable to connect a bank.");
      actionRef.current = null;
      setAction(null);
    }
  };

  if (unlinkTarget) return <div role="alertdialog" aria-label="Unlink bank account" className="finverse-connect__selection"><h4>Unlink {unlinkTarget.name}?</h4><p>Your Clover accounts and history will stay. All accounts sharing this bank login will be unlinked: {linked.filter(a=>a.connectionId===unlinkTarget.connectionId&&!a.unlinkedAt).map(a=>`${a.name}${a.last4?` •••• ${a.last4}`:""}`).join(", ")}. Reconnection requires bank authentication. Used slots stay reserved for the allocation period, including the entire original 30-day signup trial.</p><button type="button" className="button button-secondary" disabled={action !== null} autoFocus onClick={() => setUnlinkTarget(null)}>Keep linked</button><button type="button" className="button button-secondary" disabled={action !== null} onClick={() => void unlink()}>Unlink account</button></div>;
  const progressId = progressConnection ?? connectionId;
  const progressBank = pending.find(bank => bank.id === progressId);
  const canCancel = Boolean(progressId && progressBank && !linked.some(account => account.connectionId === progressId));
  const leaveSetup = () => router.replace(setupReturnPath(progressId));
  const awaitingSignIn = setup && (callbackStatus === "signin" || progressBank?.status === "link_pending");
  const openSignIn = () => {
    try {
      const url = sessionStorage.getItem(`finverse-sign-in:${progressId}`);
      if (url) { window.location.assign(url); return; }
    } catch { /* The user can restart from the bank picker. */ }
    setMessage("This sign-in session is unavailable. Go back and choose your bank again.");
  };
  const setupStep = awaitingSignIn ? 0 : selection || visiblePreview || retry?.ids?.length ? 2 : 1;
  const steps = setup ? <ol className="finverse-setup__steps" aria-label="Linking stages">
    {["Sign in", "Retrieve accounts", "Choose accounts"].map((label, index) => <li key={label} aria-current={index === setupStep ? "step" : undefined}>{index + 1}. {label}</li>)}
  </ol> : null;
  const selectionPanel = selection ? <fieldset className="finverse-connect__selection"><legend>{progressBank ? `Select ${progressBank.name} accounts` : "Select bank accounts"}</legend><p>Choose which accounts to link. Matching Clover accounts keep their history.</p><p>{selection.remaining} new account slots available. Previously used accounts can be reconnected.</p>{selection.accounts.map(account => {
        const newSelected = selection.accounts.filter(a => selected.includes(a.id) && !a.reserved).length;
        return <label key={account.id}><input type="checkbox" checked={selected.includes(account.id)} disabled={action !== null || (!selected.includes(account.id) && !account.reserved && newSelected >= selection.remaining)} onChange={event => setSelected(current => event.target.checked ? [...current,account.id] : current.filter(id => id !== account.id))}/><span>{account.name}{account.existingAccountName ? <small> · Reuse {account.existingAccountName}; keep all history</small> : null}{account.reserved ? <small> · Already included this period</small> : null}<select aria-label={`Destination for ${account.name}`} disabled={action!==null} value={mappings[account.id]??''} onChange={event=>setMappings(current=>({...current,[account.id]:event.target.value}))}><option value="">{account.suggestedAccountId?'Use matching existing account':'Create a new account card'}</option>{account.candidates?.map(c=><option key={c.id} value={c.id}>Link to {c.name}{c.last4?` •••• ${c.last4}`:''}</option>)}</select></span></label>;
      })}<button type="button" className="button button-primary" disabled={action !== null || selected.length === 0} onClick={() => void sync(selection.connectionId,selected)}>Link selected accounts</button><div className="finverse-progress-actions"><button className="button button-secondary" type="button" onClick={setup ? leaveSetup : backToBanks}>{setup ? "Continue later" : "Back to Banks"}</button><button type="button" className="button button-secondary" disabled={action === "unlinking"} onClick={()=>void cancelSetup(selection.connectionId)}>Cancel Linking</button></div>{message?<p role="status">{message}</p>:null}</fieldset> : null;
  const callbackLoading = callbackStatus === "connected" && connectionId && autoSyncStarted.current !== connectionId && !access && !connectionsError;
  if (setup || progressOpen || callbackLoading) return <section className="finverse-progress" aria-label="Bank connection progress" aria-live="polite">
    {(action === null && !retry && selectionPanel) || <>
      <h4>{setup && progressBank?.logoUrl ? <img src={progressBank.logoUrl} alt="" width={32} height={32} /> : null}{progressBank ? progressBank.name : "Bank connection"} {action === "syncing" || callbackLoading ? "linking in progress" : retry ? "needs attention" : awaitingSignIn ? "secure sign-in" : "setup"}</h4>
      {visiblePreview ? <div ref={previewRef}>
        <strong>{visiblePreview.row.label}</strong>
        <p>{visiblePreview.row.kind === "balance" ? "Bank balance" : "Booked transaction"} · {formatCurrencyAmount(visiblePreview.row.amount, visiblePreview.row.currency)}</p>
        <Link className="button button-primary" href={visiblePreview.row.kind === "balance" ? "/accounts" : `/transactions/${encodeURIComponent(visiblePreview.row.id)}`}>{visiblePreview.row.kind === "balance" ? "View accounts" : "View transaction"}</Link>
      </div> : null}
      {action === "syncing" || callbackLoading ? <span className="finverse-progress__spinner" aria-hidden="true" /> : null}
      <p role="status">{message || connectionsError || (connectionsLoaded && !allowed ? "Bank linking is unavailable for this Profile." : awaitingSignIn ? "Complete your login and verification in the secure Finverse window." : "Retrieving your accounts…")}</p>
      {reconnect ? <p>Choose your bank again to start a fresh connection.</p> : null}
      <div className="finverse-progress-actions">
        {awaitingSignIn && allowed ? <button type="button" className="button button-primary" onClick={openSignIn}>Continue to bank</button> : null}
        {setup && progressId && allowed && !action && !visiblePreview && !awaitingSignIn && callbackStatus === "connected" ? <button type="button" className="button button-primary" onClick={() => void sync(progressId, retry?.ids)}>Check again</button> : null}
        <button type="button" className="button button-secondary" disabled={action === "unlinking"} onClick={setup ? leaveSetup : backToBanks}>{setup ? visiblePreview ? "Done" : callbackStatus === "connected" ? "Continue later" : "Back to Clover" : "Back to Banks"}</button>
        {canCancel && progressId ? <button type="button" className="button button-secondary" disabled={action === "unlinking"} onClick={() => void cancelSetup(progressId)}>Cancel Linking</button> : null}
      </div>
    </>}
    {steps}
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
  if (mode === "sync" && accountId) {
    const account = syncAccounts[0];
    const presentation = bankLinkPresentation(account);
    return <section className="account-bank-link" aria-label="Bank connection">
      <span className="account-bank-link__status" role="status">{presentation.label}</span>
      {bankSyncDate(account.lastSyncedAt) ? <small>Last synced {bankSyncDate(account.lastSyncedAt)}</small> : null}
      <div className="account-bank-link__actions">
        {presentation.relink ? <button type="button" className="button button-secondary" disabled={action !== null || !allowed} onClick={() => void connect(account.institutionId ?? undefined)}>Relink</button> : <>
          <button type="button" className="button button-secondary" disabled={action !== null || !allowed || presentation.pending} onClick={() => void sync(account.connectionId, [], true)}>{action === "syncing" ? "Syncing…" : "Sync"}</button>
          <button type="button" className="account-bank-link__unlink" disabled={action !== null || presentation.pending} onClick={() => setUnlinkTarget(account)}>Unlink</button>
        </>}
      </div>
      {!allowed ? <ResourceUpgradeNotice resource="linkedBanks" /> : null}
      {message ? <p className="account-bank-link__message" role="status">{message}</p> : null}
    </section>;
  }
  return (
    <div className="finverse-connect finverse-connect--picker">
      <SignupTrialSummary trial={access?.trial?.status === "active" ? access.trial : null} />
      {mode === "connect" ? <ResourceUpgradeNotice resource="linkedBanks" /> : null}


      {pending.length ? <section className="finverse-pending" aria-label="Finish linking">{pending.map(c=><FinversePendingChip key={c.id} connection={c} busy={action!==null} resumeDisabled={!allowed} onResume={() => router.push(`/accounts/link?finverse=connected&finverseConnection=${encodeURIComponent(c.id)}&finverseWorkspace=${encodeURIComponent(workspaceId)}`)} onCancel={()=>void cancelSetup(c.id)}/>)}</section> : null}
      {mode === "connect" ? <>{banksLoaded && allowed ? <FinverseBankPicker banks={banks} busy={action!==null} onConnect={id=>void connect(id)}/> : <p role="status">{bankStatus}</p>}</> : null}
      {syncAccounts.length ? <section aria-label="Connected accounts"><h4>Connected accounts</h4><div className="finverse-connect__grid">{syncAccounts.map(account=><div key={account.id} className="finverse-connect__sync-card"><img src={account.logoUrl} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src="/assets/account-types/bank.png";}}/><strong>{account.name}</strong><span>{account.last4 ? `•••• ${account.last4}` : "Linked account"}</span><small>{account.status==="disconnect_pending"?"Disconnection pending":account.status==="link_pending"?"Authorization needed":account.syncError || account.status==="error"?"Connection needs attention":account.status==="retrieving"?"Syncing":"Connected"}</small><small>Last Synced · {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Not yet synced"}</small><button className="button button-secondary" type="button" disabled={action !== null || !allowed || account.status==="disconnect_pending"} onClick={()=>void sync(account.connectionId,[],true)}>{action === "syncing" ? "Syncing…" : "↻ Sync"}</button><button type="button" className="finverse-connect__unlink" disabled={action !== null||account.status==="disconnect_pending"} onClick={()=>setUnlinkTarget(account)}>Unlink</button></div>)}</div></section> : mode === "sync" ? <>

      {banksLoaded ? <FinverseBankPicker key={`${workspaceId}:${bankRevision}`} banks={banks} busy={action !== null} onConnect={id => void connect(id)} /> : <p role="status">{bankStatus}</p>}
      {bankStatus && bankStatus !== "Loading banks…" ? <div role="status"><p>{bankStatus}</p><button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Refresh banks</button></div> : null}
      </> : null}
      {mode === "connect" && !banksLoaded && bankStatus !== "Loading banks…" ? <button type="button" className="button button-secondary" onClick={()=>setBankRevision(v=>v+1)}>Retry bank list</button> : null}
      {message ? <p className="finverse-connect__inline-status" role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}
