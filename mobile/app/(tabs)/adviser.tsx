import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Body, Card, Field, Notice, Screen } from "../../src/ui";
import { PlanAction } from "../../src/plan-ui";
import { useSession } from "../../src/session";
type Message = { role: "user" | "assistant"; content: string };
export default function Adviser() {
  const session = useSession();
  const params = useLocalSearchParams<{ prompt?: string; page?: string }>();
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
          <Body muted={false}>What would you like to understand?</Body>
          <Body>
            Ask about your spending, budgets or goals in this Profile.
          </Body>
          {[
            "Where did my money go this month?",
            "How can I stay within my budget?",
            "How am I doing on my goals?",
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
