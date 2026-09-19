import type { CSSProperties } from "react";

const icons: Record<string, string> = { Name: "name", Type: "type", Date: "date", Account: "account", Category: "category", Amount: "amount", Tags: "tags", Notes: "notes", Dates: "date", Accounts: "account", Categories: "category", Types: "type", Currency: "amount", Status: "type" };

export function TransactionDetailLabel({ label }: { label: string }) {
  const icon = icons[label];
  const mask = `url("/figma-icons/transaction-details/${icon}.svg")`;
  return <span className="transaction-detail-label">{label === "Warnings" ? <span className="warning-mark warning-mark--small" aria-hidden="true" /> : icon ? <span aria-hidden="true" className="transaction-detail-label__icon" style={{ maskImage: mask, WebkitMaskImage: mask } as CSSProperties} /> : null}{label}</span>;
}
