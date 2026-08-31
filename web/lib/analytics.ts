import { getDeploymentEnvironment } from "@/lib/deployment-environment";

export type AnalyticsValue = string | number | boolean | null | undefined;

export type AnalyticsProperties = Record<string, AnalyticsValue>;

export type AnalyticsEventName =
  | "signup_started"
  | "signup_completed"
  | "identity_environment_conflict"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_missions_viewed"
  | "onboarding_mission_started"
  | "onboarding_mission_completed"
  | "onboarding_missions_dismissed"
  | "first_login"
  | "workspace_created"
  | "workspace_updated"
  | "workspace_deleted"
  | "workspace_switched"
  | "account_created"
  | "account_updated"
  | "account_deleted"
  | "account_wiped"
  | "account_reset"
  | "category_created"
  | "category_updated"
  | "category_deleted"
  | "merchant_rule_deleted"
  | "merchant_rule_reverted"
  | "dashboard_viewed"
  | "page_load_completed"
  | "page_load_slow"
  | "data_load_failed"
  | "data_load_slow"
  | "first_import_started"
  | "first_import_completed"
  | "transaction_confirmation_completed"
  | "second_import_completed"
  | "first_report_viewed"
  | "file_upload_started"
  | "file_uploaded"
  | "file_upload_failed"
  | "import_started"
  | "import_parsing_started"
  | "import_parsed_successfully"
  | "import_parsed_with_warnings"
  | "import_failed"
  | "import_processing_started"
  | "import_processing_completed"
  | "import_processing_stalled"
  | "import_parser_arbitrated"
  | "import_receipt_cache_reused"
  | "review_queue_opened"
  | "review_queue_completed"
  | "review_queue_abandoned"
  | "confidence_details_viewed"
  | "source_document_viewed"
  | "transaction_confirmed_without_edit"
  | "transaction_edited_before_confirmation"
  | "import_confirmed"
  | "import_retry_started"
  | "import_retry_succeeded"
  | "import_retry_failed"
  | "qa_run_completed"
  | "qa_run_failed"
  | "password_provided"
  | "password_failed"
  | "import_password_canceled"
  | "statement_identity_resolved"
  | "statement_identity_confirmed"
  | "import_duplicate_detected"
  | "manual_transaction_created"
  | "manual_transfer_created"
  | "bulk_transaction_updated"
  | "bulk_transaction_deleted"
  | "transaction_imported"
  | "transaction_updated"
  | "transaction_categorized"
  | "transaction_recategorized"
  | "transaction_merchant_normalized"
  | "transaction_split"
  | "transaction_merged"
  | "transaction_deleted"
  | "transaction_undone"
  | "review_item_opened"
  | "review_item_accepted"
  | "review_item_edited"
  | "review_item_rejected"
  | "merchant_rule_created"
  | "merchant_rule_updated"
  | "merchant_rule_applied"
  | "category_rule_created"
  | "category_rule_updated"
  | "category_rule_deleted"
  | "category_rule_reverted"
  | "category_rule_applied"
  | "ai_suggestion_shown"
  | "ai_suggestion_accepted"
  | "ai_suggestion_rejected"
  | "report_viewed"
  | "report_filtered"
  | "report_exported"
  | "cashflow_viewed"
  | "category_mix_viewed"
  | "top_sources_viewed"
  | "trend_line_viewed"
  | "insight_generated"
  | "insight_opened"
  | "insight_action_taken"
  | "weekly_summary_viewed"
  | "recurring_item_reviewed"
  | "recurring_item_confirmed"
  | "recurring_occurrence_updated"
  | "adviser_question_asked"
  | "adviser_recommendation_opened"
  | "adviser_action_completed"
  | "split_bill_created"
  | "split_bill_completed"
  | "split_bill_settled"
  | "split_bill_qr_viewed"
  | "split_bill_qr_uploaded"
  | "split_bill_qr_saved"
  | "split_bill_qr_updated"
  | "split_bill_qr_deleted"
  | "split_bill_qr_detection_failed"
  | "circle_created"
  | "circle_updated"
  | "circle_deleted"
  | "circle_invitation_created"
  | "circle_invitation_accepted"
  | "circle_member_updated"
  | "circle_budget_created"
  | "circle_goal_created"
  | "circle_contribution_recorded"
  | "circle_commitment_created"
  | "circle_transaction_shared"
  | "circle_investment_shared"
  | "session_started"
  | "session_returned"
  | "acquisition_identified"
  | "page_engagement"
  | "ui_interaction"
  | "feature_used"
  | "settings_updated"
  | "goal_target_saved"
  | "goal_updated"
  | "goal_target_reached"
  | "goal_progress_updated"
  | "goal_reset"
  | "plan_limit_reached"
  | "billing_started"
  | "billing_success"
  | "billing_cancelled"
  | "upgrade_cta_clicked"
  | "trial_to_paid_conversion"
  | "upgrade_prompt_viewed"
  | "support_contacted"
  | "admin_support_action"
  | "error_shown";

// Keep the Admin event inventory aligned with the compile-time event contract.
// This is intentionally data-free: event names are safe to expose in internal tooling.
export const ANALYTICS_EVENT_NAMES: AnalyticsEventName[] = [
  "signup_started", "signup_completed", "identity_environment_conflict", "onboarding_started", "onboarding_completed", "onboarding_missions_viewed",
  "onboarding_mission_started", "onboarding_mission_completed", "onboarding_missions_dismissed", "first_login",
  "workspace_created", "workspace_updated", "workspace_deleted", "workspace_switched",
  "account_created", "account_updated", "account_deleted", "account_wiped", "account_reset",
  "category_created", "category_updated", "category_deleted", "merchant_rule_deleted", "merchant_rule_reverted",
  "dashboard_viewed", "page_load_completed", "page_load_slow", "data_load_failed", "data_load_slow",
  "first_import_started", "first_import_completed", "transaction_confirmation_completed", "second_import_completed", "first_report_viewed",
  "file_upload_started", "file_uploaded", "file_upload_failed", "import_started", "import_parsing_started",
  "import_parsed_successfully", "import_parsed_with_warnings", "import_failed", "import_processing_started",
  "import_processing_completed", "import_processing_stalled", "import_parser_arbitrated", "import_receipt_cache_reused", "review_queue_opened", "review_queue_completed", "review_queue_abandoned",
  "confidence_details_viewed", "source_document_viewed", "transaction_confirmed_without_edit", "transaction_edited_before_confirmation",
  "import_confirmed", "import_retry_started", "import_retry_succeeded", "import_retry_failed", "qa_run_completed", "qa_run_failed",
  "password_provided", "password_failed", "import_password_canceled", "statement_identity_resolved", "statement_identity_confirmed", "import_duplicate_detected",
  "manual_transaction_created", "manual_transfer_created", "bulk_transaction_updated", "bulk_transaction_deleted", "transaction_imported", "transaction_updated",
  "transaction_categorized", "transaction_recategorized", "transaction_merchant_normalized", "transaction_split", "transaction_merged",
  "transaction_deleted", "transaction_undone", "review_item_opened", "review_item_accepted", "review_item_edited", "review_item_rejected",
  "merchant_rule_created", "merchant_rule_updated", "merchant_rule_applied", "category_rule_created", "category_rule_updated",
  "category_rule_deleted", "category_rule_reverted", "category_rule_applied", "ai_suggestion_shown", "ai_suggestion_accepted", "ai_suggestion_rejected",
  "report_viewed", "report_filtered", "report_exported", "cashflow_viewed", "category_mix_viewed", "top_sources_viewed", "trend_line_viewed",
  "insight_generated", "insight_opened", "insight_action_taken", "weekly_summary_viewed", "recurring_item_reviewed", "recurring_item_confirmed", "recurring_occurrence_updated",
  "adviser_question_asked", "adviser_recommendation_opened", "adviser_action_completed", "split_bill_created", "split_bill_completed", "split_bill_settled",
  "split_bill_qr_viewed", "split_bill_qr_uploaded", "split_bill_qr_saved", "split_bill_qr_updated", "split_bill_qr_deleted", "split_bill_qr_detection_failed",
  "circle_created", "circle_updated", "circle_deleted", "circle_invitation_created", "circle_invitation_accepted", "circle_member_updated",
  "circle_budget_created", "circle_goal_created", "circle_contribution_recorded", "circle_commitment_created", "circle_transaction_shared", "circle_investment_shared",
  "session_started", "session_returned", "acquisition_identified", "page_engagement", "ui_interaction", "feature_used", "settings_updated", "goal_target_saved", "goal_updated", "goal_target_reached",
  "goal_progress_updated", "goal_reset", "plan_limit_reached", "billing_started", "billing_success", "billing_cancelled", "upgrade_cta_clicked",
  "trial_to_paid_conversion", "upgrade_prompt_viewed", "support_contacted", "admin_support_action", "error_shown",
];

export const ANALYTICS_BETA_EPOCH = "beta-2026-07-28";
export const DEFAULT_ANALYTICS_BETA_STARTED_AT = "2026-07-28T11:40:00.000Z";
export const DEFAULT_BEHAVIOR_ANALYTICS_STARTED_AT = "2026-08-31T00:00:00.000Z";

export const getAnalyticsBetaStartedAt = () => {
  const configured = process.env.NEXT_PUBLIC_ANALYTICS_BETA_STARTED_AT?.trim();
  const parsed = configured ? new Date(configured) : new Date(DEFAULT_ANALYTICS_BETA_STARTED_AT);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_ANALYTICS_BETA_STARTED_AT) : parsed;
};

export const getBehaviorAnalyticsStartedAt = () => {
  const configured = process.env.NEXT_PUBLIC_BEHAVIOR_ANALYTICS_STARTED_AT?.trim();
  const parsed = configured ? new Date(configured) : new Date(DEFAULT_BEHAVIOR_ANALYTICS_STARTED_AT);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_BEHAVIOR_ANALYTICS_STARTED_AT) : parsed;
};

export const getAnalyticsEpochProperties = (): AnalyticsProperties => ({
  analytics_epoch: ANALYTICS_BETA_EPOCH,
  release_stage: "beta",
  beta_started_at: getAnalyticsBetaStartedAt().toISOString(),
});

const normalizeHost = (host: string) => host.replace(/\/$/, "");

export const getAnalyticsEnvironment = () => {
  return getDeploymentEnvironment();
};

export const scopeAnalyticsDistinctId = (distinctId: string, environment = getAnalyticsEnvironment()) =>
  `${environment}:${distinctId}`;

export const getPostHogConfig = () => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  return {
    key,
    host: normalizeHost(host),
  };
};

export const shouldTrackAnalytics = () => Boolean(getPostHogConfig().key);

export const getPostHogClientHost = () => {
  // Sending browser analytics directly avoids turning every PostHog event,
  // feature-flag check, and session ping into a Vercel Edge request.
  return getPostHogConfig().host;
};

export const getPostHogServerHost = () => getPostHogConfig().host;

export const capturePostHogServerEvent = async (
  event: AnalyticsEventName,
  distinctId: string,
  properties: AnalyticsProperties = {}
) => {
  const { key } = getPostHogConfig();
  const host = getPostHogServerHost();
  const scopedDistinctId = scopeAnalyticsDistinctId(distinctId);

  if (!key) {
    return;
  }

  await fetch(`${host}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: scopedDistinctId,
      properties: {
        ...getAnalyticsEpochProperties(),
        ...properties,
      },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => null);
};

export const analyticsOnceKey = (event: AnalyticsEventName, scope: string) =>
  `posthog:${ANALYTICS_BETA_EPOCH}:${event}:${scope}`;
