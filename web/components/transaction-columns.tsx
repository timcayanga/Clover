"use client";
import { useEffect, useState } from "react";

const defaults = { date: true, account: true, category: true, tags: false };
type Columns = typeof defaults;
const storageKey = "clover.transactions.columns.v1";
export function useTransactionColumns() {
  const [columns, setColumns] = useState<Columns>(defaults);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && typeof saved === "object")
        setColumns(
          Object.fromEntries(
            Object.entries(defaults).map(([key, value]) => [
              key,
              typeof saved[key] === "boolean" ? saved[key] : value,
            ]),
          ) as Columns,
        );
    } catch {
      /* Storage is optional; retain the default columns. */
    }
  }, []);
  const toggle = (key: keyof Columns) =>
    setColumns((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* This session still works without storage. */
      }
      return next;
    });
  return { columns, toggle };
}
export function TransactionColumns({
  columns,
  toggle,
}: ReturnType<typeof useTransactionColumns>) {
  return (
    <details className="transaction-columns">
      <summary aria-label="Customize columns" title="Customize columns">
        ⋮
      </summary>
      <div className="transaction-columns__menu">
        <strong>Customize columns</strong>
        <small>Name and amount are always shown.</small>
        {Object.entries(columns).map(([key, checked]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(key as keyof Columns)}
            />
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </label>
        ))}
      </div>
    </details>
  );
}
export function TransactionTagPreview({
  tags,
}: {
  tags?: { id: string; name: string }[];
}) {
  if (!tags?.length)
    return (
      <span className="transaction-tags-preview" aria-label="No tags">
        —
      </span>
    );
  return (
    <div className="transaction-tags-preview">
      {tags.slice(0, 2).map((tag) => (
        <span key={tag.id}>{tag.name}</span>
      ))}
      {tags.length > 2 ? (
        <details>
          <summary aria-label={`Show all ${tags.length} tags`}>
            +{tags.length - 2}
          </summary>
          <div className="transaction-columns__menu">
            {tags.map((tag) => (
              <span key={tag.id}>{tag.name}</span>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
