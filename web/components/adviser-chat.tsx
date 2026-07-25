"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { trackAdviserInteraction } from "@/lib/adviser-interactions";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

export type AdviserPrompt = {
  id: string;
  group: string;
  label: string;
  prompt: string;
};

const getPromptEmoji = (group: string) => {
  const normalizedGroup = group.toLowerCase();
  if (normalizedGroup.includes("account")) return "🏦";
  if (normalizedGroup.includes("cash") || normalizedGroup.includes("budget")) return "💰";
  if (normalizedGroup.includes("recurr") || normalizedGroup.includes("bill")) return "🔁";
  if (normalizedGroup.includes("split") || normalizedGroup.includes("shared")) return "🤝";
  if (normalizedGroup.includes("goal")) return "🎯";
  if (normalizedGroup.includes("invest")) return "📈";
  if (normalizedGroup.includes("cleanup") || normalizedGroup.includes("quality")) return "🧹";
  if (normalizedGroup.includes("report") || normalizedGroup.includes("trend")) return "📊";
  if (normalizedGroup.includes("transaction") || normalizedGroup.includes("pattern") || normalizedGroup.includes("behavior")) return "🧾";
  return "💡";
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
  unlimited?: boolean;
};

type AdviserGrounding = {
  accountCount: number;
  transactionCount: number;
  historyThrough: string;
  freshness?: string;
  historyDays?: number;
  confidenceScore?: number;
  confidenceLabel?: string;
  mode?: string;
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
  isPro: boolean;
  storageKey?: string;
};

const adviserChatStorageKey = "clover-adviser-chat-session-v1";

const inferFeedbackGroup = (question: string) => {
  const normalized = question.toLowerCase();
  if (/goal|target|track|progress|save more|emergency fund|drift/.test(normalized)) {
    return "goals";
  }
  if (/invest|portfolio|dividend|gain|loss|snapshot|stock/.test(normalized)) {
    return "investments";
  }
  if (/uncategorized|cleanup|categor|merchant|transaction|spend|weekend|pattern|why/.test(normalized)) {
    return "behavior";
  }
  if (/bill|recurr|due|loan|balance|cash flow|budget|owe|payment|pressure|account/.test(normalized)) {
    return "cashflow";
  }
  return "cashflow";
};

export function AdviserChat({ prompts, isPro, storageKey = adviserChatStorageKey }: AdviserChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AdviserUsage | null>(null);
  const [actions, setActions] = useState<AdviserAction[]>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [grounding, setGrounding] = useState<AdviserGrounding | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<AdviserPrompt[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<number, "helpful" | "not_helpful">>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const visiblePrompts = useMemo(() => (suggestedPrompts.length > 0 ? suggestedPrompts : prompts).slice(0, 6), [prompts, suggestedPrompts]);
  const hasReachedLimit = usage !== null && !usage.unlimited && usage.remaining <= 0;
  const resetLabel = usage ? new Date(usage.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { messages?: ChatMessage[]; suggestions?: AdviserPrompt[]; grounding?: AdviserGrounding };
        if (Array.isArray(parsed.messages)) {
          setMessages(parsed.messages.filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string").slice(-10));
        }
        if (Array.isArray(parsed.suggestions)) {
          setSuggestedPrompts(parsed.suggestions.slice(0, 6));
        }
        if (parsed.grounding) {
          setGrounding(parsed.grounding);
        }
      }
    } catch {
      // A private browsing mode or malformed session should not block Adviser.
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ messages: messages.slice(-10), suggestions: suggestedPrompts.slice(0, 6), grounding })
      );
    } catch {
      // Session persistence is helpful but never required for chat.
    }
  }, [grounding, isHydrated, messages, storageKey, suggestedPrompts]);

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
    setActions([]);
    capturePostHogClientEvent("adviser_question_asked", {
      prompt_source: prompts.some((prompt) => prompt.prompt === trimmed) ? "suggested_prompt" : "custom",
      message_length_bucket: trimmed.length < 40 ? "short" : trimmed.length < 160 ? "medium" : "long",
    });
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
        let streamedSuggestions: AdviserPrompt[] = [];
        let streamedUsage: AdviserUsage | undefined;
        let streamedGrounding: AdviserGrounding | undefined;

        const handleEvent = (event: string) => {
          const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) {
            return;
          }
          const data = JSON.parse(dataLine.slice(6)) as { type?: string; text?: string; usage?: AdviserUsage; actions?: AdviserAction[]; suggestions?: AdviserPrompt[]; grounding?: AdviserGrounding };
          if (data.type === "delta" && data.text) {
            streamedReply += data.text;
            setMessages((current) => current.map((message, index) => (index === assistantIndex ? { ...message, content: streamedReply } : message)));
          }
          if (data.type === "complete") {
            streamedActions = data.actions ?? [];
            streamedSuggestions = data.suggestions ?? [];
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
        if (streamedSuggestions.length > 0) {
          setSuggestedPrompts(streamedSuggestions);
        }
        setActions(streamedActions.slice(0, 1));
        window.setTimeout(scrollToBottom, 0);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { error?: string; usage?: AdviserUsage; actions?: AdviserAction[]; suggestions?: AdviserPrompt[]; reply?: string; grounding?: AdviserGrounding } | null;
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
      if (payload.suggestions?.length) {
        setSuggestedPrompts(payload.suggestions);
      }

      const reply = payload.reply?.trim() || "I could not generate a response just now.";

      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      setActions((payload.actions ?? []).slice(0, 1));
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
      capturePostHogClientEvent("adviser_action_completed", {
        action_type: action.type,
      });
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

  const sendSuggestedPrompt = (prompt: AdviserPrompt) => {
    trackAdviserInteraction({
      kind: "prompt",
      group: prompt.group,
      itemId: prompt.id,
      label: prompt.label,
      pathname: window.location.pathname,
    });
    void sendMessage(prompt.prompt);
  };

  const startNewConversation = () => {
    setMessages([]);
    setActions([]);
    setSuggestedPrompts([]);
    setFeedbackByMessage({});
    setGrounding(null);
    setError(null);
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures; the visible conversation is still cleared.
    }
  };

  const submitFeedback = (messageIndex: number, rating: "helpful" | "not_helpful") => {
    setFeedbackByMessage((current) => ({ ...current, [messageIndex]: rating }));
    const sourceQuestion = [...messages.slice(0, messageIndex)].reverse().find((message) => message.role === "user")?.content ?? "";
    void fetch("/api/adviser/interaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "feedback",
        group: inferFeedbackGroup(sourceQuestion),
        itemId: `message-${messageIndex}`,
        label: "Ask Clover answer",
        rating,
        pathname: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => null);
  };

  if (!isPro) {
    return (
      <div className="adviser-chat adviser-chat--locked" aria-label="Ask Clover is available with Pro">
        <div className="adviser-chat__locked-preview" aria-hidden="true">
          <div className="adviser-chat__composer-bar">
            <input type="text" value="Ask Clover a question about your money..." readOnly tabIndex={-1} />
            <button type="button" className="button button-primary button-small" disabled>
              Send
            </button>
          </div>
          <div className="adviser-chat__prompt-row">
            {prompts.slice(0, 3).map((prompt) => (
              <span key={prompt.id} className="adviser-chat__prompt">
                <span className="adviser-chat__prompt-emoji">{getPromptEmoji(prompt.group)}</span>
                <span>{prompt.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="adviser-chat__locked-copy">
          <p className="eyebrow">Pro feature</p>
          <h3>Ask Clover about your money</h3>
          <p>Get personalized answers grounded in your accounts, transactions, goals, and recurring bills.</p>
          <Link className="button button-primary button-small" href="/pricing">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="adviser-chat">
      <div className="adviser-chat__heading-row">
        <p className="eyebrow adviser-chat__ask-label">Ask Clover</p>
        {messages.length > 0 ? (
          <button type="button" className="adviser-chat__reset" onClick={startNewConversation}>
            Start fresh
          </button>
        ) : null}
      </div>
      {usage && !usage.unlimited ? (
        <p className="adviser-chat__status">
          {hasReachedLimit
            ? `Your Adviser questions refresh on ${resetLabel}.`
            : `${usage.remaining} Adviser question${usage.remaining === 1 ? "" : "s"} left this month on ${usage.plan === "pro" ? "Pro" : "Free"}.`}
        </p>
      ) : null}
      {messages.length === 0 ? (
        <>
          <p className="adviser-chat__question-lead">Try one of these, or ask in your own words.</p>
          <div className="adviser-chat__prompt-row" aria-label="Suggested questions">
            {visiblePrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                className="adviser-chat__prompt"
                disabled={hasReachedLimit || isSending}
                onClick={() => sendSuggestedPrompt(prompt)}
              >
                <span className="adviser-chat__prompt-emoji" aria-hidden="true">{getPromptEmoji(prompt.group)}</span>
                <span>{prompt.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      {messages.length > 0 ? (
        <div className="adviser-chat__thread" role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`adviser-chat__message adviser-chat__message--${message.role}`}
            >
              <p>{message.content}</p>
              {message.role === "assistant" && message.content.trim() ? (
                <div className="adviser-chat__feedback" aria-label="Rate this answer">
                  <span>Was this useful?</span>
                  <button
                    type="button"
                    className={feedbackByMessage[index] === "helpful" ? "is-selected" : ""}
                    aria-label="This answer was helpful"
                    aria-pressed={feedbackByMessage[index] === "helpful"}
                    onClick={() => submitFeedback(index, "helpful")}
                  >
                    Helpful
                  </button>
                  <button
                    type="button"
                    className={feedbackByMessage[index] === "not_helpful" ? "is-selected" : ""}
                    aria-label="This answer was not helpful"
                    aria-pressed={feedbackByMessage[index] === "not_helpful"}
                    onClick={() => submitFeedback(index, "not_helpful")}
                  >
                    Not quite
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="adviser-chat__actions" aria-label="Suggested action">
          {actions.slice(0, 1).map((action) => (
            <button
              key={action.id}
              type="button"
              className="button button-primary button-small adviser-chat__action"
              disabled={pendingActionId === action.id}
              onClick={() => void completeAction(action)}
            >
              {pendingActionId === action.id ? "Saving..." : action.label}
            </button>
          ))}
        </div>
      ) : null}
      <form className="adviser-chat__composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="adviser-chat-input">
          Ask Clover anything
        </label>
        {messages.length > 0 && visiblePrompts.length > 0 ? (
          <div className="adviser-chat__bottom-prompts" aria-label="Suggested follow-up questions">
            {visiblePrompts.slice(0, 3).map((prompt) => (
              <button
                key={`bottom-${prompt.id}`}
                type="button"
                className="adviser-chat__prompt"
                disabled={hasReachedLimit || isSending}
                onClick={() => sendSuggestedPrompt(prompt)}
              >
                <span className="adviser-chat__prompt-emoji" aria-hidden="true">{getPromptEmoji(prompt.group)}</span>
                <span>{prompt.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="adviser-chat__composer-bar">
          <input
            id="adviser-chat-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your money..."
            disabled={hasReachedLimit}
          />
          <button type="submit" className="button button-primary button-small" disabled={hasReachedLimit || isSending || input.trim().length === 0}>
            {isSending ? "Sending" : "Send"}
          </button>
          {isSending || error ? <span className="adviser-chat__status">{isSending ? "Thinking..." : error}</span> : null}
        </div>
      </form>
    </div>
  );
}
