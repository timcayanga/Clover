import "server-only";

import {
  ANALYTICS_BETA_EPOCH,
  ANALYTICS_EVENT_NAMES,
  getAnalyticsBetaStartedAt,
  getBehaviorAnalyticsStartedAt,
  getAnalyticsEnvironment,
  type AnalyticsEventName,
} from "@/lib/analytics";
import { FEATURE_FUNNEL_DEFINITIONS } from "@/lib/feature-adoption";

// PostHog's blocking query can exceed five seconds during cold periods. Admin
// analytics should wait a little longer instead of reporting a false outage.
const POSTHOG_QUERY_TIMEOUT_MS = 12_000;
const POSTHOG_QUERY_EVENT_LIMIT = 250;

type PostHogQueryResponse = {
  columns?: unknown;
  results?: unknown;
  is_cached?: unknown;
};

export type PostHogFeatureFunnelResult = {
  status: "not_configured" | "ready" | "unavailable";
  counts: Record<string, number>;
  isCached: boolean;
  errorCode: PostHogLiveAnalytics["errorCode"];
};

export type PostHogFeatureFunnelRange = {
  from: Date;
  to: Date;
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

export type PostHogGrowthAnalytics = {
  status: PostHogLiveAnalytics["status"];
  generatedAt: string;
  trackingStartedAt: string;
  isCached: boolean;
  websiteVisits: number;
  uniqueVisitors: number;
  attributedAccounts: number;
  channels: Array<{ channel: string; source: string; visitors: number; visits: number; accounts: number }>;
  pages: Array<{ route: string; views: number; uniqueVisitors: number; averageDurationMs: number; averageScrollPercent: number }>;
  heatmaps: Array<{ route: string; totalClicks: number; uniqueVisitors: number; cells: Array<{ x: number; y: number; count: number }> }>;
  errorCode: PostHogLiveAnalytics["errorCode"];
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

const emptyGrowthResult = (
  status: PostHogGrowthAnalytics["status"],
  errorCode: PostHogGrowthAnalytics["errorCode"],
): PostHogGrowthAnalytics => ({
  status,
  generatedAt: new Date().toISOString(),
  trackingStartedAt: getBehaviorAnalyticsStartedAt().toISOString(),
  isCached: false,
  websiteVisits: 0,
  uniqueVisitors: 0,
  attributedAccounts: 0,
  channels: [],
  pages: [],
  heatmaps: [],
  errorCode,
});

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

const escapeHogQl = (value: string) => value.replaceAll("'", "''");

const queryPostHog = async (
  config: NonNullable<ReturnType<typeof getQueryConfig>>,
  query: string,
  name: string,
  signal: AbortSignal,
) => {
  const response = await fetch(`${config.appUrl}/api/projects/${encodeURIComponent(config.projectId)}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.personalApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name, refresh: "blocking" }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const error = new Error(`PostHog query failed with ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as PostHogQueryResponse;
};

const rowsAsRecords = (payload: PostHogQueryResponse) => {
  const columns = Array.isArray(payload.columns) ? payload.columns.filter((value): value is string => typeof value === "string") : [];
  const results = Array.isArray(payload.results) ? payload.results.filter((row): row is unknown[] => Array.isArray(row)) : [];
  return results.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
};

export async function getPostHogGrowthAnalytics(
  environment = getAnalyticsEnvironment(),
): Promise<PostHogGrowthAnalytics> {
  const config = getQueryConfig();
  if (!config) return emptyGrowthResult("not_configured", "missing_credentials");

  const startedAt = escapeHogQl(getBehaviorAnalyticsStartedAt().toISOString());
  const scopedEnvironment = escapeHogQl(environment);
  const environmentCondition = `toString(properties.analytics_environment) = '${scopedEnvironment}'`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POSTHOG_QUERY_TIMEOUT_MS);
  const acquisitionQuery = `
    SELECT channel, source, count(*) AS unique_visitors, sum(visits) AS website_visits
    FROM (
      SELECT toString(distinct_id) AS visitor_id,
        argMin(toString(properties.acquisition_channel), timestamp) AS channel,
        argMin(toString(properties.acquisition_source), timestamp) AS source,
        count(*) AS visits
      FROM events
      WHERE event = '$pageview' AND timestamp >= toDateTime('${startedAt}') AND ${environmentCondition}
        AND properties.is_public_website = true
        AND notEmpty(toString(properties.acquisition_channel))
      GROUP BY visitor_id
    )
    GROUP BY channel, source ORDER BY unique_visitors DESC LIMIT 100
  `;
  const conversionQuery = `
    SELECT toString(properties.acquisition_channel) AS channel,
      toString(properties.acquisition_source) AS source,
      count(DISTINCT distinct_id) AS converted_accounts
    FROM events
    WHERE event = 'acquisition_identified' AND timestamp >= toDateTime('${startedAt}') AND ${environmentCondition}
    GROUP BY channel, source
  `;
  const engagementQuery = `
    SELECT toString(properties.route) AS route, count(*) AS views,
      count(DISTINCT distinct_id) AS unique_visitors,
      avg(toFloat(properties.duration_ms)) AS average_duration_ms,
      avg(toFloat(properties.max_scroll_percent)) AS average_scroll_percent
    FROM events
    WHERE event = 'page_engagement' AND timestamp >= toDateTime('${startedAt}') AND ${environmentCondition}
    GROUP BY route ORDER BY views DESC LIMIT 30
  `;
  const heatmapQuery = `
    SELECT toString(properties.route) AS route,
      floor(toFloat(properties.x_percent) / 20) AS x_bucket,
      floor(toFloat(properties.y_percent) / 20) AS y_bucket,
      count(*) AS clicks, count(DISTINCT distinct_id) AS unique_visitors
    FROM events
    WHERE event = 'ui_interaction' AND timestamp >= toDateTime('${startedAt}') AND ${environmentCondition}
    GROUP BY route, x_bucket, y_bucket ORDER BY clicks DESC LIMIT 500
  `;

  try {
    const [acquisitionPayload, conversionPayload, engagementPayload, heatmapPayload] = await Promise.all([
      queryPostHog(config, acquisitionQuery, `clover_admin_acquisition_${environment}`, controller.signal),
      queryPostHog(config, conversionQuery, `clover_admin_conversion_${environment}`, controller.signal),
      queryPostHog(config, engagementQuery, `clover_admin_engagement_${environment}`, controller.signal),
      queryPostHog(config, heatmapQuery, `clover_admin_heatmap_${environment}`, controller.signal),
    ]);
    const conversions = new Map(
      rowsAsRecords(conversionPayload).map((row) => [`${String(row.channel)}\u0000${String(row.source)}`, toFiniteNumber(row.converted_accounts)])
    );
    const channels = rowsAsRecords(acquisitionPayload).map((row) => ({
      channel: String(row.channel || "Unknown"),
      source: String(row.source || "Unknown"),
      visitors: toFiniteNumber(row.unique_visitors),
      visits: toFiniteNumber(row.website_visits),
      accounts: conversions.get(`${String(row.channel)}\u0000${String(row.source)}`) ?? 0,
    }));
    const pages = rowsAsRecords(engagementPayload).map((row) => ({
      route: String(row.route || "/"),
      views: toFiniteNumber(row.views),
      uniqueVisitors: toFiniteNumber(row.unique_visitors),
      averageDurationMs: Math.round(toFiniteNumber(row.average_duration_ms)),
      averageScrollPercent: Math.round(toFiniteNumber(row.average_scroll_percent)),
    }));
    const heatmapGroups = new Map<string, { totalClicks: number; uniqueVisitors: number; cells: Array<{ x: number; y: number; count: number }> }>();
    for (const row of rowsAsRecords(heatmapPayload)) {
      const route = String(row.route || "/");
      const current = heatmapGroups.get(route) ?? { totalClicks: 0, uniqueVisitors: 0, cells: [] };
      const count = toFiniteNumber(row.clicks);
      current.totalClicks += count;
      current.uniqueVisitors += toFiniteNumber(row.unique_visitors);
      current.cells.push({ x: Math.min(4, toFiniteNumber(row.x_bucket)), y: Math.min(4, toFiniteNumber(row.y_bucket)), count });
      heatmapGroups.set(route, current);
    }
    const heatmaps = Array.from(heatmapGroups, ([route, values]) => ({ route, ...values }))
      .sort((left, right) => right.totalClicks - left.totalClicks)
      .slice(0, 6);
    return {
      status: "ready",
      generatedAt: new Date().toISOString(),
      trackingStartedAt: getBehaviorAnalyticsStartedAt().toISOString(),
      isCached: [acquisitionPayload, conversionPayload, engagementPayload, heatmapPayload].every((payload) => payload.is_cached === true),
      websiteVisits: channels.reduce((sum, item) => sum + item.visits, 0),
      uniqueVisitors: channels.reduce((sum, item) => sum + item.visitors, 0),
      attributedAccounts: channels.reduce((sum, item) => sum + item.accounts, 0),
      channels,
      pages,
      heatmaps,
      errorCode: null,
    };
  } catch (error) {
    const errorCode = error instanceof Error && error.name === "AbortError"
      ? "timeout"
      : error instanceof Error && "status" in error && typeof error.status === "number"
        ? errorCodeForResponse(error.status)
        : "query_failed";
    console.warn(JSON.stringify({ event: "admin_behavior_analytics_query_failed", environment, errorCode }));
    return emptyGrowthResult("unavailable", errorCode);
  } finally {
    clearTimeout(timeout);
  }
}

const criterionCondition = (criterion: { event: string; pathPrefixes?: string[] }) => {
  const eventCondition = `event = '${escapeHogQl(criterion.event)}'`;
  if (!criterion.pathPrefixes?.length) {
    return eventCondition;
  }

  const paths = criterion.pathPrefixes
    .map((path) => `startsWith(toString(properties.$pathname), '${escapeHogQl(path)}')`)
    .join(" OR ");
  return `(${eventCondition} AND (${paths}))`;
};

export async function getPostHogFeatureFunnels(
  environment = getAnalyticsEnvironment(),
  range?: PostHogFeatureFunnelRange,
): Promise<PostHogFeatureFunnelResult> {
  const config = getQueryConfig();
  if (!config) {
    return { status: "not_configured", counts: {}, isCached: false, errorCode: "missing_credentials" };
  }

  const measurableSteps = FEATURE_FUNNEL_DEFINITIONS.flatMap((feature) =>
    feature.steps
      .filter((step) => step.criteria?.length)
      .map((step) => ({ alias: `${feature.key}__${step.key}`, criteria: step.criteria ?? [] }))
  );
  const stepExpressions = measurableSteps.flatMap(({ alias, criteria }) => {
    const condition = criteria.map(criterionCondition).join(" OR ");
    return [
      `countIf(${condition}) > 0 AS ${alias}_hit`,
      `minIf(timestamp, ${condition}) AS ${alias}_at`,
    ];
  });
  const selectExpressions = FEATURE_FUNNEL_DEFINITIONS.flatMap((feature) => {
    const measurableFeatureSteps = feature.steps.filter((step) => step.criteria?.length);
    return measurableFeatureSteps.map((step, index) => {
      const stepsThroughCurrent = measurableFeatureSteps.slice(0, index + 1);
      const progression = [
        ...stepsThroughCurrent.map((priorStep) => `${feature.key}__${priorStep.key}_hit`),
        ...stepsThroughCurrent.slice(1).map((currentStep, stepIndex) => {
          const priorStep = stepsThroughCurrent[stepIndex];
          return `${feature.key}__${currentStep.key}_at >= ${feature.key}__${priorStep.key}_at`;
        }),
      ].join(" AND ");
      return `countIf(${progression}) AS ${feature.key}__${step.key}`;
    });
  });
  const betaStartedAt = getAnalyticsBetaStartedAt();
  const rangeStart = escapeHogQl((range?.from ?? betaStartedAt).toISOString());
  const rangeEnd = escapeHogQl((range?.to ?? new Date()).toISOString());
  const distinctIdPrefix = `${escapeHogQl(environment)}:%`;
  const query = `
    SELECT ${selectExpressions.join(",\n      ")}
    FROM (
      SELECT
        toString(distinct_id) AS person_id,
        ${stepExpressions.join(",\n        ")}
      FROM events
      WHERE timestamp >= toDateTime('${rangeStart}')
        AND timestamp < toDateTime('${rangeEnd}')
        AND toString(distinct_id) LIKE '${distinctIdPrefix}'
      GROUP BY person_id
    )
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
        query: { kind: "HogQLQuery", query },
        name: `clover_admin_feature_funnels_${environment}_${ANALYTICS_BETA_EPOCH}_${rangeStart.slice(0, 10)}_${rangeEnd.slice(0, 10)}`,
        refresh: "blocking",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: "unavailable", counts: {}, isCached: false, errorCode: errorCodeForResponse(response.status) };
    }

    const payload = (await response.json()) as PostHogQueryResponse;
    const columns = Array.isArray(payload.columns) ? payload.columns.filter((value): value is string => typeof value === "string") : [];
    const row = Array.isArray(payload.results) && Array.isArray(payload.results[0]) ? payload.results[0] : [];
    const counts = Object.fromEntries(
      measurableSteps.map(({ alias }) => [alias, toFiniteNumber(row[columns.indexOf(alias)])])
    );
    return { status: "ready", counts, isCached: payload.is_cached === true, errorCode: null };
  } catch (error) {
    return {
      status: "unavailable",
      counts: {},
      isCached: false,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "query_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

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
