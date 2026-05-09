"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalDefinition, GoalPlan, GoalTargetCadence, GoalTargetMode } from "@/lib/goals";
import { GoalGlyph } from "@/components/goals-visuals";
import { formatCurrencyAmount } from "@/lib/currency-format";
import {
  getGoalMoneyLabel,
  getGoalPlanSummary,
  goalPurposeSuggestions,
  goalTargetCadenceLabels,
  goalTargetModeLabels,
} from "@/lib/goals";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

type GoalsEditorProps = {
  goals: GoalDefinition[];
  currentGoal: string | null;
  currentTargetAmount: string | null;
  currentGoalPlan?: GoalPlan | null;
  monthlyIncome?: number | null;
  suggestedTargetAmount?: number | null;
  investmentHoldingsCount?: number | null;
  investmentHoldingsValue?: number | null;
  paydayHint?: string | null;
  beginnerMode?: boolean;
  currency?: string | null;
};

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const getPlanDefaults = (goalKey: string | null): { targetMode: GoalTargetMode; cadence: GoalTargetCadence; purpose: string } => ({
  targetMode: goalKey === "invest_better" ? "percent" : "amount",
  cadence: "monthly",
  purpose: "",
});

export function GoalsEditor({
  goals,
  currentGoal,
  currentTargetAmount,
  currentGoalPlan = null,
  monthlyIncome = null,
  suggestedTargetAmount = null,
  investmentHoldingsCount = null,
  investmentHoldingsValue = null,
  paydayHint = null,
  beginnerMode = false,
  currency = "PHP",
}: GoalsEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(currentGoal ?? goals[0]?.value ?? null);
  const initialPlan =
    currentGoalPlan ??
    (currentGoal
      ? {
          goalKey: currentGoal as GoalPlan["goalKey"],
          targetMode: "amount" as const,
          cadence: "monthly" as const,
          targetAmount: currentTargetAmount ? Number(currentTargetAmount) : null,
          targetPercent: null,
          purpose: null,
        }
      : null);
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
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(!beginnerMode);

  const selectedGoalMeta = useMemo(() => goals.find((goal) => goal.value === selectedGoal) ?? null, [goals, selectedGoal]);
  const currentGoalMeta = useMemo(() => goals.find((goal) => goal.value === currentGoal) ?? null, [goals, currentGoal]);
  const [optimisticGoalLabel, setOptimisticGoalLabel] = useState<string | null>(currentGoalMeta?.title ?? null);
  const [optimisticStatusLabel, setOptimisticStatusLabel] = useState<string | null>(null);
  const currentTargetValue = currentTargetAmount ?? "";
  const currentPlanSummary = getGoalPlanSummary(currentGoalPlan, monthlyIncome, currency);
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
    setOptimisticGoalLabel(currentGoalMeta?.title ?? null);
  }, [currentGoal, currentGoalMeta, goals]);

  useEffect(() => {
    const nextPlan = currentGoalPlan;
    const nextSelectedGoal = currentGoal ?? goals[0]?.value ?? null;
    const defaults = getPlanDefaults(nextSelectedGoal);

    setSelectedGoal(nextSelectedGoal);
    setOptimisticGoalLabel(nextSelectedGoal ? goals.find((goal) => goal.value === nextSelectedGoal)?.title ?? null : null);
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

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    document.body.dataset.goalEditorOpen = "true";

    return () => {
      if (document.body.dataset.goalEditorOpen === "true") {
        document.body.dataset.goalEditorOpen = "false";
      }
    };
  }, [isOpen]);

  const saveGoal = (goalValue: string | null) => {
    if (isSaving) {
      return;
    }

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
        monthlyIncome,
        currency
      ) ?? null;

    const nextGoalLabel = goals.find((goal) => goal.value === selectedGoalKey)?.title ?? "Goal";
    setStatus("Saving your goal...");
    setOptimisticStatusLabel(nextGoalLabel);
    setIsSaving(true);
    setIsOpen(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    void (async () => {
      try {
        const response = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal: selectedGoalKey,
            targetAmount:
              resolvedMonthlyTarget !== null && Number.isFinite(resolvedMonthlyTarget)
                ? resolvedMonthlyTarget.toFixed(2)
                : null,
            goalPlan: nextPlan,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to save goal");
        }

        setOptimisticGoalLabel(nextGoalLabel);
        setStatus(goalValue ? summary?.detail ?? "Goal target updated. Nice work." : "Goal cleared. You can set a new one anytime.");
        router.refresh();
      } catch {
        setStatus("We couldn't save that goal right now.");
        setIsOpen(true);
      } finally {
        window.clearTimeout(timeout);
        setIsSaving(false);
        setOptimisticStatusLabel(null);
      }
    })();
  };

  const compactStatus =
    status ??
    currentPlanSummary?.detail ??
    (optimisticStatusLabel ? `Saving ${optimisticStatusLabel.toLowerCase()}...` : null) ??
    (targetAmount
      ? `${getGoalMoneyLabel(currentGoalMeta?.value ?? null)} is set to ${formatCurrency(Number(targetAmount || 0), currency)}.`
      : "Your current goal is saved in Clover.");
  const currentGoalLabel = optimisticGoalLabel ?? currentGoalMeta?.title ?? "Set a goal";
  const chipLabel = currentGoal ? "Adjust" : "Set goal";
  const investmentContextCopy =
    selectedGoal === "invest_better" && investmentHoldingsCount && investmentHoldingsCount > 0
      ? `You already track ${investmentHoldingsCount} investment account${investmentHoldingsCount === 1 ? "" : "s"} worth ${formatCurrency(
          investmentHoldingsValue ?? 0,
          currency
        )}.`
      : null;
  const paydayContextCopy = selectedGoal === "invest_better" ? paydayHint ?? "Aim to move the investing transfer right after payday." : null;

  return (
    <section className="goals-editor glass" aria-label="Goal editor">
      <div className="goals-editor__summary">
        <div className="goals-editor__summary-copy">
          <p className="eyebrow">{currentGoal ? "Current goal" : "Set a goal"}</p>
          <h4>{currentGoalLabel}</h4>
          <p>{compactStatus}</p>
        </div>
        <div className="goals-editor__summary-actions">
          <span className={`goals-editor__chip${currentGoal ? " is-saved" : " is-new"}`}>{currentGoal ? currentGoalLabel : "No goal yet"}</span>
          <button type="button" className="button button-secondary button-small goals-editor__launch" onClick={() => setIsOpen(true)}>
            {chipLabel}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          className="modal-backdrop modal-backdrop--soft modal-backdrop--centered-mobile goals-editor__backdrop"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <section
            className="modal-card modal-card--wide goals-editor__modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="goals-editor-modal-title"
            aria-describedby="goals-editor-modal-copy"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head goals-editor__modal-head">
              <div>
                <p className="eyebrow">{currentGoal ? "Change goal" : "Set goal"}</p>
                <h4 id="goals-editor-modal-title">Pick the lane that feels right today</h4>
                <p id="goals-editor-modal-copy" className="goals-editor__modal-copy">
                  {compactStatus}
                </p>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>

            {investmentContextCopy || paydayContextCopy ? (
              <div className="goals-editor__insights">
                {investmentContextCopy ? (
                  <div className="goals-editor__insight">
                    <span>Investments linked</span>
                    <strong>{investmentContextCopy}</strong>
                  </div>
                ) : null}
                {paydayContextCopy ? (
                  <div className="goals-editor__insight">
                    <span>Payday rhythm</span>
                    <strong>{paydayContextCopy}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}

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
                      ? formatCurrency(suggestedTargetAmount, currency)
                      : "Optional for now"
                }
              />
              <small>
                {targetMode === "percent"
                  ? monthlyIncome !== null
                    ? `That is about ${formatCurrency(resolvedMonthlyTarget ?? 0, currency)} per month based on recent income.`
                    : "We need recent income before Clover can estimate the monthly peso amount."
                  : cadence === "annual"
                    ? "Enter the yearly amount and Clover will translate it into a monthly rhythm."
                    : suggestedTargetAmount
                      ? `A strong starting point from the last 30 days is ${formatCurrency(suggestedTargetAmount, currency)}.`
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
                disabled={isSaving || !hasChanges}
                onClick={() => saveGoal(selectedGoal)}
              >
                {isSaving ? "Saving..." : selectedGoal ? "Save goal" : "Clear goal"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={isSaving || (currentGoal === null && currentTargetAmount === null && targetAmount === "")}
                onClick={() => {
                  capturePostHogClientEvent("goal_reset", {
                    reset_scope: "editor_selection",
                  });
                  setSelectedGoal(currentGoal ?? goals[0]?.value ?? null);
                  const fallbackPlan = currentGoalPlan ?? null;
                  const defaults = getPlanDefaults(currentGoal ?? goals[0]?.value ?? null);
                  setTargetMode(fallbackPlan?.targetMode ?? defaults.targetMode);
                  setCadence(fallbackPlan?.cadence ?? defaults.cadence);
                  setPurpose(fallbackPlan?.purpose ?? defaults.purpose);
                  setTargetPercent(
                    fallbackPlan?.targetPercent !== null && fallbackPlan?.targetPercent !== undefined
                      ? String(fallbackPlan.targetPercent)
                      : ""
                  );
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
        </div>
      ) : null}
    </section>
  );
}
