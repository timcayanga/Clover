"use client";

import { useState } from "react";
import type { AccountBrand } from "@/lib/account-brand";

export function AccountBrandMark({ accountBrand, label }: { accountBrand: AccountBrand; label: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className="accounts-brand-mark"
      style={{
        background: accountBrand.background,
        color: accountBrand.foreground,
        boxShadow: `inset 0 0 0 1px ${accountBrand.accent}55`,
      }}
      title={accountBrand.label}
    >
      {accountBrand.logoSrc && !failed ? (
        <img
          src={accountBrand.logoSrc}
          alt={label}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : accountBrand.fallbackIconSrc ? (
        <img
          src={accountBrand.fallbackIconSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 4l9 6.5" />
          <path d="M5 20h14" />
          <path d="M6.5 10.5V17" />
          <path d="M12 10.5V17" />
          <path d="M17.5 10.5V17" />
        </svg>
      )}
    </span>
  );
}
