"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalDefinition, GoalKey } from "@/lib/goals";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { detectGoalIntent, parseGoalIntentAmount } from "@/lib/goal-intent";
import { postJsonWithXhr } from "@/lib/client-json-request";

type GoalInlineSetupProps = {
  goals: GoalDefinition[];
  suggestedTargetAmount: number | null;
  monthlyIncome: number | null;
  currency: string;
  personalGoal?: { id?: string; goal?: GoalKey; amount?: number; purpose?: string; cadence?: "monthly" | "annual" };
};

const goalEmojis: Record<GoalKey, string> = {
  save_more: "🌱",
  pay_down_debt: "🧭",
  track_spending: "🔎",
  build_emergency_fund: "🛡️",
  invest_better: "📈",
};

export function GoalInlineSetup({ goals, suggestedTargetAmount, monthlyIncome, currency, personalGoal }: GoalInlineSetupProps) {
  const router = useRouter();
  const availableGoals = useMemo(() => goals.filter((goal) => goal.value !== "track_spending"), [goals]);
  const [selectedGoal, setSelectedGoal] = useState<GoalKey>(personalGoal?.goal ?? availableGoals[0]?.value ?? "save_more");
  const [intent, setIntent] = useState(personalGoal?.purpose ?? "");
  const [targetAmount, setTargetAmount] = useState(personalGoal?.amount ? String(personalGoal.amount) : suggestedTargetAmount ? String(Math.round(suggestedTargetAmount)) : "");
  const [cadence, setCadence] = useState(personalGoal?.cadence ?? "monthly");
  const [goalCurrency, setGoalCurrency] = useState(currency);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const vagueTargetSuggestion = intent.trim()
    && parseGoalIntentAmount(intent) === null
    && /car|vehicle|house|home|school|tuition|travel|trip|phone|laptop/.test(intent.toLowerCase())
    && suggestedTargetAmount
    ? `Clover suggests starting at ${formatCurrencyAmount(Math.round(suggestedTargetAmount), currency)}. Adjust it before saving.`
    : null;
  const roadmapNote = vagueTargetSuggestion ?? (monthlyIncome ? "Clover will shape the milestones around your recent cash flow." : null);

  const handleIntentChange = (value: string) => {
    setIntent(value);
    const detectedGoal = detectGoalIntent(value);
    const detectedAmount = parseGoalIntentAmount(value);
    if (detectedGoal && availableGoals.some((goal) => goal.value === detectedGoal)) setSelectedGoal(detectedGoal);
    if (detectedAmount !== null) setTargetAmount(String(detectedAmount));
  };

  const save = async () => {
    if (inFlight.current) return;
    const amount = Number(targetAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Add a target amount so Clover can build your roadmap.");
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await postJsonWithXhr(personalGoal ? "/api/personal-goals" : "/api/settings/financial-focus", {
          ...(personalGoal ? { id: personalGoal.id, currency: goalCurrency } : {}),
          goal: selectedGoal,
          targetAmount: amount.toFixed(2),
          goalPlan: {
            goalKey: selectedGoal,
            targetMode: "amount",
            cadence,
            targetAmount: amount,
            targetPercent: null,
            purpose: intent.trim() || null,
          },
        });
      if (personalGoal) router.push("/goals");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save goal");
      setSaving(false);
      inFlight.current = false;
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
        <input maxLength={120} value={intent} onChange={(event) => handleIntentChange(event.target.value)} placeholder="e.g. Save 25k for a phone" />
      </label>
      <div className="goal-inline-setup__target-row">
        <label className="goal-inline-setup__field">
          <span>Target Amount</span>
          <input inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="25000" />
        </label>
        <div className="goal-inline-setup__suggestion">
          <span>Roadmap Preview</span>
          <strong>{formatCurrencyAmount(Number(targetAmount) || 0, goalCurrency)} target</strong>
          {roadmapNote ? <small>{roadmapNote}</small> : null}
        </div>
      </div>
      {personalGoal ? <div className="goal-inline-setup__target-row">
        <label className="goal-inline-setup__field"><span>Target period</span><select value={cadence} onChange={(event) => setCadence(event.target.value as "monthly" | "annual")}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
        <label className="goal-inline-setup__field"><span>Currency</span><select value={goalCurrency} onChange={(event) => setGoalCurrency(event.target.value)}>{Array.from(new Set([currency, "PHP", "USD", "EUR", "GBP", "SGD", "AUD", "CAD", "JPY"])).map((code) => <option key={code}>{code}</option>)}</select></label>
      </div> : null}
      {error ? <p className="goal-inline-setup__error" role="alert">{error}</p> : null}
      <button className="button button-primary button-pill" type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving goal..." : personalGoal?.id ? "Save goal" : "Create my roadmap"}
      </button>
    </div>
  );
}
