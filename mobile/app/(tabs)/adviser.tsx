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
import { Body, Card, Field, Notice, Screen } from "../../src/ui";
import { PlanAction } from "../../src/plan-ui";
import { useSession } from "../../src/session";
type Message = { role: "user" | "assistant"; content: string };
export default function Adviser() {
  const session = useSession();
  const params = useLocalSearchParams<{ prompt?: string; page?: string }>();
  const [local, setLocal] = useState(false);
  const useLocal = local || !session.offlineStatus.online;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState(false);
  const generation = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setMessages([]);
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
    if (inFlight.current || !draft.trim()) return;
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
        setMessages([...next, { role: "assistant", content: reply }]);
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
      }>(`adviser/chat?workspaceId=${encodeURIComponent(session.profileId)}`, {
        method: "POST",
        body: JSON.stringify({
          messages: next
            .slice(-6)
            .map((m) => ({ ...m, content: m.content.slice(0, 4000) })),
          page: allowed.includes(params.page ?? "") ? params.page : "general",
          clientDate: new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Manila",
          }),
        }),
      });
      if (version !== generation.current) return;
      setMessages([...next, { role: "assistant", content: result.reply }]);
      setDraft("");
      setActions(Boolean(result.hasActions || result.entryDraft));
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
  return (
    <Screen>
      <Card>
        <Body muted={false}>
          {useLocal ? "On-device · Downloaded records" : "Cloud Adviser"}
        </Body>
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
            setActions(false);
            setLocal(!local);
          }}
        />
        <PlanAction
          title="Manage downloads and local AI"
          onPress={() => router.push("/offline")}
        />
      </Card>
      <PlanAction
        title="New chat"
        disabled={busy}
        onPress={() => {
          setMessages([]);
          setDraft("");
          setError("");
          setActions(false);
        }}
      />
      {!messages.length ? (
        <Card>
          <Body muted={false}>Ask Clover anything about your finances.</Body>
          {[
            "📊 Where did my money go this month?",
            "💰 How can I stay within my budget?",
            "🎯 How am I doing on my goals?",
          ].map((prompt) => (
            <PlanAction
              key={prompt}
              title={prompt}
              onPress={() => setDraft(prompt)}
            />
          ))}
        </Card>
      ) : null}
      {messages.map((message, index) => (
        <Card key={index}>
          <Body muted={false}>
            {message.role === "user" ? "You" : "Clover"}
          </Body>
          <Body>{message.content}</Body>
        </Card>
      ))}
      {actions ? (
        <Notice>
          This reply includes a suggested change. No records were changed. Use
          the relevant entry or edit form to review and confirm it.
        </Notice>
      ) : null}
      <Field
        label="Ask Clover"
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={4000}
        editable={!busy}
      />
      <AdviserInputTools
        onDeviceOnly={useLocal}
        disabled={busy}
        onText={(text) =>
          setDraft((previous) => `${previous} ${text}`.trim().slice(0, 4000))
        }
        onPhoto={() => router.push("/(tabs)/add")}
      />
      {error ? <Notice>{error}</Notice> : null}
      <PlanAction
        title={busy ? "Thinking…" : "Send question"}
        tone="primary"
        disabled={busy || !draft.trim()}
        onPress={() => void send()}
      />
    </Screen>
  );
}
