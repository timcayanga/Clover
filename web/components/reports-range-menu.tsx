"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ReportsRange = "30d" | "90d" | "ytd";

type ReportsRangeMenuProps = {
  currentRange: ReportsRange;
  currentRangeLabel: string;
  currentFrom?: string;
  currentTo?: string;
};

const reportsRangeLabels: Record<ReportsRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
};

export function ReportsRangeMenu({
  currentRange,
  currentRangeLabel,
  currentFrom,
  currentTo,
}: ReportsRangeMenuProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(currentFrom ?? "");
  const [to, setTo] = useState(currentTo ?? "");
  const [optimisticRange, setOptimisticRange] = useState<ReportsRange | null>(null);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rangeHref = (range: ReportsRange) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("range", range);
    params.delete("from");
    params.delete("to");
    return `${pathname}?${params.toString()}`;
  };

  const prefetchStandardRanges = () => {
    (["30d", "90d", "ytd"] as const).forEach((range) => {
      if (range !== currentRange || currentFrom || currentTo) {
        router.prefetch(rangeHref(range));
      }
    });
  };

  const navigateWithParams = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    update(params);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const setRange = (range: ReportsRange) => {
    setOpen(false);
    setOptimisticRange(range);
    navigateWithParams((params) => {
      params.set("range", range);
      params.delete("from");
      params.delete("to");
    });
  };

  const applyCustomRange = () => {
    if (!from || !to || from > to) return;
    setOpen(false);
    navigateWithParams((params) => {
      params.set("from", from);
      params.set("to", to);
    });
  };

  useEffect(() => {
    setOptimisticRange(null);
    setFrom(currentFrom ?? "");
    setTo(currentTo ?? "");
  }, [currentFrom, currentRange, currentTo]);

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
    <div className={`reports-range-menu${isPending ? " is-pending" : ""}`} ref={menuRef} aria-busy={isPending}>
      <button
        className="reports-range-menu__summary"
        type="button"
        aria-label={`Change report range. Current range: ${currentRangeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
      title="Change report range"
        onPointerEnter={prefetchStandardRanges}
        onFocus={prefetchStandardRanges}
        onClick={() => {
          prefetchStandardRanges();
          setOpen((current) => !current);
        }}
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
              <button
                key={range}
                className={`pill pill-interactive ${(optimisticRange ?? currentRange) === range ? "pill-is-selected" : ""}`}
                type="button"
                onClick={() => setRange(range)}
              >
                {reportsRangeLabels[range]}
              </button>
            ))}
          </div>
          <div className="reports-range-menu__custom">
            <label>
              <span>From</span>
              <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </label>
            <button
              className="button button-primary button-small"
              type="button"
              disabled={!from || !to || from > to}
              onClick={applyCustomRange}
            >
              Apply dates
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
