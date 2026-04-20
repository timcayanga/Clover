"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoalDefinition } from "@/lib/goals";

type GoalsEditorProps = {
  goals: GoalDefinition[];
  currentGoal: string | null;
};

export function GoalsEditor({ goals, currentGoal }: GoalsEditorProps) {
  const router = useRouter();
  const [selectedGoal, setSelectedGoal] = useState(currentGoal ?? goals[0]?.value ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedGoalMeta = useMemo(() => goals.find((goal) => goal.value === selectedGoal) ?? null, [goals, selectedGoal]);

  const saveGoal = (goalValue: string | null) => {
    startTransition(() => {
      setStatus("Saving your goal...");
      void fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalValue }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to save goal");
          }

          setStatus("Goal updated. Nice work.");
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
          <span>{status ?? "Your current goal is saved in Clover."}</span>
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
              <span className="goals-editor__card-pill">{isSelected ? "Selected" : "Tap to focus"}</span>
              <strong>{goal.title}</strong>
              <span>{goal.description}</span>
            </button>
          );
        })}
      </div>

      <div className="goals-editor__actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || selectedGoal === currentGoal}
          onClick={() => saveGoal(selectedGoal)}
        >
          {selectedGoal ? "Save goal" : "Clear goal"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isPending || currentGoal === null}
          onClick={() => {
            setSelectedGoal(currentGoal ?? goals[0]?.value ?? null);
          }}
        >
          Reset selection
        </button>
      </div>
    </section>
  );
}
