"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { reportFilterSelection } from "@/lib/report-filter-policy";

type ReportsRange = "30d" | "90d" | "ytd";
type Options = {
  profiles: { id: string; name: string }[];
  currentProfile: string;
  accounts: { id: string; name: string }[];
  categories: string[];
  currencies: string[];
  currentCurrency: string;
  defaultCurrency: string;
};
const emptyOptions: Options = {
  profiles: [],
  currentProfile: "",
  accounts: [],
  categories: [],
  currencies: [],
  currentCurrency: "PHP",
  defaultCurrency: "PHP",
};
const reportsRangeLabels = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
};
const filterKeys = [
  "range",
  "from",
  "to",
  "currency",
  "accountId",
  "accounts",
  "categories",
  "review",
  "transfers",
  "compare",
  "filter",
];
export function ReportsRangeMenu({
  currentRange,
  currentRangeLabel,
  currentFrom,
  currentTo,
  options = emptyOptions,
  children,
}: {
  currentRange: ReportsRange;
  currentRangeLabel: string;
  currentFrom?: string;
  currentTo?: string;
  options?: Options;
  children?: ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const selection = reportFilterSelection(
    Object.fromEntries(params?.entries() ?? []),
  );
  const [open, setOpen] = useState(false),
    [range, setRange] = useState(currentRange),
    [from, setFrom] = useState(currentFrom ?? ""),
    [to, setTo] = useState(currentTo ?? "");
  const [profile, setProfile] = useState(options.currentProfile),
    [currency, setCurrency] = useState(options.currentCurrency),
    [compare, setCompare] = useState(params?.get("compare") ?? "previous");
  const [accounts, setAccounts] = useState(selection.accounts),
    [categories, setCategories] = useState(selection.categories),
    [review, setReview] = useState(selection.review),
    [transfers, setTransfers] = useState(selection.transfers);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const changedProfile = profile !== options.currentProfile;
  const count =
    Number(Boolean(params?.get("currency"))) +
    Number(selection.accounts.length > 0) +
    Number(selection.categories.length > 0) +
    Number(selection.review !== "all") +
    Number(selection.transfers !== "exclude") +
    Number(params?.get("compare") === "year");
  const show = () => {
    setRange(currentRange);
    setFrom(currentFrom ?? "");
    setTo(currentTo ?? "");
    setProfile(options.currentProfile);
    setCurrency(options.currentCurrency);
    setCompare(params?.get("compare") ?? "previous");
    setAccounts(selection.accounts);
    setCategories(selection.categories);
    setReview(selection.review);
    setTransfers(selection.transfers);
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handle);
      trigger.current?.focus();
    };
  }, [open]);
  const navigate = (reset = false) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    filterKeys.forEach((key) => next.delete(key));
    if (!reset) {
      next.set("range", range);
      if (from && to) {
        next.set("from", from);
        next.set("to", to);
      }
      if (currency && !changedProfile) next.set("currency", currency);
      if (compare === "year") next.set("compare", compare);
      if (!changedProfile && accounts.length)
        next.set("accounts", accounts.join(","));
      if (!changedProfile && categories.length)
        next.set("categories", JSON.stringify(categories));
      if (review !== "all") next.set("review", review);
      if (transfers !== "exclude") next.set("transfers", transfers);
      if (changedProfile && options.profiles.some((p) => p.id === profile))
        persistSelectedWorkspaceId(profile);
    }
    window.location.replace(`${pathname}?${next.toString()}`);
  };
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  return (
    <div className="reports-range-menu">
      <button
        ref={trigger}
        className="reports-range-menu__summary"
        type="button"
        aria-label={`Filters. Current range: ${currentRangeLabel}${count ? `. ${count} active filters` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <img src="/assets/organize/filter.svg" alt="" width={18} height={18} />
        <span className="reports-filter-label">Filters</span>
        {count ? <span className="reports-filter-count">{count}</span> : null}
      </button>
      {open
        ? createPortal(
            <div
              className="reports-filter-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                ref={dialog}
                className="reports-filter-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Filter reports"
              >
                <header>
                  <h2>Filter reports</h2>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Close report filters"
                    onClick={() => setOpen(false)}
                  >
                    ×
                  </button>
                </header>
                {options.profiles.length ? (
                  <label>
                    Profile
                    <select
                      value={profile}
                      onChange={(e) => setProfile(e.target.value)}
                    >
                      {options.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Period
                  <select
                    value={range}
                    onChange={(e) => {
                      setRange(e.target.value as ReportsRange);
                      setFrom("");
                      setTo("");
                    }}
                  >
                    {Object.entries(reportsRangeLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <div className="reports-filter-dates">
                  <label>
                    From
                    <input
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Compare with
                  <select
                    value={compare}
                    onChange={(e) => setCompare(e.target.value)}
                  >
                    <option value="previous">Previous period</option>
                    <option value="year">Same dates last year</option>
                  </select>
                </label>
                <label>
                  Currency
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="ALL">All currencies, shown separately</option>
                    {options.currencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                {changedProfile ? (
                  <p>
                    Apply filters to load this Profile’s accounts and
                    categories.
                  </p>
                ) : (
                  <>
                    <details>
                      <summary>
                        Accounts{" "}
                        <span>
                          {accounts.length
                            ? `${accounts.length} selected`
                            : "All accounts"}
                        </span>
                      </summary>
                      <div className="reports-filter-options">
                        {options.accounts.map((a) => (
                          <label key={a.id}>
                            <input
                              type="checkbox"
                              checked={accounts.includes(a.id)}
                              onChange={() =>
                                setAccounts(toggle(accounts, a.id))
                              }
                            />
                            {a.name}
                          </label>
                        ))}
                      </div>
                    </details>
                    <details>
                      <summary>
                        Categories{" "}
                        <span>
                          {categories.length
                            ? `${categories.length} selected`
                            : "All categories"}
                        </span>
                      </summary>
                      <div className="reports-filter-options">
                        {Array.from(
                          new Set([...options.categories, "Uncategorized"]),
                        ).map((name) => (
                          <label key={name}>
                            <input
                              type="checkbox"
                              checked={categories.includes(name)}
                              onChange={() =>
                                setCategories(toggle(categories, name))
                              }
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                    </details>
                  </>
                )}
                <label>
                  Transfers
                  <select
                    value={transfers}
                    onChange={(e) => setTransfers(e.target.value)}
                  >
                    <option value="exclude">Excluded</option>
                    <option value="include">Include in activity</option>
                    <option value="only">Transfers only</option>
                  </select>
                </label>
                <label>
                  Review status
                  <select
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                  >
                    <option value="all">All transactions</option>
                    <option value="confirmed">Confirmed or edited</option>
                    <option value="pending">Needs review</option>
                  </select>
                </label>
                <p>
                  Category and review filters apply to transaction reports.
                  Balance and net worth charts retain all account movements.
                  Transfers never count as income or expenses.
                </p>
                {children}
                {(from || to) && (!from || !to || from > to) ? (
                  <p role="alert">Choose both dates, with From before To.</p>
                ) : null}
                <footer>
                  <button
                    className="button"
                    type="button"
                    onClick={() => navigate(true)}
                  >
                    Reset
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={Boolean(
                      (from || to) && (!from || !to || from > to),
                    )}
                    onClick={() => navigate()}
                  >
                    Apply filters
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
