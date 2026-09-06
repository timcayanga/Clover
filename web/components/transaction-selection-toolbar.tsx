"use client";

import { useEffect, useRef, useState } from "react";
import "./transaction-selection-toolbar.css";

type Props = {
  compact?: boolean;
  count: number;
  query: string;
  onQueryChange: (query: string) => void;
  filterOpen: boolean;
  onFilter: () => void;
  onEdit: () => void;
  onTags: () => void;
  onDelete: () => void;
  onClear: () => void;
};

export function TransactionSelectionToolbar(props: Props) {
  const { compact, count, query, onQueryChange, filterOpen, onFilter, onEdit, onTags, onDelete, onClear } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(".transaction-selection-toolbar__popover button")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => { setOpen(false); }, [count, compact]);
  const act = (action: () => void) => { setOpen(false); action(); };
  const clear = () => {
    act(onClear);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("input, button")?.focus());
  };
  const actions = <>
    <button type="button" onClick={() => act(onEdit)}>{count === 1 ? "Edit" : "Edit selected"}</button>
    <button type="button" onClick={() => act(onTags)}>Tags</button>
    <button type="button" className="transaction-selection-toolbar__delete" onClick={() => act(onDelete)}>Delete</button>
    <button type="button" onClick={clear} aria-label="Clear selection">{compact ? "Clear selection" : "×"}</button>
  </>;
  const filter = <button type="button" className="icon-button transaction-selection-toolbar__filter" onClick={onFilter} aria-label="Filter transactions" aria-expanded={filterOpen}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
    {!compact ? <span>Filter</span> : null}
  </button>;
  return <div ref={root} className={`transaction-selection-toolbar${compact ? " transaction-selection-toolbar--compact" : ""}`}>
    {compact ? count > 0 ? <>
      <button ref={trigger} className="transaction-selection-toolbar__trigger" type="button" aria-expanded={open} aria-label={`Actions for ${count} selected transactions`} onClick={() => setOpen(!open)}>Actions · {count}</button>
      {open ? <div className="transaction-selection-toolbar__popover" role="group" aria-label="Selected transaction actions">{actions}</div> : null}
    </> : filter : count > 0 ? <>
      <span className="transaction-selection-toolbar__count" role="status" aria-live="polite">{count} selected</span>
      <div className="transaction-selection-toolbar__actions">{actions}</div>
    </> : <>
      <input type="search" aria-label="Search transactions" placeholder="Search transactions" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      {filter}
    </>}
  </div>;
}
