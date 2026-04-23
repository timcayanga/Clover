"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalDefinition } from "@/lib/goals";
import { GoalGlyph } from "@/components/goals-visuals";
import { getGoalMoneyLabel } from "@/lib/goals";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

type GoalsEditorProps = {
  goals: GoalDefinition[];
  currentGoal: string | null;
  currentTargetAmount: string | null;
  suggestedTargetAmount?: number | null;
};

export function GoalsEditor({ goals, currentGoal, currentTargetAmount, suggestedTargetAmount = null }: GoalsEditorProps) {
  const router = useRouter();
  const [selectedGoal, setSelectedGoal] = useState(currentGoal ?? goals[0]?.value ?? null);
  const [targetAmount, setTargetAmount] = useState(currentTargetAmount ?? (suggestedTargetAmount ? String(suggestedTargetAmount) : ""));
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedGoalMeta = useMemo(() => goals.find((goal) => goal.value === selectedGoal) ?? null, [goals, selectedGoal]);
  const currentTargetValue = currentTargetAmount ?? "";
  const hasChanges = selectedGoal !== currentGoal || targetAmount.trim() !== currentTargetValue.trim();

  useEffect(() => {
    setSelectedGoal(currentGoal ?? goals[0]?.value ?? null);
  }, [currentGoal, goals]);

  useEffect(() => {
    if (currentTargetAmount !== null) {
      setTargetAmount(currentTargetAmount);
      return;
    }

    if (suggestedTargetAmount !== null && targetAmount === "") {
      setTargetAmount(String(suggestedTargetAmount));
    }
  }, [currentTargetAmount, suggestedTargetAmount]);

  const saveGoal = (goalValue: string | null) => {
    startTransition(() => {
      setStatus("Saving your goal...");
      void fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goalValue,
          targetAmount: targetAmount.trim() || null,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to save goal");
          }

          setStatus(goalValue ? "Goal target updated. Nice work." : "Goal cleared. You can set a new one anytime.");
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
        <span>{getGoalMoneyLabel(selectedGoalMeta?.value ?? null)}</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="100"
          value={targetAmount}
          onChange={(event) => setTargetAmount(event.target.value)}
          placeholder={suggestedTargetAmount ? currencyFormatter.format(suggestedTargetAmount) : "Optional for now"}
        />
        <small>
          {suggestedTargetAmount
            ? `A strong starting point from the last 30 days is ${currencyFormatter.format(suggestedTargetAmount)}.`
            : "Set the monthly number you want Clover to coach against."}
        </small>
      </label>

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
            setTargetAmount(currentTargetAmount ?? (suggestedTargetAmount ? String(suggestedTargetAmount) : ""));
          }}
        >
          Reset selection
        </button>
      </div>
    </section>
  );
}
