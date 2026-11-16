import { analyticsExcludedIds } from "./analytics-audience";
import { measurementConfig, syntheticSuffixes } from "./analytics-audience-rules";
const quoted = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
/** Current persons are deliberate: event-time snapshots cannot retrospectively exclude staff. */
export async function customerEventPredicate(environment: string) {
  const c = measurementConfig();
  const assigned = process.env.DATABASE_URL ? await analyticsExcludedIds(environment) : [];
  const ids = [...new Set([...c.staffIds, ...c.testIds, ...assigned])];
  const emails = [...c.staffEmails, ...c.testEmails].map(quoted).join(",");
  const distinctIds = ids.flatMap(id => [id, `${environment}:${id}`]).map(quoted).join(",");
  return `lower(coalesce(toString(properties.analytics_excluded), 'false')) NOT IN ('true','1')
    AND lower(coalesce(toString(properties.is_simulator), 'false')) NOT IN ('true','1')
    AND lower(coalesce(toString(properties.is_test_access), 'false')) NOT IN ('true','1')
    AND empty(coalesce(toString(properties.qa_source), ''))
    AND toString(distinct_id) NOT IN (${distinctIds})
    AND person_id NOT IN (SELECT id FROM persons WHERE lower(toString(properties.analytics_excluded)) IN ('true','1')
      OR lower(toString(properties.email)) IN (${emails})
      OR ${syntheticSuffixes.map(s => `endsWith(lower(toString(properties.email)), ${quoted(s)})`).join(" OR ")})
    AND (toString(properties.event_source) = 'server' OR NOT isLikelyBot(properties.$raw_user_agent))`;
}
/** Scope each events scan, including nested queries; retain raw events for diagnostics. */
export async function scopeCustomerAnalyticsQuery(query: string, environment: string) {
  const predicate = await customerEventPredicate(environment);
  return query.replace(/\bFROM events\b/g, `FROM (SELECT * FROM events WHERE ${predicate})`);
}
