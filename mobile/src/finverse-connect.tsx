import { useCallback, useEffect, useRef, useState } from "react";
import { finverseCountries } from "../../shared/finverse-countries";
import { Image } from "expo-image";
import { apiBase } from "./api-base";
import { Alert, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Text } from "./app-text";
import { Body, Button, Field, Heading, Notice, useTheme } from "./ui";
import { useSession } from "./session";

const countryFlags: Record<string, number> = {
  HKG: require("../assets/countries/hong kong.png"), IDN: require("../assets/countries/indonesia.png"),
  MYS: require("../assets/countries/malaysia.png"), PHL: require("../assets/countries/philippines.png"),
  SGP: require("../assets/countries/singapore.png"), VNM: require("../assets/countries/vietnam.png"),
};
function CountryFlag({code, fallback}: {code:string;fallback:string}) {
  return countryFlags[code] ? <Image source={countryFlags[code]} style={{width:48,height:36}} contentFit="contain" /> : <Text style={{fontSize:32}}>{fallback}</Text>;
}

function BankLogo({path}:{path:string}) {
  const [failed,setFailed]=useState(false);
  return <Image source={failed?require("../assets/account-types/bank.png"):{uri:path.startsWith("/")?apiBase()+path:path}} style={{width:48,height:48}} contentFit="contain" onError={()=>setFailed(true)}/>;
}

type Bank = { id: string; name: string; reserved?: boolean; existingAccountName?: string | null };
type SyncResult = { status: string; linkUrl?: string; connectionId?: string; remaining?: number; accounts?: Bank[]; transactions?: { imported: number }; error?: string };
export function FinverseConnect({ onSynced, callbackConnection, mode = "connect", accountId }: { onSynced: () => void; callbackConnection?: string; mode?: "connect" | "sync"; accountId?: string }) {
  const session = useSession();
  const { colors } = useTheme();
  const [access, setAccess] = useState<{ profileId: string; upgradeRequired: boolean } | null>(null);
  const allowed = access?.profileId === session.profileId && !access.upgradeRequired;
  const [banks, setBanks] = useState<(Bank & {countries:string[];logoUrl:string;logoUrls?:Record<string,string>})[]>([]);
  const [country,setCountry] = useState<string|null>(null);
  const [linked,setLinked] = useState<{id:string;connectionId:string;name:string;last4:string|null;logoUrl:string;lastSyncedAt:string|null}[]>([]);
  const [connectionsLoaded,setConnectionsLoaded] = useState(false);
  const [connectionsError,setConnectionsError] = useState("");
  const [bankMessage, setBankMessage] = useState("Loading banks…");
  const [message, setMessage] = useState("");
  const [test, setTest] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState(callbackConnection);
  const [selection, setSelection] = useState<{ accounts: Bank[]; remaining: number; connectionId: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const active = useRef(true);
  const action = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(session.request); requestRef.current = session.request;
  const syncedRef = useRef(onSynced); syncedRef.current = onSynced;
  useEffect(() => { active.current = true; return () => { active.current = false; abortRef.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setAccess(null);
    setBanks([]); setCountry(null); setBankMessage("Loading banks…");
    if (session.demo) { setBankMessage("Sign in to connect your bank. Demo mode does not access bank accounts."); return; }
    void requestRef.current<{ banks: (Bank & {countries:string[];logoUrl:string;logoUrls?:Record<string,string>})[]; mode?: string; message?: string; upgradeRequired?: boolean }>(`finverse/institutions?workspaceId=${encodeURIComponent(session.profileId)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setAccess({ profileId: session.profileId, upgradeRequired: data.upgradeRequired === true }); setBanks(data.banks); setTest(data.mode === "test"); setBankMessage(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); } })
      .catch(error => { if (!controller.signal.aborted) setBankMessage(error.message || "Unable to load banks."); });
    return () => controller.abort();
  }, [session.demo, session.profileId, revision]);
  useEffect(()=>{
    const controller=new AbortController();setConnectionsLoaded(false);setConnectionsError("");setLinked([]);
    if(session.demo){setConnectionsLoaded(true);return;}
    void requestRef.current<{accounts:typeof linked}>(`finverse/connections?workspaceId=${encodeURIComponent(session.profileId)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted){setLinked(data.accounts);setConnectionsLoaded(true);}}).catch(error=>{if(!controller.signal.aborted)setConnectionsError(error.message);});
    return()=>controller.abort();
  },[session.demo,session.profileId,revision]);
  const sync = useCallback(async (id?: string, accountIds?: string[], refresh = false) => {
    if (!allowed || action.current) return;
    action.current = true; setBusy(true); setMessage("Retrieving your bank accounts…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const data = await requestRef.current<SyncResult>("finverse/sync", { method: "POST", signal: controller.signal, body: JSON.stringify({ workspaceId: session.profileId, connectionId: id, selectedAccountIds: accountIds, refresh: refresh && attempt === 0 }) });
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
          setConnection(data.connectionId); setSelection({ accounts: data.accounts, remaining: data.remaining ?? 0, connectionId: data.connectionId }); setSelected([]); setMessage(""); return;
        }
        if (data.status === "retrieving") {
          await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); }; const timer = setTimeout(done, 3000); controller.signal.addEventListener("abort", done, { once: true }); });
          if (controller.signal.aborted) return;
          continue;
        }
        setSelection(null); setMessage("Bank connected. New transactions are ready for review."); setRevision(v=>v+1); syncedRef.current(); return;
      }
      setMessage("Finverse is still retrieving your data. Use Sync to check again.");
    } catch (error) { if (active.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to sync your bank."); }
    finally { action.current = false; if (active.current) setBusy(false); }
  }, [allowed, session.profileId]);
  const callbackHandled = useRef("");
  useEffect(() => { if (allowed && callbackConnection && callbackHandled.current !== callbackConnection) { callbackHandled.current = callbackConnection; setConnection(callbackConnection); void sync(callbackConnection); } }, [allowed, callbackConnection, sync]);
  function confirmUnlink(account: {id:string;name:string}) {
    Alert.alert(`Unlink ${account.name}?`, "Your Clover account and history will stay. This account still uses a slot until your monthly allowance resets. Reconnecting it uses no extra slot.", [
      { text: "Keep linked", style: "cancel" },
      { text: "Unlink", style: "destructive", onPress: () => { void (async () => {
        if (action.current) return; action.current = true; setBusy(true);
        try { await requestRef.current("finverse/unlink", { method: "POST", body: JSON.stringify({ workspaceId: session.profileId, accountId: account.id }) }); setRevision(v => v + 1); setMessage("Bank unlinked. Your account and history are preserved."); syncedRef.current(); }
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
  if(mode==="sync"&&accountId&&(!connectionsLoaded||!linked.some(a=>a.id===accountId))) return null;
  if (access?.profileId === session.profileId && access.upgradeRequired && !(mode === "sync" && linked.length)) return <View style={{ gap: 16 }}>
    <Heading>Unlock bank connections</Heading>
    <Body>Upgrade to Clover Plus or Pro to securely connect your banks through Finverse.</Body>
    <Button title="Upgrade plan" fullWidth onPress={() => router.push("/settings?section=plan")} />
    <Body muted>You can still add accounts with Manual or Upload on Free.</Body>
  </View>;
  if (!allowed && !(access?.upgradeRequired && mode === "sync" && linked.length)) return <View style={{ gap: 16 }}><Notice>{bankMessage}</Notice>{bankMessage !== "Loading banks…" && !session.demo ? <Button secondary title="Try again" onPress={() => setRevision(v => v + 1)} /> : null}</View>;
  if(mode==="sync"&&!connectionsLoaded)return <Notice>{connectionsError||"Loading linked accounts…"}</Notice>;
  const syncAccounts=linked.filter(a=>!accountId||a.id===accountId);
  return <View style={{gap:16}}>
    {selection ? <View style={{ gap: 12 }}><Heading>Select bank accounts</Heading><Body>{selection.remaining} new account slots available. Previously used accounts can be reconnected.</Body>{selection.accounts.map(account => {
      const checked = selected.includes(account.id), disabled = busy || (!checked && !account.reserved && selection.accounts.filter(a => selected.includes(a.id) && !a.reserved).length >= selection.remaining);
      return <Pressable key={account.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => setSelected(current => checked ? current.filter(id => id !== account.id) : [...current, account.id])} style={{ padding: 14, borderWidth: 1, borderColor: checked ? colors.teal : colors.line, borderRadius: 12 }}><Text style={{ color: colors.ink }}>{checked ? "✓ " : "○ "}{account.name}{account.existingAccountName ? ` · Reuse ${account.existingAccountName}; keep all history` : ""}{account.reserved ? " · Already included this period" : ""}</Text></Pressable>;
    })}<Button title="Link selected accounts" disabled={busy || !selected.length} onPress={() => void sync(selection.connectionId, selected)} /></View> : null}
    {mode==="sync"&&syncAccounts.length ? syncAccounts.map(account=><View key={account.id} style={{gap:8,padding:12,borderWidth:1,borderColor:colors.line,borderRadius:16}}>
      <BankLogo path={account.logoUrl} />
      <Body>{account.name} {account.last4 ? `•••• ${account.last4}` : ""}</Body>
      <Body muted>Last Synced · {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Not yet synced"}</Body>
      <Button title={busy?"Syncing…":"Sync"} icon="sync" disabled={busy || !allowed} onPress={()=>void sync(account.connectionId,[],true)} />
      <Button secondary title="Unlink" disabled={busy} onPress={() => confirmUnlink(account)} />
    </View>) : <>
      {test?<Notice>Test mode · Only test banks are shown.</Notice>:null}
      {country?<Button secondary title={`‹ Countries · ${finverseCountries(banks).find(c=>c.code===country)?.name}`} onPress={()=>setCountry(null)}/>:null}
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
        {!country ? finverseCountries(banks).map(c=><Pressable key={c.code} accessibilityRole="button" accessibilityLabel={c.name} onPress={()=>setCountry(c.code)} style={{width:"31%",padding:12,alignItems:"center",gap:8,borderWidth:1,borderColor:colors.line,borderRadius:16}}><CountryFlag code={c.code} fallback={c.flag} /><Text style={{fontSize:11,color:colors.ink,textAlign:"center"}}>{c.name}</Text></Pressable>) : banks.filter(bank=>bank.countries.includes(country)).map(bank=><Pressable key={bank.id} accessibilityRole="button" accessibilityLabel={bank.name} disabled={busy} onPress={()=>void connect(bank)} style={{width:"31%",padding:8,alignItems:"center",gap:8,borderWidth:1,borderColor:colors.line,borderRadius:16}}><BankLogo path={bank.logoUrls?.[country] || bank.logoUrl}/><Text style={{fontSize:11,color:colors.ink,textAlign:"center"}}>{bank.name}</Text></Pressable>)}
      </View>
      {country&&!banks.some(bank=>bank.countries.includes(country))?<Body>No {test?"test ":""}banks are available here yet.</Body>:null}
    </>}
    {message?<Notice>{message}</Notice>:null}
  </View>;
}
