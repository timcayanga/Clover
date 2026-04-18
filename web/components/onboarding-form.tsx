"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type GoalOption = {
  value: string;
  title: string;
  icon: ReactNode;
};

type StartOption = {
  value: "accounts" | "statement" | "manual" | "skip";
  title: string;
  icon: ReactNode;
  href: string;
};

const GOALS: GoalOption[] = [
  {
    value: "save_more",
    title: "Save more",
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
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 18h12" />
        <path d="M8 14l3-3 2 2 5-6" />
        <path d="M17 7h1.5V8.5" />
      </svg>
    ),
  },
];

const START_OPTIONS: StartOption[] = [
  {
    value: "accounts",
    title: "Add an account",
    href: "/accounts",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h16" />
        <path d="M6 5v14" />
        <path d="M6 17h12" />
        <path d="M12 11v6" />
        <path d="M9 14h6" />
      </svg>
    ),
  },
  {
    value: "statement",
    title: "Upload a statement",
    href: "/imports",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v10" />
        <path d="m8 7 4-4 4 4" />
        <path d="M5 13v6h14v-6" />
      </svg>
    ),
  },
  {
    value: "manual",
    title: "Enter manually",
    href: "/transactions",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h10l4 4v10H5z" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </svg>
    ),
  },
  {
    value: "skip",
    title: "Skip for now",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    ),
  },
];

type OnboardingFormProps = {
  currentGoal?: string | null;
};

export function OnboardingForm({ currentGoal = null }: OnboardingFormProps) {
  const router = useRouter();
  const [goals, setGoals] = useState<string[]>(currentGoal ? [currentGoal] : []);
  const [step, setStep] = useState<"goals" | "start">("goals");
  const [selectedStart, setSelectedStart] = useState<StartOption["value"] | null>(null);
  const [message, setMessage] = useState("Choose one or more goals to shape your first experience.");
  const [isPending, startTransition] = useTransition();

  const submit = (skipped: boolean) => {
    const payload = JSON.stringify({ goal: goals[0] ?? null, goals, skipped, startAction: selectedStart });
    const isStagingHost = window.location.hostname === "staging.clover.ph";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isStagingHost) {
      headers["x-staging-guest"] = "1";
    }

    startTransition(() => {
      setMessage(skipped ? "Skipping for now..." : "Saving your preference...");
      void fetch("/api/onboarding", {
        method: "POST",
        headers,
        body: payload,
        keepalive: true,
      }).catch(() => {
        // The redirect happens immediately; this is best-effort persistence.
      });
      const nextRoute = START_OPTIONS.find((option) => option.value === selectedStart)?.href ?? "/dashboard";
      router.replace(nextRoute);
    });
  };

  return (
    <section className="glass onboarding-card">
      <div className="onboarding-card__brand" aria-label="Clover">
        <img className="onboarding-card__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
      </div>

      {step === "goals" ? (
        <>
          <h3>What do you want Clover to help you with first?</h3>
          <p className="onboarding-card__copy">Pick one or more goals and we’ll tune the first experience around them.</p>

          <div className="onboarding-grid" role="list" aria-label="Financial goals">
            {GOALS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`onboarding-option ${goals.includes(option.value) ? "is-selected" : ""}`}
                onClick={() => {
                  setGoals((current) =>
                    current.includes(option.value)
                      ? current.filter((item) => item !== option.value)
                      : [...current, option.value],
                  );
                }}
                role="listitem"
                aria-pressed={goals.includes(option.value)}
              >
                <span className="onboarding-option__icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="onboarding-option__title">{option.title}</span>
              </button>
            ))}
          </div>

          <div className="onboarding-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={isPending || goals.length === 0}
              onClick={() => {
                setSelectedStart(null);
                setStep("start");
                setMessage("How would you like to get started?");
              }}
            >
              Continue
            </button>
            <button className="button button-secondary" type="button" disabled={isPending} onClick={() => submit(true)}>
              Skip for now
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>How would you like to get started?</h3>
          <p className="onboarding-card__copy">
            Choose the first thing you want to do. You can always come back and do the rest later.
          </p>

          <div className="onboarding-grid onboarding-grid--start" role="list" aria-label="Getting started options">
            {START_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`onboarding-option onboarding-option--start ${selectedStart === option.value ? "is-selected" : ""}`}
                onClick={() => setSelectedStart(option.value)}
                role="listitem"
                aria-pressed={selectedStart === option.value}
              >
                <span className="onboarding-option__icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="onboarding-option__title">{option.title}</span>
              </button>
            ))}
          </div>

          <div className="onboarding-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={isPending}
              onClick={() => {
                setStep("goals");
                setMessage("Choose one or more goals to shape your first experience.");
              }}
            >
              Back
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={isPending || selectedStart === null}
              onClick={() => submit(false)}
            >
              Continue
            </button>
          </div>
        </>
      )}

      <p className="onboarding-status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
