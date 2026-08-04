import "server-only";

import {
  ANALYTICS_BETA_EPOCH,
  ANALYTICS_EVENT_NAMES,
  getAnalyticsBetaStartedAt,
  getAnalyticsEnvironment,
  type AnalyticsEventName,
} from "@/lib/analytics";

const POSTHOG_QUERY_TIMEOUT_MS = 5_000;
const POSTHOG_QUERY_EVENT_LIMIT = 250;

type PostHogQueryResponse = {
  columns?: unknown;
  results?: unknown;
  is_cached?: unknown;
};

export type PostHogEventAggregate = {
  name: string;
  count: number;
  uniqueUsers: number;
  lastSeen: string | null;
};

export type PostHogLiveAnalytics = {
  status: "not_configured" | "ready" | "unavailable";
  generatedAt: string;
  rangeStartedAt: string;
  rangeDays: number;
  isCached: boolean;
  totalEvents: number;
  observedEventTypes: number;
  instrumentedEventTypes: number;
  observedInstrumentedEvents: number;
  topEvents: PostHogEventAggregate[];
  missingInstrumentedEvents: AnalyticsEventName[];
  errorCode: "missing_credentials" | "timeout" | "unauthorized" | "rate_limited" | "query_failed" | null;
};

const emptyResult = (
  status: PostHogLiveAnalytics["status"],
  errorCode: PostHogLiveAnalytics["errorCode"]
): PostHogLiveAnalytics => {
  const betaStartedAt = getAnalyticsBetaStartedAt();
  return {
    status,
    generatedAt: new Date().toISOString(),
    rangeStartedAt: betaStartedAt.toISOString(),
    rangeDays: Math.max(1, Math.ceil((Date.now() - betaStartedAt.getTime()) / 86_400_000)),
    isCached: false,
    totalEvents: 0,
    observedEventTypes: 0,
    instrumentedEventTypes: ANALYTICS_EVENT_NAMES.length,
    observedInstrumentedEvents: 0,
    topEvents: [],
    missingInstrumentedEvents: [...ANALYTICS_EVENT_NAMES],
    errorCode,
  };
};

const getQueryConfig = () => {
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim() ?? "";
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim() ?? "";
  const appUrl = process.env.POSTHOG_APP_URL?.trim().replace(/\/$/, "") || "https://us.posthog.com";

  if (!personalApiKey || !projectId) {
    return null;
  }

  try {
    const parsedUrl = new URL(appUrl);
    if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && parsedUrl.hostname === "localhost")) {
      return null;
    }

    return {
      personalApiKey,
      projectId,
      appUrl: parsedUrl.toString().replace(/\/$/, ""),
    };
  } catch {
    return null;
  }
};

const toFiniteNumber = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const toIsoDate = (value: unknown) => {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseEventRows = (payload: PostHogQueryResponse): PostHogEventAggregate[] => {
  if (!Array.isArray(payload.columns) || !Array.isArray(payload.results)) {
    return [];
  }

  const columns = payload.columns.filter((column): column is string => typeof column === "string");
  const eventIndex = columns.indexOf("event_name");
  const countIndex = columns.indexOf("event_count");
  const uniqueUsersIndex = columns.indexOf("unique_users");
  const lastSeenIndex = columns.indexOf("last_seen");

  if (eventIndex < 0 || countIndex < 0 || uniqueUsersIndex < 0 || lastSeenIndex < 0) {
    return [];
  }

  return payload.results
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => ({
      name: typeof row[eventIndex] === "string" ? row[eventIndex] : "",
      count: toFiniteNumber(row[countIndex]),
      uniqueUsers: toFiniteNumber(row[uniqueUsersIndex]),
      lastSeen: toIsoDate(row[lastSeenIndex]),
    }))
    .filter((row) => row.name && row.count > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
};

const errorCodeForResponse = (status: number): PostHogLiveAnalytics["errorCode"] => {
  if (status === 401 || status === 403) {
    return "unauthorized";
  }

  if (status === 429) {
    return "rate_limited";
  }

  return "query_failed";
};

export async function getPostHogLiveAnalytics(
  environment = getAnalyticsEnvironment()
): Promise<PostHogLiveAnalytics> {
  const config = getQueryConfig();
  if (!config) {
    return emptyResult("not_configured", "missing_credentials");
  }

  const betaStartedAt = getAnalyticsBetaStartedAt();
  const escapedBetaStartedAt = betaStartedAt.toISOString().replaceAll("'", "''");
  const distinctIdPrefix = `${environment.replaceAll("'", "''")}:%`;
  const query = `
    SELECT
      event AS event_name,
      count(*) AS event_count,
      count(DISTINCT distinct_id) AS unique_users,
      max(timestamp) AS last_seen
    FROM events
    WHERE timestamp >= toDateTime('${escapedBetaStartedAt}')
      AND event NOT LIKE '$%'
      AND toString(distinct_id) LIKE '${distinctIdPrefix}'
    GROUP BY event
    ORDER BY event_count DESC
    LIMIT ${POSTHOG_QUERY_EVENT_LIMIT}
  `;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POSTHOG_QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.appUrl}/api/projects/${encodeURIComponent(config.projectId)}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.personalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
        },
        name: `clover_admin_event_coverage_${environment}_${ANALYTICS_BETA_EPOCH}`,
        refresh: "blocking",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return emptyResult("unavailable", errorCodeForResponse(response.status));
    }

    const payload = (await response.json()) as PostHogQueryResponse;
    const topEvents = parseEventRows(payload);
    const observedNames = new Set(topEvents.map((event) => event.name));
    const observedInstrumentedEvents = ANALYTICS_EVENT_NAMES.filter((event) => observedNames.has(event)).length;

    return {
      status: "ready",
      generatedAt: new Date().toISOString(),
      rangeStartedAt: betaStartedAt.toISOString(),
      rangeDays: Math.max(1, Math.ceil((Date.now() - betaStartedAt.getTime()) / 86_400_000)),
      isCached: payload.is_cached === true,
      totalEvents: topEvents.reduce((total, event) => total + event.count, 0),
      observedEventTypes: topEvents.length,
      instrumentedEventTypes: ANALYTICS_EVENT_NAMES.length,
      observedInstrumentedEvents,
      topEvents: topEvents.slice(0, 12),
      missingInstrumentedEvents: ANALYTICS_EVENT_NAMES.filter((event) => !observedNames.has(event)),
      errorCode: null,
    };
  } catch (error) {
    return emptyResult("unavailable", error instanceof Error && error.name === "AbortError" ? "timeout" : "query_failed");
  } finally {
    clearTimeout(timeout);
  }
}
