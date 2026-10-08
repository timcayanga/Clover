"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CloverMascot } from "./clover-mascot";
import { contextualUpgradeOptions, upgradeDetails, type UpgradeContext, type UpgradeResource } from "../../shared/contextual-upgrades";
import { PLAN_CATALOG, type CloverPlanTier } from "../../shared/plan-catalog";
import type { RetentionSnapshot } from "../../shared/plan-retention";
import planStyles from "./plan-card-surface.module.css";
import styles from "./contextual-upgrade.module.css";

export function ContextualUpgrade({ context, tier, currentLimit, onDismiss }: { context: UpgradeContext; tier: CloverPlanTier | "unknown"; currentLimit?: number | null; onDismiss?: () => void }) {
  const detail = upgradeDetails[context];
  const options = contextualUpgradeOptions(context, tier, currentLimit);
  return <section className={styles.card} aria-label={detail.title}>
    {onDismiss ? <button type="button" className={styles.close} onClick={onDismiss} aria-label="Dismiss upgrade options">×</button> : null}
    <CloverMascot pose={detail.mascot} size={128} />
    <h2>{detail.title}</h2>
    {currentLimit !== undefined && currentLimit !== null ? <p>Your current plan includes {currentLimit} {detail.label}.</p> : null}
    {context === "linkedBanks" ? <p>Linked bank allowances apply each monthly period.</p> : null}
    {options.map(option => <Link className={`${styles.choice} ${planStyles.surface} ${planStyles[option.tier]}`} key={option.tier} href={`/settings?section=plan&upgrade=${option.tier}&interval=annual`}><span>Upgrade to {option.name}</span><span>{option.benefit}</span></Link>)}
    <Link href="/pricing">Compare plans</Link>
  </section>;
}
export function ResourceUpgradeNotice({ resource, enabled = true }: { resource: UpgradeResource; enabled?: boolean }) {
  const [snapshot, setSnapshot] = useState<RetentionSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch("/api/billing/retention", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setSnapshot).catch(() => {});
    return () => controller.abort();
  }, [enabled, resource]);
  if (!enabled || !snapshot) return null;
  const used = resource === "linkedBanks" ? snapshot.linkedBanks?.used : snapshot.usage[resource];
  const limit = resource === "linkedBanks" ? snapshot.linkedBanks?.limit : snapshot.limits[resource] === undefined ? PLAN_CATALOG[snapshot.planTier][resource] : snapshot.limits[resource];
  if (used === undefined || limit === undefined || limit === null || used < limit) return null;
  return <ContextualUpgrade context={resource} tier={snapshot.planTier} currentLimit={limit} />;
}
export function PremiumPreview({ context, children }: { context: "insights" | "trends" | "planner" | "markets" | "analysis"; children?: ReactNode }) {
  return <div className={styles.preview}><div className={styles.sample} aria-hidden="true">{children || <img src={`/assets/upgrade-previews/${context}.png`} alt="" />}</div><ContextualUpgrade context={context} tier="free" /></div>;
}
