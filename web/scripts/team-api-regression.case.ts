import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixtures/team-clerk";
import { GET, PUT } from "../app/api/team/state/route";
import { POST as upload } from "../app/api/team/media/route";
import { GET as media } from "../app/api/team/media/[mediaId]/route";
import { initialStudio } from "../lib/team-studio";
import { prisma } from "../lib/prisma";
async function main() {
  assert(
    process.env.DATABASE_URL?.startsWith(
      "postgresql://clover_test@127.0.0.1:55432/",
    ),
  );
  const id = `api-test-${randomUUID()}`;
  const request = (state: unknown, origin = "https://team.clover.ph") =>
    new Request("https://team.clover.ph/api/team/state", {
      method: "PUT",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(state),
    });
  // Even development mode + localhost must not bypass API authentication.
  assert.equal((await GET()).status, 401);
  assert.equal((await PUT(request({}))).status, 401);
  assert.equal((await upload(request({}))).status, 401);
  assert.equal(
    (
      await media(request({}), {
        params: Promise.resolve({ mediaId: randomUUID() }),
      })
    ).status,
    401,
  );
  fixture.user = {
    id,
    emailAddresses: [
      {
        emailAddress: "hello@clover.ph",
        verification: { status: "unverified" },
      },
    ],
  };
  assert.equal((await GET()).status, 403);
  fixture.user.emailAddresses = [
    { emailAddress: "other@clover.ph", verification: { status: "verified" } },
  ];
  assert.equal((await GET()).status, 403);
  fixture.user.emailAddresses = [
    { emailAddress: "hello@clover.ph", verification: { status: "verified" } },
  ];
  assert.equal((await GET()).status, 200);
  const state = { ...initialStudio(), drafts: [] };
  assert.equal(
    (await PUT(request({ revision: 0, state }, "https://evil.test"))).status,
    403,
  );
  const saved = await PUT(request({ revision: 0, state }));
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("cache-control"), "private, no-store");
  assert.equal((await saved.json()).revision, 1);
  assert.equal((await PUT(request({ revision: 0, state }))).status, 409);
  assert.equal((await PUT(request({ revision: 1, state: {} }))).status, 400);
  assert.equal(
    (
      await media(request({}), {
        params: Promise.resolve({ mediaId: randomUUID() }),
      })
    ).status,
    404,
  );
  assert.equal(
    (await PUT(request({ enormous: "a".repeat(2_000_001) }))).status,
    413,
  );
  await prisma.teamStudioAudit.deleteMany({ where: { ownerId: id } });
  await prisma.teamStudioState.deleteMany({ where: { ownerId: id } });
  console.log(
    "PASS: real API routes reject missing/unverified/non-owner identities, enforce same-origin writes, limit payloads, return private responses, and reject stale revisions. Clerk itself is simulated.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
