"use client";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TransactionsHeaderOverlay({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const header = document.querySelector(".content--transactions .topbar") ?? document.querySelector(".topbar");
    const update = () => setTop(Math.max(0, header?.getBoundingClientRect().bottom ?? 64) + 4);
    update();
    const observer = new ResizeObserver(update);
    if (header) observer.observe(header);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); window.visualViewport?.removeEventListener("resize", update); };
  }, []);
  return top === null ? null : createPortal(<div className={`transactions-header-overlay ${className}`} style={{ top, maxHeight: `calc(100dvh - ${top + 88}px)` }}>{children}</div>, document.body);
}

export function TransactionFilterRow({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  return <details className="transaction-filter-row">
    <summary><span>{label}</span><span className="transaction-filter-row__summary" title={summary}>{summary}</span><span className="transaction-filter-row__chevron" aria-hidden="true">⌄</span></summary>
    <div className="transaction-filter-row__body">{children}</div>
  </details>;
}
