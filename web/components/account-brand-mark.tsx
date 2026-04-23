"use client";

import { useState } from "react";
import type { AccountBrand } from "@/lib/account-brand";

export function AccountBrandMark({ accountBrand, label }: { accountBrand: AccountBrand; label: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="accounts-brand-mark" style={{ background: accountBrand.background, color: accountBrand.foreground }}>
      {accountBrand.logoUrl && !failed ? (
        <img
          src={accountBrand.logoUrl}
          alt={label}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <strong>{accountBrand.label.slice(0, 2).toUpperCase()}</strong>
      )}
    </span>
  );
}
