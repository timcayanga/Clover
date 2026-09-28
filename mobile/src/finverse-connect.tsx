import { useCallback, useEffect, useRef, useState } from "react";
import type { FinverseBankOption } from "../../shared/finverse-bank-options";
import { BankLogo, FinverseBankPicker } from "./finverse-bank-picker";
import { ActivityIndicator, Alert, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Text } from "./app-text";
import { Body, Button, Field, Heading, Notice, useTheme } from "./ui";
import { ApiError } from "./api";
import { useSession } from "./session";

type Bank = { id: string; name: string; reserved?: boolean; existingAccountName?: string | null; suggestedAccountId?:string|null; candidates?:{id:string;name:string;last4:string|null}[] };
type SyncResult = { status: string; linkUrl?: string; connectionId?: string; remaining?: number; accounts?: Bank[]; transactions?: { imported: number }; error?: string };
export function FinverseConnect({ onSynced, callbackConnection, mode = "connect", accountId, onDismiss }: { onSynced: () => void; callbackConnection?: string; mode?: "connect" | "sync"; accountId?: string; onDismiss?:()=>void }) {
  const session = useSession();
  const { colors } = useTheme();
  const [access, setAccess] = useState<{ profileId: string; upgradeRequired: boolean } | null>(null);
  const allowed = access?.profileId === session.profileId && !access.upgradeRequired;
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [banks, setBanks] = useState<FinverseBankOption[]>([]);
  const [linked,setLinked] = useState<{id:string;connectionId:string;name:string;last4:string|null;logoUrl:string;lastSyncedAt:string|null;status:string;syncError:string|null}[]>([]);
  const [pending,setPending] = useState<{id:string;name:string;status:string}[]>([]);
  const [reconnectRequired,setReconnectRequired] = useState(false);
  const [progressOpen,setProgressOpen] = useState(false);
  const [connectionsLoaded,setConnectionsLoaded] = useState(false);
  const [connectionsError,setConnectionsError] = useState("");
  const [bankMessage, setBankMessage] = useState("Loading banks…");
  const [message, setMessage] = useState("");
  const [test, setTest] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [retrySync, setRetrySync] = useState<{ id?: string; accountIds?: string[]; refresh?:boolean } | null>(null);
  const [connection, setConnection] = useState(callbackConnection);
  const [selection, setSelection] = useState<{ accounts: Bank[]; remaining: number; connectionId: string } | null>(null);
  const [mappings,setMappings]=useState<Record<string,string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const active = useRef(true);
  const action = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(session.request); requestRef.current = session.request;
  const syncedRef = useRef(onSynced); syncedRef.current = onSynced;
  useEffect(() => { active.current = true; return () => { active.current = false; abortRef.current?.abort(); }; }, []);
  useEffect(() => {
    if (mode === "sync" && accountId) return;
    const controller = new AbortController();
    setBanksLoaded(false);
    setBanks([]); setBankMessage("Loading banks…");
    if (session.demo) { setBankMessage("Sign in to connect your bank. Demo mode does not access bank accounts."); return; }
    void requestRef.current<{ banks: FinverseBankOption[]; mode?: string; message?: string; upgradeRequired?: boolean }>(`finverse/institutions?workspaceId=${encodeURIComponent(session.profileId)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setBanksLoaded(true); setBanks(data.banks); setTest(data.mode === "test"); setBankMessage(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); } })
      .catch(error => { if (!controller.signal.aborted) setBankMessage(error.message || "Unable to load banks."); });
    return () => controller.abort();
  }, [session.demo, session.profileId, revision, mode, accountId]);
  useEffect(()=>{
    setAccess(null);
    const controller=new AbortController();setConnectionsLoaded(false);setConnectionsError("");setLinked([]);
    if(session.demo){setConnectionsLoaded(true);return;}
    void requestRef.current<{accounts:typeof linked;pending:typeof pending;upgradeRequired:boolean}>(`finverse/connections?view=picker&workspaceId=${encodeURIComponent(session.profileId)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted){setLinked(data.accounts);setPending(data.pending);setAccess({ profileId: session.profileId, upgradeRequired: data.upgradeRequired === true });setConnectionsLoaded(true);}}).catch(error=>{if(!controller.signal.aborted)setConnectionsError(error.message);});
    return()=>controller.abort();
  },[session.demo,session.profileId,revision,mode]);
  const sync = useCallback(async (id?: string, accountIds?: string[], refresh = false) => {
    if (!allowed || action.current) return;
    action.current = true; setBusy(true); setProgressOpen(true); setRetrySync(null); setReconnectRequired(false); setMessage(refresh ? "Syncing your bank transactions…" : accountIds?.length ? "Linking selected accounts and syncing transactions…" : "Bank authorized. Retrieving your accounts…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const data = await requestRef.current<SyncResult>("finverse/sync", { method: "POST", signal: controller.signal, body: JSON.stringify({ workspaceId: session.profileId, connectionId: id, selectedAccountIds: accountIds, accountMappings:Object.fromEntries(Object.entries(mappings).filter(([id,target])=>accountIds?.includes(id)&&target)), refresh: refresh && attempt === 0 }) });
        if (!active.current || controller.signal.aborted) return;
        if (data.status === "authorize" && data.linkUrl) {
          const result = await WebBrowser.openAuthSessionAsync(data.linkUrl, "clover://accounts");
          if (!active.current || controller.signal.aborted) return;
          if (result.type !== "success") { setMessage("Bank sync cancelled."); return; }
          const url = new URL(result.url);
          if (url.protocol !== "clover:" || url.hostname !== "accounts" || url.searchParams.get("finverse") !== "connected" || url.searchParams.get("finverseConnection") !== id) { setMessage("Bank sync could not be completed. Please try again."); return; }
          continue;
        }
        if (data.status === "select_accounts" && data.accounts && data.connectionId) {
          setConnection(data.connectionId); setSelection({ accounts: data.accounts, remaining: data.remaining ?? 0, connectionId: data.connectionId }); setSelected([]); setMessage(""); setPending(p=>p.some(c=>c.id===data.connectionId)?p:[...p,{id:data.connectionId!,name:"your bank",status:"awaiting_selection"}]); return;
        }
        if (data.status === "retrieving") {
          await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); }; const timer = setTimeout(done, 3000); controller.signal.addEventListener("abort", done, { once: true }); });
          if (controller.signal.aborted) return;
          continue;
        }
        setSelection(null); setPending(p=>p.filter(c=>c.id!==id)); setMessage(`${accountIds?.length ? `${accountIds.length} account${accountIds.length===1?"":"s"} linked. ` : ""}${data.transactions?.imported ? `${data.transactions.imported} new transactions added.` : "Already up to date."}`); setRevision(v=>v+1); syncedRef.current(); return;
      }
      setMessage("Finverse is still retrieving your accounts. Return through Finish linking or Notifications to check progress.");
    } catch (error) { if (active.current && !controller.signal.aborted) { setMessage(error instanceof Error ? error.message : "Unable to sync your bank."); setRetrySync({ id, accountIds, refresh }); setReconnectRequired(error instanceof ApiError && error.data?.reconnectRequired === true); } }
    finally { action.current = false; if (active.current) setBusy(false); }
  }, [mappings, allowed, session.profileId]);
  const callbackHandled = useRef("");
  useEffect(() => { if (allowed && session.offlineStatus.online && callbackConnection && callbackHandled.current !== callbackConnection) { callbackHandled.current = callbackConnection; setConnection(callbackConnection); void sync(callbackConnection); } }, [allowed, session.offlineStatus.online, callbackConnection, sync]);
  function confirmUnlink(account: {id:string;name:string;connectionId:string}) {
    Alert.alert(`Unlink ${account.name}?`, `These accounts share a bank login and will disconnect: ${linked.filter(a=>a.connectionId===account.connectionId).map(a=>`${a.name}${a.last4?` •••• ${a.last4}`:""}`).join(", ")}. Your Clover accounts and history stay. Reconnecting requires bank authorization. Unlinking does not free monthly slots.`, [
      { text: "Keep linked", style: "cancel" },
      { text: "Unlink", style: "destructive", onPress: () => { void (async () => {
        if (action.current) return; action.current = true; setBusy(true);
        try { const result=await requestRef.current<{message?:string}>("finverse/unlink", { method: "POST", body: JSON.stringify({ workspaceId: session.profileId, accountId: account.id }) }); setRevision(v => v + 1); setMessage(result.message || "Bank disconnected. Your account and history are preserved."); syncedRef.current(); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Unable to unlink."); }
        finally { action.current = false; if (active.current) setBusy(false); }
      })(); } },
    ]);
  }
  async function connect(bank: Bank) {
    if (!allowed || action.current || session.demo) return;
    if (Platform.OS === "web") { setMessage("Use Clover’s mobile website or the iOS or Android app to connect a bank."); return; }
    action.current = true; setBusy(true); setMessage(`Opening ${bank.name} with Finverse…`);
    try {
      const data = await requestRef.current<{ connectionId: string; linkUrl: string }>("finverse/link", { method: "POST", body: JSON.stringify({ workspaceId: session.profileId, institutionId: bank.id }) });
      if (!active.current) return;
      setConnection(data.connectionId);
      const result = await WebBrowser.openAuthSessionAsync(data.linkUrl, "clover://accounts");
      if (!active.current) return;
      if (result.type === "success") {
        const url = new URL(result.url);
        if (url.protocol === "clover:" && url.hostname === "accounts" && url.searchParams.get("finverse") === "connected" && url.searchParams.get("finverseConnection") === data.connectionId) {
          action.current = false; await sync(data.connectionId); return;
        }
        setMessage("The bank connection was not completed. Please try again.");
      } else setMessage("Bank connection cancelled. You can try again when you’re ready.");
    } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : "Unable to connect your bank."); }
    finally { action.current = false; if (active.current) setBusy(false); }
  }
  const selectionPanel = selection ? <View style={{ gap: 12 }}><Heading>Select bank accounts</Heading><Body>{selection.remaining} new account slots available. Previously used accounts can be reconnected.</Body>{selection.accounts.map(account => {
      const checked = selected.includes(account.id), disabled = busy || (!checked && !account.reserved && selection.accounts.filter(a => selected.includes(a.id) && !a.reserved).length >= selection.remaining);
      return <View key={account.id} style={{gap:6}}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => setSelected(current => checked ? current.filter(id => id !== account.id) : [...current, account.id])} style={{ padding: 14, borderWidth: 1, borderColor: checked ? colors.teal : colors.line, borderRadius: 12 }}><Text style={{ color: colors.ink }}>{checked ? "✓ " : "○ "}{account.name}{account.existingAccountName ? ` · Reuse ${account.existingAccountName}; keep all history` : ""}{account.reserved ? " · Already included this period" : ""}</Text></Pressable>{checked?<View style={{gap:6}}><Body>Link to an existing account:</Body><Button secondary title={account.suggestedAccountId?'Use matching account':'Create a new account card'} onPress={()=>setMappings(m=>({...m,[account.id]:''}))}/>{account.candidates?.map(c=><Button key={c.id} secondary title={`${mappings[account.id]===c.id?'✓ ':''}${c.name}${c.last4?` •••• ${c.last4}`:''}`} onPress={()=>setMappings(m=>({...m,[account.id]:c.id}))}/>)}</View>:null}</View>;
    })}<Button title="Link selected accounts" disabled={busy || !selected.length} onPress={() => void sync(selection.connectionId, selected)} /><Button secondary title="Choose later" onPress={()=>{setSelection(null);setProgressOpen(false);setRevision(v=>v+1);}} /></View> : null;
  if (progressOpen || (callbackConnection && callbackHandled.current !== callbackConnection && !access && !connectionsError)) return <View style={{gap:16,padding:20}} accessibilityLabel="Bank connection progress">
    {(!busy && !retrySync && selectionPanel) || <><Heading>{busy ? "Bank connection in progress" : retrySync ? "Bank connection needs attention" : "Bank connection update"}</Heading>
    {busy || !access ? <ActivityIndicator color={colors.teal}/> : null}<Notice>{message || "Bank authorized. Retrieving your accounts…"}</Notice>
    {retrySync ? <>{!reconnectRequired ? <Button title="Retry" onPress={()=>void sync(retrySync.id,retrySync.accountIds,retrySync.refresh)}/> : <Button secondary title="Reconnect bank" onPress={()=>{setProgressOpen(false);router.push("/accounts?add=connect");}}/>}</> : null}
    <Body>Pending account selections stay under Finish linking in Accounts and Notifications.</Body>
    <Button secondary title={busy ? "Continue using Clover" : "Done"} onPress={()=>{setProgressOpen(false);onDismiss?.();}}/></>}
  </View>;
  if (mode === "sync" && accountId && connectionsError) return <View style={{ gap: 12 }}><Body>{connectionsError}</Body><Button title="Retry bank connection status" secondary onPress={() => setRevision(v => v + 1)} /></View>;
  if (mode === "sync" && accountId && !connectionsLoaded) return <Body>Checking bank connection…</Body>;
  if (mode === "sync" && accountId && !linked.some(a => a.id === accountId)) return null;
  if (access?.profileId === session.profileId && access.upgradeRequired && !linked.length) return <View style={{ gap: 16 }}>
    <Heading>Unlock bank connections</Heading>
    <Body>Upgrade to Clover Plus or Pro to securely connect your banks through Finverse.</Body>
    <Button title="Upgrade plan" fullWidth onPress={() => router.push("/settings?section=plan")} />
    <Body muted>You can still add accounts with Manual or Upload on Free.</Body>
  </View>;
  if (!connectionsLoaded && !session.demo) return <View style={{ gap: 12 }}><Notice>{connectionsError || "Loading linked accounts…"}</Notice>{connectionsError ? <Button secondary title="Try again" onPress={() => setRevision(v => v + 1)} /> : null}</View>;
  const syncAccounts=linked.filter(a=>!accountId||a.id===accountId);
  return <View style={{gap:16}}>

    {pending.map(c=><Button key={c.id} secondary title={`Finish linking ${c.name} · Select accounts`} disabled={busy||!allowed} onPress={()=>void sync(c.id)}/>)}
    {mode === "connect" ? <>{test ? <Notice>Test mode · Only test banks are shown.</Notice> : null}{banksLoaded&&allowed ? <FinverseBankPicker banks={banks} busy={busy} onConnect={bank=>void connect(bank)}/> : <Notice>{bankMessage}</Notice>}</> : null}
    {syncAccounts.length ? <Heading>Connected accounts</Heading> : null}
    {syncAccounts.length ? syncAccounts.map(account=><View key={account.id} style={{gap:8,padding:12,borderWidth:1,borderColor:colors.line,borderRadius:16}}>
      <BankLogo path={account.logoUrl} />
      <Body>{account.name} {account.last4 ? `•••• ${account.last4}` : ""}</Body>
      <Body muted>{account.status==="disconnect_pending"?"Disconnection pending":account.status==="link_pending"?"Authorization needed":account.syncError || account.status==="error"?"Connection needs attention":account.status==="retrieving"?"Syncing":"Connected"}</Body>
      <Body muted>Last Synced · {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Not yet synced"}</Body>
      <Button title={busy?"Syncing…":"Sync"} icon="sync" disabled={busy || !allowed || account.status==="disconnect_pending"} onPress={()=>void sync(account.connectionId,[],true)} />
      <Button secondary title="Account actions" icon="ellipsis-horizontal" disabled={busy||account.status==="disconnect_pending"} onPress={()=>Alert.alert(account.name,"Account actions",[{text:"Cancel",style:"cancel"},{text:"Unlink",style:"destructive",onPress:()=>confirmUnlink(account)}])} />
    </View>) : mode === "sync" ? <>
      {test?<Notice>Test mode · Only test banks are shown.</Notice>:null}
      {banksLoaded ? <FinverseBankPicker key={`${session.profileId}:${revision}`} banks={banks} busy={busy} onConnect={bank => void connect(bank)} /> : <Notice>{bankMessage}</Notice>}
    </> : null}
    {!banksLoaded && bankMessage !== "Loading banks…" && !session.demo ? <Button secondary title="Retry bank list" onPress={()=>setRevision(v=>v+1)}/> : null}
    {message?<Notice>{message}</Notice>:null}
    {retrySync ? <Button secondary title="Try again" disabled={busy || !session.offlineStatus.online} onPress={() => void sync(retrySync.id, retrySync.accountIds, retrySync.refresh)} /> : null}
  </View>;
}
