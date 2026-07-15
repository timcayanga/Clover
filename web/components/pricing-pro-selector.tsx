"use client";

import Link from "next/link";
import { useState } from "react";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

type BillingInterval = "monthly" | "annual";

type PricingProSelectorProps = {
  signedIn: boolean;
  isPro: boolean;
  clientId?: string | null;
  monthlyPlanId?: string | null;
  annualPlanId?: string | null;
  customId?: string | null;
};

export function PricingProSelector({
  signedIn,
  isPro,
  clientId,
  monthlyPlanId,
  annualPlanId,
  customId,
}: PricingProSelectorProps) {
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const isAnnual = interval === "annual";
  const planId = isAnnual ? annualPlanId : monthlyPlanId;
  const hasCheckout = Boolean(signedIn && clientId && planId && customId);

  return (
    <div className="pricing-pro-selector">
      <div className="pricing-pro-selector__billing" role="group" aria-label="Billing frequency">
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
        <strong>{isAnnual ? "PHP 999" : "PHP 99"}</strong>
        <span>{isAnnual ? "/ year" : "/ month"}</span>
      </div>

      {isAnnual ? (
        <p className="pricing-pro-selector__saving">
          <s>PHP 1,188</s> Save PHP 189 when billed annually.
        </p>
      ) : (
        <p className="pricing-pro-selector__saving">Switch to annually to save PHP 189 each year.</p>
      )}

      {isPro ? (
        <p className="pricing-pro-selector__status">Pro is active on your account.</p>
      ) : hasCheckout ? (
        <PayPalSubscribeButton
          clientId={clientId as string}
          planId={planId as string}
          customId={customId as string}
          className="pricing-pro-selector__checkout"
          onStart={() =>
            capturePostHogClientEvent("upgrade_cta_clicked", {
              cta_location: "pricing_pro_card",
              plan_tier: "free",
              plan_interval: interval,
            })
          }
        />
      ) : signedIn ? (
        <p className="pricing-pro-selector__status">Pro checkout is not configured for this environment yet.</p>
      ) : (
        <Link className="button button-primary button-pill pricing-pro-selector__signup" href="/sign-up" prefetch={false}>
          Start with Pro
        </Link>
      )}
    </div>
  );
}
