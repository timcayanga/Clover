import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Text } from "./app-text";
import { Body, Button, Field, Heading, Notice, useTheme } from "./ui";
import { useSession } from "./session";

type Bank = { id: string; name: string };
type SyncResult = { status: string; connectionId?: string; remaining?: number; accounts?: Bank[]; transactions?: { imported: number }; error?: string };
export function FinverseConnect({ onSynced, callbackConnection }: { onSynced: () => void; callbackConnection?: string }) {
  const session = useSession();
  const { colors } = useTheme();
  const [access, setAccess] = useState<{ profileId: string; upgradeRequired: boolean } | null>(null);
  const allowed = access?.profileId === session.profileId && !access.upgradeRequired;
  const [banks, setBanks] = useState<Bank[]>([]);
  const [query, setQuery] = useState("");
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
    setBanks([]); setBankMessage("Loading banks…");
    if (session.demo) { setBankMessage("Sign in to connect your bank. Demo mode does not access bank accounts."); return; }
    void requestRef.current<{ banks: Bank[]; mode?: string; message?: string; upgradeRequired?: boolean }>(`finverse/institutions?workspaceId=${encodeURIComponent(session.profileId)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setAccess({ profileId: session.profileId, upgradeRequired: data.upgradeRequired === true }); setBanks(data.banks); setTest(data.mode === "test"); setBankMessage(data.message || (data.banks.length ? "" : "No banks are available right now. Use Manual or Upload.")); } })
      .catch(error => { if (!controller.signal.aborted) setBankMessage(error.message || "Unable to load banks."); });
    return () => controller.abort();
  }, [session.demo, session.profileId, revision]);
  const sync = useCallback(async (id?: string, accountIds?: string[]) => {
    if (!allowed || action.current) return;
    action.current = true; setBusy(true); setMessage("Retrieving your bank accounts…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const data = await requestRef.current<SyncResult>("finverse/sync", { method: "POST", signal: controller.signal, body: JSON.stringify({ workspaceId: session.profileId, connectionId: id, selectedAccountIds: accountIds }) });
        if (!active.current || controller.signal.aborted) return;
        if (data.status === "select_accounts" && data.accounts && data.connectionId) {
          setConnection(data.connectionId); setSelection({ accounts: data.accounts, remaining: data.remaining ?? 0, connectionId: data.connectionId }); setSelected([]); setMessage("Choose the bank accounts to add."); return;
        }
        if (data.status === "retrieving") {
          await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); }; const timer = setTimeout(done, 3000); controller.signal.addEventListener("abort", done, { once: true }); });
          if (controller.signal.aborted) return;
          continue;
        }
        setSelection(null); setMessage("Bank connected. New transactions are ready for review."); syncedRef.current(); return;
      }
      setMessage("Finverse is still retrieving your data. Use Resume bank sync to check again.");
    } catch (error) { if (active.current && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to sync your bank."); }
    finally { action.current = false; if (active.current) setBusy(false); }
  }, [allowed, session.profileId]);
  const callbackHandled = useRef("");
  useEffect(() => { if (allowed && callbackConnection && callbackHandled.current !== callbackConnection) { callbackHandled.current = callbackConnection; setConnection(callbackConnection); void sync(callbackConnection); } }, [allowed, callbackConnection, sync]);
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
  if (access?.profileId === session.profileId && access.upgradeRequired) return <View style={{ gap: 16 }}>
    <Heading>Unlock bank connections</Heading>
    <Body>Upgrade to Clover Plus or Pro to securely connect your banks through Finverse.</Body>
    <Button title="Upgrade plan" fullWidth onPress={() => router.push("/settings?section=plan")} />
    <Body muted>You can still add accounts with Manual or Upload on Free.</Body>
  </View>;
  if (!allowed) return <View style={{ gap: 16 }}><Notice>{bankMessage}</Notice>{bankMessage !== "Loading banks…" && !session.demo ? <Button secondary title="Try again" onPress={() => setRevision(v => v + 1)} /> : null}</View>;
  const filtered = banks.filter(bank => bank.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <View style={{ gap: 16 }}>
    <Heading>Connect your bank</Heading>
    <Body>Choose a bank to securely connect through Finverse. Review the accounts before adding them to Clover.</Body>
    {test ? <Notice>Test mode · Only test banks are shown.</Notice> : null}
    <Field label="Find your bank" placeholder="Search banks" value={query} onChangeText={setQuery} />
    <Body muted>Philippines</Body>
    {bankMessage ? <Notice>{bankMessage}</Notice> : null}
    {bankMessage && bankMessage !== "Loading banks…" && !session.demo ? <Button secondary title="Refresh bank list" onPress={() => setRevision(v => v + 1)} /> : null}
    {filtered.map(bank => <Button key={bank.id} title={bank.name} secondary fullWidth disabled={busy} onPress={() => void connect(bank)} icon="chevron-forward" />)}
    {banks.length > 0 && !filtered.length ? <Body>No matching banks. Try another name or use Manual or Upload.</Body> : null}
    <Body muted>Can’t find your bank? Use Manual or Upload.</Body>
    <Body muted>Authorization happens with Finverse. Clover never asks for your bank password.</Body>
    {!session.demo && (banks.length > 0 || connection) ? <Button secondary title={busy ? "Please wait…" : "Resume bank sync"} disabled={busy} onPress={() => void sync(connection)} /> : null}
    {selection ? <View style={{ gap: 12 }}><Heading>Choose up to {selection.remaining} accounts</Heading>{selection.accounts.map(account => {
      const checked = selected.includes(account.id), disabled = busy || (!checked && selected.length >= selection.remaining);
      return <Pressable key={account.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => setSelected(current => checked ? current.filter(id => id !== account.id) : [...current, account.id])} style={{ padding: 14, borderWidth: 1, borderColor: checked ? colors.teal : colors.line, borderRadius: 12 }}><Text style={{ color: colors.ink }}>{checked ? "✓ " : "○ "}{account.name}</Text></Pressable>;
    })}<Button title="Add selected accounts" disabled={busy || !selected.length} onPress={() => void sync(selection.connectionId, selected)} /></View> : null}
    {message ? <Notice>{message}</Notice> : null}
  </View>;
}
