"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function InvestmentPortfolioFilters({ children, active }: { children: ReactNode; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [header, setHeader] = useState<Element | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const update = () => setHeader(media.matches ? document.querySelector("#investment-header-filter") : null);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
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
  const menu = <div ref={ref} className="portfolio-filter-menu" data-open={open}>
    <button ref={button} type="button" className="icon-button portfolio-filter-menu__trigger"
      aria-label={active ? "Filter portfolio (filters active)" : "Filter portfolio"}
      aria-expanded={open} aria-controls="portfolio-filter-options" onClick={() => setOpen(!open)}>
      <img src="/assets/organize/filter.svg" width={18} height={18} alt="" />
      <span className="portfolio-filter-menu__label-text">Filters</span>
      {active ? <span className="portfolio-filter-menu__badge" aria-hidden="true" /> : null}
    </button>
    <div id="portfolio-filter-options" className="portfolio-filter-menu__options" role="group" aria-label="Portfolio filters">{children}</div>
  </div>;
  return header ? createPortal(menu, header) : menu;
}
