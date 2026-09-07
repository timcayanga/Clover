"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TransactionsHeaderOverlay } from "./transactions-header-overlay";
import "./transaction-selection-toolbar.css";

type Props = {
  compact?: boolean; count: number; query: string; onQueryChange: (query: string) => void;
  searchTargetId?: string;
  filterOpen: boolean; onFilter: () => void; onEdit: () => void; onTags: () => void; onDelete: () => void; onClear: () => void;
};
export function TransactionSelectionToolbar({ compact, count, query, onQueryChange, filterOpen, onFilter, onEdit, onTags, onDelete, searchTargetId }: Props) {
  const [searchTarget, setSearchTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setSearchTarget(searchTargetId ? document.getElementById(searchTargetId) : null); }, [searchTargetId]);
  const [searchOpen, setSearchOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (filterOpen || count) setSearchOpen(false); }, [filterOpen, count]);
  useEffect(() => {
    if (!searchOpen) return;
    const timer = requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".transactions-mobile-search input")?.focus());
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(".transactions-mobile-search, .transaction-selection-toolbar, #transactions-mobile-search-trigger")) setSearchOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSearchOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { cancelAnimationFrame(timer); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [searchOpen]);
  const actions = <div className="transaction-selection-toolbar__actions" role="group" aria-label="Selected transaction actions">
    <button className="button button-secondary button-small transactions-action-button" type="button" onClick={onEdit}>Edit Selected</button>
    <button className="button button-secondary button-small transactions-action-button" type="button" onClick={onTags}>Tags</button>
    <button className="button button-secondary button-small transactions-action-button transaction-selection-toolbar__delete" type="button" onClick={onDelete}>Delete</button>
  </div>;
  const search = <input type="search" aria-label="Search" placeholder="Search" value={query} onPointerDown={(event) => { event.currentTarget.dataset.pointerFocus = "true"; }} onBlur={(event) => { delete event.currentTarget.dataset.pointerFocus; }} onChange={(event) => onQueryChange(event.target.value)} />;
  const searchButton = <button ref={trigger} type="button" className="icon-button transaction-selection-toolbar__search" aria-label="Search" aria-expanded={searchOpen} onClick={() => { if (filterOpen) onFilter(); setSearchOpen((value) => !value); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>;
  return <div className={`transaction-selection-toolbar${compact ? " transaction-selection-toolbar--compact" : ""}`}>
    {count ? compact ? <TransactionsHeaderOverlay className="transactions-selection-overlay">{actions}</TransactionsHeaderOverlay> : actions : <>
      {compact ? searchTarget ? createPortal(searchButton, searchTarget) : searchButton : search}
      <button type="button" className="button button-secondary button-small transactions-action-button transaction-selection-toolbar__filter" onClick={() => { setSearchOpen(false); onFilter(); }} aria-label="Filter transactions" aria-expanded={filterOpen}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>{!compact ? <span>Filter</span> : null}
      </button>
      {compact && searchOpen ? <TransactionsHeaderOverlay className="transactions-mobile-search">{search}</TransactionsHeaderOverlay> : null}
    </>}
  </div>;
}
