"use client";

import Link from "next/link";
import type { PlanTier } from "@prisma/client";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { PLAN_FEATURES } from "@/lib/plan-features";
import { formatLimitValue, type UserLimits } from "@/lib/user-limits";

type PlanTierBannerProps = {
  planTier: PlanTier | "unknown";
  label: string;
  limits?: UserLimits | null;
  ctaHref: string;
  ctaLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
};

export function PlanTierBanner({
  planTier,
  label,
  limits,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
  className,
}: PlanTierBannerProps) {
  if (planTier === "unknown") {
    return null;
  }

  const feature = PLAN_FEATURES[planTier];
  const primaryLabel = ctaLabel ?? (planTier === "free" ? "Upgrade to Pro" : "Manage billing");
  const limitsText = limits
    ? `Limits: ${formatLimitValue(limits.accountLimit)} non-cash accounts · ${formatLimitValue(limits.monthlyUploadLimit)} monthly uploads · ${formatLimitValue(
        limits.transactionLimit
      )} transaction rows`
    : null;

  return (
    <section className={`plan-tier-banner glass${className ? ` ${className}` : ""}`}>
      <div className="plan-tier-banner__top">
        <div className="plan-tier-banner__label-group">
          <p className="eyebrow">{label}</p>
          <span className={`pill ${planTier === "pro" ? "pill-good" : "pill-subtle"}`}>{feature.title}</span>
        </div>
        <span className="plan-tier-banner__headline">{feature.headline}</span>
      </div>

      <p className="plan-tier-banner__copy">{feature.copy}</p>

      {limitsText ? <p className="plan-tier-banner__limits">{limitsText}</p> : null}

      <ul className="plan-tier-banner__bullets">
        {feature.bullets.map((bullet) => (
          <PlanFeatureItem key={bullet} label={bullet} className="plan-tier-banner__bullet" />
        ))}
      </ul>

      <div className="plan-tier-banner__actions">
        <Link className="button button-primary button-small" href={ctaHref}>
          {primaryLabel}
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
