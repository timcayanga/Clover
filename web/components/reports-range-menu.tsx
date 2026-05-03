"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ReportsRange = "30d" | "90d" | "ytd";
type ReportsSection = "overview" | "spending" | "trends" | "advanced";

type ReportsRangeMenuProps = {
  currentRange: ReportsRange;
  currentSection: ReportsSection;
  currentRangeLabel: string;
};

const reportsRangeLabels: Record<ReportsRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
};

const buildReportsHref = (range: ReportsRange, section: ReportsSection) => `?${new URLSearchParams({ range, section }).toString()}`;

export function ReportsRangeMenu({
  currentRange,
  currentSection,
  currentRangeLabel,
}: ReportsRangeMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current || menuRef.current.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="reports-range-menu" ref={menuRef}>
      <button
        className="reports-range-menu__summary"
        type="button"
        aria-label={`Change report range. Current range: ${currentRangeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change report range"
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v12A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-12A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm12.5 8h-15v8.5c0 .276.224.5.5.5h14a.5.5 0 0 0 .5-.5V10Zm-14-4A.5.5 0 0 0 5 8.5V8h14v.5a.5.5 0 0 0-.5-.5h-14Z" />
        </svg>
        <span className="sr-only">Change report range</span>
      </button>

      {open ? (
        <div className="reports-range-menu__panel glass" role="menu" aria-label="Report range">
          <div className="reports-range-menu__panel-head">
            <p className="reports-range-menu__label">Showing {currentRangeLabel}</p>
            <button
              className="reports-range-menu__close"
              type="button"
              aria-label="Close report range menu"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="reports-range-menu__choices">
            {(["30d", "90d", "ytd"] as const).map((range) => (
              <Link
                key={range}
                className={`pill pill-interactive ${currentRange === range ? "pill-is-selected" : ""}`}
                href={buildReportsHref(range, currentSection)}
                onClick={() => setOpen(false)}
              >
                {reportsRangeLabels[range]}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
