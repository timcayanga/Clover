"use client";

import Link from "next/link";
import { getPlanLimitNudgeCopy, type PlanLimitPayload } from "@/lib/plan-limit-nudges";
import { analyticsOnceKey, PostHogEvent, capturePostHogClientEvent } from "@/components/posthog-analytics";

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
      <PostHogEvent
        event="upgrade_prompt_viewed"
        onceKey={analyticsOnceKey("upgrade_prompt_viewed", `plan-limit:${payload.planTier}:${payload.limitType}:${payload.limitValue ?? "current"}`)}
        properties={{
          plan_tier: payload.planTier,
          prompt_location: "plan_limit_nudge",
          limit_type: payload.limitType,
          limit_value: payload.limitValue,
        }}
      />
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
        <Link
          className="button button-primary button-small"
          href={copy.ctaHref}
          onClick={() =>
            capturePostHogClientEvent("upgrade_cta_clicked", {
              cta_location: "plan_limit_nudge",
              plan_tier: payload.planTier,
              limit_type: payload.limitType,
              limit_value: payload.limitValue,
              cta_href: copy.ctaHref,
            })
          }
        >
          {copy.ctaLabel}
        </Link>
      </div>
    </aside>
  );
}
