import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadTeamStudio, saveTeamStudio } from "../lib/team-studio-store";
import {
  canonicalStudioState,
  emptyServerStudio,
} from "../lib/team-studio-server-state";
import { initialStudio, reviseDraft, reviewDraft } from "../lib/team-studio";
import { prisma } from "../lib/prisma";
import { matchesMediaSignature } from "../lib/team-media.server";

async function main() {
  if (
    !process.env.DATABASE_URL?.startsWith(
      "postgresql://clover_test@127.0.0.1:55432/",
    )
  )
    throw new Error(
      "Run only against the disposable local database on port 55432.",
    );
  const owner = `test-${randomUUID()}`;
  const other = `test-${randomUUID()}`;
  const empty = emptyServerStudio();
  const draft = {
    ...initialStudio().drafts[0],
    id: randomUUID(),
    sample: false,
  };
  const one = await saveTeamStudio(owner, {
    revision: 0,
    state: { ...empty, drafts: [draft] },
  });
  assert.equal(one.state.drafts[0].status, "Draft");
  assert.equal((await loadTeamStudio(owner)).state.drafts.length, 1);
  assert.equal((await loadTeamStudio(other)).state.drafts.length, 0);
  const approved = reviewDraft(
    one.state.drafts[0],
    "Approved",
    "Owner approved",
  );
  const two = await saveTeamStudio(owner, {
    revision: one.revision,
    state: { ...one.state, drafts: [approved] },
  });
  assert.equal(two.state.drafts[0].approvedRevision, 1);
  const forged = {
    ...two.state.drafts[0],
    caption: "Changed behind an approval",
    approvedRevision: 1,
    revision: 1,
  };
  const three = await saveTeamStudio(owner, {
    revision: two.revision,
    state: { ...two.state, drafts: [forged] },
  });
  assert.equal(three.state.drafts[0].status, "Draft");
  assert.equal(three.state.drafts[0].approvedRevision, undefined);
  assert.equal(three.state.drafts[0].history.at(-1)?.caption, draft.caption);
  await assert.rejects(
    () => saveTeamStudio(owner, { revision: two.revision, state: two.state }),
    /CONFLICT/,
  );
  const contenders = await Promise.allSettled([
    saveTeamStudio(owner, {
      revision: three.revision,
      state: {
        ...three.state,
        instructions: { ...three.state.instructions, lead: "Tab A" },
      },
    }),
    saveTeamStudio(owner, {
      revision: three.revision,
      state: {
        ...three.state,
        instructions: { ...three.state.instructions, lead: "Tab B" },
      },
    }),
  ]);
  assert.equal(contenders.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await prisma.teamStudioAudit.count({ where: { ownerId: owner } }),
    4,
  );
  const current = await loadTeamStudio(owner);
  const alienMedia = await prisma.teamStudioMedia.create({
    data: {
      ownerId: other,
      id: randomUUID(),
      storageKey: randomUUID(),
      stagingKey: randomUUID(),
      contentType: "image/png",
      size: 100,
      ready: true,
    },
  });
  await assert.rejects(
    () =>
      saveTeamStudio(owner, {
        revision: current.revision,
        state: {
          ...current.state,
          drafts: [
            reviseDraft(current.state.drafts[0], {
              mediaId: alienMedia.id,
              mediaType: "image",
            }),
          ],
        },
      }),
    /INVALID_MEDIA/,
  );
  assert.equal((await loadTeamStudio(owner)).revision, current.revision);
  assert.throws(
    () => canonicalStudioState(current.state, { ...current.state, drafts: [] }),
    /INVALID_STATE/,
  );
  assert.deepEqual(
    canonicalStudioState(current.state, {
      ...current.state,
      drafts: [{ ...current.state.drafts[0], history: [] }],
    }).drafts[0].history,
    current.state.drafts[0].history,
  );
  assert(
    matchesMediaSignature(
      "image/png",
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
  );
  assert(
    !matchesMediaSignature(
      "image/png",
      new TextEncoder().encode("<html>not an image</html>"),
    ),
  );
  const rls = await prisma.$queryRaw<
    { relname: string; relrowsecurity: boolean }[]
  >`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('TeamStudioState','TeamStudioAudit','TeamStudioMedia')`;
  assert.equal(rls.length, 3);
  assert(rls.every((r) => r.relrowsecurity));
  console.log(
    "PASS: persistence, owner isolation, immutable audit, concurrent saves, forged approvals/history, media ownership/signatures, and RLS.",
  );
  await prisma.teamStudioAudit.deleteMany({ where: { ownerId: owner } });
  await prisma.teamStudioState.deleteMany({ where: { ownerId: owner } });
  await prisma.teamStudioMedia.deleteMany({ where: { ownerId: other } });
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
