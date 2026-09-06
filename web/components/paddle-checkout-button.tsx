"use client";

import Script from "next/script";
import { ReferralCheckoutField, prepareCheckout } from "./referral-checkout-field";
import { useEffect, useRef, useState } from "react";
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
  customerId: string;
  customerEmail: string;
  interval: BillingInterval;
  className?: string;
  onStart?: () => void;
};

export function PaddleCheckoutButton({
  clientToken,
  environment,
  priceId,
  customerId,
  customerEmail,
  interval,
  className,
  onStart,
}: PaddleCheckoutButtonProps) {
  const initializedTokenRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
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
      const paddleEvent = (event as CustomEvent<PaddleCheckoutEvent>).detail;
      if (paddleEvent.name === "checkout.completed") {
        setMessage("Payment received. Clover is confirming your Pro access.");
      } else if (paddleEvent.name === "checkout.closed") {
        setMessage((current) => current ?? "Checkout closed.");
      }
    };

    window.addEventListener("clover:paddle-checkout", handleCheckoutEvent);
    if (window.Paddle) {
      setScriptReady(true);
      initialize();
    }

    return () => {
      window.removeEventListener("clover:paddle-checkout", handleCheckoutEvent);
    };
    // Paddle may only be initialized once for a page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToken, environment]);

  const openCheckout = async () => {
    if (preparing) return;
    if (!window.Paddle) {
      setMessage("Paddle checkout is still loading.");
      return;
    }

    initialize();
    onStart?.();
    capturePostHogClientEvent("billing_started", {
      billing_action: "create_subscription",
      billing_provider: "paddle",
      plan_interval: interval,
    });
    setMessage(null);

    setPreparing(true);
    try {
    const checkout = await prepareCheckout("paddle", priceId, referralCode);
    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: customerEmail ? { email: customerEmail } : undefined,
      customData: {
        cloverUserId: customerId,
        cloverCheckoutId: checkout.checkoutId,
        planTier: "pro",
        interval,
      },
      settings: {
        displayMode: "overlay",
        theme: "light",
        locale: "en",
      },
    });
    } catch(error) { setMessage(error instanceof Error ? error.message : "Unable to prepare checkout."); }
    finally { setPreparing(false); }
  };

  return (
    <div className={className}>
      <ReferralCheckoutField value={referralCode} onChange={setReferralCode} provider="paddle" planId={priceId} />
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => {
          setScriptReady(true);
          initialize();
        }}
      />
      <button
        type="button"
        className="button-primary settings-plan-card__paddle-button"
        onClick={openCheckout}
        disabled={!scriptReady || preparing}
      >
        {preparing ? "Preparing checkout…" : scriptReady ? "Subscribe" : "Loading secure checkout..."}
      </button>
      {message ? <p className="billing-helper" aria-live="polite">{message}</p> : null}
    </div>
  );
}
