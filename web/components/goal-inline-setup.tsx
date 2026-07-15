"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalDefinition, GoalKey } from "@/lib/goals";
import { formatCurrencyAmount } from "@/lib/currency-format";

type GoalInlineSetupProps = {
  goals: GoalDefinition[];
  suggestedTargetAmount: number | null;
  monthlyIncome: number | null;
  currency: string;
};

const goalEmojis: Record<GoalKey, string> = {
  save_more: "🌱",
  pay_down_debt: "🧭",
  track_spending: "🔎",
  build_emergency_fund: "🛡️",
  invest_better: "📈",
};

const parseAmount = (value: string) => {
  const match = value.match(/(?:₱|php|p)?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount * (match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2]?.toLowerCase() === "k" ? 1_000 : 1);
};

const detectGoal = (value: string): GoalKey | null => {
  const text = value.toLowerCase();
  if (/invest|portfolio|stocks|fund/.test(text)) return "invest_better";
  if (/debt|loan|credit card/.test(text)) return "pay_down_debt";
  if (/emergency|buffer|rainy day/.test(text)) return "build_emergency_fund";
  if (/spend|track|overspend/.test(text)) return "track_spending";
  if (/save|car|vehicle|house|home|school|tuition|travel|trip|phone|laptop/.test(text)) return "save_more";
  return null;
};

export function GoalInlineSetup({ goals, suggestedTargetAmount, monthlyIncome, currency }: GoalInlineSetupProps) {
  const router = useRouter();
  const availableGoals = useMemo(() => goals.filter((goal) => goal.value !== "track_spending"), [goals]);
  const [selectedGoal, setSelectedGoal] = useState<GoalKey>(availableGoals[0]?.value ?? "save_more");
  const [intent, setIntent] = useState("");
  const [targetAmount, setTargetAmount] = useState(suggestedTargetAmount ? String(Math.round(suggestedTargetAmount)) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vagueTargetSuggestion = intent.trim()
    && parseAmount(intent) === null
    && /car|vehicle|house|home|school|tuition|travel|trip|phone|laptop/.test(intent.toLowerCase())
    && suggestedTargetAmount
    ? `Clover suggests starting at ${formatCurrencyAmount(Math.round(suggestedTargetAmount), currency)}. Adjust it before saving.`
    : null;

  const handleIntentChange = (value: string) => {
    setIntent(value);
    const detectedGoal = detectGoal(value);
    const detectedAmount = parseAmount(value);
    if (detectedGoal && availableGoals.some((goal) => goal.value === detectedGoal)) setSelectedGoal(detectedGoal);
    if (detectedAmount !== null) setTargetAmount(String(detectedAmount));
  };

  const save = async () => {
    const amount = Number(targetAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Add a target amount so Clover can build your roadmap.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: selectedGoal,
          targetAmount: amount.toFixed(2),
          goalPlan: {
            goalKey: selectedGoal,
            targetMode: "amount",
            cadence: "monthly",
            targetAmount: amount,
            targetPercent: null,
            purpose: intent.trim() || null,
          },
        }),
      });
      if (!response.ok) throw new Error("Unable to save goal");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save goal");
      setSaving(false);
    }
  };

  return (
    <div className="goal-inline-setup">
      <div className="goal-inline-setup__chips" aria-label="Goal choices">
        {availableGoals.map((goal) => (
          <button
            key={goal.value}
            type="button"
            className={`goal-inline-setup__chip${selectedGoal === goal.value ? " is-selected" : ""}`}
            onClick={() => setSelectedGoal(goal.value)}
          >
            <span aria-hidden="true">{goalEmojis[goal.value]}</span>
            {goal.value === "save_more" ? "Save More" : goal.value === "pay_down_debt" ? "Pay Debt" : goal.value === "build_emergency_fund" ? "Emergency Fund" : "Invest Better"}
          </button>
        ))}
      </div>
      <label className="goal-inline-setup__field">
        <span>Or describe it in your own words</span>
        <input value={intent} onChange={(event) => handleIntentChange(event.target.value)} placeholder="e.g. Save 25k for a phone" />
      </label>
      <div className="goal-inline-setup__target-row">
        <label className="goal-inline-setup__field">
          <span>Target amount</span>
          <input inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="25000" />
        </label>
        <div className="goal-inline-setup__suggestion">
          <span>Roadmap preview</span>
          <strong>{formatCurrencyAmount(Number(targetAmount) || 0, currency)} target</strong>
          <small>{vagueTargetSuggestion ?? (monthlyIncome ? "Clover will shape the milestones around your recent cash flow." : "Add recent income later for more personalized pacing.")}</small>
        </div>
      </div>
      {error ? <p className="goal-inline-setup__error">{error}</p> : null}
      <button className="button button-primary button-pill" type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "Creating roadmap..." : "Create my roadmap"}
      </button>
    </div>
  );
}
