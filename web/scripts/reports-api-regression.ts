import assert from "node:assert/strict";
import { GET, POST } from "../app/api/reports/saved/route";
import { defaultReportView } from "../../shared/reports/analysis";
const state = (globalThis as any).__reportFixture as {
  user: string;
  paid: boolean;
  rows: any[];
  locks: number;
};
if (!state)
  throw Error("Run with the isolated in-memory Reports fixture preload.");
const request = (
  method: string,
  body?: unknown,
  profile = "profile-a",
  origin = "https://clover.example",
) =>
  new Request(
    `https://clover.example/api/reports/saved?workspaceId=${profile}`,
    {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
async function main() {
  const create = {
    action: "create",
    name: "Household",
    view: { ...defaultReportView, range: "90d" },
  };
  assert.equal((await POST(request("POST", create))).status, 200);
  const saved = (await (await GET(request("GET"))).json()).reports[0];
  assert.equal(saved.name, "Household");
  assert.equal(
    (await POST(request("POST", create, "profile-b"))).status,
    400,
    "Other Profile cannot be modified",
  );
  assert.equal((await GET(request("GET", undefined, "profile-b"))).status, 403);
  assert.equal(
    (await POST(request("POST", create, "profile-a", "https://evil.example")))
      .status,
    400,
    "Cross-origin write must be rejected",
  );
  state.user = "owner-b";
  assert.deepEqual(
    (await (await GET(request("GET", undefined, "profile-b"))).json()).reports,
    [],
  );
  assert.equal(
    (
      await POST(
        request(
          "POST",
          { action: "delete", id: saved.id, revision: 1 },
          "profile-b",
        ),
      )
    ).status,
    409,
    "Guessed IDs cannot delete another Profile report",
  );
  state.user = "owner-a";
  const update = {
    action: "update",
    id: saved.id,
    revision: 1,
    name: "Updated",
    view: defaultReportView,
  };
  const results = await Promise.all([
    POST(request("POST", update)),
    POST(request("POST", update)),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  state.paid = false;
  assert.equal((await POST(request("POST", create))).status, 403);
  assert.equal(
    (await POST(request("POST", { ...update, revision: 2 }))).status,
    403,
  );
  assert.equal(
    (await GET(request("GET"))).status,
    200,
    "Downgraded users can see saved settings",
  );
  assert.equal(
    (
      await POST(
        request("POST", { action: "delete", id: saved.id, revision: 2 }),
      )
    ).status,
    200,
    "Downgraded users can remove their saved settings",
  );
  state.paid = true;
  assert.equal(
    (await POST(request("POST", { ...create, name: "" }))).status,
    400,
  );
  assert.equal(
    (
      await POST(
        request("POST", {
          ...create,
          view: {
            ...defaultReportView,
            range: "custom",
            from: "2026-02-30",
            to: "2026-03-01",
          },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await POST(request("POST", { ...create, name: "x".repeat(25000) })))
      .status,
    413,
  );
  for (let i = 0; i < 49; i++)
    assert.equal(
      (await POST(request("POST", { ...create, name: `Report ${i}` }))).status,
      200,
    );
  const cap = await Promise.all([
    POST(request("POST", create)),
    POST(request("POST", create)),
  ]);
  assert.deepEqual(cap.map((r) => r.status).sort(), [200, 409]);
  assert.equal(state.rows.length, 50);
  state.user = "";
  assert.equal((await GET(request("GET"))).status, 403);
  assert.equal((await POST(request("POST", create))).status, 400);
  assert(state.locks >= 55);
  console.log(
    "Saved Reports API passed: authentication, Profile ownership, CSRF, paid writes, downgrade deletion, malformed data, concurrent revisions and 50-report cap. No live database used.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
