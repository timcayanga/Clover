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

  return (
    <article
      className={["financial-account-card", interactive ? "is-interactive" : null, className].filter(Boolean).join(" ")}
      style={{ ["--card-accent" as string]: accountBrand.accent }}
      data-state={state}
    >
      {interactive ? (
        <button
          className="financial-account-card__overlay"
          type="button"
          onClick={onOpen}
          aria-label={openLabel ?? `Open ${name}`}
        />
      ) : null}

      <div className="financial-account-card__content">
        <div className="financial-account-card__top">
          <AccountBrandMark accountBrand={accountBrand} label={name} />
          {showChevron ? (
            <button
              className="financial-account-card__chevron"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen?.();
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
