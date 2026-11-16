"use client";
import { useEffect, useState } from "react";
import { PLAN_CATALOG, type CloverPlanTier } from "../../shared/plan-catalog";
import { retainedPlanRows, RETENTION_MESSAGE, DOWNGRADE_MESSAGE, type RetentionSnapshot } from "../../shared/plan-retention";

export function PlanRetentionPanel({ planTier }: { planTier: CloverPlanTier }) {
  const [snapshot, setSnapshot] = useState<RetentionSnapshot | null>(null);
  const [target, setTarget] = useState<CloverPlanTier | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null); setFailed(false); setTarget(null);
    fetch("/api/billing/retention", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<RetentionSnapshot>; })
      .then(value => { if (!controller.signal.aborted) setSnapshot(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [planTier, retry]);
  const current = snapshot?.planTier ?? planTier;
  const selected = target ?? current;
  const preview = selected !== current;
  return <section className="settings-plan-retention" aria-label="Plan changes and existing records">
    <h4>Changing plans</h4>
    <p>{RETENTION_MESSAGE}</p>
    <p>{DOWNGRADE_MESSAGE}</p>
    <label>Preview plan limits <select value={selected} onChange={event => setTarget(event.target.value as CloverPlanTier)}>
      {(["premium", "pro", "free"] as const).map(tier => <option key={tier} value={tier}>{PLAN_CATALOG[tier].name}{tier === current ? " (current)" : ""}</option>)}
    </select></label>
    {snapshot ? <>
      <p>{preview ? `Preview only — this does not change your subscription. ${PLAN_CATALOG[selected].name} standard limits:` : "Current account-wide usage:"}</p>
      <ul>{retainedPlanRows(snapshot.usage, selected, preview ? {} : snapshot.limits).map(row => <li key={row.key}>
        <strong>{row.label}: {row.used} / {row.limit === null ? "Unlimited" : row.limit}</strong>
        {row.excess > 0 ? ` — ${row.excess} above limit. Existing items stay usable; no additional items until below the limit or upgrading.` : !row.canCreate ? " — At limit. Existing items stay usable." : ""}
      </li>)}</ul>
      <p>Cash accounts do not count. Investments count by institution. Only active budgets and Circles you own that are not archived count. All saved personal goals count. Reactivating a budget needs an available slot.</p>
    </> : failed ? <p role="status">Usage could not be loaded. <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></p> : <p role="status">Loading plan usage…</p>}
  </section>;
}
