"use client";
import {
  circleActivityEmoji,
  circleCategoryTotals,
} from "../../shared/circle-overview";
import { CloverMascot } from "./clover-mascot";
import { CollectionCard } from "./collection-card";
import { CategoryBrandMark } from "./category-brand-mark";
import { getNavigationIconSrc } from "@/lib/navigation-icons";
import { formatCurrencyAmount as money } from "@/lib/currency-format";
import type {
  CircleSummary,
  CircleBudgetSummary,
  CircleGoalSummary,
} from "@/lib/circles";

export function CircleTabIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Overview: "M4 4h5v5H4z M15 4h5v5h-5z M4 15h5v5H4z M15 15h5v5h-5z",
    Expenses: "M6 3h12v18l-3-2-3 2-3-2-3 2V3 M9 7h6 M9 11h6",
    Budgets: "M3 7h18v13H3z M3 7l14-4v4 M16 12h5v4h-5z",
    Goals: "M5 21V3 M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0",
    Recurring:
      "M4 9a8 8 0 0 1 14-4l2 2 M20 3v4h-4 M20 15A8 8 0 0 1 6 19l-2-2 M4 21v-4h4",
    Contributions:
      "M3 8h18v5H3z M5 13v8h14v-8 M12 8v13 M12 8C4 8 5 1 8 3l4 5c8 0 7-7 4-5z",
    Activity: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M12 7v5l4 2",
    People: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 22v-3a8 8 0 0 1 16 0v3",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.Overview} />
    </svg>
  );
}
export function CircleEmpty({
  title,
  pose = "circles",
}: {
  title: string;
  pose?: "circles" | "budget" | "savings" | "calendar" | "reports";
}) {
  return (
    <div className="circles-soft-empty circles-soft-empty--illustrated">
      <CloverMascot pose={pose} size={112} />
      <p>{title}</p>
    </div>
  );
}
export function CircleActivityIcon({ action }: { action: string }) {
  return (
    <span className="circle-activity-icon" aria-hidden="true">
      {circleActivityEmoji(action)}
    </span>
  );
}

export function CirclePlanningCard({
  item,
  kind,
  onOpen,
  onEdit,
}: {
  item: CircleBudgetSummary | CircleGoalSummary;
  kind: "budget" | "goal";
  onOpen: () => void;
  onEdit?: () => void;
}) {
  const current = "spentAmount" in item ? item.spentAmount : item.currentAmount;
  const progress = Math.max(0, Math.min(100, item.progressPercent));
  const exceeded = kind === "budget" && item.progressPercent >= 100,
    warning = kind === "budget" && item.progressPercent >= 80;
  const color = exceeded
    ? "#e65064"
    : warning
      ? "#d8841e"
      : kind === "budget"
        ? "#00abc0"
        : "#35b875";
  return (
    <div className="circle-planning-card">
      <CollectionCard
        kind={kind}
        name={item.name}
        subtitle={
          kind === "budget"
            ? "cadence" in item
              ? item.cadence === "once"
                ? "One-Time Budget"
                : `${item.cadence.charAt(0).toUpperCase() + item.cadence.slice(1)} Budget`
              : "Shared Budget"
            : "Shared Goal"
        }
        icon={
          <img
            src={getNavigationIconSrc(
              kind === "budget" ? "budgeting" : "goals",
            )}
            width={32}
            height={32}
            alt=""
          />
        }
        color={color}
        editable={false}
        onOpen={onOpen}
        onSave={async () => {}}
      >
        {kind === "goal" ? (
          <div className="collection-card__goal-progress">
            <strong>{money(current, item.currency)}</strong>
            <small>Saved</small>
            <progress
              value={progress}
              max={100}
              aria-label={`${item.name} progress`}
            />
            <span>{Math.round(item.progressPercent)}% of target</span>
          </div>
        ) : null}
        <div className="collection-card__value">
          <small>{kind === "budget" ? "Spent" : "Target"}</small>
          <strong>
            {money(
              kind === "budget" ? current : item.targetAmount,
              item.currency,
            )}
          </strong>
          <small>
            {kind === "budget"
              ? `of ${money(item.targetAmount, item.currency)} · ${exceeded ? "Over Budget" : `${money(Math.max(0, item.targetAmount - current), item.currency)} Left`}`
              : `Target ${money(item.targetAmount, item.currency)}`}
          </small>
        </div>
        {kind === "budget" ? (
          <div
            className="collection-card__progress"
            role="meter"
            aria-label={`${item.name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%`, background: color }} />
          </div>
        ) : null}
      </CollectionCard>
      {onEdit ? (
        <button
          type="button"
          className="circle-card-menu"
          aria-label={`Edit ${item.name}`}
          onClick={onEdit}
        >
          •••
        </button>
      ) : null}
    </div>
  );
}
export function CircleOverviewReports({
  circle,
  onNavigate,
  currency,
  rates,
  loading,
}: {
  currency: string;
  rates: Record<string, number>;
  loading: boolean;
  circle: CircleSummary;
  onNavigate: (tab: string) => void;
}) {
  const converted = circleCategoryTotals(circle.expenses, currency, rates);
  const categories = converted ?? [];
  const total = categories.reduce((n, [, amount]) => n + amount, 0),
    palette = [
      "#00abc0",
      "#35b878",
      "#8771bb",
      "#d8841e",
      "#db5774",
      "#6286b7",
    ];
  let offset = 0;
  const slices = categories.map(([, n], i) => {
    const start = offset;
    offset += total ? (n / total) * 100 : 0;
    return `${palette[i % palette.length]} ${start}% ${offset}%`;
  });
  return (
    <>
      <section className="report-card glass report-v2-panel circle-report">
        <header className="circle-report__head">
          <h2>Where It Went</h2>
        </header>
        {converted === null ? (
          <p role="status">
            {loading ? "Converting…" : "Conversion unavailable"}
          </p>
        ) : categories.length ? (
          <>
            <div
              className="report-v2-donut"
              role="img"
              aria-label={`Shared spending ${money(total, currency)}. Category breakdown follows.`}
              style={{ background: `conic-gradient(${slices.join(",")})` }}
            >
              <span>{money(total, currency)}</span>
            </div>
            <div className="circle-ledger circle-category-report">
              {categories.map(([label, n], i) => (
                <div className="circle-ledger__row" key={label}>
                  <CategoryBrandMark categoryName={label} size={30} />
                  <span className="circle-ledger__body">
                    <span
                      className="circle-category-dot"
                      style={{ background: palette[i % palette.length] }}
                    />
                    {label}
                  </span>
                  <span className="circle-ledger__amount">
                    {money(n, currency)}{" "}
                    <small>· {((n / total) * 100).toFixed(1)}%</small>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <CircleEmpty
            title="Share your first expense to see your category report"
            pose="reports"
          />
        )}
      </section>
      <section className="circle-overview-tracking">
        <header className="circle-report__head">
          <h2>Budget Tracking</h2>
          <button
            className="circle-text-action"
            onClick={() => onNavigate("Budgets")}
          >
            View Budgets ›
          </button>
        </header>
        {circle.budgets.length ? (
          <div className="collection-card-grid">
            {circle.budgets.slice(0, 2).map((item) => (
              <CirclePlanningCard
                key={item.id}
                item={item}
                kind="budget"
                onOpen={() => onNavigate("Budgets")}
              />
            ))}
          </div>
        ) : (
          <CircleEmpty
            title="Create a shared budget to track your spending"
            pose="budget"
          />
        )}
      </section>
      <section className="circle-overview-tracking">
        <header className="circle-report__head">
          <h2>Goal Tracking</h2>
          <button
            className="circle-text-action"
            onClick={() => onNavigate("Goals")}
          >
            View Goals ›
          </button>
        </header>
        {circle.goals.length ? (
          <div className="collection-card-grid">
            {circle.goals.slice(0, 2).map((item) => (
              <CirclePlanningCard
                key={item.id}
                item={item}
                kind="goal"
                onOpen={() => onNavigate("Goals")}
              />
            ))}
          </div>
        ) : (
          <CircleEmpty
            title="Create a shared goal to track your progress"
            pose="savings"
          />
        )}
      </section>
    </>
  );
}
