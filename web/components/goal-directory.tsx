"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CollectionCard } from "@/components/collection-card";
import { formatCurrencyAmount } from "@/lib/currency-format";

export type GoalCardData = { id: string; name: string; category: string; amount: number | null; currency: string; cadence: string; emoji: string };

export function GoalDirectory({ goals }: { goals: GoalCardData[] }) {
  const router = useRouter();
  return <section>
    <div className="collection-directory-heading"><h2>Your goals</h2><p>Give each plan its own place. Open a goal to review its target and roadmap.</p></div>
    <div className="collection-card-grid" aria-label="Your goals">
      {goals.map((goal) => <CollectionCard key={goal.id} kind="goal" name={goal.name} subtitle={goal.category} icon={goal.emoji} editable={false} onOpen={() => router.push(`/goals?goal=${encodeURIComponent(goal.id)}`)} onSave={async () => {}}>
        <span className="collection-card__value"><small>{goal.cadence} target</small><strong>{goal.amount === null ? "Set a target" : formatCurrencyAmount(goal.amount, goal.currency)}</strong></span>
      </CollectionCard>)}
      <Link className="collection-create-card" href="/goals/new"><span aria-hidden="true">＋</span><strong>Create goal</strong><small>Make room for another plan</small></Link>
    </div>
  </section>;
}
