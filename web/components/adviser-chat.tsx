"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { trackAdviserInteraction } from "@/lib/adviser-interactions";

type AdviserPrompt = {
  id: string;
  group: string;
  label: string;
  prompt: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AdviserUsage = {
  plan: "free" | "pro";
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

type AdviserGrounding = {
  accountCount: number;
  transactionCount: number;
  historyThrough: string;
  recurringCount: number;
  budgetCount: number;
  investmentSnapshotAvailable: boolean;
};

type AdviserAction = {
  id: string;
  kind: "navigate" | "confirm";
  type: string;
  label: string;
  description: string;
  href?: string;
  payload?: Record<string, unknown>;
};

type AdviserChatProps = {
  prompts: AdviserPrompt[];
};

const actionDetails = (action: AdviserAction) =>
  Object.entries(action.payload ?? {})
    .filter(([key, value]) => key !== "workspaceId" && value !== null && value !== undefined && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" • ");

export function AdviserChat({ prompts }: AdviserChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AdviserUsage | null>(null);
  const [actions, setActions] = useState<AdviserAction[]>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [grounding, setGrounding] = useState<AdviserGrounding | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const visiblePrompts = useMemo(() => prompts.slice(0, 4), [prompts]);
  const hasReachedLimit = usage !== null && usage.remaining <= 0;
  const resetLabel = usage ? new Date(usage.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) {
      return;
    }

    setError(null);
    setIsSending(true);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");

    try {
      const response = await fetch("/api/adviser/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages,
          stream: true,
        }),
      });

      if (response.ok && response.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Clover did not return a readable Adviser response.");
        }

        const assistantIndex = nextMessages.length;
        setMessages((current) => [...current, { role: "assistant", content: "" }]);
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedReply = "";
        let streamedActions: AdviserAction[] = [];
        let streamedUsage: AdviserUsage | undefined;
        let streamedGrounding: AdviserGrounding | undefined;

        const handleEvent = (event: string) => {
          const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) {
            return;
          }
          const data = JSON.parse(dataLine.slice(6)) as { type?: string; text?: string; usage?: AdviserUsage; actions?: AdviserAction[]; grounding?: AdviserGrounding };
          if (data.type === "delta" && data.text) {
            streamedReply += data.text;
            setMessages((current) => current.map((message, index) => (index === assistantIndex ? { ...message, content: streamedReply } : message)));
          }
          if (data.type === "complete") {
            streamedActions = data.actions ?? [];
            streamedUsage = data.usage;
            streamedGrounding = data.grounding;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          events.forEach(handleEvent);
          if (done) {
            break;
          }
        }

        if (streamedUsage) {
          setUsage(streamedUsage);
        }
        if (streamedGrounding) {
          setGrounding(streamedGrounding);
        }
        setActions((current) => [...current, ...streamedActions]);
        window.setTimeout(scrollToBottom, 0);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { error?: string; usage?: AdviserUsage; actions?: AdviserAction[]; reply?: string; grounding?: AdviserGrounding } | null;
      if (payload?.usage) {
        setUsage(payload.usage);
      }

      if (!payload) {
        throw new Error("Clover did not return an Adviser response.");
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to get a response from Adviser.");
      }

      if (payload.grounding) {
        setGrounding(payload.grounding);
      }

      const reply = payload.reply?.trim() || "I could not generate a response just now.";

      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      setActions((current) => [...current, ...(payload.actions ?? [])]);
      window.setTimeout(scrollToBottom, 0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to get a response from Adviser.");
    } finally {
      setIsSending(false);
    }
  };

  const completeAction = async (action: AdviserAction) => {
    if (action.kind === "navigate" && action.href) {
      window.location.href = action.href;
      return;
    }

    if (action.kind !== "confirm" || !action.payload) {
      return;
    }

    setError(null);
    if (pendingActionId) {
      return;
    }
    setPendingActionId(action.id);
    try {
      const response = await fetch("/api/adviser/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; result?: unknown } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Clover could not complete that action.");
      }

      setActions((current) => current.filter((item) => item.id !== action.id));
      setMessages((current) => [...current, { role: "assistant", content: `${action.label} completed. You can ask me to check the updated picture.` }]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Clover could not complete that action.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(input);
  };

  return (
    <div className="adviser-chat">
      {usage ? (
        <p className="adviser-chat__status">
          {hasReachedLimit
            ? `Your Adviser questions refresh on ${resetLabel}.`
            : `${usage.remaining} Adviser question${usage.remaining === 1 ? "" : "s"} left this month on ${usage.plan === "pro" ? "Pro" : "Free"}.`}
        </p>
      ) : null}
      <form className="adviser-chat__composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="adviser-chat-input">
          Ask Clover anything
        </label>
        <div className="adviser-chat__composer-bar">
          <input
            id="adviser-chat-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Clover a question about your money..."
            disabled={hasReachedLimit}
          />
          <button type="submit" className="button button-primary button-small" disabled={hasReachedLimit || isSending || input.trim().length === 0}>
            {isSending ? "Sending" : "Send"}
          </button>
          {isSending || error ? <span className="adviser-chat__status">{isSending ? "Thinking..." : error}</span> : null}
        </div>
      </form>

      <div className="adviser-chat__prompt-row" aria-label="Suggested questions">
        {visiblePrompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            className="adviser-chat__prompt"
            disabled={hasReachedLimit || isSending}
            onClick={() => {
              trackAdviserInteraction({
                kind: "prompt",
                group: prompt.group,
                itemId: prompt.id,
                label: prompt.label,
                pathname: window.location.pathname,
              });
              void sendMessage(prompt.prompt);
            }}
          >
            {prompt.label}
          </button>
        ))}
      </div>
      {grounding ? (
        <p className="adviser-chat__status">
          Based on {grounding.transactionCount.toLocaleString()} transactions across {grounding.accountCount} account{grounding.accountCount === 1 ? "" : "s"}, through {new Date(grounding.historyThrough).toLocaleDateString()}.
        </p>
      ) : null}

      {messages.length > 0 ? (
        <div className="adviser-chat__thread" role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`adviser-chat__message adviser-chat__message--${message.role}`}
            >
              <span>{message.role === "user" ? "You" : "Clover"}</span>
              <p>{message.content}</p>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="adviser-chat__thread" aria-label="Clover actions">
          {actions.map((action) => (
            <article key={action.id} className="adviser-chat__message adviser-chat__message--assistant">
              <span>{action.kind === "confirm" ? "Confirmation" : "Clover"}</span>
              <strong>{action.label}</strong>
              <p>{action.description}</p>
              {action.kind === "confirm" && actionDetails(action) ? <p>{actionDetails(action)}</p> : null}
              <button type="button" className="button button-primary button-small" disabled={pendingActionId === action.id} onClick={() => void completeAction(action)}>
                {pendingActionId === action.id ? "Saving" : action.kind === "confirm" ? "Confirm" : "Open"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
