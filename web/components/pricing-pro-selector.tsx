"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BILLING_PLANS } from "@/lib/billing-plans";

type BillingInterval = "monthly" | "annual";

type PricingProSelectorProps = {
  signedIn: boolean;
  planTier: "free" | "pro" | null;
};

export function PricingProSelector({ signedIn, planTier }: PricingProSelectorProps) {
  const auth = useAuth();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const isAnnual = interval === "annual";
  const resolvedSignedIn = auth.isLoaded ? Boolean(auth.isSignedIn) : signedIn;
  const isPro = auth.isLoaded && auth.isSignedIn && planTier === "pro";
  const proHref = resolvedSignedIn
    ? "/settings?upgrade=pro&interval=" + interval + "#billing"
    : "/sign-up?intent=pro&interval=" + interval;
  const monthlyPlan = BILLING_PLANS.find((plan) => plan.interval === "monthly")!;
  const annualPlan = BILLING_PLANS.find((plan) => plan.interval === "annual")!;
  const annualizedMonthlyPrice = monthlyPlan.priceValue * 12;
  const annualSavings = annualizedMonthlyPrice - annualPlan.priceValue;

  if (isPro) {
    return <div className="pricing-pro-selector pricing-pro-selector--active"><p>Pro is active on your account.</p></div>;
  }

  return (
    <div className="pricing-pro-selector">
      <div className={`pricing-pro-selector__billing ${isAnnual ? "is-annual" : "is-monthly"}`} role="group" aria-label="Billing frequency">
        <span className="pricing-pro-selector__billing-thumb" aria-hidden="true" />
        <button
          className={!isAnnual ? "is-selected" : ""}
          type="button"
          aria-pressed={!isAnnual}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </button>
        <button
          className={isAnnual ? "is-selected" : ""}
          type="button"
          aria-pressed={isAnnual}
          onClick={() => setInterval("annual")}
        >
          Annually
        </button>
      </div>

      <div className="pricing-pro-selector__price">
        <strong>{isAnnual ? annualPlan.priceLabel : monthlyPlan.priceLabel}</strong>
        <span>{isAnnual ? "/ year" : "/ month"}</span>
      </div>

      {isAnnual ? (
        <p className="pricing-pro-selector__saving">
          <s>USD {annualizedMonthlyPrice.toFixed(2)}</s> Save USD {annualSavings.toFixed(2)} when billed annually.
        </p>
      ) : (
        <p className="pricing-pro-selector__saving">
          Switch to annually to save USD {annualSavings.toFixed(2)} each year.
        </p>
      )}

      <Link className="button button-primary button-pill pricing-pro-selector__signup" href={proHref} prefetch={false}>
        {resolvedSignedIn ? "Upgrade to Pro" : "Organize my finances with Pro"}
      </Link>
    </div>
  );
}
