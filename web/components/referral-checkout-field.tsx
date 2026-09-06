"use client";
import { useEffect, useState } from "react";

export function ReferralCheckoutField({
  value,
  onChange,
  provider,
  planId,
}: {
  value: string;
  onChange: (value: string) => void;
  provider: "paypal" | "paddle";
  planId: string;
}) {
  const [terms, setTerms] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) onChange(code.trim().toUpperCase().slice(0, 64));
  }, [onChange]);
  return (
    <div style={{ marginBlock: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        Referral code (optional)
        <input
          style={{ minHeight: 44, maxWidth: "100%" }}
          value={value}
          maxLength={64}
          autoCapitalize="characters"
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setTerms("");
          }}
          placeholder="Enter your friend’s code"
        />
      </label>
      <small>
        For eligible first paid purchases. Your referrer earns Pro time; your
        checkout price is unchanged.
      </small>
      {value && (
        <button
          type="button"
          disabled={checking}
          style={{ minHeight: 44 }}
          onClick={() => {
            setChecking(true);
            void prepareCheckout(provider, planId, value)
              .then((r) => setTerms(`Code is eligible. ${r.terms}`))
              .catch((e) => setTerms(e.message))
              .finally(() => setChecking(false));
          }}
        >
          Check code & view terms
        </button>
      )}
      {terms && (
        <p role="status" style={{ whiteSpace: "pre-wrap" }}>
          {terms}
        </p>
      )}
    </div>
  );
}

export async function prepareCheckout(
  provider: "paypal" | "paddle",
  planId: string,
  code: string,
) {
  const response = await fetch("/api/billing/referral-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, planId, code }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error ?? "Unable to apply referral.");
  return payload as {
    checkoutId: string;
    terms: string;
    referralApplied: boolean;
  };
}
