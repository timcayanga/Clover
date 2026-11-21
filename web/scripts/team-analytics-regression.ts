import assert from "node:assert/strict";
import { getTeamAnalyticsSnapshot, teamAnalyticsWindow } from "../lib/team-analytics-snapshot";
import { agentProfiles, initialStudio } from "../lib/team-studio";
import { canonicalStudioState } from "../lib/team-studio-server-state";
import { assignmentTransferSchema } from "../lib/team-agent-contract";
async function main() {
  const now = new Date("2026-11-21T00:00:00Z");
  assert.deepEqual(teamAnalyticsWindow(now), {from: "2026-11-06T16:00:00.000Z", comparisonEnd: "2026-11-13T16:00:00.000Z", toExclusive: "2026-11-20T16:00:00.000Z"});
  assert.equal(teamAnalyticsWindow(new Date("2026-11-20T15:59:59Z")).toExclusive, "2026-11-13T16:00:00.000Z");
  assert.equal(agentProfiles.length, 5);
  const old = initialStudio(); delete old.instructions["web-analyst"]; delete old.instructions["analytics-reviewer"];
  const next = {...old, instructions: {...old.instructions, "web-analyst": "Analyze mobile friction"}};
  assert.equal(canonicalStudioState(old, next).instructions["web-analyst"], "Analyze mobile friction");
  assert(assignmentTransferSchema.safeParse({kind: "brief", agent: "analytics-reviewer", text: "Review evidence"}).success);
  delete process.env.POSTHOG_PERSONAL_API_KEY;
  assert.equal((await getTeamAnalyticsSnapshot(now)).status, "unavailable");
  process.env.POSTHOG_PERSONAL_API_KEY = "test-key";
  process.env.POSTHOG_PROJECT_ID = "388373";
  process.env.POSTHOG_APP_URL = "https://us.posthog.com";
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(String(url), "https://us.posthog.com/api/projects/388373/query/");
      const sql = JSON.parse(String(options?.body)).query.query;
      assert.match(sql, /properties\.\$host = 'clover.ph'/);
      assert.match(sql, /timestamp </);
      return Response.json({results: [["current", "Mobile", 0, 0, 0]]});
    };
    const zero = await getTeamAnalyticsSnapshot(now);
    assert.equal(zero.status, "partial");
    assert('rows' in zero && zero.rows?.[0][2] === 0);
    global.fetch = async () => Response.json({results: [["current", "Mobile", "broken", 2, 0]]});
    assert.equal((await getTeamAnalyticsSnapshot(now)).status, "unavailable");
    global.fetch = async () => new Response("sensitive provider message", {status: 401});
    assert(!JSON.stringify(await getTeamAnalyticsSnapshot(now)).includes("sensitive"));
    process.env.POSTHOG_APP_URL = "https://attacker.example";
    global.fetch = async () => {throw new Error("Must not send credentials");};
    assert.equal((await getTeamAnalyticsSnapshot(now)).status, "unavailable");
  } finally {global.fetch = originalFetch;}
  console.log("PASS: weekly boundaries, existing-owner role upgrades, cross-agent handoff, fixed aggregate scope, unavailable versus zero, strict response validation and credential destination allowlist.");
}
main().catch(e => {console.error(e);process.exitCode = 1;});
