"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function InvestmentPortfolioFilters({ children, active }: { children: ReactNode; active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div ref={ref} className="portfolio-filter-menu" data-open={open}>
    <button ref={button} type="button" className="icon-button portfolio-filter-menu__trigger"
      aria-label={active ? "Filter portfolio (filters active)" : "Filter portfolio"}
      aria-expanded={open} aria-controls="portfolio-filter-options" onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" strokeLinecap="round" /></svg>
      {active ? <span className="portfolio-filter-menu__badge" aria-hidden="true" /> : null}
    </button>
    <div id="portfolio-filter-options" className="portfolio-filter-menu__options" role="group" aria-label="Portfolio filters">{children}</div>
  </div>;
}
