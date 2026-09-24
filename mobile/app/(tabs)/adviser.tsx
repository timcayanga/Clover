import { Text } from "../../src/app-text";
import { createAdviserHistoryHook } from "../../../shared/use-adviser-history";
import {
  parseAdviserChart,
  type AdviserChart,
} from "../../../shared/adviser-chart";
import { AdviserReportCard } from "../../src/adviser-report-card";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  askLocally,
  refreshLocalAllowance,
  localCapability,
  deviceAllowance,
} from "../../src/offline/local-ai";
import { AdviserInputTools } from "../../src/adviser-input-tools";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Body, Card, Icon, Notice, Screen, useTheme } from "../../src/ui";
import { PlanAction } from "../../src/plan-ui";
import { useSession } from "../../src/session";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
const useAdviserHistory = createAdviserHistoryHook({
  useEffect,
  useRef,
  useState,
});

type FollowUp = { id: string; label: string; prompt: string };
type Grounding = { transactionCount?: number; historyThrough?: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  visualization?: AdviserChart;
};
export default function Adviser() {
  const session = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showSettings, setShowSettings] = useState(false);
  const params = useLocalSearchParams<{ prompt?: string; page?: string }>();
  const [local, setLocal] = useState(false);
  const useLocal = local || !session.offlineStatus.online;
  const [messages, setMessages] = useState<Message[]>([]);
  const [cloudConversation, setCloudConversation] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [grounding, setGrounding] = useState<Grounding | null>(null);
  const history = useAdviserHistory(
    session.profileId,
    !session.demo && !useLocal,
    <T,>(path: string, body?: unknown) =>
      session.request<T>(
        path,
        body ? { method: "POST", body: JSON.stringify(body) } : undefined,
      ),
    () => Crypto.randomUUID(),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewedChatId, setViewedChatId] = useState<string | undefined>();
  useEffect(() => {
    if (!history.active) return;
    setCloudConversation(true);
    setViewedChatId(history.active.id);
    setMessages(history.active.messages ?? []);
    setFollowUps([]);
    setGrounding(null);
    setDraft("");
    setError("");
    setActions(false);
    setHistoryOpen(false);
  }, [history.active]);
  useEffect(() => {
    if (
      cloudConversation &&
      !useLocal &&
      viewedChatId === history.active?.id &&
      !busy &&
      !history.busy &&
      !history.error &&
      messages.at(-1)?.role === "assistant"
    )
      void history.save(messages);
  }, [
    messages,
    busy,
    history.busy,
    history.error,
    viewedChatId,
    history.active?.id,
    cloudConversation,
    useLocal,
  ]);
  const generation = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setViewedChatId(undefined);
    setMessages([]);
    setCloudConversation(false);
    setFollowUps([]);
    setGrounding(null);
    setDraft("");
    setError("");
    setBusy(false);
    setActions(false);
    return () => {
      generation.current++;
    };
  }, [session.profileId]);
  useEffect(() => {
    if (params.prompt) setDraft(params.prompt.slice(0, 4000));
  }, [params.prompt]);
  const send = async () => {
    if (inFlight.current || history.busy || !draft.trim()) return;
    if (session.demo) {
      setError(
        "Sign in to ask Adviser about your records. Sample mode does not send questions or financial data.",
      );
      return;
    }
    const version = generation.current;
    const next: Message[] = [
      ...messages,
      { role: "user", content: draft.trim() },
    ];
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (useLocal) {
        if (!session.offline)
          throw new Error(
            "On-device tools require an updated native build with encrypted storage.",
          );
        // Reserve credits only on an explicit local request; never send the question online.
        if (
          session.offlineStatus.online &&
          (await localCapability()).model === "available"
        ) {
          try {
            await refreshLocalAllowance(
              session.offline,
              session.profileId,
              () => Crypto.randomUUID(),
            );
          } catch (e) {
            if (!(await deviceAllowance(session.offline).get())?.grant) throw e;
          }
        }
        const reply = await askLocally(
          session.offline,
          session.profileId,
          draft.trim(),
        );
        if (version !== generation.current) return;
        setCloudConversation(false);
        setMessages([...next, { role: "assistant", content: reply }]);
        setFollowUps([]);
        setGrounding(null);
        setDraft("");
        setActions(false);
        return;
      }
      const allowed = [
        "home",
        "accounts",
        "transactions",
        "recurring",
        "budgeting",
        "goals",
        "investments",
        "reports",
        "circles",
        "split-bills",
      ];
      const result = await session.request<{
        reply: string;
        hasActions?: boolean;
        entryDraft?: unknown;
        suggestions?: FollowUp[];
        grounding?: Grounding;
        visualization?: AdviserChart;
      }>(`adviser/chat?workspaceId=${encodeURIComponent(session.profileId)}`, {
        method: "POST",
        body: JSON.stringify({
          messages: next
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
          page: allowed.includes(params.page ?? "") ? params.page : "general",
          clientDate: new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Manila",
          }),
        }),
      });
      if (version !== generation.current) return;
      setCloudConversation(true);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: result.reply,
          visualization: parseAdviserChart(result.visualization) ?? undefined,
        },
      ]);
      setDraft("");
      setActions(Boolean(result.hasActions || result.entryDraft));
      setFollowUps(
        (result.suggestions ?? [])
          .filter(
            (item) =>
              typeof item.prompt === "string" && typeof item.label === "string",
          )
          .slice(0, 3),
      );
      setGrounding(result.grounding ?? null);
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to send your question.",
        );
    } finally {
      if (version === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const composer = (
    <AdviserInputTools
      value={draft}
      onChangeText={setDraft}
      onSend={() => void send()}
      onDeviceOnly={useLocal}
      disabled={busy || history.busy}
      onText={(text) =>
        setDraft((previous) => `${previous} ${text}`.trim().slice(0, 4000))
      }
      onPhoto={() =>
        router.push({
          pathname: "/(tabs)/add",
          params: { entry: `upload-${Date.now()}` },
        })
      }
    />
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 70}
    >
      <Screen>
        {!useLocal && !session.demo ? (
          <PlanAction
            title="Your chats"
            disabled={busy || history.busy}
            onPress={() => setHistoryOpen(!historyOpen)}
          />
        ) : null}
        {historyOpen ? (
          <Card>
            <PlanAction
              title="New chat"
              disabled={busy || history.busy}
              onPress={history.fresh}
            />
            {!history.conversations.length ? (
              <Body>Your conversations will appear here.</Body>
            ) : null}
            {history.conversations.map((chat) => (
              <PlanAction
                key={chat.id}
                title={chat.title}
                disabled={busy || history.busy}
                onPress={() => void history.open(chat.id)}
              />
            ))}
          </Card>
        ) : null}
        {history.error ? (
          <Notice>
            {history.error}
            <PlanAction
              title="Retry chat history"
              onPress={() =>
                cloudConversation && messages.length
                  ? void history.save(messages)
                  : history.retry()
              }
            />
          </Notice>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {messages.length ? (
            <PlanAction
              title="New chat"
              disabled={busy || history.busy}
              onPress={() => {
                if (!useLocal && !session.demo) history.fresh();
                setMessages([]);
                setCloudConversation(false);
                setFollowUps([]);
                setGrounding(null);
                setDraft("");
                setError("");
                setActions(false);
              }}
            />
          ) : null}
        </View>
        {showSettings ? (
          <Card>
            <Body>
              {useLocal
                ? "Uses this Profile’s downloaded data. Calculations stay on your phone. Local model requests have a separate allowance."
                : "Questions are processed online using your cloud token allowance."}
            </Body>
            <PlanAction
              title={local ? "Use cloud when connected" : "Use on-device tools"}
              disabled={busy}
              onPress={() => {
                generation.current++;
                setMessages([]);
                setCloudConversation(false);
                setFollowUps([]);
                setGrounding(null);
                setActions(false);
                setError("");
                setViewedChatId(undefined);
                setLocal(!local);
              }}
            />
            <PlanAction
              title="Manage downloads and local AI"
              onPress={() => router.push("/offline")}
            />
          </Card>
        ) : null}
        {!messages.length ? (
          <View style={{ gap: 20, paddingTop: 32 }}>
            <Image
              source={require("../../assets/organize/clover.png")}
              style={{ width: 44, height: 44 }}
            />
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: "Poppins-SemiBold",
                fontSize: 22,
                lineHeight: 34,
                color: colors.ink,
              }}
            >
              {session.data?.firstName?.trim()
                ? `Hi ${session.data.firstName.trim()}! `
                : ""}
              Ask Clover anything about your finances.
            </Text>
            {composer}
            <View style={{ gap: 8 }}>
              {[
                "🍽️ Why is food spending up?",
                "📅 What’s due before payday?",
                "🎯 How are my goals doing?",
              ].map((prompt) => (
                <PlanAction
                  fullWidth
                  key={prompt}
                  title={prompt}
                  disabled={busy}
                  onPress={() => setDraft(prompt)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {messages.map((message, index) => (
          <View
            key={index}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: 16,
              borderRadius: 20,
              borderBottomRightRadius: message.role === "user" ? 4 : 20,
              borderBottomLeftRadius: message.role === "assistant" ? 4 : 20,
              backgroundColor:
                message.role === "user" ? colors.pale : colors.white,
              gap: 6,
            }}
          >
            <Text
              style={{
                color: colors.teal,
                fontFamily: "Poppins-SemiBold",
                fontSize: 13,
              }}
            >
              {message.role === "user" ? "You" : "Clover"}
            </Text>
            <Body muted={false}>{message.content}</Body>
            {message.visualization ? (
              <AdviserReportCard chart={message.visualization} />
            ) : null}
          </View>
        ))}
        {grounding &&
        Number.isFinite(grounding.transactionCount) &&
        messages.length ? (
          <Body>
            Data used: {grounding.transactionCount ?? 0} transactions
            {grounding.historyThrough &&
            Number.isFinite(Date.parse(grounding.historyThrough))
              ? ` · through ${new Date(grounding.historyThrough).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}`
              : ""}
          </Body>
        ) : null}
        {followUps.length && messages.length ? (
          <View style={{ gap: 8 }}>
            {followUps.map((item, index) => (
              <PlanAction
                key={`${item.id}-${index}`}
                title={`💡 ${item.label}`}
                disabled={busy}
                fullWidth
                onPress={() => setDraft(item.prompt.slice(0, 4000))}
              />
            ))}
          </View>
        ) : null}
        {busy ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.muted, fontFamily: "Poppins-Regular" }}
          >
            Clover is thinking…
          </Text>
        ) : null}
        {actions ? (
          <Notice>
            This reply includes a suggested change. No records were changed. Use
            the relevant entry or edit form to review and confirm it.
          </Notice>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
      </Screen>
      {messages.length ? (
        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          {composer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
