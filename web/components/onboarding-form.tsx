"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyticsOnceKey, PostHogEvent } from "@/components/posthog-analytics";
import {
  getFinancialExperienceDefinition,
  getFinancialExperienceProfile,
  getGoalMoneyLabel,
  getGoalMoneyPrompt,
  type FinancialExperienceLevel,
  type GoalKey,
} from "@/lib/goals";

type GoalOption = {
  value: GoalKey;
  title: string;
  icon: ReactNode;
};

type ExperienceOption = {
  value: FinancialExperienceLevel;
  title: string;
  description: string;
  icon: ReactNode;
};

type StartOption = {
  value: "accounts" | "statement" | "manual" | "skip";
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  featured?: boolean;
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

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    value: "beginner",
    title: "Still learning",
    description: "Keep the language simple and show me what matters first.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8h10" />
        <path d="M7 12h10" />
        <path d="M7 16h6" />
        <path d="M10 5v14" />
      </svg>
    ),
  },
  {
    value: "comfortable",
    title: "Comfortable",
    description: "I understand budgets, statements, and goal tracking.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h16" />
        <path d="M12 4v16" />
        <path d="M7.5 7.5 16.5 16.5" />
      </svg>
    ),
  },
  {
    value: "advanced",
    title: "Very comfortable",
    description: "Give me the numbers, trends, and short explanations.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18h14" />
        <path d="M6 14l3-4 4 2 5-7" />
        <path d="M17 5h1.5V6.5" />
      </svg>
    ),
  },
];

const START_OPTIONS: StartOption[] = [
  {
    value: "statement",
    title: "Import files",
    description: "Upload a statement to unlock your dashboard, transactions, and review queue in one step.",
    href: "/dashboard?import=1",
    featured: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v10" />
        <path d="m8 7 4-4 4 4" />
        <path d="M5 13v6h14v-6" />
      </svg>
    ),
  },
  {
    value: "accounts",
    title: "Add an account",
    description: "Connect an account if you want ongoing tracking right away.",
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
    value: "manual",
    title: "Enter transactions manually",
    description: "Add a few transactions yourself if you want to start small.",
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
    description: "Jump into the dashboard and explore first.",
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
  currentExperience?: string | null;
  currentGoal?: string | null;
  currentTargetAmount?: string | null;
};

export function OnboardingForm({
  currentExperience = null,
  currentGoal = null,
  currentTargetAmount = null,
}: OnboardingFormProps) {
  const router = useRouter();
  const [experience, setExperience] = useState<FinancialExperienceLevel | null>(
    (currentExperience as FinancialExperienceLevel | null) ?? null,
  );
  const [goals, setGoals] = useState<GoalKey[]>(currentGoal ? [currentGoal as GoalKey] : []);
  const [step, setStep] = useState<"experience" | "goals" | "start">("experience");
  const [message, setMessage] = useState("How comfortable are you with financial management?");
  const [targetAmount, setTargetAmount] = useState(currentTargetAmount ?? "");
  const [isPending, startTransition] = useTransition();
  const skipOption = START_OPTIONS.find((option) => option.value === "skip");
  const selectedGoalKey: GoalKey | null = goals[0] ?? null;
  const selectedExperienceProfile = getFinancialExperienceProfile(experience);
  const selectedExperienceDefinition = getFinancialExperienceDefinition(experience);

  const completeStep = (option: StartOption) => {
    const payload = JSON.stringify({
      experience,
      goal: selectedGoalKey,
      goals,
      targetAmount: targetAmount.trim() || null,
      skipped: option.value === "skip",
      startAction: option.value,
    });
    const isStagingHost = window.location.hostname === "staging.clover.ph";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isStagingHost) {
      headers["x-staging-guest"] = "1";
    }

    startTransition(() => {
      setMessage(`Opening ${option.title.toLowerCase()}...`);
      void fetch("/api/onboarding", {
        method: "POST",
        headers,
        body: payload,
        keepalive: true,
      }).catch(() => {
        // The redirect happens immediately; this is best-effort persistence.
      });
      router.replace(option.href);
    });
  };

  return (
    <section className="glass onboarding-card">
      <PostHogEvent
        event="onboarding_started"
        onceKey={analyticsOnceKey("onboarding_started", "session")}
        properties={{
          current_goal: currentGoal ?? null,
          current_experience: currentExperience ?? null,
        }}
      />
      <div className="onboarding-card__brand" aria-label="Clover">
        <img className="onboarding-card__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
      </div>

      {step === "experience" ? (
        <>
          <h3>How comfortable are you with financial management?</h3>
          <p className="onboarding-card__copy">
            {getFinancialExperienceProfile(experience).onboardingLead}
          </p>

          <div className="onboarding-grid onboarding-grid--experience" role="list" aria-label="Financial experience">
            {EXPERIENCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`onboarding-option onboarding-option--experience ${experience === option.value ? "is-selected" : ""}`}
                onClick={() => {
                  setExperience(option.value);
                  setMessage(option.description);
                }}
                role="listitem"
                aria-pressed={experience === option.value}
              >
                <span className="onboarding-option__icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="onboarding-option__content">
                  <span className="onboarding-option__title-row">
                    <span className="onboarding-option__title">{option.title}</span>
                    {experience === option.value ? <span className="onboarding-option__badge">Selected</span> : null}
                  </span>
                  <span className="onboarding-option__copy">{option.description}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="onboarding-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={isPending || experience === null}
              onClick={() => {
                setStep("goals");
                setMessage(selectedExperienceProfile.goalsSupport);
              }}
            >
              Continue
            </button>
          </div>
        </>
      ) : step === "goals" ? (
        <>
          <h3>Welcome to Clover</h3>
          <p className="onboarding-card__copy">{selectedExperienceProfile.goalsLead}</p>

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

          {selectedGoalKey ? (
            <label className="onboarding-goal-target">
              <div className="onboarding-goal-target__header">
                <span className="onboarding-goal-target__label">{getGoalMoneyLabel(selectedGoalKey)}</span>
                <span className="onboarding-goal-target__pill">Optional</span>
              </div>
              <span className="onboarding-goal-target__prompt">{getGoalMoneyPrompt(selectedGoalKey)}</span>
              <div className="onboarding-goal-target__input-row">
                <span className="onboarding-goal-target__currency" aria-hidden="true">
                  PHP
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  value={targetAmount}
                  onChange={(event) => setTargetAmount(event.target.value)}
                  placeholder="0"
                  aria-label={getGoalMoneyLabel(selectedGoalKey)}
                />
                <span className="onboarding-goal-target__suffix">/ month</span>
              </div>
              <small>You can leave this blank and set it later on the Goals page.</small>
            </label>
          ) : null}

          <div className="onboarding-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={isPending || goals.length === 0}
              onClick={() => {
                setStep("start");
                setMessage(selectedExperienceProfile.actionStripCopy);
              }}
            >
              Continue
            </button>
            <button className="button button-secondary" type="button" disabled={isPending} onClick={() => skipOption && completeStep(skipOption)}>
              Skip for now
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={isPending}
              onClick={() => {
                setStep("experience");
                setMessage(selectedExperienceDefinition.description);
              }}
            >
              Back
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>Choose your first move</h3>
          <p className="onboarding-card__copy">{selectedExperienceProfile.actionStripCopy}</p>

          <div className="onboarding-grid onboarding-grid--start" role="list" aria-label="Getting started options">
            {START_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`onboarding-option onboarding-option--start ${option.featured ? "onboarding-option--featured" : ""}`}
                onClick={() => completeStep(option)}
                role="listitem"
                aria-label={option.title}
              >
                <span className="onboarding-option__icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="onboarding-option__content">
                  <span className="onboarding-option__title-row">
                    <span className="onboarding-option__title">{option.title}</span>
                    {option.featured ? <span className="onboarding-option__badge">Recommended</span> : null}
                  </span>
                  <span className="onboarding-option__copy">{option.description}</span>
                </span>
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
                setMessage(selectedExperienceProfile.goalsSupport);
              }}
            >
              Back
            </button>
          </div>
        </>
      )}

      {message ? <p className="onboarding-card__message">{message}</p> : null}

    </section>
  );
}
