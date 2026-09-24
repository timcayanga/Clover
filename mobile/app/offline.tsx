import { Text } from "../src/app-text";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  CloverLocalAI,
  type LocalCapability,
} from "../modules/clover-local-ai";
import {
  localCapability,
  deviceAllowance,
  refreshLocalAllowance,
} from "../src/offline/local-ai";
import type { Allowance } from "../src/offline/local-allowance";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSession } from "../src/session";
import { Body, Button, Card, Heading, Notice, Screen } from "../src/ui";
import type { OfflineMutation } from "../src/offline/types";
import type { Transaction, TransactionPage } from "../src/types";
export default function OfflineScreen() {
  const session = useSession(),
    engine = session.offline,
    status = session.offlineStatus;
  const [capability, setCapability] = useState<LocalCapability | null>(null),
    [allowance, setAllowance] = useState<Allowance | null>(null);
  useEffect(() => {
    let active = true;
    void localCapability().then((v) => {
      if (active) setCapability(v);
    });
    void (engine ? deviceAllowance(engine).get() : Promise.resolve(null)).then(
      (v) => {
        if (active) setAllowance(v);
      },
    );
    return () => {
      active = false;
    };
  }, [engine]);
  const [items, setItems] = useState<OfflineMutation[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void engine?.pending().then((v) => {
      if (active) setItems(v);
    });
    return () => {
      active = false;
    };
  }, [engine, status.pending, status.conflicts, status.syncing]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setItems((await engine?.pending()) ?? []);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    if (!session.profileId) throw new Error("Choose a Profile first.");
    const suffix = `?workspaceId=${encodeURIComponent(session.profileId)}`;
    for (const route of ["home", "accounts", "options"])
      await session.request(route + suffix);
    const rows: Transaction[] = [];
    let count = 0,
      total = 0;
    for (let page = 1; page <= 20; page++) {
      const result = await session.request<TransactionPage>(
        `transactions${suffix}&page=${page}`,
      );
      if (!engine?.status.online)
        throw new Error(
          "Download interrupted. Your previous Adviser snapshot is still available.",
        );
      rows.push(...result.transactions);
      count += result.transactions.length;
      total = result.totalCount;
      if (count >= total || !result.transactions.length) break;
    }
    await engine!.saveDownloadedHistory(session.profileId, rows, total);
    setMessage(
      `Downloaded ${count} of ${total} transactions for this Profile. Open other pages online to make them available offline. Files and shared data may still need a connection.`,
    );
  };
  return (
    <Screen>
      <Card>
        <Heading>
          {status.online ? "Sync & Offline" : "Working offline"}
        </Heading>
        <Body>
          {session.data?.profiles.find((p) => p.id === session.profileId)
            ?.name ?? "Choose a Profile"}
        </Body>
        <Body>
          {status.lastSync
            ? `Last connected ${new Date(status.lastSync).toLocaleString()}`
            : "Not synced on this device yet"}
        </Body>
        <Body>
          Downloaded records stay encrypted on this device. Charts reflect their
          last downloaded data.
        </Body>
        <Button
          title={status.syncing ? "Syncing…" : status.online ? "Sync now" : "Retry connection"}
          disabled={!engine || busy || status.syncing}
          onPress={() =>
            void run(async () => {
              const connection = await NetInfo.fetch();
              const online = connection.isConnected !== false && connection.isInternetReachable !== false;
              await engine!.setOnline(online);
              if (!online) throw new Error("Still offline. Check your connection and try again.");
              session.refresh();
            })
          }
        />
      </Card>
      {status.error ? <Notice>{status.error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {!engine ? (
        <Notice>
          Encrypted offline storage requires an updated native Clover build.
          Online features remain available.
        </Notice>
      ) : null}
      <Card>
        <Heading>Downloaded data</Heading>
        <Body>
          Download Home, accounts, choices and up to 600 transactions in the
          selected Profile. Offline Adviser will state when the downloaded
          history is incomplete.
        </Body>
        <Button
          title="Download this Profile"
          secondary
          disabled={!engine || busy || !status.online}
          onPress={() => void run(download)}
        />
      </Card>
      <Card>
        <Heading>On-device AI</Heading>
        <Body>
          {capability?.provider ?? "Checking device…"} ·{" "}
          {capability?.model ?? "checking"}
        </Body>
        <Body>{capability?.detail}</Body>
        <Body>
          {allowance?.grant
            ? `${Math.max(0, allowance.grant.issued - allowance.grant.used)} AI tokens reserved on this device. Expires ${new Date(allowance.grant.expiresAt).toLocaleDateString()}.`
            : "Connect to reserve your device allowance."}
        </Body>
        <Body>
          On-device AI draws from the same monthly and rolling 24-hour AI token allowance as cloud AI. Tokens are reserved while online; unused reservations remain charged for their window. Cloud token limits are
          shared. Local calculations, dictation and OCR do not use these
          requests.
        </Body>
        {capability?.model === "downloadable" ? (
          <Button
            title="Download on-device model"
            disabled={busy || !status.online}
            onPress={() =>
              void run(async () => {
                await CloverLocalAI?.download();
                setCapability(await localCapability());
              })
            }
          />
        ) : null}
        <Button
          title="Refresh device allowance"
          secondary
          disabled={!engine || busy || !status.online || !session.profileId}
          onPress={() =>
            void run(async () =>
              setAllowance(
                await refreshLocalAllowance(engine!, session.profileId, () =>
                  Crypto.randomUUID(),
                ),
              ),
            )
          }
        />
        <Button
          title="Open Adviser"
          secondary
          onPress={() => router.push("/(tabs)/adviser")}
        />
      </Card>
      <Heading>{session.queuedFiles.length} saved files</Heading>
      {session.queuedFiles.map((file) => (
        <Card key={file.id}>
          <Body muted={false}>{file.name}</Body>
          <Body>
            {session.data?.profiles.find((p) => p.id === file.workspaceId)
              ?.name ?? "Unavailable Profile"}{" "}
            · {file.state}
          </Body>
          <Button
            title="View file"
            secondary
            onPress={() =>
              router.push({ pathname: "/import/[id]", params: { id: file.id } })
            }
          />
        </Card>
      ))}
      <Heading>{items.length} pending changes</Heading>
      {!items.length ? <Body>No changes waiting to sync.</Body> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Heading>
            {String(
              item.payload.merchantRaw ??
                item.payload.merchantClean ??
                "Transaction edit",
            )}
          </Heading>
          <Body>
            {session.data?.profiles.find((p) => p.id === item.workspaceId)
              ?.name ?? "Unavailable Profile"}{" "}
            · {item.kind === "create" ? "New transaction" : "Edit"}
          </Body>
          <Body>
            {item.state === "pending"
              ? "Saved on this device · Pending sync"
              : "Needs attention"}
          </Body>
          {item.error ? <Notice>{item.error}</Notice> : null}
          {item.current ? (
            <View style={{ gap: 8 }}>
              <Body muted={false}>Saved in Clover</Body>
              <Body>Name: {String(item.current.merchantClean ?? "—")}</Body>
              <Body>Note: {String(item.current.description ?? "—")}</Body>
              <Body>
                Tags:{" "}
                {Array.isArray(item.current.tags)
                  ? item.current.tags.join(", ")
                  : "—"}
              </Body>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Body muted={false}>Your pending change</Body>
            {Object.entries(item.payload)
              .filter(([key]) =>
                [
                  "merchantRaw",
                  "merchantClean",
                  "description",
                  "tags",
                  "amount",
                  "currency",
                  "date",
                ].includes(key),
              )
              .map(([key, value]) => (
                <Body key={key}>
                  {
                    (
                      {
                        merchantRaw: "Name",
                        merchantClean: "Name",
                        description: "Note",
                        tags: "Tags",
                        amount: "Amount",
                        currency: "Currency",
                        date: "Date",
                      } as Record<string, string>
                    )[key]
                  }
                  :{" "}
                  {Array.isArray(value)
                    ? value.join(", ")
                    : String(value ?? "—")}
                </Body>
              ))}
          </View>
          {item.state === "conflict" && item.current ? (
            <Button
              title="Review and keep my edit"
              disabled={busy || !status.online}
              onPress={() =>
                Alert.alert(
                  "Keep your edit?",
                  "This will apply the name, note and tags shown above to the latest saved transaction.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Keep my edit",
                      onPress: () => void run(() => engine!.keepEdit(item.id)),
                    },
                  ],
                )
              }
            />
          ) : null}
          <Button
            secondary
            title={
              item.state === "conflict"
                ? "Use saved version"
                : "Discard pending change"
            }
            disabled={busy || status.syncing}
            onPress={() =>
              Alert.alert(
                "Discard this pending change?",
                "Only the unsynced change on this device will be removed.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Discard",
                    style: "destructive",
                    onPress: () => void run(() => engine!.discard(item.id)),
                  },
                ],
              )
            }
          />
        </Card>
      ))}
    </Screen>
  );
}
