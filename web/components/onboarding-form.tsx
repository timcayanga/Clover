"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type GoalOption = {
  value: string;
  title: string;
  description: string;
};

const GOALS: GoalOption[] = [
  {
    value: "save_more",
    title: "Save more",
    description: "Focus the app on reducing spend and spotting room to save.",
  },
  {
    value: "pay_down_debt",
    title: "Pay down debt",
    description: "Prioritize balances, payments, and money going out.",
  },
  {
    value: "track_spending",
    title: "Track spending",
    description: "Keep daily spending visible and easy to understand.",
  },
  {
    value: "build_emergency_fund",
    title: "Build an emergency fund",
    description: "Highlight consistency, cash flow, and savings progress.",
  },
  {
    value: "invest_better",
    title: "Invest better",
    description: "Keep the app centered on surplus cash and long-term growth.",
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
      <p className="eyebrow">Quick setup</p>
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
          >
            <span className="onboarding-option__title">{option.title}</span>
            <span className="onboarding-option__copy">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="onboarding-actions">
        <button className="button button-primary" type="button" disabled={isPending || goal === null} onClick={() => submit(false)}>
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
