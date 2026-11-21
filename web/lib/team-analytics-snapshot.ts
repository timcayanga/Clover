import { z } from "zod";

// Fixed read-only aggregate query. Briefs never become SQL, hosts or credentials.
export function teamAnalyticsWindow(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - ((shifted.getUTCDay() + 1) % 7));
  const end = new Date(shifted.getTime() - 8 * 3600_000);
  return { from: new Date(+end - 14 * 86400_000).toISOString(), comparisonEnd: new Date(+end - 7 * 86400_000).toISOString(), toExclusive: end.toISOString() };
}
const rowsSchema = z.array(z.tuple([
  z.enum(["current", "previous"]), z.string().max(80),
  z.number().int().nonnegative(), z.number().int().nonnegative(),
  z.number().int().nonnegative(),
])).max(30);
export async function getTeamAnalyticsSnapshot(now = new Date()) {
  const window = teamAnalyticsWindow(now);
  const base = { capturedAt: now.toISOString(), window, timezone: "Asia/Manila", host: "clover.ph", scope: "Web acquisition pageviews only; anonymous and identified visitors included", definitions: { pageviews: "$pageview events", visitors: "Distinct PostHog distinct_id per device/week; not verified accounts or deduplicated cross-device users", missingAudience: "Pageviews without analytics_audience" }, gaps: ["No ordered funnels, retention, revenue, bounce, session replay or native-app coverage in this snapshot.", "Staff, bots and QA may remain where exclusion tags are missing. Device totals are not additive unique people.", "Window is independently defined, not verified against the Saturday email. Releases and consent may affect coverage."] };
  const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const project = process.env.POSTHOG_PROJECT_ID?.trim();
  const host = process.env.POSTHOG_APP_URL?.trim().replace(/\/$/, "") || "https://us.posthog.com";
  if (!key || !project) return {...base, status: "unavailable", reason: "PostHog query credentials are not configured."};
  if (!/^\d+$/.test(project) || !["https://us.posthog.com", "https://eu.posthog.com"].includes(host)) return {...base, status: "unavailable", reason: "PostHog project or cloud host needs verification."};
  const sql = `SELECT if(timestamp >= toDateTime('${window.comparisonEnd}'), 'current', 'previous') AS period,
    coalesce(nullIf(toString(properties.$device_type), ''), 'Unknown') AS device,
    count() AS pageviews, uniqExact(distinct_id) AS visitors,
    countIf(empty(coalesce(toString(properties.analytics_audience), ''))) AS missing_audience
    FROM events WHERE event = '$pageview'
    AND timestamp >= toDateTime('${window.from}') AND timestamp < toDateTime('${window.toExclusive}')
    AND properties.$host = 'clover.ph'
    AND coalesce(toString(properties.analytics_environment), '') NOT IN ('staging', 'development', 'test')
    AND coalesce(toString(properties.analytics_audience), '') NOT IN ('test', 'staff', 'internal')
    AND coalesce(toString(properties.analytics_excluded), '') NOT IN ('true', '1')
    GROUP BY period, device ORDER BY period, device LIMIT 30`;
  try {
    const response = await fetch(`${host}/api/projects/${project}/query/`, {
      method: "POST", headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
      signal: AbortSignal.timeout(18000), redirect: "error", cache: "no-store",
      body: JSON.stringify({query: {kind: "HogQLQuery", query: sql}}),
    });
    if (!response.ok) return {...base, project, status: "unavailable", reason: `PostHog query failed (${response.status}).`};
    const payload = await response.json();
    const rows = rowsSchema.parse(payload.results);
    return {...base, project, status: "partial", rows, query: sql, source: `${host}/project/${project}`, cached: payload.is_cached === true};
  } catch {
    return {...base, project, status: "unavailable", reason: "PostHog timed out or returned an unsupported response. No metrics inferred."};
  }
}
