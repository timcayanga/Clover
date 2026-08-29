import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { AccountLogoPicker } from "@/components/account-logo-picker";
import type { AccountBrand } from "@/lib/account-brand";

type FinancialAccountCardProps = {
  accountBrand: AccountBrand;
  name: string;
  accountNumber?: string | null;
  amount: string;
  openLabel?: string;
  onOpen?: () => void;
  amountLabel?: string;
  onAmountClick?: () => void;
  editableName?: string;
  editableAccountNumber?: string;
  editableAmount?: string;
  onNameCommit?: (value: string) => Promise<void> | void;
  onAccountNumberCommit?: (value: string) => Promise<void> | void;
  onAmountCommit?: (value: string) => Promise<void> | void;
  logoUrl?: string | null;
  onLogoCommit?: (logoUrl: string | null) => Promise<void> | void;
  className?: string;
  state?: "deleting" | "loading" | undefined;
  showChevron?: boolean;
};

function InlineCardField({
  value,
  displayValue,
  label,
  className,
  inputMode,
  onCommit,
}: {
  value: string;
  displayValue: string;
  label: string;
  className: string;
  inputMode?: "decimal";
  onCommit: (value: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    if (savingRef.current) return;
    const nextValue = draft.trim();
    if (nextValue === value.trim()) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onCommit(nextValue);
      setEditing(false);
    } catch {
      inputRef.current?.focus();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`${className} financial-account-card__inline-input`}
        value={draft}
        inputMode={inputMode}
        aria-label={label}
        disabled={saving}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void commit()}
      />
    );
  }

  return (
    <button
      className={`${className} financial-account-card__inline-trigger`}
      type="button"
      aria-label={label}
      data-empty={displayValue ? undefined : "true"}
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {displayValue}
    </button>
  );
}

export function FinancialAccountCard({
  accountBrand,
  name,
  accountNumber,
  amount,
  openLabel,
  onOpen,
  amountLabel,
  onAmountClick,
  editableName,
  editableAccountNumber,
  editableAmount,
  onNameCommit,
  onAccountNumberCommit,
  onAmountCommit,
  logoUrl,
  onLogoCommit,
  className,
  state,
  showChevron = true,
}: FinancialAccountCardProps) {
  const interactive = typeof onOpen === "function";
  const amountInteractive = typeof onAmountClick === "function";
  const handleOpen = () => {
    onOpen?.();
  };

  return (
    <article
      className={["financial-account-card", interactive ? "is-interactive" : null, className].filter(Boolean).join(" ")}
      data-brand-label={accountBrand.label}
      style={
        {
          ["--card-accent" as string]: accountBrand.accent,
          background: accountBrand.background,
          color: accountBrand.foreground,
        } as CSSProperties
      }
      data-state={state}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleOpen : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleOpen();
              }
            }
          : undefined
      }
    >
      <div className="financial-account-card__content">
        <div className="financial-account-card__head">
          <div className="financial-account-card__identity">
            {onLogoCommit ? (
              <AccountLogoPicker
                accountBrand={accountBrand}
                accountName={name}
                currentLogoUrl={logoUrl}
                onCommit={onLogoCommit}
              />
            ) : (
              <AccountBrandMark accountBrand={accountBrand} label={name} />
            )}
            {onNameCommit && editableName !== undefined ? (
              <InlineCardField
                value={editableName}
                displayValue={name}
                label={`Edit ${name} name`}
                className="financial-account-card__name"
                onCommit={onNameCommit}
              />
            ) : (
              <strong className="financial-account-card__name">{name}</strong>
            )}
          </div>
          {showChevron ? (
            <button
              className="financial-account-card__chevron"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpen();
              }}
              aria-label={openLabel ?? `Open ${name}`}
              disabled={!interactive}
            >
              <span aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>

        <div className="financial-account-card__meta">
          {onAccountNumberCommit && editableAccountNumber !== undefined ? (
            <InlineCardField
              value={editableAccountNumber}
              displayValue={accountNumber ?? ""}
              label={`Edit ${name} account number`}
              className="financial-account-card__number"
              onCommit={onAccountNumberCommit}
            />
          ) : accountNumber ? (
            <span className="financial-account-card__number" title={accountNumber}>
              {accountNumber}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        {onAmountCommit && editableAmount !== undefined ? (
          <InlineCardField
            value={editableAmount}
            displayValue={amount}
            label={amountLabel ?? `Change ${name} balance`}
            className="financial-account-card__amount"
            inputMode="decimal"
            onCommit={onAmountCommit}
          />
        ) : amountInteractive ? (
          <button
            className="financial-account-card__amount financial-account-card__amount-button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAmountClick?.();
            }}
            aria-label={amountLabel ?? `Change ${name} balance`}
          >
            {amount}
          </button>
        ) : (
          <div className="financial-account-card__amount">{amount}</div>
        )}
      </div>
    </article>
  );
}
