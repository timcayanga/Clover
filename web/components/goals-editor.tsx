"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalDefinition, GoalPlan, GoalTargetCadence, GoalTargetMode } from "@/lib/goals";
import { GoalGlyph } from "@/components/goals-visuals";
import { getGoalMoneyLabel, getGoalPlanSummary, goalPurposeSuggestions, goalTargetCadenceLabels, goalTargetModeLabels } from "@/lib/goals";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

type GoalsEditorProps = {
  goals: GoalDefinition[];
  currentGoal: string | null;
  currentTargetAmount: string | null;
  currentGoalPlan?: GoalPlan | null;
  monthlyIncome?: number | null;
  suggestedTargetAmount?: number | null;
  beginnerMode?: boolean;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);

const getPlanDefaults = (goalKey: string | null): { targetMode: GoalTargetMode; cadence: GoalTargetCadence; purpose: string } => ({
  targetMode: goalKey === "invest_better" ? "percent" : "amount",
  cadence: goalKey === "save_more" || goalKey === "invest_better" ? "monthly" : "monthly",
  purpose: "",
});

export function GoalsEditor({
  goals,
  currentGoal,
  currentTargetAmount,
  currentGoalPlan = null,
  monthlyIncome = null,
  suggestedTargetAmount = null,
  beginnerMode = false,
}: GoalsEditorProps) {
  const router = useRouter();
  const [selectedGoal, setSelectedGoal] = useState(currentGoal ?? goals[0]?.value ?? null);
  const initialPlan = currentGoalPlan ?? (currentGoal ? { goalKey: currentGoal as GoalPlan["goalKey"], targetMode: "amount", cadence: "monthly", targetAmount: currentTargetAmount ? Number(currentTargetAmount) : null, targetPercent: null, purpose: null } : null);
  const defaultPlan = getPlanDefaults(selectedGoal);
  const [targetMode, setTargetMode] = useState<GoalTargetMode>(initialPlan?.targetMode ?? defaultPlan.targetMode);
  const [cadence, setCadence] = useState<GoalTargetCadence>(initialPlan?.cadence ?? defaultPlan.cadence);
  const [purpose, setPurpose] = useState(initialPlan?.purpose ?? defaultPlan.purpose);
  const [targetAmount, setTargetAmount] = useState(
    initialPlan?.targetMode === "amount"
      ? initialPlan.cadence === "annual" && initialPlan.targetAmount !== null
        ? String(initialPlan.targetAmount)
        : initialPlan.targetAmount !== null
          ? String(initialPlan.targetAmount)
          : currentTargetAmount ?? (suggestedTargetAmount ? String(suggestedTargetAmount) : "")
      : currentTargetAmount ?? (suggestedTargetAmount ? String(suggestedTargetAmount) : "")
  );
  const [targetPercent, setTargetPercent] = useState(initialPlan?.targetPercent !== null ? String(initialPlan?.targetPercent ?? "") : "");
  const [status, setStatus] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(!beginnerMode);
  const [isPending, startTransition] = useTransition();

  const selectedGoalMeta = useMemo(() => goals.find((goal) => goal.value === selectedGoal) ?? null, [goals, selectedGoal]);
  const currentTargetValue = currentTargetAmount ?? "";
  const resolvedMonthlyTarget = useMemo(() => {
    const rawAmount = targetAmount.trim() ? Number(targetAmount) : null;
    const rawPercent = targetPercent.trim() ? Number(targetPercent) : null;

    if (targetMode === "percent") {
      if (monthlyIncome !== null && Number.isFinite(monthlyIncome) && rawPercent !== null && Number.isFinite(rawPercent)) {
        return monthlyIncome * (rawPercent / 100);
      }
      return null;
    }

    if (rawAmount === null || Number.isNaN(rawAmount)) {
      return null;
    }

    return cadence === "annual" ? rawAmount / 12 : rawAmount;
  }, [cadence, monthlyIncome, targetAmount, targetMode, targetPercent]);
  const currentPlanSummary = getGoalPlanSummary(currentGoalPlan, monthlyIncome);
  const currentPlanAmount =
    currentGoalPlan?.targetMode === "amount"
      ? currentGoalPlan.targetAmount !== null && currentGoalPlan.targetAmount !== undefined
        ? String(currentGoalPlan.targetAmount)
        : ""
      : currentTargetValue.trim();
  const currentPlanPercent =
    currentGoalPlan?.targetMode === "percent"
      ? currentGoalPlan.targetPercent !== null && currentGoalPlan.targetPercent !== undefined
        ? String(currentGoalPlan.targetPercent)
        : ""
      : "";
  const hasChanges =
    selectedGoal !== currentGoal ||
    targetAmount.trim() !== currentPlanAmount ||
    targetPercent.trim() !== currentPlanPercent ||
    targetMode !== (currentGoalPlan?.targetMode ?? defaultPlan.targetMode) ||
    cadence !== (currentGoalPlan?.cadence ?? defaultPlan.cadence) ||
    purpose.trim() !== (currentGoalPlan?.purpose ?? "");

  useEffect(() => {
    setSelectedGoal(currentGoal ?? goals[0]?.value ?? null);
  }, [currentGoal, goals]);

  useEffect(() => {
    const nextPlan = currentGoalPlan;
    const nextSelectedGoal = currentGoal ?? goals[0]?.value ?? null;
    const defaults = getPlanDefaults(nextSelectedGoal);

    setSelectedGoal(nextSelectedGoal);
    setTargetMode(nextPlan?.targetMode ?? defaults.targetMode);
    setCadence(nextPlan?.cadence ?? defaults.cadence);
    setPurpose(nextPlan?.purpose ?? defaults.purpose);
    setTargetPercent(nextPlan?.targetPercent !== null && nextPlan?.targetPercent !== undefined ? String(nextPlan.targetPercent) : "");

    if (nextPlan?.targetMode === "amount" && nextPlan.targetAmount !== null && nextPlan.targetAmount !== undefined) {
      setTargetAmount(String(nextPlan.targetAmount));
      return;
    }

    if (currentTargetAmount !== null) {
      setTargetAmount(currentTargetAmount);
      return;
    }

    if (suggestedTargetAmount !== null) {
      setTargetAmount(String(suggestedTargetAmount));
      return;
    }

    setTargetAmount("");
  }, [currentGoal, currentGoalPlan, currentTargetAmount, goals, suggestedTargetAmount]);

  useEffect(() => {
    setShowAdvanced(!beginnerMode);
  }, [beginnerMode]);

  const saveGoal = (goalValue: string | null) => {
    startTransition(() => {
      setStatus("Saving your goal...");
      const selectedGoalKey = goalValue ?? selectedGoal ?? null;
      const rawAmount = targetAmount.trim() ? Number(targetAmount) : null;
      const rawPercent = targetPercent.trim() ? Number(targetPercent) : null;
      const nextPlan = {
        goalKey: selectedGoalKey,
        targetMode,
        cadence,
        targetAmount: targetMode === "amount" ? rawAmount : null,
        targetPercent: targetMode === "percent" ? rawPercent : null,
        purpose: purpose.trim() || null,
      };
      void fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: selectedGoalKey,
          targetAmount:
            resolvedMonthlyTarget !== null && Number.isFinite(resolvedMonthlyTarget)
              ? resolvedMonthlyTarget.toFixed(2)
              : null,
          goalPlan: nextPlan,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to save goal");
          }

          const summary =
            getGoalPlanSummary(
              {
                goalKey: selectedGoalKey ?? (selectedGoal ?? goals[0]?.value ?? null),
                targetMode,
                cadence,
                targetAmount: targetMode === "amount" ? rawAmount : null,
                targetPercent: targetMode === "percent" ? rawPercent : null,
                purpose: purpose.trim() || null,
              } as GoalPlan,
              monthlyIncome
            ) ?? null;

          setStatus(
            goalValue
              ? summary?.detail ?? "Goal target updated. Nice work."
              : "Goal cleared. You can set a new one anytime."
          );
          router.refresh();
        })
        .catch(() => {
          setStatus("We couldn't save that goal right now.");
        });
    });
  };

  return (
    <section className="goals-editor glass" aria-label="Goal editor">
      <div className="goals-editor__head">
        <div>
          <p className="eyebrow">Change your goal</p>
          <h4>Pick the lane that feels right today</h4>
        </div>
        <div className="goals-editor__status">
          <strong>{selectedGoalMeta?.title ?? "No goal selected"}</strong>
          <span>
            {status ??
              currentPlanSummary?.detail ??
              (targetAmount
                ? `${getGoalMoneyLabel(selectedGoalMeta?.value ?? null)} is set to ${currencyFormatter.format(Number(targetAmount || 0))}.`
                : "Your current goal is saved in Clover.")}
          </span>
        </div>
      </div>

      <div className="goals-editor__grid" role="list" aria-label="Goal choices">
        {goals.map((goal) => {
          const isSelected = goal.value === selectedGoal;
          return (
            <button
              key={goal.value}
              type="button"
              className={`goals-editor__card ${isSelected ? "is-selected" : ""}`}
              onClick={() => setSelectedGoal(goal.value)}
              aria-pressed={isSelected}
              role="listitem"
            >
              <span className="goals-editor__card-pill">
                <GoalGlyph goalKey={goal.value} />
                {isSelected ? "Selected" : "Tap to focus"}
              </span>
              <strong>{goal.title}</strong>
              <span>{goal.description}</span>
            </button>
          );
        })}
      </div>

      <label className="goals-editor__amount">
        <span>
          {targetMode === "percent"
            ? `${goalTargetModeLabels.percent} of salary`
            : `${getGoalMoneyLabel(selectedGoalMeta?.value ?? null)} (${goalTargetCadenceLabels[cadence].toLowerCase()})`}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={targetMode === "percent" ? "0.5" : "100"}
          value={targetMode === "percent" ? targetPercent : targetAmount}
          onChange={(event) => {
            if (targetMode === "percent") {
              setTargetPercent(event.target.value);
              return;
            }
            setTargetAmount(event.target.value);
          }}
          placeholder={
            targetMode === "percent"
              ? monthlyIncome !== null
                ? "10"
                : "Percent"
              : suggestedTargetAmount
                ? currencyFormatter.format(suggestedTargetAmount)
                : "Optional for now"
          }
        />
        <small>
          {targetMode === "percent"
            ? monthlyIncome !== null
              ? `That is about ${formatCurrency(resolvedMonthlyTarget ?? 0)} per month based on recent income.`
              : "We need recent income before Clover can estimate the monthly peso amount."
            : cadence === "annual"
              ? "Enter the yearly amount and Clover will translate it into a monthly rhythm."
              : suggestedTargetAmount
                ? `A strong starting point from the last 30 days is ${currencyFormatter.format(suggestedTargetAmount)}.`
                : "Set the monthly number you want Clover to coach against."}
        </small>
        {beginnerMode ? <small className="goals-editor__helper">Amount means a fixed peso goal. Percent means a share of salary.</small> : null}
      </label>

      {beginnerMode ? (
        <div className="goals-editor__advanced-toggle">
          <button type="button" className="pill-link pill-link--inline" onClick={() => setShowAdvanced((current) => !current)}>
            {showAdvanced ? "Hide advanced options" : "Show advanced options"}
          </button>
          <small>Use this if you want to switch from a simple peso goal to salary share or annual planning.</small>
        </div>
      ) : null}

      {showAdvanced ? (
        <>
          <div className="goals-editor__mode-grid">
            <label className="goals-editor__mode">
              <span>Target type</span>
              <select value={targetMode} onChange={(event) => setTargetMode(event.target.value as GoalTargetMode)}>
                <option value="amount">{goalTargetModeLabels.amount}</option>
                <option value="percent">{goalTargetModeLabels.percent}</option>
              </select>
            </label>
            <label className="goals-editor__mode">
              <span>Cadence</span>
              <select value={cadence} onChange={(event) => setCadence(event.target.value as GoalTargetCadence)}>
                <option value="monthly">{goalTargetCadenceLabels.monthly}</option>
                <option value="annual">{goalTargetCadenceLabels.annual}</option>
              </select>
            </label>
          </div>

          <label className="goals-editor__purpose">
            <span>What is this goal for?</span>
            <input
              type="text"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder={selectedGoalMeta ? goalPurposeSuggestions[selectedGoalMeta.value][0] : "For a car, house, phone, or something else"}
            />
            <small>Examples: car, phone, house, emergency fund, retirement.</small>
          </label>

          <div className="goals-editor__purpose-chips" aria-label="Suggested purposes">
            {(selectedGoalMeta ? goalPurposeSuggestions[selectedGoalMeta.value] : []).map((option) => (
              <button
                key={option}
                type="button"
                className={`goals-editor__purpose-chip ${purpose === option ? "is-selected" : ""}`}
                onClick={() => setPurpose(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="goals-editor__actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || !hasChanges}
          onClick={() => saveGoal(selectedGoal)}
        >
          {selectedGoal ? "Save goal" : "Clear goal"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || (currentGoal === null && currentTargetAmount === null && targetAmount === "")}
          onClick={() => {
            setSelectedGoal(currentGoal ?? goals[0]?.value ?? null);
            const fallbackPlan = currentGoalPlan ?? null;
            const defaults = getPlanDefaults(currentGoal ?? goals[0]?.value ?? null);
            setTargetMode(fallbackPlan?.targetMode ?? defaults.targetMode);
            setCadence(fallbackPlan?.cadence ?? defaults.cadence);
            setPurpose(fallbackPlan?.purpose ?? defaults.purpose);
            setTargetPercent(fallbackPlan?.targetPercent !== null && fallbackPlan?.targetPercent !== undefined ? String(fallbackPlan.targetPercent) : "");
            setTargetAmount(
              fallbackPlan?.targetMode === "amount"
                ? fallbackPlan.targetAmount !== null && fallbackPlan.targetAmount !== undefined
                  ? String(fallbackPlan.targetAmount)
                  : currentTargetAmount ?? (suggestedTargetAmount ? String(suggestedTargetAmount) : "")
                : currentTargetAmount ?? (suggestedTargetAmount ? String(suggestedTargetAmount) : "")
            );
          }}
        >
          Reset selection
        </button>
      </div>
    </section>
  );
}
