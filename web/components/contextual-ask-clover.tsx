"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AdviserChat, type AdviserPrompt } from "@/components/adviser-chat";
import { hasFullFeatureAccess } from "@/lib/beta-access";

type AskCloverContext = "accounts" | "transactions" | "recurring";
type PlanTier = "free" | "pro" | "unknown";

type ContextualAskCloverProps = {
  context: AskCloverContext;
  planTier?: PlanTier;
};

const contextCopy: Record<
  AskCloverContext,
  {
    label: string;
    title: string;
    prompts: AdviserPrompt[];
  }
> = {
  accounts: {
    label: "Ask Clover about your accounts",
    title: "Your accounts",
    prompts: [
      {
        id: "accounts-cash-position",
        group: "accounts",
        label: "How much cash do I actually have?",
        prompt: "Looking across my Clover accounts, how much cash do I actually have and what part of it is safe to use?",
      },
      {
        id: "accounts-bill-cover",
        group: "cashflow",
        label: "Can my accounts cover upcoming bills?",
        prompt: "Can my current account balances cover my known upcoming bills and recurring payments? Show me the important numbers.",
      },
      {
        id: "accounts-concentration",
        group: "accounts",
        label: "Where is my balance concentrated?",
        prompt: "Where is my balance concentrated across my Clover accounts, and is there anything worth reviewing?",
      },
      {
        id: "accounts-safe-spend",
        group: "cashflow",
        label: "What can I safely spend?",
        prompt: "Based on my accounts, upcoming commitments, goals, and recommended buffer, what can I safely spend right now?",
      },
    ],
  },
  transactions: {
    label: "Ask Clover about your transactions",
    title: "Your transactions",
    prompts: [
      {
        id: "transactions-pattern",
        group: "behavior",
        label: "What spending pattern stands out?",
        prompt: "What is the most useful spending pattern in my Clover transactions right now? Explain it with specific figures.",
      },
      {
        id: "transactions-cleanup",
        group: "cleanup",
        label: "What needs a quick cleanup?",
        prompt: "Which of my transactions most need categorization, review, or cleanup, and why?",
      },
      {
        id: "transactions-change",
        group: "trend",
        label: "Why is my spending changing?",
        prompt: "How has my spending changed across the transaction history Clover has, and what is driving that change?",
      },
      {
        id: "transactions-unusual",
        group: "transactions",
        label: "Find unusual transactions",
        prompt: "Find unusual or outlier transactions in my Clover history and tell me which ones are worth checking first.",
      },
    ],
  },
  recurring: {
    label: "Ask Clover about your recurring transactions",
    title: "Your recurring transactions",
    prompts: [
      {
        id: "recurring-due-soon",
        group: "recurring",
        label: "What is due soon?",
        prompt: "What recurring payments, debts, installments, or reminders are due soon, and how much should I keep available?",
      },
      {
        id: "recurring-cover",
        group: "cashflow",
        label: "Can I cover upcoming bills?",
        prompt: "Can my available account balances cover my upcoming recurring commitments? Show the expected pressure and remaining buffer.",
      },
      {
        id: "recurring-change",
        group: "recurring",
        label: "Which recurring cost changed?",
        prompt: "Have any of my recurring costs changed or become unusual compared with their history?",
      },
      {
        id: "recurring-review",
        group: "bills",
        label: "What could I review or cancel?",
        prompt: "Which recurring costs are most worth reviewing, reducing, or cancelling based on my Clover data?",
      },
    ],
  },
};

export function ContextualAskClover({ context, planTier = "unknown" }: ContextualAskCloverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPlanTier, setResolvedPlanTier] = useState<PlanTier>(planTier);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const copy = contextCopy[context];

  useEffect(() => {
    if (planTier !== "unknown") {
      setResolvedPlanTier(planTier);
    }
  }, [planTier]);

  useEffect(() => {
    if (!isOpen || resolvedPlanTier !== "unknown") {
      return;
    }

    const controller = new AbortController();
    void fetch("/api/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load plan");
        }
        const payload = (await response.json()) as { user?: { planTier?: string } };
        setResolvedPlanTier(payload.user?.planTier === "pro" ? "pro" : "free");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResolvedPlanTier("free");
        }
      });

    return () => controller.abort();
  }, [isOpen, resolvedPlanTier]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const closePanel = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <span className="contextual-ask-clover">
      <button
        ref={triggerRef}
        type="button"
        className="contextual-ask-clover__trigger"
        aria-label={copy.label}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Image
          src="/assets/3d%20icons/adviser.png?v=20260725"
          alt=""
          width={96}
          height={96}
          className="contextual-ask-clover__icon"
          aria-hidden="true"
        />
        <span className="contextual-ask-clover__tooltip" role="tooltip">
          {copy.label}
        </span>
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="contextual-ask-clover__dismiss-layer"
                aria-label="Close Ask Clover"
                tabIndex={-1}
                onClick={closePanel}
              />
              <section
                ref={panelRef}
                className="contextual-ask-clover__panel"
                role="dialog"
                aria-modal="false"
                aria-labelledby={titleId}
                tabIndex={-1}
              >
                <header className="contextual-ask-clover__panel-header">
                  <div className="contextual-ask-clover__panel-title">
                    <Image src="/assets/3d%20icons/adviser.png?v=20260725" alt="" width={96} height={96} aria-hidden="true" />
                    <div>
                      <p className="eyebrow">Ask Clover</p>
                      <h2 id={titleId}>{copy.title}</h2>
                    </div>
                  </div>
                  <button type="button" className="contextual-ask-clover__close" aria-label="Close Ask Clover" onClick={closePanel}>
                    <span aria-hidden="true">×</span>
                  </button>
                </header>
                <div className="contextual-ask-clover__chat">
                  {resolvedPlanTier === "unknown" ? (
                    <p className="contextual-ask-clover__loading" role="status">
                      Getting Ask Clover ready...
                    </p>
                  ) : (
                    <AdviserChat
                      prompts={copy.prompts}
                      isPro={hasFullFeatureAccess(resolvedPlanTier)}
                      storageKey={`clover-adviser-chat-${context}-v1`}
                    />
                  )}
                </div>
              </section>
            </>,
            document.body
          )
        : null}
    </span>
  );
}
