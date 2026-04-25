"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
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
  className?: string;
  disabled?: boolean;
  onApproved?: () => void;
  onCancelled?: () => void;
};

export function PayPalSubscribeButton({
  clientId,
  planId,
  customId,
  className,
  disabled = false,
  onApproved,
  onCancelled,
}: PayPalSubscribeButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<{ close?: () => void } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

    return `https://www.paypal.com/sdk/js?${params.toString()}`;
  }, [clientId]);

  useEffect(() => {
    if (!scriptReady || disabled || !containerRef.current || !window.paypal) {
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

      const buttons = window.paypal?.Buttons({
        style: {
          layout: "vertical",
          color: "white",
          shape: "pill",
          label: "paypal",
          height: 45,
        },
        createSubscription: (_data, actions) =>
          actions.subscription.create({
            plan_id: planId,
            custom_id: customId,
          }),
        onApprove: async () => {
          if (cancelled) {
            return;
          }

          setMessage("Subscription approved. Clover will confirm access once PayPal posts the webhook.");
          onApproved?.();
        },
        onCancel: () => {
          if (cancelled) {
            return;
          }

          setMessage("Subscription checkout was cancelled.");
          onCancelled?.();
        },
        onError: (error) => {
          if (cancelled) {
            return;
          }

          setMessage(error instanceof Error ? error.message : "Unable to start PayPal checkout.");
        },
      });

      if (!buttons) {
        setMessage("PayPal checkout is not available right now.");
        return;
      }

      instanceRef.current = buttons;
      await buttons.render(containerRef.current);
    };

    void mount();

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
  }, [customId, disabled, onApproved, onCancelled, planId, scriptReady]);

  return (
    <div className={className}>
      <Script
        src={scriptSrc}
        strategy="afterInteractive"
        data-sdk-integration-source="button-factory"
        onLoad={() => setScriptReady(true)}
      />
      <div ref={containerRef} aria-live="polite" />
      {message ? <p className="billing-helper">{message}</p> : null}
      {!scriptReady ? <p className="billing-helper">Loading PayPal checkout...</p> : null}
      {disabled ? <p className="billing-helper">PayPal checkout is not configured for this environment yet.</p> : null}
    </div>
  );
}
