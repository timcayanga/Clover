import assert from "node:assert/strict";
import { getPostHogLiveAnalytics } from "@/lib/posthog-query";

const originalFetch = global.fetch;
const originalPersonalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const originalProjectId = process.env.POSTHOG_PROJECT_ID;
const originalAppUrl = process.env.POSTHOG_APP_URL;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalBetaStartedAt = process.env.NEXT_PUBLIC_ANALYTICS_BETA_STARTED_AT;

const restoreEnvironment = () => {
  global.fetch = originalFetch;

  const values = {
    POSTHOG_PERSONAL_API_KEY: originalPersonalApiKey,
    POSTHOG_PROJECT_ID: originalProjectId,
    POSTHOG_APP_URL: originalAppUrl,
    VERCEL_ENV: originalVercelEnv,
    NEXT_PUBLIC_ANALYTICS_BETA_STARTED_AT: originalBetaStartedAt,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const main = async () => {
  try {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    process.env.POSTHOG_PROJECT_ID = "388373";

    const notConfigured = await getPostHogLiveAnalytics();
    assert.equal(notConfigured.status, "not_configured");
    assert.equal(notConfigured.errorCode, "missing_credentials");

    process.env.POSTHOG_PERSONAL_API_KEY = "test-personal-key";
    process.env.POSTHOG_PROJECT_ID = "388373";
    process.env.POSTHOG_APP_URL = "https://us.posthog.com";
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_ANALYTICS_BETA_STARTED_AT = "2026-07-28T11:40:00.000Z";

    let capturedRequest: { url: string; authorization: string | null; body: string } | null = null;
    global.fetch = async (input, init) => {
      capturedRequest = {
        url: String(input),
        authorization: new Headers(init?.headers).get("Authorization"),
        body: typeof init?.body === "string" ? init.body : "",
      };

      return Response.json({
        columns: ["event_name", "event_count", "unique_users", "last_seen"],
        results: [
          ["file_uploaded", 12, 4, "2026-07-27T10:00:00Z"],
          ["import_processing_completed", "4", "3", "2026-07-26T09:00:00Z"],
        ],
        is_cached: true,
      });
    };

    const ready = await getPostHogLiveAnalytics();
    assert.equal(ready.status, "ready");
    assert.equal(ready.totalEvents, 16);
    assert.equal(ready.observedEventTypes, 2);
    assert.equal(ready.observedInstrumentedEvents, 2);
    assert.equal(ready.topEvents[0]?.name, "file_uploaded");
    assert.equal(ready.topEvents[0]?.uniqueUsers, 4);
    assert.equal(ready.isCached, true);
    assert.ok(capturedRequest);
    assert.match(capturedRequest.url, /\/api\/projects\/388373\/query\/$/);
    assert.equal(capturedRequest.authorization, "Bearer test-personal-key");
    assert.match(capturedRequest.body, /staging:%/);
    assert.match(capturedRequest.body, /2026-07-28T11:40:00\.000Z/);
    assert.equal(ready.rangeStartedAt, "2026-07-28T11:40:00.000Z");
    assert.doesNotMatch(capturedRequest.body, /test-personal-key/);

    global.fetch = async () => new Response(null, { status: 401 });
    const unauthorized = await getPostHogLiveAnalytics();
    assert.equal(unauthorized.status, "unavailable");
    assert.equal(unauthorized.errorCode, "unauthorized");

    global.fetch = async () => {
      throw new Error("network unavailable");
    };
    const networkFailure = await getPostHogLiveAnalytics();
    assert.equal(networkFailure.status, "unavailable");
    assert.equal(networkFailure.errorCode, "query_failed");

    console.log("PostHog query regression passed: configuration, aggregation, scoping, and fallback checks.");
  } finally {
    restoreEnvironment();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
