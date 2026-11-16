import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { manageAppleStoreSubscription, type StoreStatus } from "./store-billing";
import { printSnapshot } from "./print-snapshot";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useSession } from "./session";
import { useAccess } from "./access";
import { snapshotHtml } from "./snapshot-html";
import { removeUploadCopy } from "./upload";
import { Text } from "./app-text";
import { Body, Button, Card, Field, Notice, useTheme } from "./ui";
export function SettingsData({
  accountOnly = false,
}: {
  accountOnly?: boolean;
}) {
  const session = useSession();
  const access = useAccess();
  const { styles } = useTheme();
  const [billing, setBilling] = useState<{ appleCancellationRequired: boolean; googleCancellationRequired: boolean } | null>(null);
  const [appleReturned, setAppleReturned] = useState(false);
  const [appleAcknowledged, setAppleAcknowledged] = useState(false);
  const awaitingApple = useRef(false);
  useEffect(() => {
    let leftApp = false;
    const listener = AppState.addEventListener("change", state => {
      if (awaitingApple.current && state !== "active") leftApp = true;
      if (awaitingApple.current && leftApp && state === "active") {
        awaitingApple.current = false;
        leftApp = false;
        setAppleReturned(true);
      }
    });
    return () => listener.remove();
  }, []);
  const [before, setBefore] = useState("");
  const [scope, setScope] = useState<
    "transactions" | "accounts" | "all" | "account" | null
  >(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const version = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    version.current++;
    setScope(null);
    setBilling(null);
    setAppleReturned(false);
    setAppleAcknowledged(false);
    awaitingApple.current = false;
    setTyped("");
    setBefore("");
    setError("");
    setMessage("");
    return () => {
      version.current++;
    };
  }, [session.profileId]);
  const run = async (action: (stamp: number) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const stamp = version.current;
    try {
      if (session.demo) throw new Error("Sign in to manage your data.");
      await action(stamp);
    } catch (e) {
      if (stamp === version.current)
        setError(
          e instanceof Error ? e.message : "Unable to complete this action.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const beginDeletion = (stamp: number) => session.request<{ appleCancellationRequired: boolean; googleCancellationRequired: boolean }>("settings/delete-account").then(status => {
    if (stamp !== version.current) return;
    setBilling(status); setAppleReturned(false); setAppleAcknowledged(false);
    awaitingApple.current = false; setTyped(""); setScope("account");
  });
  const openApple = async (stamp: number) => {
    setAppleAcknowledged(false);
    if (Platform.OS === "ios") {
      try {
        const status = await session.request<StoreStatus>("billing/store");
        if (stamp !== version.current) return;
        await manageAppleStoreSubscription({ ...status, billingProvider: "app_store", hasPaidSubscription: true });
        if (stamp === version.current) setAppleReturned(true);
        return;
      } catch {
        // Apple management must remain reachable when new purchases are disabled
        // or StoreKit cannot present its in-app subscription screen.
      }
    }
    if (stamp !== version.current) return;
    awaitingApple.current = true;
    try { await Linking.openURL("https://apps.apple.com/account/subscriptions"); }
    catch (error) { awaitingApple.current = false; throw error; }

  };
  const download = async (
    kind: "transactions" | "account-balances",
    stamp: number,
  ) => {
    const csv = await session.download(
      `settings/export/${kind}?workspaceId=${encodeURIComponent(session.profileId)}`,
    );
    if (stamp !== version.current) return;
    const html = snapshotHtml(
      csv,
      kind === "transactions" ? "Transactions" : "Accounts",
      session.data?.profiles.find((p) => p.id === session.profileId)?.name ??
        "Profile",
    );
    if (Platform.OS === "web") {
      await printSnapshot(html);
      return;
    }
    if (!(await Sharing.isAvailableAsync()))
      throw new Error("File sharing is unavailable on this device.");
    const file = await Print.printToFileAsync({
      html,
      width: 842,
      height: 595,
    });
    try {
      if (stamp === version.current)
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Save Clover snapshot",
        });
    } finally {
      removeUploadCopy(file.uri);
    }
  };
  const phrase =
    scope === "account"
      ? "DELETE"
      : scope === "all"
        ? "DELETE ALL DATA"
        : "DELETE";
  const remove = async (stamp: number) => {
    if (typed !== phrase || !scope)
      throw new Error(`Type ${phrase} to confirm.`);
    if (scope === "account" || scope === "all") {
      await session.request(
        `settings/${scope === "account" ? "delete-account" : "wipe-data"}`,
        { method: "POST", body: JSON.stringify({ confirmation: phrase, ...(scope === "account" ? { appleSubscriptionAcknowledged: appleAcknowledged } : {}) }) },
      );
      if (scope === "account") {
        access.markAccountDeleted();
        await session.signOut({ accountDeleted: true });
        return;
      }
    } else {
      const cutoff =
        scope === "transactions"
          ? new Date(`${before}T00:00:00.000Z`)
          : new Date();
      if (
        Number.isNaN(cutoff.getTime()) ||
        (scope === "transactions" &&
          cutoff.toISOString().slice(0, 10) !== before)
      )
        throw new Error("Enter a valid date as YYYY-MM-DD.");
      await session.request(
        `settings/data?workspaceId=${encodeURIComponent(session.profileId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            workspaceId: session.profileId,
            beforeDate: cutoff.toISOString(),
            scope,
            confirmation: typed,
          }),
        },
      );
    }
    session.refresh();
    if (stamp === version.current) {
      setScope(null);
      setTyped("");
      setMessage("Selected data removed.");
    }
  };
  return (
    <>
      {!accountOnly ? (
        <>
          <Card style={{ borderRadius: 16 }}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Download snapshots</Text>
            <Button
              title="Transactions as PDF · Download"
              disabled={busy || !session.profileId}
              onPress={() =>
                void run((stamp) => download("transactions", stamp))
              }
            />
            <Button
              title="Accounts as PDF · Download"
              disabled={busy || !session.profileId}
              onPress={() =>
                void run((stamp) => download("account-balances", stamp))
              }
            />
          </Card>
          <Card style={{ borderRadius: 16 }}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Remove Clover data</Text>
            <Field
              label="Transactions before date (UTC, YYYY-MM-DD)"
              value={before}
              placeholder="YYYY-MM-DD"
              maxLength={10}
              editable={!busy}
              onChangeText={setBefore}
            />
            <Button
              title="Delete transactions before this date"
              secondary
              disabled={
                busy ||
                !session.profileId ||
                !/^\d{4}-\d{2}-\d{2}$/.test(before)
              }
              onPress={() => {
                setScope("transactions");
                setTyped("");
              }}
            />
            <Button
              title="Delete accounts in this Profile"
              secondary
              disabled={busy || !session.profileId}
              onPress={() => {
                setScope("accounts");
                setTyped("");
              }}
            />
            <Button
              title="Delete all Clover data"
              secondary
              disabled={busy}
              onPress={() => {
                setScope("all");
                setTyped("");
              }}
            />
          </Card>
        </>
      ) : null}
      {accountOnly ? <Card style={{ borderRadius: 16 }}>
        <Body>Permanently delete your Clover account.</Body>
        {scope === "account" ? <>
          <Body>This cannot be undone.</Body>
          {billing?.googleCancellationRequired ? <Body>Clover will cancel your Google Play subscription before deleting your account. If cancellation fails, your account stays available. No refund is issued automatically.</Body> : null}
          {billing?.appleCancellationRequired ? <>
            <Body>Cancel Clover in Apple Subscriptions, then return here to confirm deletion. Deleting your account does not cancel Apple billing.</Body>
            <Button textOnly title="Open Apple Subscriptions" disabled={busy} onPress={() => void run(openApple)}/>
            {appleReturned ? <Button secondary title={appleAcknowledged ? "✓ I canceled my Apple subscription" : "I canceled my Apple subscription"} disabled={busy} onPress={() => setAppleAcknowledged(value => !value)}/> : null}
          </> : null}
          {!billing?.appleCancellationRequired || (appleReturned && appleAcknowledged) ? <>
            <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" editable={!busy}/>
            <Button danger title={busy ? "Deleting…" : "Confirm deletion"} disabled={busy || typed !== phrase} onPress={() => void run(remove)}/>
          </> : null}
          <Button secondary title="Cancel" disabled={busy} onPress={() => { setScope(null); setTyped(""); awaitingApple.current = false; }}/>

        </> : <Button danger title="Delete account" disabled={busy} onPress={() => void run(beginDeletion)}/>}
      </Card> : null}
      {scope && !accountOnly ? (
        <Card>
          <Body>
            {scope === "account"
              ? "Permanently delete your account, login, and financial data? If you subscribed through Apple or Google, manage your subscription in that store as well."
              : scope === "all"
                ? "Delete financial data across ALL Profiles, including accounts, transactions, imports, split bills and goals? Your login remains available and a blank starter Profile is created."
                : scope === "accounts"
                  ? "Delete ALL accounts in this Profile and their related transactions and imports? The date field does not limit account deletion."
                  : `Delete transactions before ${before} at 00:00 UTC in this Profile? Orphaned transaction records will also be removed.`}
          </Body>
          <Body>
            This cannot be undone. Download a snapshot first if you need one.
          </Body>
          <Field
            label={`Type ${phrase} to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            editable={!busy}
          />
          <Button
            title={busy ? "Deleting…" : "Confirm deletion"}
            disabled={busy || typed !== phrase}
            onPress={() => void run(remove)}
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => {
              setScope(null);
              setTyped("");
            }}
          />
        </Card>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </>
  );
}
