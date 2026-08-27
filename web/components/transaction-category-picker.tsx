"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CategoryBrandMark } from "@/components/category-brand-mark";

export type TransactionPickerCategory = {
  id: string;
  name: string;
  type: string;
  parentCategoryId?: string | null;
};

type TransactionCategoryPickerProps = {
  categories: TransactionPickerCategory[];
  selectedId: string;
  onSelect: (category: TransactionPickerCategory) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
};

const normalize = (value: string) => value.trim().toLowerCase();
const sortOtherLast = (left: TransactionPickerCategory, right: TransactionPickerCategory) => {
  const leftOther = normalize(left.name) === "other";
  const rightOther = normalize(right.name) === "other";
  if (leftOther !== rightOther) return leftOther ? 1 : -1;
  return left.name.localeCompare(right.name);
};

export function TransactionCategoryPicker({
  categories,
  selectedId,
  onSelect,
  buttonRef,
  className,
  buttonClassName,
  menuClassName,
  ariaLabel = "Choose category",
}: TransactionCategoryPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = categories.find((category) => category.id === selectedId) ?? null;

  const groups = useMemo(() => {
    const visible = categories.filter((category) => normalize(category.name).includes(normalize(query)));
    const parents = visible.filter((category) => !category.parentCategoryId).sort(sortOtherLast);
    const childrenByParent = new Map<string, TransactionPickerCategory[]>();

    for (const category of visible.filter((entry) => entry.parentCategoryId)) {
      const entries = childrenByParent.get(category.parentCategoryId ?? "") ?? [];
      entries.push(category);
      childrenByParent.set(category.parentCategoryId ?? "", entries.sort(sortOtherLast));
    }

    const grouped = parents.map((parent) => ({ parent, children: childrenByParent.get(parent.id) ?? [] }));
    const visibleIds = new Set(visible.map((category) => category.id));
    const orphaned = visible
      .filter((category) => category.parentCategoryId && !visibleIds.has(category.parentCategoryId))
      .sort(sortOtherLast);

    const order = ["expense", "income", "transfer"];
    const sections = order
      .map((type) => ({
        type,
        label: type === "expense" ? "Expenses" : type === "income" ? "Income" : "Transfers",
        groups: grouped.filter(({ parent }) => parent.type === type),
        orphaned: orphaned.filter((category) => category.type === type),
      }))
      .filter((section) => section.groups.length > 0 || section.orphaned.length > 0);

    return sections;
  }, [categories, query]);

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

  const renderOption = (category: TransactionPickerCategory, child = false) => (
    <button
      key={category.id}
      type="button"
      className={`transaction-category-picker__option ${child ? "is-child" : ""} ${category.id === selectedId ? "is-selected" : ""}`}
      onClick={() => {
        onSelect(category);
        setOpen(false);
        setQuery("");
      }}
      role="option"
      aria-selected={category.id === selectedId}
    >
      <CategoryBrandMark categoryName={category.name} size="100%" radius={10} />
      <span>{category.name}</span>
      {category.id === selectedId ? <span className="transaction-category-picker__check">✓</span> : null}
    </button>
  );

  return (
    <div className={`transaction-category-picker ${className ?? ""}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`transactions-manual-picker__button transactions-manual-picker__button--plain ${buttonClassName ?? ""}`.trim()}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="transactions-manual-picker__text">{selected?.name ?? "Other"}</span>
        <span className="transactions-manual-picker__chevron" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className={`transaction-category-picker__menu ${menuClassName ?? ""}`.trim()} role="listbox" aria-label={ariaLabel}>
          <div className="transaction-category-picker__head">
            <strong>Choose category</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close categories">×</button>
          </div>
          <label className="transaction-category-picker__search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search categories" autoFocus />
          </label>
          <div className="transaction-category-picker__list">
            {groups.map((section) => (
              <section className="transaction-category-picker__type-group" key={section.type} aria-label={section.label}>
                <p>{section.label}</p>
                {section.groups.map(({ parent, children }) => (
                  <div className="transaction-category-picker__group" key={parent.id}>
                    {renderOption(parent)}
                    {children.length > 0 ? <div className="transaction-category-picker__children">{children.map((child) => renderOption(child, true))}</div> : null}
                  </div>
                ))}
                {section.orphaned.map((category) => renderOption(category))}
              </section>
            ))}
          </div>
          <Link className="transaction-category-picker__manage" href="/transactions/categories" onClick={() => setOpen(false)}>
            Manage categories
          </Link>
        </div>
      ) : null}
    </div>
  );
}
