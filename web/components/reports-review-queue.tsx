"use client";

import Link from "next/link";
import { useState } from "react";

export type ReportsQueueAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

export type ReportsQueueItem = {
  title: string;
  description: string;
  tags: string[];
  actions: [ReportsQueueAction, ReportsQueueAction?];
};

type ReportsReviewQueueProps = {
  items: ReportsQueueItem[];
};

export function ReportsReviewQueue({ items }: ReportsReviewQueueProps) {
  const [index, setIndex] = useState(0);

  if (items.length === 0) {
    return <div className="empty-state">No actionable items right now.</div>;
  }

  const currentIndex = index % items.length;
  const current = items[currentIndex];

  const goPrevious = () => setIndex((value) => (value - 1 + items.length) % items.length);
  const goNext = () => setIndex((value) => (value + 1) % items.length);

  return (
    <div className="reports-review-queue">
      <div className="report-card__head">
        <div>
          <p className="eyebrow">Review queue</p>
          <h4>{items.length} actionable item{items.length === 1 ? "" : "s"}</h4>
        </div>
        <div className="report-card__stat">
          <strong>
            {currentIndex + 1}/{items.length}
          </strong>
          <span>Use the arrows to move through the queue</span>
        </div>
      </div>

      <div className="reports-review-queue__body">
        <div className="reports-review-queue__nav">
          <button type="button" className="report-review-nav" onClick={goPrevious} aria-label="Previous review item">
            ‹
          </button>
          <div className="reports-review-queue__counter">
            {currentIndex + 1} of {items.length}
          </div>
          <button type="button" className="report-review-nav" onClick={goNext} aria-label="Next review item">
            ›
          </button>
        </div>

        <div className="reports-review-queue__item">
          <div className="report-list__meta">
            <strong>{current.title}</strong>
            <span>{current.description}</span>
          </div>

          <div className="report-tags">
            {current.tags.map((tag) => (
              <span key={tag} className="pill pill-subtle">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="reports-review-queue__actions">
          {current.actions.map((action) => (
            action ? (
              <Link
                key={action.label}
                href={action.href}
                className={`button ${action.variant === "secondary" ? "button-secondary" : "button-primary"} button-pill`}
              >
                {action.label}
              </Link>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}
