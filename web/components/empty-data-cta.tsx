import type { ReactNode } from "react";
import Link from "next/link";

type EmptyDataCtaProps = {
  eyebrow?: string;
  title: string;
  copy: string;
  illustration?: string;
  illustrationAlt?: string;
  actions?: ReactNode;
  importHref?: string;
  accountHref: string;
  transactionHref: string;
  importLabel?: string;
  accountLabel?: string;
  transactionLabel?: string;
};

export function EmptyDataCta({
  eyebrow = "Start here",
  title,
  copy,
  illustration,
  illustrationAlt = "",
  actions,
  importHref,
  accountHref,
  transactionHref,
  importLabel = "Import files",
  accountLabel = "Add an account",
  transactionLabel = "Add a transaction",
}: EmptyDataCtaProps) {
  return (
    <section className="transactions-empty-state">
      {illustration ? (
        <div className="transactions-empty-state__art" aria-hidden={illustrationAlt === ""}>
          <img src={illustration} alt={illustrationAlt} loading="lazy" decoding="async" />
        </div>
      ) : null}
      <p className="transactions-empty-state__eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p className="transactions-empty-state__copy">{copy}</p>
      {actions ? (
        <div className="transactions-empty-state__actions">{actions}</div>
      ) : (
        <div className="transactions-empty-state__actions">
          {importHref ? (
            <Link className="button button-primary button-small" href={importHref}>
              {importLabel}
            </Link>
          ) : null}
          <Link className="button button-secondary button-small" href={accountHref}>
            {accountLabel}
          </Link>
          <Link className="pill-link pill-link--inline transactions-empty-state__manual-link" href={transactionHref}>
            {transactionLabel}
          </Link>
        </div>
      )}
    </section>
  );
}
