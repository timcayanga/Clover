import { getPostHogConfig, getAnalyticsEnvironment, getAnalyticsEpochProperties } from "@/lib/analytics";
// Public ingestion token only (already present in the web bundle), never a query/admin key.
export function GET() {
  const { key, host } = getPostHogConfig();
  return Response.json({ key, host, environment: getAnalyticsEnvironment(), epoch: getAnalyticsEpochProperties() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
