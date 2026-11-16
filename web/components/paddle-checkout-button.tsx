"use client";

import Script from "next/script";
import { ReferralCheckoutField, prepareCheckout } from "./referral-checkout-field";
import { useEffect, useRef, useState } from "react";
import { beginCheckoutPreparation, planFunnelProperties, type CheckoutPreparationReason, type PlanEntryPoint } from "../../shared/plan-funnel";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import type { BillingInterval } from "@/lib/billing-plans";

type PaddleCheckoutEvent = {
  name?: string;
};

type PaddleInstance = {
  Environment: {
    set: (environment: "sandbox" | "production") => void;
  };
  Initialize: (options: {
    token: string;
    pwCustomer?: Record<string, never>;
    eventCallback?: (event: PaddleCheckoutEvent) => void;
  }) => void;
  Checkout: {
    open: (options: {
      items: Array<{ priceId: string; quantity: number }>;
      customer?: { email: string };
      customData: Record<string, string>;
      settings?: {
        displayMode: "overlay";
        theme: "light";
        locale: "en";
      };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleInstance;
    __cloverPaddleInitializedToken?: string;
  }
}

type PaddleCheckoutButtonProps = {
  clientToken: string;
  environment: "sandbox" | "live";
  priceId: string;
  planTier?: "pro" | "premium";
  customerId: string;
  customerEmail: string;
  interval: BillingInterval;
  className?: string;
  onStart?: () => void;
  entryPoint?: PlanEntryPoint;
  displayedCurrency?: string;
};

export function PaddleCheckoutButton({
  clientToken,
  environment,
  priceId,
  planTier = "pro",
  customerId,
  customerEmail,
  interval,
  className,
  onStart,
  entryPoint = "settings",
  displayedCurrency,
}: PaddleCheckoutButtonProps) {
  const checkoutDialogRef = useRef<HTMLDialogElement>(null);
  const checkoutActiveRef = useRef(false);
  const checkoutAttemptRef = useRef<string | null>(null);
  const initializedTokenRef = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [preparing, setPreparing] = useState(false);

  const initialize = () => {
    if (
      !window.Paddle ||
      initializedTokenRef.current === clientToken ||
      window.__cloverPaddleInitializedToken === clientToken
    ) {
      initializedTokenRef.current = window.__cloverPaddleInitializedToken ?? null;
      return;
    }

    if (environment === "sandbox") {
      window.Paddle.Environment.set("sandbox");
    }

    window.Paddle.Initialize({
      token: clientToken,
      ...(environment === "live" ? { pwCustomer: {} } : {}),
      eventCallback: (event) => {
        window.dispatchEvent(new CustomEvent("clover:paddle-checkout", { detail: event }));
      },
    });
    window.__cloverPaddleInitializedToken = clientToken;
    initializedTokenRef.current = clientToken;
  };

  useEffect(() => {
    const handleCheckoutEvent = (event: Event) => {
      if (!checkoutActiveRef.current) return;
      const paddleEvent = (event as CustomEvent<PaddleCheckoutEvent>).detail;
      if (paddleEvent.name === "checkout.completed" || paddleEvent.name === "checkout.closed") {
        const completed = paddleEvent.name === "checkout.completed";
        if (checkoutAttemptRef.current) {
          capturePostHogClientEvent("checkout_outcome", {
            billing_provider: "paddle", checkout_attempt_id: checkoutAttemptRef.current,
            checkout_outcome: completed ? "provider_completed" : "canceled",
          });
        }
        checkoutAttemptRef.current = null;
        checkoutActiveRef.current = false;
        if (completed) setMessage(`Payment received. Clover is confirming your ${planTier === "premium" ? "Pro" : "Plus"} access.`);
        else setMessage((current) => current ?? "Checkout closed.");
      }
    };

    window.addEventListener("clover:paddle-checkout", handleCheckoutEvent);

    return () => {
      window.removeEventListener("clover:paddle-checkout", handleCheckoutEvent);
    };
    // Paddle may only be initialized once for a page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToken, environment, planTier]);

  const openCheckout = async () => {
    if (preparing) return;
    const selection = {
      ...planFunnelProperties(entryPoint, interval, displayedCurrency, planTier),
      billing_provider: "paddle",
      checkout_kind: "new_subscription",
      plan_surface: entryPoint === "onboarding" ? "onboarding" : "settings",
    };
    const preparation = beginCheckoutPreparation(capturePostHogClientEvent, selection);
    if (!window.Paddle) {
      preparation.finish("provider_sdk_unavailable");
      setMessage("Paddle checkout is still loading.");
      return;
    }

    onStart?.();
    capturePostHogClientEvent("billing_started", {
      billing_action: "create_subscription",
      billing_provider: "paddle",
      plan_interval: interval,
      target_plan: planTier,
      plan_tier: planTier,
    });
    setMessage(null);

    setPreparing(true);
    let step: CheckoutPreparationReason = "provider_sdk_unavailable";
    try {
      initialize();
      step = "checkout_session_failed";
      const checkout = await prepareCheckout("paddle", priceId, referralCode);
      checkoutAttemptRef.current = checkout.checkoutId;
      checkoutActiveRef.current = true;
      checkoutDialogRef.current?.close();
      step = "provider_handoff_failed";
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: customerEmail ? { email: customerEmail } : undefined,
        customData: {
          cloverUserId: customerId,
          cloverCheckoutId: checkout.checkoutId,
          planTier,
          interval,
        },
        settings: {
          displayMode: "overlay",
          theme: "light",
          locale: "en",
        },
      });
      preparation.finish(undefined, checkout.checkoutId);
      capturePostHogClientEvent("checkout_started", {
        ...selection, checkout_attempt_id: checkout.checkoutId, checkout_preparation_id: preparation.id,
      });
    } catch(error) {
      preparation.finish(step, checkoutAttemptRef.current ?? undefined);
      checkoutAttemptRef.current = null;
      checkoutActiveRef.current = false;
      setMessage(error instanceof Error ? error.message : "Unable to prepare checkout.");
    }
    finally { setPreparing(false); }
  };

  return (
    <div className={className}>
      <dialog ref={checkoutDialogRef} className="clover-checkout-dialog" aria-label="Checkout">
        <h2>Subscribe to {planTier === "premium" ? "Pro" : "Plus"}</h2>
        <p>Review the final price and currency in secure checkout before paying.</p>
        <ReferralCheckoutField value={referralCode} onChange={setReferralCode} provider="paddle" planId={priceId} />
        <div className="settings-plan-management__actions"><button type="button" className="button button-primary" disabled={preparing} onClick={() => void openCheckout()}>{preparing ? "Preparing…" : "Continue to payment"}</button><button type="button" className="button button-secondary" onClick={() => checkoutDialogRef.current?.close()}>Back</button></div>
        {message ? <p role="status">{message}</p> : null}
      </dialog>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
      />
      <button
        type="button"
        className="button-primary settings-plan-card__paddle-button"
        onClick={() => checkoutDialogRef.current?.showModal()}
        disabled={preparing}
      >
        {preparing ? "Preparing checkout…" : `Subscribe to ${planTier === "premium" ? "Pro" : "Plus"}`}
      </button>
      {message ? <p className="billing-helper" aria-live="polite">{message}</p> : null}
    </div>
  );
}
