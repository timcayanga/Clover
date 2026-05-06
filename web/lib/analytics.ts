export type AnalyticsValue = string | number | boolean | null | undefined;

export type AnalyticsProperties = Record<string, AnalyticsValue>;

export type AnalyticsEventName =
  | "signup_started"
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
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
  | "first_import_started"
  | "first_import_completed"
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
  | "review_queue_opened"
  | "import_confirmed"
  | "import_retry_started"
  | "import_retry_succeeded"
  | "import_retry_failed"
  | "qa_run_completed"
  | "qa_run_failed"
  | "password_provided"
  | "password_failed"
  | "statement_identity_resolved"
  | "statement_identity_confirmed"
  | "import_duplicate_detected"
  | "manual_transaction_created"
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
  | "session_started"
  | "session_returned"
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
  | "error_shown";

const normalizeHost = (host: string) => host.replace(/\/$/, "");

export const getAnalyticsEnvironment = () => {
  if (process.env.VERCEL_ENV === "production") {
    return "production";
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "staging";
  }

  if (process.env.NODE_ENV !== "production") {
    return "local";
  }

  return "production";
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
  if (process.env.NODE_ENV === "production") {
    return "/ph";
  }

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
      properties,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => null);
};

export const analyticsOnceKey = (event: AnalyticsEventName, scope: string) => `posthog:${event}:${scope}`;
