import {
  initialStudio,
  reviseDraft,
  reviewDraft,
  studioSchema,
  type StudioDraft,
  type StudioState,
} from "./team-studio";

const contentKeys = [
  "title",
  "caption",
  "date",
  "channel",
  "format",
  "mediaId",
  "mediaType",
] as const;
export function canonicalStudioState(
  previous: StudioState,
  input: unknown,
): StudioState {
  const proposed = studioSchema.parse(input);
  for (const rows of [proposed.drafts, proposed.briefs]) {
    if (
      new Set(rows.map((r) => r.id)).size !== rows.length ||
      rows.some((r) => !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id))
    )
      throw new Error("INVALID_STATE");
  }
  if (previous.drafts.some((d) => !proposed.drafts.some((p) => p.id === d.id)))
    throw new Error("INVALID_STATE");
  // Assignment history is append-only. Standing instructions can be edited.
  if (
    previous.briefs.some(
      (b) =>
        JSON.stringify(proposed.briefs.find((p) => p.id === b.id)) !==
        JSON.stringify(b),
    )
  )
    throw new Error("INVALID_STATE");
  if (
    Object.keys(proposed.instructions).some(
      (k) => !["lead", "creator", "researcher"].includes(k),
    )
  )
    throw new Error("INVALID_STATE");
  for (const brief of proposed.briefs) {
    if (
      brief.sourceAssignmentId &&
      !previous.briefs.some((b) => b.id === brief.id)
    )
      throw new Error("INVALID_STATE");
  }
  const drafts = proposed.drafts.map((candidate) => {
    const old = previous.drafts.find((d) => d.id === candidate.id);
    if (candidate.sourceAssignmentId !== old?.sourceAssignmentId)
      throw new Error("INVALID_STATE");
    if (!old)
      return {
        ...candidate,
        sample: false,
        revision: 1,
        approvedRevision: undefined,
        status: "Draft" as const,
        history: [],
      };
    const changed = contentKeys.some((k) => candidate[k] !== old[k]);
    if (changed)
      return reviseDraft(
        old,
        Object.fromEntries(
          contentKeys.map((k) => [k, candidate[k]]),
        ) as Partial<StudioDraft>,
        candidate.status !== "Approved" &&
          candidate.history.at(-1)?.text !== old.history.at(-1)?.text
          ? candidate.history.at(-1)?.text || "Draft edited"
          : "Draft edited; approval requires review of this version",
      );
    const note = candidate.history.at(-1)?.text;
    if (
      candidate.status !== old.status ||
      (note && note !== old.history.at(-1)?.text)
    ) {
      return reviewDraft(
        old,
        candidate.status,
        note || `Owner set status to ${candidate.status}`,
      );
    }
    return old;
  });
  return {
    ...proposed,
    drafts,
    briefs: proposed.briefs.map(
      (b) =>
        previous.briefs.find((p) => p.id === b.id) ?? {
          ...b,
          at: new Date().toISOString(),
        },
    ),
  };
}
export function emptyServerStudio(): StudioState {
  return { ...initialStudio(), drafts: [] };
}
export function studioMediaReferences(state: StudioState) {
  return [
    ...new Set(
      state.drafts
        .flatMap((d) => [d.mediaId, ...d.history.map((h) => h.mediaId)])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}
