"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AccountBrandMark } from "@/components/account-brand-mark";
import type { AccountBrand } from "@/lib/account-brand";

export type TransactionPickerAccount = {
  id: string;
  label: string;
  subtitle?: string | null;
  brand: AccountBrand;
};

type TransactionAccountPickerProps = {
  accounts: TransactionPickerAccount[];
  selectedId: string;
  onSelect: (account: TransactionPickerAccount) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
  placeholder?: string;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function TransactionAccountPicker({
  accounts,
  selectedId,
  onSelect,
  buttonRef,
  className,
  buttonClassName,
  menuClassName,
  ariaLabel = "Choose account",
  placeholder = "Choose account",
}: TransactionAccountPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = accounts.find((account) => account.id === selectedId) ?? null;
  const visibleAccounts = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return accounts;
    return accounts.filter((account) =>
      normalize(`${account.label} ${account.subtitle ?? ""}`).includes(normalizedQuery)
    );
  }, [accounts, query]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={`transaction-account-picker ${className ?? ""}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`transactions-manual-picker__button transactions-manual-picker__button--plain ${buttonClassName ?? ""}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="transactions-manual-picker__text">{selected?.label ?? placeholder}</span>
        <span className="transactions-manual-picker__chevron" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className={`transaction-account-picker__menu ${menuClassName ?? ""}`.trim()} role="listbox" aria-label={ariaLabel}>
          <div className="transaction-account-picker__head">
            <strong>{ariaLabel}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close accounts">×</button>
          </div>
          {accounts.length > 7 ? (
            <label className="transaction-account-picker__search">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" autoFocus />
            </label>
          ) : null}
          <div className="transaction-account-picker__list">
            {visibleAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`transaction-account-picker__option ${account.id === selectedId ? "is-selected" : ""}`.trim()}
                role="option"
                aria-selected={account.id === selectedId}
                onClick={() => {
                  onSelect(account);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="transactions-manual-picker__brand" aria-hidden="true">
                  <AccountBrandMark accountBrand={account.brand} label={account.label} />
                </span>
                <span className="transaction-account-picker__option-text">
                  <strong>{account.label}</strong>
                </span>
                {account.id === selectedId ? <span className="transaction-account-picker__check" aria-hidden="true">✓</span> : null}
              </button>
            ))}
            {visibleAccounts.length === 0 ? <p className="transaction-account-picker__empty">No matching accounts</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
