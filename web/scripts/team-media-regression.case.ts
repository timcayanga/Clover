import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  prepareTeamUpload,
  completeTeamUpload,
  teamMediaReadUrl,
} from "../lib/team-media.server";
import { prisma } from "../lib/prisma";
import { objects } from "./fixtures/team-s3";
async function main() {
  const owner = `media-test-${randomUUID()}`;
  process.env.R2_ACCOUNT_ID = "fixture";
  process.env.R2_ACCESS_KEY_ID = "fixture";
  process.env.R2_SECRET_ACCESS_KEY = "fixture";
  process.env.CLOVER_TEAM_MEDIA_BUCKET = "private-fixture";
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const upload = await prepareTeamUpload(owner, {
    contentType: "image/png",
    size: bytes.length,
  });
  let row = await prisma.teamStudioMedia.findUniqueOrThrow({
    where: { id: upload.id },
  });
  objects.set(row.stagingKey, {
    bytes,
    contentType: "image/png",
    etag: "first",
  });
  await assert.rejects(
    () => completeTeamUpload("other", upload.id),
    /MEDIA_NOT_FOUND/,
  );
  await assert.rejects(
    () => teamMediaReadUrl(owner, upload.id),
    /MEDIA_NOT_FOUND/,
  );
  await completeTeamUpload(owner, upload.id);
  row = await prisma.teamStudioMedia.findUniqueOrThrow({
    where: { id: upload.id },
  });
  assert(row.ready);
  assert.deepEqual(objects.get(row.storageKey)?.bytes, bytes);
  assert((await teamMediaReadUrl(owner, upload.id)).includes("expires=300"));
  const finalKey = row.storageKey;
  objects.set(row.stagingKey, {
    bytes: new Uint8Array(8),
    contentType: "image/png",
    etag: "replayed",
  });
  await completeTeamUpload(owner, upload.id);
  assert.equal(
    (
      await prisma.teamStudioMedia.findUniqueOrThrow({
        where: { id: upload.id },
      })
    ).storageKey,
    finalKey,
  );
  assert.deepEqual(objects.get(finalKey)?.bytes, bytes);
  const bad = await prepareTeamUpload(owner, {
    contentType: "image/png",
    size: 8,
  });
  const badRow = await prisma.teamStudioMedia.findUniqueOrThrow({
    where: { id: bad.id },
  });
  objects.set(badRow.stagingKey, {
    bytes: new Uint8Array(8),
    contentType: "image/png",
    etag: "bad",
  });
  await assert.rejects(
    () => completeTeamUpload(owner, bad.id),
    /INVALID_MEDIA/,
  );
  assert.equal(
    (await prisma.teamStudioMedia.findUniqueOrThrow({ where: { id: bad.id } }))
      .ready,
    false,
  );
  await prisma.teamStudioMedia.deleteMany({ where: { ownerId: owner } });
  console.log(
    "PASS: private media ownership, pending-read denial, verified finalization, expiring URLs, invalid signatures, and replay-safe immutable media. R2 is simulated.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
