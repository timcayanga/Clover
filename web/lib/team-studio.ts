import { z } from "zod";

export const agentProfiles = [
  {
    id: "lead",
    name: "Distribution lead",
    initials: "DL",
    color: "sage",
    specialty: "The big picture",
    description:
      "Turns your goals into focused campaigns, channel plans, and experiments.",
    instructions:
      "Propose organic distribution experiments for Clover. State the audience, hypothesis, channel, effort, and success measure. Ask for owner approval before assigning or publishing work.",
  },
  {
    id: "creator",
    name: "Content creator",
    initials: "CC",
    color: "peach",
    specialty: "Ideas, made tangible",
    description:
      "Shapes the words, images, and video stories that bring Clover to life.",
    instructions:
      "Prepare clear, useful content in Clover’s warm, practical voice. Use verified product capabilities. Produce drafts for review, preserve prior versions, and never publish without approval.",
  },
  {
    id: "researcher",
    name: "Community researcher",
    initials: "CR",
    color: "lilac",
    specialty: "Closer to the audience",
    description:
      "Finds the communities, conversations, and questions worth understanding.",
    instructions:
      "Research relevant communities and their posting rules. Cite sources and separate observations from assumptions. Suggest helpful replies; do not message people or post autonomously.",
  },
] as const;

export const statusSchema = z.enum([
  "Draft",
  "In review",
  "Approved",
  "Changes requested",
]);
export const draftSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  sourceAssignmentId: z.string().uuid().optional(),
  caption: z.string().max(6000),
  format: z.enum(["Image", "Carousel", "Video", "Text"]),
  channel: z.enum(["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn"]),
  agent: z.enum(["lead", "creator", "researcher"]),
  status: statusSchema,
  date: z.string(),
  sample: z.boolean(),
  visual: z.enum(["sage", "peach", "lilac"]),
  mediaId: z.string().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  revision: z.number().int().positive(),
  approvedRevision: z.number().int().positive().optional(),
  history: z
    .array(
      z.object({
        at: z.string(),
        text: z.string(),
        caption: z.string(),
        revision: z.number(),
        title: z.string().optional(),
        mediaId: z.string().optional(),
        mediaType: z.enum(["image", "video"]).optional(),
        channel: z.string().optional(),
        date: z.string().optional(),
        format: z.string().optional(),
      }),
    )
    .max(100),
});
export type StudioDraft = z.infer<typeof draftSchema>;
export type StudioStatus = z.infer<typeof statusSchema>;
export const studioSchema = z.object({
  version: z.literal(1),
  drafts: z.array(draftSchema).max(200),
  instructions: z.record(z.string(), z.string().max(6000)),
  briefs: z
    .array(
      z.object({
        id: z.string(),
        agent: z.string(),
        sourceAssignmentId: z.string().uuid().optional(),
        text: z.string().max(6000),
        at: z.string(),
      }),
    )
    .max(200),
});
export type StudioState = z.infer<typeof studioSchema>;

export function initialStudio(): StudioState {
  return {
    version: 1,
    instructions: Object.fromEntries(
      agentProfiles.map((a) => [a.id, a.instructions]),
    ),
    briefs: [],
    drafts: [
      {
        id: "sample-clarity",
        title: "A clearer picture of your money",
        caption:
          "A little clarity goes a long way. Bring your statements together, review your transactions, and start making sense of your money with Clover.\n\nSample copy for review — verify every claim before publishing.",
        format: "Image",
        channel: "Instagram",
        agent: "creator",
        status: "In review",
        date: "",
        sample: true,
        visual: "sage",
        revision: 1,
        history: [],
      },
      {
        id: "sample-habits",
        title: "Small habits. More clarity.",
        caption:
          "A weekly money check-in: gather your statements, review unfamiliar transactions, and look back at where your money went.\n\nSample carousel concept. Slides have not been produced.",
        format: "Carousel",
        channel: "Facebook",
        agent: "creator",
        status: "Draft",
        date: "",
        sample: true,
        visual: "peach",
        revision: 1,
        history: [],
      },
      {
        id: "sample-story",
        title: "From statement to understanding",
        caption:
          "Video storyboard: open on a stack of statements, show Clover’s import and review flow with synthetic data, and close with one clear next step.\n\nSample storyboard only — no video has been generated.",
        format: "Video",
        channel: "TikTok",
        agent: "lead",
        status: "Draft",
        date: "",
        sample: true,
        visual: "lilac",
        revision: 1,
        history: [],
      },
    ],
  };
}

export function reviseDraft(
  draft: StudioDraft,
  changes: Partial<
    Pick<
      StudioDraft,
      | "title"
      | "caption"
      | "date"
      | "channel"
      | "format"
      | "mediaId"
      | "mediaType"
    >
  >,
  note = "Draft edited",
): StudioDraft {
  return {
    ...draft,
    ...changes,
    revision: draft.revision + 1,
    approvedRevision: undefined,
    status: "Draft",
    history: [
      ...draft.history,
      {
        at: new Date().toISOString(),
        text: note,
        caption: draft.caption,
        revision: draft.revision,
        title: draft.title,
        mediaId: draft.mediaId,
        mediaType: draft.mediaType,
        channel: draft.channel,
        date: draft.date,
        format: draft.format,
      },
    ].slice(-100),
  };
}

export function reviewDraft(
  draft: StudioDraft,
  status: StudioStatus,
  note: string,
): StudioDraft {
  return {
    ...draft,
    status,
    approvedRevision: status === "Approved" ? draft.revision : undefined,
    history: [
      ...draft.history,
      {
        at: new Date().toISOString(),
        text: note,
        caption: draft.caption,
        revision: draft.revision,
        title: draft.title,
        mediaId: draft.mediaId,
        mediaType: draft.mediaType,
        channel: draft.channel,
        date: draft.date,
        format: draft.format,
      },
    ].slice(-100),
  };
}
