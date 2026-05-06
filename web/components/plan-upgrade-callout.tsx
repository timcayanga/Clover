"use client";

import Link from "next/link";
import type { PlanTier } from "@prisma/client";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { analyticsOnceKey, PostHogEvent, capturePostHogClientEvent } from "@/components/posthog-analytics";

type PlanUpgradeCalloutProps = {
  planTier: PlanTier;
  title: string;
  copy: string;
  ctaHref: string;
  ctaLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
};

const upgradeFeatureLabels = [
  "Full investment portfolio tools",
  "Advanced reports and insights",
  "Enhanced goal tracking and recommendations",
] as const;

export function PlanUpgradeCallout({
  planTier,
  title,
  copy,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
  className,
}: PlanUpgradeCalloutProps) {
  if (planTier !== "free") {
    return null;
  }

  return (
    <section className={`plan-upgrade-callout glass${className ? ` ${className}` : ""}`}>
      <PostHogEvent
        event="upgrade_prompt_viewed"
        onceKey={analyticsOnceKey("upgrade_prompt_viewed", `upgrade-callout:${planTier}:${ctaHref}:${title}`)}
        properties={{
          plan_tier: planTier,
          prompt_location: "plan_upgrade_callout",
          cta_href: ctaHref,
        }}
      />
      <div className="plan-upgrade-callout__copy">
        <p className="eyebrow">Ready for more?</p>
        <h4>{title}</h4>
        <p>{copy}</p>
      </div>

      <ul className="plan-upgrade-callout__features">
        {upgradeFeatureLabels.map((label) => (
          <PlanFeatureItem key={label} label={label} />
        ))}
      </ul>

      <div className="plan-upgrade-callout__actions">
        <Link
          className="button button-primary button-small"
          href={ctaHref}
          onClick={() =>
            capturePostHogClientEvent("upgrade_cta_clicked", {
              cta_location: "plan_upgrade_callout",
              plan_tier: planTier,
              cta_href: ctaHref,
            })
          }
        >
          {ctaLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link className="button button-secondary button-small" href={secondaryHref}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
