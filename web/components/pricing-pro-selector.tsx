"use client";

import Link from "next/link";
import { useState } from "react";

type BillingInterval = "monthly" | "annual";

type PricingProSelectorProps = {
  signedIn: boolean;
};

export function PricingProSelector({ signedIn }: PricingProSelectorProps) {
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const isAnnual = interval === "annual";

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

      <Link className="button button-primary button-pill pricing-pro-selector__signup" href={signedIn ? "/home" : "/sign-up"} prefetch={false}>
        {signedIn ? "Go to Clover" : "Sign Up"}
      </Link>
    </div>
  );
}
