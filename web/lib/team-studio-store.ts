import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { studioSchema, type StudioState } from "./team-studio";
import {
  canonicalStudioState,
  emptyServerStudio,
  studioMediaReferences,
} from "./team-studio-server-state";
export async function loadTeamStudio(userId: string) {
  const row = await prisma.teamStudioState.findUnique({
    where: { ownerId: userId },
  });
  return {
    revision: row?.revision ?? 0,
    state: row ? studioSchema.parse(row.payload) : emptyServerStudio(),
  };
}
export async function saveTeamStudio(
  userId: string,
  input: { revision: number; state: StudioState },
) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.teamStudioState.findUnique({
      where: { ownerId: userId },
    });
    if ((old?.revision ?? 0) !== input.revision) throw new Error("CONFLICT");
    const state = canonicalStudioState(
      old ? studioSchema.parse(old.payload) : emptyServerStudio(),
      input.state,
    );
    const ids = studioMediaReferences(state);
    if (ids.length) {
      const media = await tx.teamStudioMedia.findMany({
        where: { id: { in: ids }, ownerId: userId, ready: true },
      });
      if (media.length !== ids.length) throw new Error("INVALID_MEDIA");
      for (const draft of state.drafts) {
        if (
          draft.mediaId &&
          draft.mediaType !==
            (media
              .find((m) => m.id === draft.mediaId)!
              .contentType.startsWith("video/")
              ? "video"
              : "image")
        )
          throw new Error("INVALID_MEDIA");
      }
    }
    const revision = input.revision + 1;
    const payload = JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
    if (!old)
      await tx.teamStudioState.create({
        data: { ownerId: userId, revision, payload },
      });
    else {
      const update = await tx.teamStudioState.updateMany({
        where: { ownerId: userId, revision: input.revision },
        data: { revision, payload },
      });
      if (update.count !== 1) throw new Error("CONFLICT");
    }
    await tx.teamStudioAudit.create({
      data: { ownerId: userId, revision, payload },
    });
    return { state, revision };
  });
}
