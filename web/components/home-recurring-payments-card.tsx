"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

export type HomeRecurringPaymentItem = {
  id: string;
  title: string;
  detail: string;
  dueDate: string;
  completed: boolean;
};

export type HomeRecurringSuggestionItem = {
  id: string;
  title: string;
  detail: string;
};

export function HomeRecurringPaymentsCard({
  payments,
  suggestions,
}: {
  payments: HomeRecurringPaymentItem[];
  suggestions: HomeRecurringSuggestionItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(payments);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(payments);
  }, [payments]);

  const toggleCompleted = async (item: HomeRecurringPaymentItem) => {
    if (savingId) {
      return;
    }

    const completed = !item.completed;
    setSavingId(item.id);
    setError(null);
    setItems((current) =>
      current.map((candidate) => candidate.id === item.id ? { ...candidate, completed } : candidate)
    );

    try {
      const response = await fetch(`/api/commitments/${item.id}/completion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: item.dueDate, completed }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update this payment yet");
      }

      capturePostHogClientEvent("feature_used", {
        feature: "recurring_payment_checklist",
        action: completed ? "completed" : "reopened",
      });
      router.refresh();
    } catch (caughtError) {
      setItems((current) =>
        current.map((candidate) => candidate.id === item.id ? { ...candidate, completed: item.completed } : candidate)
      );
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update this payment yet");
    } finally {
      setSavingId(null);
    }
  };

  const visibleSuggestions = suggestions.slice(0, Math.max(0, 4 - items.length));
  const hasItems = items.length > 0 || visibleSuggestions.length > 0;

  return (
    <div className="dashboard-home__goal-card dashboard-home__recurring-card">
      <div className="dashboard-home__goal-card-head">
        <p className="eyebrow">What&apos;s coming up</p>
      </div>
      <div className="dashboard-home__action-card-heading">
        <span className="dashboard-home__status-check dashboard-home__status-check--calendar" aria-hidden="true">✓</span>
        <div>
          <strong>Recurring payments</strong>
          <small>{hasItems ? "Check off confirmed payments as you complete them." : "No upcoming payments need attention."}</small>
        </div>
      </div>
      {hasItems ? (
        <div className="dashboard-home__action-list">
          {items.map((item) => (
            <div className="dashboard-home__action-row" data-completed={item.completed ? "true" : "false"} key={`${item.id}:${item.dueDate}`}>
              <button
                aria-checked={item.completed}
                aria-label={`Mark ${item.title} ${item.completed ? "not completed" : "completed"}`}
                className="dashboard-home__payment-check"
                disabled={savingId === item.id}
                onClick={() => void toggleCompleted(item)}
                role="checkbox"
                type="button"
              >
                {item.completed ? "✓" : ""}
              </button>
              <div className="dashboard-home__action-row-copy">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
            </div>
          ))}
          {visibleSuggestions.map((suggestion) => (
            <div className="dashboard-home__action-row" key={suggestion.id}>
              <span className="dashboard-home__payment-check dashboard-home__payment-check--suggestion" aria-hidden="true">?</span>
              <div className="dashboard-home__action-row-copy">
                <strong>{suggestion.title}</strong>
                <small>{suggestion.detail}</small>
              </div>
              <Link className="dashboard-home__mini-action" href="/recurring?tab=planned">Review</Link>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="dashboard-home__action-error" role="status">{error}</p> : null}
      <Link className="dashboard-home__report-link" href="/recurring">
        Open recurring
      </Link>
    </div>
  );
}
