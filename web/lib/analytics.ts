export type AnalyticsValue = string | number | boolean | null | undefined;

export type AnalyticsProperties = Record<string, AnalyticsValue>;

export type AnalyticsEventName =
  | "signup_started"
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "first_login"
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
  | "review_queue_opened"
  | "import_confirmed"
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
  | "review_item_rejected"
  | "merchant_rule_created"
  | "merchant_rule_updated"
  | "category_rule_created"
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
  | "plan_limit_reached"
  | "upgrade_prompt_viewed"
  | "support_contacted"
  | "error_shown";

const normalizeHost = (host: string) => host.replace(/\/$/, "");

export const getPostHogConfig = () => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  return {
    key,
    host: normalizeHost(host),
  };
};

export const shouldTrackAnalytics = () => Boolean(getPostHogConfig().key);

export const capturePostHogServerEvent = async (
  event: AnalyticsEventName,
  distinctId: string,
  properties: AnalyticsProperties = {}
) => {
  const { key, host } = getPostHogConfig();

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
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => null);
};

export const analyticsOnceKey = (event: AnalyticsEventName, scope: string) => `posthog:${event}:${scope}`;
