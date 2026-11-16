"use client";
import { CloverMascot } from "@/components/clover-mascot";

import { CategoryBrandMark } from "@/components/category-brand-mark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CollectionCard } from "@/components/collection-card";
import { formatCurrencyAmount } from "@/lib/currency-format";

export type GoalCardData = {
  id: string;
  name: string;
  category: string;
  amount: number | null;
  currency: string;
  cadence: string;
  emoji: string;
  period?: string;
  progress?: {
    currentAmount: number | null;
    currentLabel: string;
    progressPercent: number | null;
  };
};

export function GoalDirectory({ goals }: { goals: GoalCardData[] }) {
  const router = useRouter();
  return (
    <section>
      {!goals.length ? (
        <div className="plan-presets mascot-empty-state"><CloverMascot pose="savings" />
          <h2>What would you like to work toward?</h2>
          <p>Set your target and start working toward it.</p>
          <div className="mascot-empty-state__actions"><Link className="button button-primary" href="/goals/new">Create custom goal</Link><Link className="button button-secondary" href="/adviser?prompt=Help%20me%20plan%20a%20goal">Plan a goal with Clover</Link></div>
        </div>
      ) : null}
      <div className="collection-card-grid" aria-label="Your goals">
        {goals.map((goal) => (
          <CollectionCard
            key={goal.id}
            kind="goal"
            name={goal.name}
            subtitle={goal.category}
            icon={
              <CategoryBrandMark
                categoryName={
                  /invest/i.test(goal.category)
                    ? "Investments"
                    : /emergency/i.test(goal.category)
                      ? "Health & Wellness"
                      : "Income"
                }
                size={32}
              />
            }
            color={/emergency/i.test(goal.category) ? "#ef8e99" : "#35b875"}
            editable={false}
            onOpen={() =>
              router.push(`/goals?goal=${encodeURIComponent(goal.id)}`)
            }
            onSave={async () => {}}
          >
            {goal.progress ? (
              <div className="collection-card__goal-progress">
                <strong>
                  {goal.progress.currentAmount === null
                    ? "—"
                    : formatCurrencyAmount(
                        goal.progress.currentAmount,
                        goal.currency,
                      )}
                </strong>
                <small>{goal.progress.currentLabel}</small>
                {goal.period ? <small>{goal.period}</small> : null}
                <progress
                  value={goal.progress.progressPercent ?? 0}
                  max={100}
                  aria-label="Goal progress"
                />
                <span>
                  {Math.round(goal.progress.progressPercent ?? 0)}% of {goal.cadence === "Annual" ? "monthly pace" : "target"}
                </span>
              </div>
            ) : null}
            <span className="collection-card__value">
              <small>{goal.cadence} target</small>
              <strong>
                {goal.amount === null
                  ? "Set a target"
                  : formatCurrencyAmount(goal.amount, goal.currency)}
              </strong>
            </span>
          </CollectionCard>
        ))}
        {goals.length > 0 ? <Link className="collection-create-card" href="/goals/new">
          <span aria-hidden="true">＋</span>
          <strong>Create goal</strong>
          <small>Make room for another plan</small>
        </Link> : null}
      </div>
    </section>
  );
}
