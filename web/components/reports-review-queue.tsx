"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  categoryOptions?: string[];
};

type ReportsReviewQueueProps = {
  items: ReportsQueueItem[];
};

export function ReportsReviewQueue({ items }: ReportsReviewQueueProps) {
  const [index, setIndex] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<Record<number, string>>({});
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const hasItems = items.length > 0;
  const currentIndex = hasItems ? index % items.length : 0;
  const current = hasItems ? items[currentIndex] : null;
  const currentCategory = current ? selectedCategories[currentIndex] ?? null : null;
  const categoryOptions = current?.categoryOptions ?? ["Food & Dining", "Transport", "Groceries", "Utilities", "Subscriptions"];
  const canPickCategory = current?.tags.includes("No category") ?? false;

  useEffect(() => {
    setIsCategoryPickerOpen(false);
  }, [currentIndex, items.length]);

  const goPrevious = () => setIndex((value) => (value - 1 + items.length) % items.length);
  const goNext = () => setIndex((value) => (value + 1) % items.length);
  const setCategory = (category: string) => {
    setSelectedCategories((value) => ({ ...value, [currentIndex]: category }));
    setIsCategoryPickerOpen(false);
  };

  if (!hasItems || !current) {
    return <div className="empty-state">No actionable items right now.</div>;
  }

  return (
    <div className="reports-review-queue">
      <div className="report-card__head">
        <div>
          <h4>Review queue</h4>
        </div>
      </div>

      <div className="reports-review-queue__body">
        <div className="reports-review-queue__nav">
          <button type="button" className="report-review-nav" onClick={goPrevious} aria-label="Previous review item">
            ‹
          </button>
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
            {current.tags.map((tag) => {
              if (tag === "No category" && canPickCategory) {
                return (
                  <div key={tag} className="reports-review-queue__picker-group">
                    <button
                      type="button"
                      className={`pill pill-subtle pill-interactive ${currentCategory ? "pill-is-selected" : ""}`}
                      onClick={() => setIsCategoryPickerOpen((value) => !value)}
                      aria-expanded={isCategoryPickerOpen}
                      aria-haspopup="menu"
                    >
                      {currentCategory ?? tag}
                    </button>

                    {isCategoryPickerOpen ? (
                      <div className="reports-review-queue__picker" role="menu" aria-label="Category options">
                        {categoryOptions.map((category) => (
                          <button
                            key={category}
                            type="button"
                            className="reports-review-queue__picker-option"
                            onClick={() => setCategory(category)}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <span key={tag} className="pill pill-subtle">
                  {tag}
                </span>
              );
            })}
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

        <div className="reports-review-queue__footer">
          <div className="reports-review-queue__counter">
            {currentIndex + 1} of {items.length}
          </div>
        </div>
      </div>
    </div>
  );
}
