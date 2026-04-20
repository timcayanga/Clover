"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type GoalChecklistItem = {
  title: string;
  body: string;
  href: string;
  label: string;
  icon: "spark" | "shield" | "chart" | "target" | "path";
};

type GoalsChecklistProps = {
  items: GoalChecklistItem[];
};

export function GoalsChecklist({ items }: GoalsChecklistProps) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const completedCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);

  return (
    <section className="goals-checklist glass" aria-label="Weekly actions">
      <div className="goals-panel__head">
        <div>
          <p className="eyebrow">Weekly actions</p>
          <h4>Turn momentum into one small win at a time</h4>
        </div>
        <div className="goals-panel__stat">
          <strong>
            {completedCount}/{items.length}
          </strong>
          <span>Checked off this week</span>
        </div>
      </div>

      <div className="goals-checklist__grid" role="list" aria-label="Goal actions">
        {items.map((item) => {
          const isDone = completed[item.title] ?? false;
          return (
            <article key={item.title} className={`goals-checklist__item ${isDone ? "is-done" : ""}`} role="listitem">
              <button
                type="button"
                className="goals-checklist__toggle"
                onClick={() => setCompleted((current) => ({ ...current, [item.title]: !isDone }))}
                aria-pressed={isDone}
              >
                <span className="goals-checklist__checkbox" aria-hidden="true">
                  <ChecklistIcon icon={item.icon} done={isDone} />
                </span>
                <span className="goals-checklist__copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </span>
              </button>
              <Link className="pill-link pill-link--inline" href={item.href}>
                {isDone ? "Open again" : item.label}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ChecklistIcon({ icon, done }: { icon: GoalChecklistItem["icon"]; done: boolean }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (done) {
    return <span aria-hidden="true">✓</span>;
  }

  switch (icon) {
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 4 6 7v5c0 4 2.4 6.8 6 8 3.6-1.2 6-4 6-8V7z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M5 19h14" />
          <path d="M7 15V9" />
          <path d="M12 15V6" />
          <path d="M17 15v-4" />
        </svg>
      );
    case "path":
      return (
        <svg {...common}>
          <path d="M5 18c3-1 4-4 5-7s2-6 5-7" />
          <path d="M15 4h4v4" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "spark":
    default:
      return (
        <svg {...common}>
          <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4Z" />
        </svg>
      );
  }
}
