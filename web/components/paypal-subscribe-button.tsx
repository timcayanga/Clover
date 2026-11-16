"use client";

import Script from "next/script";
import { ReferralCheckoutField, prepareCheckout } from "./referral-checkout-field";
import { useEffect, useMemo, useRef, useState } from "react";
import { beginCheckoutPreparation, planFunnelProperties, type CheckoutPreparationReason, type PlanEntryPoint } from "../../shared/plan-funnel";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

declare global {
  interface Window {
    paypal?: {
      FUNDING?: {
        PAYPAL: string;
        CARD: string;
      };
      Buttons: (config: {
        fundingSource?: string;
        style?: {
          layout?: "vertical" | "horizontal";
          color?: "gold" | "blue" | "silver" | "white" | "black";
          shape?: "rect" | "pill";
          label?: "paypal" | "subscribe" | "pay";
          height?: number;
        };
        createSubscription: (_data: unknown, actions: { subscription: { create: (payload: { plan_id: string; custom_id?: string }) => Promise<string> } }) => Promise<string> | string;
        onApprove?: (_data: unknown, actions: unknown) => Promise<void> | void;
        onCancel?: () => void;
        onError?: (error: unknown) => void;
        onInit?: () => void;
      }) => { render: (target: HTMLElement | string) => Promise<void>; close?: () => void };
    };
  }
}

type PayPalSubscribeButtonProps = {
  clientId: string;
  planId: string;
  customId: string;
  buyerCountry?: string | null;
  className?: string;
  disabled?: boolean;
  onStart?: () => void;
  entryPoint?: PlanEntryPoint;
  displayedCurrency?: string;
  interval?: "monthly" | "annual";
  onApproved?: () => void;
  onCancelled?: () => void;
  fundingSource?: "paypal" | "card";
};

export function PayPalSubscribeButton({
  clientId,
  planId,
  customId,
  buyerCountry,
  className,
  disabled = false,
  onStart,
  entryPoint = "settings",
  displayedCurrency,
  interval,
  onApproved,
  onCancelled,
  fundingSource = "paypal",
}: PayPalSubscribeButtonProps) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const checkoutAttemptRef = useRef<string | null>(null);
  const checkoutDialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<{ close?: () => void } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    if (window.paypal) {
      setScriptReady(true);
    }
  }, []);

  const scriptSrc = useMemo(() => {
    const params = new URLSearchParams({
      "client-id": clientId,
      vault: "true",
      intent: "subscription",
    });

    if (fundingSource === "card") {
      params.set("enable-funding", "card");
      params.set("disable-funding", "paypal");
    }

    if (buyerCountry) {
      params.set("buyer-country", buyerCountry);
    }

    return `https://www.paypal.com/sdk/js?${params.toString()}`;
  }, [buyerCountry, clientId, fundingSource]);

  useEffect(() => {
    if (!checkoutOpen || !scriptFailed || disabled) return;
    beginCheckoutPreparation(capturePostHogClientEvent, {
      ...planFunnelProperties(entryPoint, interval, displayedCurrency, "pro"),
      billing_provider: "paypal",
      plan_surface: entryPoint === "onboarding" ? "onboarding" : "settings",
    }).finish("provider_sdk_unavailable");
    setMessage("PayPal checkout could not load. Please try again later.");
  }, [checkoutOpen, scriptFailed, disabled, entryPoint, interval, displayedCurrency]);

  useEffect(() => {
    if (!checkoutOpen || !scriptReady || disabled || !containerRef.current || !window.paypal) {
      return;
    }

    let cancelled = false;
    setMessage(null);

    const mount = async () => {
      try {
        instanceRef.current?.close?.();
      } catch {
        // Ignore stale renderer cleanup failures.
      }

      if (!containerRef.current) {
        return;
      }

      containerRef.current.innerHTML = "";

      const finishCheckout = (outcome: "provider_completed" | "canceled" | "failed") => {
        if (!checkoutAttemptRef.current) return;
        capturePostHogClientEvent("checkout_outcome", {
          billing_provider: "paypal", checkout_attempt_id: checkoutAttemptRef.current, checkout_outcome: outcome,
        });
        checkoutAttemptRef.current = null;
      };
      const buttons = window.paypal?.Buttons({
        fundingSource: fundingSource === "card" ? window.paypal?.FUNDING?.CARD : window.paypal?.FUNDING?.PAYPAL,
        style: {
          layout: "vertical",
          color: "white",
          shape: "pill",
          label: fundingSource === "card" ? "pay" : "subscribe",
          height: fundingSource === "card" ? 40 : 45,
        },
        createSubscription: async (_data, actions) => {
          onStart?.();
          capturePostHogClientEvent("billing_started", {
            billing_action: "create_subscription",
            funding_source: fundingSource,
          });
          const selection = {
            ...planFunnelProperties(entryPoint, interval, displayedCurrency, "pro"),
            billing_provider: "paypal",
            checkout_kind: "new_subscription",
            plan_surface: entryPoint === "onboarding" ? "onboarding" : "settings",
          };
          const preparation = beginCheckoutPreparation(capturePostHogClientEvent, selection);
          let step: CheckoutPreparationReason = "checkout_session_failed";
          try {
            const checkout = await prepareCheckout("paypal", planId, referralCode);
            step = "provider_handoff_failed";
            const subscriptionId = await actions.subscription.create({
              plan_id: planId,
              custom_id: checkout.checkoutId,
            });
            checkoutAttemptRef.current = checkout.checkoutId;
            preparation.finish(undefined, checkout.checkoutId);
            capturePostHogClientEvent("checkout_started", {
              ...selection, checkout_attempt_id: checkout.checkoutId, checkout_preparation_id: preparation.id,
            });
            return subscriptionId;
          } catch (error) {
            preparation.finish(step);
            throw error;
          }
        },
        onApprove: async () => {
          if (cancelled) {
            return;
          }

          finishCheckout("provider_completed");
          setMessage("Subscription approved. Clover will confirm access once PayPal posts the webhook.");
          onApproved?.();
        },
        onCancel: () => {
          if (cancelled) {
            return;
          }

          finishCheckout("canceled");
          setMessage("Subscription checkout was cancelled.");
          onCancelled?.();
        },
        onError: (error) => {
          if (cancelled) {
            return;
          }

          finishCheckout("failed");
          setMessage(error instanceof Error ? error.message : "Unable to start PayPal checkout.");
        },
      });

      if (!buttons) throw new Error("PayPal checkout is not available right now.");

      instanceRef.current = buttons;
      await buttons.render(containerRef.current);
    };

    void mount().catch(() => {
      if (cancelled) return;
      beginCheckoutPreparation(capturePostHogClientEvent, {
        ...planFunnelProperties(entryPoint, interval, displayedCurrency, "pro"),
        billing_provider: "paypal",
        plan_surface: entryPoint === "onboarding" ? "onboarding" : "settings",
      }).finish("provider_sdk_unavailable");
      setMessage("PayPal checkout could not load. Please try again later.");
    });

    return () => {
      cancelled = true;
      try {
        instanceRef.current?.close?.();
      } catch {
        // Ignore stale renderer cleanup failures.
      }
      instanceRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [checkoutOpen, customId, disabled, fundingSource, onApproved, onCancelled, onStart, planId, scriptReady, referralCode, entryPoint, interval, displayedCurrency]);

  return (
    <div className={className}>
      <button type="button" className="button button-primary" disabled={disabled} onClick={() => {checkoutDialogRef.current?.showModal();setCheckoutOpen(true);}}>Subscribe</button>
      <dialog ref={checkoutDialogRef} onClose={() => setCheckoutOpen(false)} className="clover-checkout-dialog" aria-label="PayPal checkout"><h2>Subscribe to Plus</h2>
      <ReferralCheckoutField value={referralCode} onChange={setReferralCode} provider="paypal" planId={planId} />
      <Script
        src={scriptSrc}
        strategy="afterInteractive"
        data-sdk-integration-source="button-factory"
        onLoad={() => { setScriptReady(true); setScriptFailed(false); }}
        onError={() => setScriptFailed(true)}
      />
      <div ref={containerRef} aria-live="polite" />
      <button type="button" className="button button-secondary" onClick={() => checkoutDialogRef.current?.close()}>Back</button>
      </dialog>
      {message ? <p className="billing-helper">{message}</p> : null}
      {!scriptReady && !scriptFailed ? <p className="billing-helper">Loading PayPal checkout...</p> : null}
      {disabled ? <p className="billing-helper">PayPal checkout is not configured for this environment yet.</p> : null}
    </div>
  );
}
