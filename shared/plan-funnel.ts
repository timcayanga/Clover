import { newTelemetryId, type TelemetryProperties, type TelemetrySink } from "./analytics";
import { publicPlan } from "./plan-analytics";
import type { CloverPlanTier } from "./plan-catalog";

const entryPoints = ["account_menu", "landing", "footer", "settings", "pricing", "upgrade_prompt", "reports", "onboarding", "notification", "direct"] as const;
export type PlanEntryPoint = typeof entryPoints[number];


export function planEntryPoint(value: unknown, fallback: PlanEntryPoint = "direct"): PlanEntryPoint {
  return entryPoints.find(entry => entry === value) ?? fallback;
}

export function planFunnelProperties(entry: PlanEntryPoint, interval: unknown, currency: unknown, tier?: CloverPlanTier) {
  return {
    entry_point: entry,
    billing_interval: tier === "free" ? undefined : interval === "P1M" || interval === "monthly" ? "monthly" : interval === "P1Y" || interval === "annual" ? "annual" : undefined,
    displayed_currency: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
    selected_plan: tier === undefined ? undefined : publicPlan(tier),
  };
}

export type CheckoutPreparationReason =
  | "plan_unavailable" | "plan_status_unavailable" | "ownership_conflict" | "store_identity_failed"
  | "customer_info_failed" | "owner_verification_failed" | "plan_out_of_sync" | "original_store_required"
  | "store_change_unavailable" | "provider_sdk_unavailable" | "checkout_session_failed" | "provider_handoff_failed";

export function beginCheckoutPreparation(capture: TelemetrySink, context: TelemetryProperties) {
  const checkout_preparation_id = newTelemetryId();
  const started = Date.now();
  const properties = { ...context, checkout_preparation_id };
  let finished = false;
  capture("checkout_prepare_started", properties);
  return {
    id: checkout_preparation_id,
    finish(reason?: CheckoutPreparationReason, checkoutAttemptId?: string) {
      if (finished) return;
      finished = true;
      capture("checkout_prepare_finished", {
        ...properties,
        checkout_attempt_id: checkoutAttemptId,
        preparation_outcome: reason ? "blocked" : "ready",
        preparation_reason: reason,
        duration_ms: Math.max(0, Date.now() - started),
      });
    },
  };
}
