import { askPagePrompts, type AskPageContext } from "../../../shared/ask-clover-page";
import { useKeyboardOpen } from "../../src/navigation-bar";
import { useAdaptiveLayout } from "../../src/adaptive";
import { useDetailPane } from "../../src/adaptive-detail";
import { CloverMascot } from "../../src/clover-mascot";
import { Text } from "../../src/app-text";
import { createAdviserHistoryHook } from "../../../shared/use-adviser-history";
import {
  parseAdviserChart,
  type AdviserChart,
} from "../../../shared/adviser-chart";
import { AdviserReportCard } from "../../src/adviser-report-card";
import { router, type Href } from "expo-router";
import { notificationDestination } from "../../src/notification-destination";
import * as Crypto from "expo-crypto";
import {
  askLocally,
} from "../../src/offline/local-ai";
import { AdviserInputTools } from "../../src/adviser-input-tools";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Body, Card, Icon, Notice, Screen, useTheme } from "../../src/ui";
import { PlanAction } from "../../src/plan-ui";
import { useSession } from "../../src/session";
import {
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

type SourceAction = { kind: string; id: string; label: string; href?: string };
type FollowUp = { id: string; label: string; prompt: string };
type Grounding = { transactionCount?: number; historyThrough?: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  visualization?: AdviserChart;
  sourceActions?: { id: string; label: string; destination: string }[];
};
export default function Adviser() { return <AdviserConversation />; }
export function AdviserConversation({ pageContext, embedded = false, onClose }: {pageContext?: AskPageContext; embedded?: boolean; onClose?: () => void} = {}) {
  const detailPane = useDetailPane();
  const wide = !embedded && detailPane;
  const keyboardOpen = useKeyboardOpen();
  const adaptive = useAdaptiveLayout();
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
    if (pageContext?.prompt || params.prompt) setDraft((pageContext?.prompt || params.prompt || "").slice(0, 4000));
  }, [params.prompt, pageContext?.prompt]);
  const send = async (prompt = draft) => {
    const question = prompt.trim().slice(0, 4000);
    if (inFlight.current || history.busy || !question) return;
    if (session.demo) {
      setError(
        "Sign in to ask Clover about your records. Sample mode does not send questions or financial data.",
      );
      return;
    }
    const version = generation.current;
    const next: Message[] = [
      ...messages,
      { role: "user", content: question },
    ];
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (useLocal) {
        if (pageContext && (pageContext.transactionId || pageContext.accountId || pageContext.circleId || pageContext.billId || pageContext.from || pageContext.to || ["circles", "split-bills"].includes(pageContext.page))) throw new Error("This page’s detailed records are not available to on-device tools. Connect to the internet and use cloud tools to ask about this page.");
        if (!session.offline)
          throw new Error(
            "On-device tools require an updated native build with encrypted storage.",
          );
        const reply = await askLocally(
          session.offline,
          session.profileId,
          question,
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
        actions?: SourceAction[];
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
          surface: pageContext?.page || (allowed.includes(params.page ?? "") ? params.page : "general"),
          pageLabel: pageContext?.title,
          pageContext,
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
          sourceActions: (result.actions ?? []).flatMap(action => {
            const destination = action.kind === "navigate" && action.href ? notificationDestination(action.href) : null;
            return destination ? [{ id: action.id, label: action.label, destination }] : [];
          }),
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
          pathname: "/add-transaction",
          params: { entry: `upload-${Date.now()}` },
        })
      }
    />
  );
  const historyPanel = <Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 16 }}>Your Chats</Text>
              <Pressable accessibilityRole="button" disabled={busy || history.busy} onPress={history.fresh} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: "#0066CC", fontFamily: "Poppins-Medium", fontSize: 14 }}>+ New Chat</Text>
              </Pressable>
            </View>
            {!history.conversations.length ? <Body>Your conversations will appear here.</Body> : null}
            {history.conversations.map((chat) => (
              <Pressable key={chat.id} accessibilityRole="button" disabled={busy || history.busy}
                onPress={() => void history.open(chat.id)}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 48 }}>
                <Text style={{ color: colors.ink, fontFamily: "Poppins-Medium", fontSize: 14 }}>{chat.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(chat.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
              </Pressable>
            ))}
          </Card>;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={embedded ? 0 : insets.top + 70}
    >
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column", minHeight: 0, width: "100%", maxWidth: 1440, alignSelf: "center" }}>
      <View style={{ width: wide ? 300 : "100%", maxHeight: wide ? "100%" : "40%", display: !useLocal && (wide || historyOpen) ? "flex" : "none" }}><Screen keyboardInsets={false} sheet={embedded} onDismiss={onClose}>{historyPanel}</Screen></View>
      <View style={{ flex: 1, minWidth: 0 }}>
      <Screen keyboardInsets={false} sheet={embedded} onDismiss={onClose}>
        {!useLocal && !session.demo && !wide ? (
          <PlanAction
            title="Your chats"
            disabled={busy || history.busy}
            onPress={() => setHistoryOpen(!historyOpen)}
          />
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
                ? "Uses this Profile’s downloaded data. Processing stays on your phone and does not use cloud tokens."
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
          <View style={{ gap: 16, paddingTop: embedded ? 0 : 32 }}>
            {!embedded ? <CloverMascot pose="welcome" size={128} /> : null}
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
              {embedded ? "How can I help with this page?" : "Ask Clover anything about your finances."}
            </Text>
            {composer}
            <View style={{ gap: 8 }}>
              {(pageContext ? askPagePrompts(pageContext) : [
                "🍽️ Why is food spending up?",
                "📅 What’s due before payday?",
                "🎯 How are my goals doing?",
              ]).map((prompt) => (
                <PlanAction
                  fullWidth
                  key={prompt}
                  title={prompt}
                  disabled={busy}
                  onPress={() => void send(prompt)}
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {message.role === "assistant" ? <CloverMascot pose="compact" size={28} /> : null}
            <Text
              style={{
                color: colors.teal,
                fontFamily: "Poppins-SemiBold",
                fontSize: 13,
              }}
            >
              {message.role === "user" ? "You" : "Clover"}
            </Text>
            </View>
            {!message.visualization?.spendingPlan ? <Body muted={false}>{message.content}</Body> : null}
            {message.visualization ? (
              <AdviserReportCard chart={message.visualization} />
            ) : null}
            {message.sourceActions?.map(action => (
              <PlanAction key={action.id} title={action.label} onPress={() => {
                onClose?.();
                router.push(action.destination as Href);
              }} />
            ))}
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
                onPress={() => void send(item.prompt)}
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
            paddingBottom: keyboardOpen ? 16 : (embedded ? 0 : adaptive.dockHeight) + insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          {composer}
        </View>
      ) : null}
      </View></View>
    </KeyboardAvoidingView>
  );
}
