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
  className,
  state,
  showChevron = true,
}: FinancialAccountCardProps) {
  const interactive = typeof onOpen === "function";
  const isMayaCard = accountBrand.label.trim().toLowerCase() === "maya";
  const cardBackground = isMayaCard
    ? "linear-gradient(135deg, rgba(3, 6, 10, 0.99), rgba(10, 14, 20, 0.98))"
    : accountBrand.background;
  const cardAccent = isMayaCard ? "#05070A" : accountBrand.accent;
  const cardForeground = isMayaCard ? "#f8fafc" : accountBrand.foreground;
  const handleOpen = () => {
    onOpen?.();
  };

  return (
    <article
      className={["financial-account-card", interactive ? "is-interactive" : null, className].filter(Boolean).join(" ")}
      data-brand-label={accountBrand.label}
      style={
        {
          ["--card-accent" as string]: cardAccent,
          background: cardBackground,
          color: cardForeground,
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
        <div className="financial-account-card__top">
          <AccountBrandMark accountBrand={accountBrand} label={name} />
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
          <strong className="financial-account-card__name">{name}</strong>
          {accountNumber ? <span className="financial-account-card__number">{accountNumber}</span> : null}
        </div>

        <div className="financial-account-card__amount">{amount}</div>
      </div>
    </article>
  );
}
