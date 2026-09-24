import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { printSnapshot } from "./print-snapshot";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useSession } from "./session";
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
  const { styles } = useTheme();
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
      ? "DELETE MY ACCOUNT"
      : scope === "all"
        ? "DELETE ALL DATA"
        : "DELETE";
  const remove = async (stamp: number) => {
    if (typed !== phrase || !scope)
      throw new Error(`Type ${phrase} to confirm.`);
    if (scope === "account" || scope === "all") {
      await session.request(
        `settings/${scope === "account" ? "delete-account" : "wipe-data"}`,
        { method: "POST", body: JSON.stringify({ confirmation: phrase }) },
      );
      if (scope === "account") {
        await session.signOut();
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
      ) : (
        <Card style={{ borderRadius: 16 }}>
          <Body>Delete account</Body>
          <Body>
            Permanently delete your Clover account and the data tied to it.
          </Body>
          <Button
            title="Delete account"
            secondary
            disabled={busy}
            onPress={() => {
              setScope("account");
              setTyped("");
            }}
          />
        </Card>
      )}
      {scope ? (
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
