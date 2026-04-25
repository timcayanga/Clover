"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

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
  const categoryOptions = current?.categoryOptions ?? ["Food & Dining", "Transport", "Groceries", "Utilities", "Subscriptions", "Entertainment"];
  const canPickCategory = current?.tags.includes("No category") ?? false;

  useEffect(() => {
    setIsCategoryPickerOpen(false);
  }, [currentIndex, items.length]);

  useEffect(() => {
    if (!current) {
      return;
    }

    capturePostHogClientEvent("review_item_opened", {
      review_title: current.title,
      review_tag_count: current.tags.length,
      has_category_picker: canPickCategory,
    });
  }, [canPickCategory, current, currentIndex]);

  const goPrevious = () => {
    capturePostHogClientEvent("feature_used", {
      feature_name: "review_queue_previous",
    });
    setIndex((value) => (value - 1 + items.length) % items.length);
  };

  const goNext = () => {
    capturePostHogClientEvent("feature_used", {
      feature_name: "review_queue_next",
    });
    setIndex((value) => (value + 1) % items.length);
  };
  const setCategory = (category: string) => {
    setSelectedCategories((value) => ({ ...value, [currentIndex]: category }));
    capturePostHogClientEvent("review_item_accepted", {
      review_title: current?.title ?? "Unknown",
      selected_category: category,
    });
    setIsCategoryPickerOpen(false);
  };

  if (!hasItems || !current) {
    return (
      <div className="empty-state reports-review-queue__empty">
        <strong>Review queue is clear</strong>
        <p>
          Clover did not find any low-confidence items in this report set. If you want to keep pressure on the numbers,
          check transactions for new imports or unresolved rows.
        </p>
        <div className="reports-review-queue__empty-actions">
          <Link className="pill-link pill-link--inline" href="/review">
            Open review
          </Link>
          <Link className="pill-link pill-link--inline" href="/transactions">
            View transactions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-review-queue">
      <div className="report-card__head">
        <div>
          <p className="eyebrow">Action queue</p>
          <h4>Review queue</h4>
        </div>
        <div className="report-card__stat">
          <strong>{items.length}</strong>
          <span>actionable items</span>
        </div>
      </div>

      <div className="reports-review-queue__body">
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
                      className={`pill pill-subtle pill-interactive reports-review-queue__chip reports-review-queue__chip--button ${
                        currentCategory ? "pill-is-selected" : ""
                      }`}
                      onClick={() => {
                        capturePostHogClientEvent("feature_used", {
                          feature_name: "review_queue_category_picker",
                        });
                        setIsCategoryPickerOpen((value) => !value);
                      }}
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
                  <span key={tag} className="pill pill-subtle reports-review-queue__chip">
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
                onClick={() => {
                  capturePostHogClientEvent("insight_action_taken", {
                    insight_type: "review_queue",
                    action_label: action.label,
                    action_href: action.href,
                  });
                  capturePostHogClientEvent("feature_used", {
                    feature_name: action.label,
                  });
                }}
              >
                {action.label}
              </Link>
            ) : null
          ))}
        </div>

        <div className="reports-review-queue__footer">
          <div className="reports-review-queue__footer-row">
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
        </div>
      </div>
    </div>
  );
}
