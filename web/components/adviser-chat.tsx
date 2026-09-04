"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { trackAdviserInteraction } from "@/lib/adviser-interactions";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { AdviserPlanningDraft, AdviserPlanningSurface } from "@/lib/adviser-planning";

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
  initialPrompt?: string;
  layout?: "embedded" | "workspace";
  surface?: AdviserPlanningSurface;
};

const adviserChatStorageKey = "clover-adviser-chat-session-v1";

const planningDraftFromAction = (action: AdviserAction): AdviserPlanningDraft | null => {
  if (action.kind !== "confirm" || (action.type !== "create_budget" && action.type !== "set_goal") || !action.payload) return null;
  const isBudget = action.type === "create_budget";
  const goalLabels: Record<string, string> = {
    save_more: "Save more",
    pay_down_debt: "Pay down debt",
    track_spending: "Track spending",
    build_emergency_fund: "Build an emergency fund",
    invest_better: "Invest better",
  };
  const title = isBudget
    ? String(action.payload.name || "New budget")
    : goalLabels[String(action.payload.goal || "")] || "New goal";
  return {
    id: action.id.replace(/^planning-/, ""),
    kind: isBudget ? "budget" : "goal",
    title,
    emoji: isBudget ? (action.payload.kind === "savings_target" ? "🌱" : "💰") : "🎯",
    summary: `${String(action.payload.cadence || (isBudget ? "monthly" : "monthly")).replaceAll("_", " ")} ${isBudget ? (action.payload.kind === "savings_target" ? "savings target" : "spending limit") : "target"}`,
    payload: action.payload,
    missingFields: [],
    ready: true,
    action: action as AdviserPlanningDraft["action"],
  };
};

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

export function AdviserChat({ prompts, isPro, storageKey = adviserChatStorageKey, initialPrompt = "", layout = "embedded", surface = "general" }: AdviserChatProps) {
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
  const [planningDraft, setPlanningDraft] = useState<AdviserPlanningDraft | null>(null);
  const [planningDetailsOpen, setPlanningDetailsOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const visiblePrompts = useMemo(() => (suggestedPrompts.length > 0 ? suggestedPrompts : prompts).slice(0, 6), [prompts, suggestedPrompts]);
  const hasReachedLimit = usage !== null && !usage.unlimited && usage.remaining <= 0;
  const resetLabel = usage ? new Date(usage.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { messages?: ChatMessage[]; suggestions?: AdviserPrompt[]; grounding?: AdviserGrounding; planningDraft?: AdviserPlanningDraft };
        if (Array.isArray(parsed.messages)) {
          setMessages(parsed.messages.filter((message) => (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string").slice(-10));
        }
        if (Array.isArray(parsed.suggestions)) {
          setSuggestedPrompts(parsed.suggestions.slice(0, 6));
        }
        if (parsed.grounding) {
          setGrounding(parsed.grounding);
        }
        if (parsed.planningDraft?.kind === "budget" || parsed.planningDraft?.kind === "goal") {
          setPlanningDraft(parsed.planningDraft);
        }
      }
    } catch {
      // A private browsing mode or malformed session should not block Adviser.
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated || !initialPrompt.trim()) {
      return;
    }

    setInput((current) => current.trim() ? current : initialPrompt.trim());
  }, [initialPrompt, isHydrated]);

  useEffect(() => {
    const inputElement = inputRef.current;
    if (!inputElement) {
      return;
    }

    inputElement.style.height = "auto";
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ messages: messages.slice(-10), suggestions: suggestedPrompts.slice(0, 6), grounding, planningDraft })
      );
    } catch {
      // Session persistence is helpful but never required for chat.
    }
  }, [grounding, isHydrated, messages, planningDraft, storageKey, suggestedPrompts]);

  const scrollToBottom = () => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
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
          // Preserve a longer on-device transcript for continuity, but send
          // only the recent conversational turn window to keep request memory
          // and model input tokens bounded.
          messages: nextMessages.slice(-6),
          stream: true,
          surface,
          activeDraft: planningDraft,
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
        let streamedPlanningDraft: AdviserPlanningDraft | undefined;

        const handleEvent = (event: string) => {
          const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) {
            return;
          }
          const data = JSON.parse(dataLine.slice(6)) as { type?: string; text?: string; usage?: AdviserUsage; actions?: AdviserAction[]; suggestions?: AdviserPrompt[]; grounding?: AdviserGrounding; planningDraft?: AdviserPlanningDraft };
          if (data.type === "delta" && data.text) {
            streamedReply += data.text;
            setMessages((current) => current.map((message, index) => (index === assistantIndex ? { ...message, content: streamedReply } : message)));
          }
          if (data.type === "complete") {
            streamedActions = data.actions ?? [];
            streamedSuggestions = data.suggestions ?? [];
            streamedUsage = data.usage;
            streamedGrounding = data.grounding;
            streamedPlanningDraft = data.planningDraft;
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
        const nextDraft = streamedPlanningDraft ?? streamedActions.map(planningDraftFromAction).find(Boolean) ?? null;
        if (nextDraft) {
          setPlanningDraft(nextDraft);
          setPlanningDetailsOpen(true);
        }
        window.setTimeout(scrollToBottom, 0);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { error?: string; usage?: AdviserUsage; actions?: AdviserAction[]; suggestions?: AdviserPrompt[]; reply?: string; grounding?: AdviserGrounding; planningDraft?: AdviserPlanningDraft } | null;
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
      const responseActions = (payload.actions ?? []).slice(0, 1);
      setActions(responseActions);
      const nextDraft = payload.planningDraft ?? responseActions.map(planningDraftFromAction).find(Boolean) ?? null;
      if (nextDraft) {
        setPlanningDraft(nextDraft);
        setPlanningDetailsOpen(true);
      }
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
      const payload = (await response.json().catch(() => null)) as { error?: string; result?: { budget?: { id?: string }; goal?: unknown } } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Clover could not complete that action.");
      }

      setActions((current) => current.filter((item) => item.id !== action.id));
      if (planningDraft?.action?.id === action.id) {
        const savedHref = action.type === "create_budget" && payload?.result?.budget?.id
          ? `/budgeting?budget=${encodeURIComponent(payload.result.budget.id)}`
          : action.type === "set_goal" ? "/goals" : undefined;
        setPlanningDraft((current) => current ? {
          ...current,
          ready: false,
          action: undefined,
          savedHref,
          savedLabel: action.type === "create_budget" ? "Open budget" : "Open goal",
        } : current);
      }
      const completionMessage =
        action.type === "create_budget"
          ? "Your budget is now saved in Clover. You can ask me to adjust your plan or review how it fits your recent spending."
          : action.type === "set_goal"
            ? "Your goal is now saved in Clover. You can ask me to adjust the target or review your progress anytime."
            : `${action.label} completed. You can ask me to check the updated picture.`;
      setMessages((current) => [...current, { role: "assistant", content: completionMessage }]);
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

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void sendMessage(input);
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
    setPlanningDraft(null);
    setPlanningDetailsOpen(false);
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
      <div className={`adviser-chat adviser-chat--locked${layout === "workspace" ? " adviser-chat--workspace" : ""}`} aria-label="Ask Clover is available with Pro">
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

  const composer = (
    <form className="adviser-chat__composer" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="adviser-chat-input">
        Ask Adviser anything
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
        <textarea
          ref={inputRef}
          id="adviser-chat-input"
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask Adviser about your money..."
          disabled={hasReachedLimit}
        />
        {isSending || error ? (
          <span className={`adviser-chat__status${isSending ? " adviser-chat__status--thinking" : ""}`}>
            {isSending ? (
              <><span>Thinking</span><span className="adviser-chat__thinking-dots" aria-hidden="true"><i /><i /><i /></span></>
            ) : error}
          </span>
        ) : null}
      </div>
    </form>
  );
  const planningAmount = planningDraft ? Number(planningDraft.payload.targetAmount ?? 0) : 0;
  const planningCurrency = planningDraft ? String(planningDraft.payload.currency || "PHP").toUpperCase() : "PHP";
  const planningCadence = planningDraft
    ? String(planningDraft.payload.cadence || ((planningDraft.payload.goalPlan as Record<string, unknown> | undefined)?.cadence ?? "monthly"))
    : "monthly";
  const planningCadenceLabel = planningCadence === "annual" ? "Yearly" : planningCadence === "quarterly" ? "Quarterly" : planningCadence === "biweekly" ? "Every 2 weeks" : planningCadence.charAt(0).toUpperCase() + planningCadence.slice(1);
  const nonPlanningActions = actions.filter((action) => action.id !== planningDraft?.action?.id);

  return (
    <div className={`adviser-chat${layout === "workspace" ? " adviser-chat--workspace" : ""}${messages.length === 0 ? " adviser-chat--empty" : ""}`}>
      {layout === "embedded" || messages.length > 0 ? (
        <div className="adviser-chat__heading-row">
          {layout === "embedded" ? <p className="eyebrow adviser-chat__ask-label">Ask Clover</p> : <span />}
          {messages.length > 0 ? (
            <button type="button" className="adviser-chat__reset" onClick={startNewConversation}>
              Start fresh
            </button>
          ) : null}
        </div>
      ) : null}
      {usage && !usage.unlimited ? (
        <p className="adviser-chat__status">
          {hasReachedLimit
            ? `Your Adviser questions refresh on ${resetLabel}.`
            : `${usage.remaining} Adviser question${usage.remaining === 1 ? "" : "s"} left this month on ${usage.plan === "pro" ? "Pro" : "Free"}.`}
        </p>
      ) : null}
      {messages.length === 0 ? (
        <div className="adviser-chat__welcome">
          <Image className="adviser-chat__welcome-mark" src="/clover-mark.svg" alt="" width={42} height={42} priority />
          <div className="adviser-chat__welcome-copy">
            <h2>Make your next money move.</h2>
            <p className="adviser-chat__question-lead">Ask Adviser to compare your options, spot risks, and suggest what to do next.</p>
          </div>
          {layout === "workspace" ? composer : null}
          <div className="adviser-chat__prompt-row" aria-label="Suggested questions">
            {visiblePrompts.slice(0, 4).map((prompt) => (
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
        </div>
      ) : null}
      {messages.length > 0 ? (
        <div ref={threadRef} className="adviser-chat__thread" role="log" aria-live="polite" aria-relevant="additions text">
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
        </div>
      ) : null}

      {planningDraft ? (
        <article className={`adviser-planning-card adviser-planning-card--${planningDraft.kind}`} aria-label={`${planningDraft.title} draft`}>
          <div className="adviser-planning-card__hero">
            <span className="adviser-planning-card__emoji" aria-hidden="true">{planningDraft.emoji}</span>
            <div>
              <span className="adviser-planning-card__status">{planningDraft.savedHref ? "Saved in Clover" : planningDraft.ready ? "Ready for your review" : "Planning draft"}</span>
              <h3>{planningDraft.title}</h3>
              <p>{planningDraft.summary}</p>
            </div>
          </div>
          <div className="adviser-planning-card__amount">
            <span>{planningDraft.kind === "budget" ? "Target amount" : "Goal target"}</span>
            <strong>{planningAmount > 0 ? formatCurrencyAmount(planningAmount, planningCurrency) : "Add an amount"}</strong>
            <small>{planningCadenceLabel}</small>
          </div>
          <button
            type="button"
            className="adviser-planning-card__details-toggle"
            aria-expanded={planningDetailsOpen}
            onClick={() => setPlanningDetailsOpen((current) => !current)}
          >
            {planningDetailsOpen ? "Hide details" : "Open details"}
          </button>
          {planningDetailsOpen ? (
            <div className="adviser-planning-card__details">
              <dl>
                <div><dt>Currency</dt><dd>{planningCurrency}</dd></div>
                <div><dt>Cadence</dt><dd>{planningCadenceLabel}</dd></div>
                {planningDraft.kind === "budget" ? <div><dt>Type</dt><dd>{planningDraft.payload.kind === "savings_target" ? "Savings target" : "Spending limit"}</dd></div> : null}
              </dl>
              {planningDraft.missingFields.length > 0 ? <p>Still needed: {planningDraft.missingFields.join(" and ")}.</p> : <p>Ask Adviser to change any detail before you confirm.</p>}
            </div>
          ) : null}
          <div className="adviser-planning-card__actions">
            {planningDraft.savedHref ? <Link className="button button-primary button-small" href={planningDraft.savedHref}>{planningDraft.savedLabel ?? "Open in Clover"}</Link> : null}
            {planningDraft.action ? (
              <button
                type="button"
                className="button button-primary button-small"
                disabled={pendingActionId === planningDraft.action.id}
                onClick={() => void completeAction(planningDraft.action as AdviserAction)}
              >
                {pendingActionId === planningDraft.action.id ? "Saving..." : planningDraft.action.label}
              </button>
            ) : null}
          </div>
        </article>
      ) : null}

      {nonPlanningActions.length > 0 ? (
        <div className="adviser-chat__actions" aria-label="Suggested action">
          {nonPlanningActions.slice(0, 1).map((action) => (
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
      {messages.length > 0 || layout === "embedded" ? composer : null}
    </div>
  );
}
