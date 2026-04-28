"use client";

import Link from "next/link";
import { getPlanLimitNudgeCopy, type PlanLimitPayload } from "@/lib/plan-limit-nudges";

type PlanLimitNudgeProps = {
  payload: PlanLimitPayload | null;
  onDismiss: () => void;
};

export function PlanLimitNudge({ payload, onDismiss }: PlanLimitNudgeProps) {
  if (!payload) {
    return null;
  }

  const copy = getPlanLimitNudgeCopy(payload);

  return (
    <aside className="plan-limit-nudge glass" role="status" aria-live="polite">
      <div className="plan-limit-nudge__title-row">
        <div>
          <p className="plan-limit-nudge__eyebrow">{copy.eyebrow}</p>
          <strong>{copy.title}</strong>
        </div>
        <button className="plan-limit-nudge__dismiss" type="button" onClick={onDismiss} aria-label="Dismiss limit notice">
          ×
        </button>
      </div>
      <p className="plan-limit-nudge__body">{copy.body}</p>
      <div className="plan-limit-nudge__actions">
        <Link className="button button-primary button-small" href={copy.ctaHref}>
          {copy.ctaLabel}
        </Link>
      </div>
    </aside>
  );
}
