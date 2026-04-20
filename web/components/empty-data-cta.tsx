import Link from "next/link";

type EmptyDataCtaProps = {
  eyebrow?: string;
  title: string;
  copy: string;
  importHref: string;
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
  importHref,
  accountHref,
  transactionHref,
  importLabel = "Import files",
  accountLabel = "Add an account",
  transactionLabel = "Add a transaction",
}: EmptyDataCtaProps) {
  return (
    <section className="transactions-empty-state">
      <p className="transactions-empty-state__eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p className="transactions-empty-state__copy">{copy}</p>
      <div className="transactions-empty-state__actions">
        <Link className="button button-primary button-small" href={importHref}>
          {importLabel}
        </Link>
        <Link className="button button-secondary button-small" href={accountHref}>
          {accountLabel}
        </Link>
        <Link className="button button-secondary button-small" href={transactionHref}>
          {transactionLabel}
        </Link>
      </div>
    </section>
  );
}
