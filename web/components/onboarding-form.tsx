"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type GoalOption = {
  value: string;
  title: string;
  description: string;
  icon: ReactNode;
};

const GOALS: GoalOption[] = [
  {
    value: "save_more",
    title: "Save more",
    description: "Focus the app on reducing spend and spotting room to save.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16" />
        <path d="M17 9.5c0-2.2-2.2-4-5-4s-5 1.5-5 3.5 1.9 3.1 5 3.6 5 1.5 5 3.6S14.2 20 12 20s-5-1.8-5-4" />
      </svg>
    ),
  },
  {
    value: "pay_down_debt",
    title: "Pay down debt",
    description: "Prioritize balances, payments, and money going out.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7h10" />
        <path d="M7 17h10" />
        <path d="M9 7l6 10" />
        <path d="M15 7l-6 10" />
      </svg>
    ),
  },
  {
    value: "track_spending",
    title: "Track spending",
    description: "Keep daily spending visible and easy to understand.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="M12 5v14" />
        <path d="M7.5 7.5 16.5 16.5" />
      </svg>
    ),
  },
  {
    value: "build_emergency_fund",
    title: "Build an emergency fund",
    description: "Highlight consistency, cash flow, and savings progress.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5v17" />
        <path d="M8.5 7.5h7" />
        <path d="M8 15.5h8" />
        <path d="M7 10.5c0-2.2 2.2-4 5-4s5 1.8 5 4-2.2 4-5 4-5 1.8-5 4" />
      </svg>
    ),
  },
  {
    value: "invest_better",
    title: "Invest better",
    description: "Keep the app centered on surplus cash and long-term growth.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 18h12" />
        <path d="M8 14l3-3 2 2 5-6" />
        <path d="M17 7h1.5V8.5" />
      </svg>
    ),
  },
];

type OnboardingFormProps = {
  currentGoal?: string | null;
};

export function OnboardingForm({ currentGoal = null }: OnboardingFormProps) {
  const router = useRouter();
  const [goal, setGoal] = useState<string | null>(currentGoal);
  const [message, setMessage] = useState("Choose the goal that matters most right now.");
  const [isPending, startTransition] = useTransition();

  const submit = (skipped: boolean) => {
    const saveOnboarding = async () => {
      setMessage(skipped ? "Skipping for now..." : "Saving your preference...");

      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, skipped }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error || "Unable to save onboarding right now.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    };

    startTransition(() => {
      void saveOnboarding();
    });
  };

  return (
    <section className="glass onboarding-card">
      <h3>What do you want Clover to help you with first?</h3>
      <p className="onboarding-card__copy">
        Pick one goal and we’ll tune the first experience around it. You can change this later.
      </p>

      <div className="onboarding-grid" role="list" aria-label="Financial goals">
        {GOALS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`onboarding-option ${goal === option.value ? "is-selected" : ""}`}
            onClick={() => setGoal(option.value)}
            role="listitem"
            aria-pressed={goal === option.value}
          >
            <span className="onboarding-option__icon" aria-hidden="true">
              {option.icon}
            </span>
            <span className="onboarding-option__content">
              <span className="onboarding-option__title">{option.title}</span>
              <span className="onboarding-option__copy">{option.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="onboarding-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={isPending || goal === null}
          onClick={() => submit(false)}
        >
          Continue
        </button>
        <button className="button button-secondary" type="button" disabled={isPending} onClick={() => submit(true)}>
          Skip for now
        </button>
      </div>

      <p className="onboarding-status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
