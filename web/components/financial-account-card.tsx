import type { CSSProperties } from "react";
import { AccountBrandMark } from "@/components/account-brand-mark";
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
  className?: string;
  state?: "deleting" | "loading" | undefined;
  showChevron?: boolean;
};

export function FinancialAccountCard({
  accountBrand,
  name,
  accountNumber,
  amount,
  openLabel,
  onOpen,
  amountLabel,
  onAmountClick,
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
            <AccountBrandMark accountBrand={accountBrand} label={name} />
            <strong className="financial-account-card__name">{name}</strong>
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
          {accountNumber ? <span className="financial-account-card__number">{accountNumber}</span> : <span aria-hidden="true" />}
        </div>

        {amountInteractive ? (
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
