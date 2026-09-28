import { z } from "zod";

export const activeRunStatuses = ["starting", "queued", "running", "canceling"];
export const startAssignmentSchema = z.object({
  briefId: z.string().min(1).max(100),
  output: z.enum(["text", "image"]).optional(),
  parentId: z.string().uuid().optional(),
  action: z.enum(["start", "revise", "retry"]).default("start"),
  feedback: z.string().trim().max(4000).default(""),
});
export type StartAssignment = z.infer<typeof startAssignmentSchema>;
export const sourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  start: z.number(),
  end: z.number(),
});
export const assignmentViewSchema = z.object({
  id: z.string(),
  briefId: z.string(),
  agent: z.string(),
  parentId: z.string().nullable(),
  status: z.string(),
  reviewStatus: z.string(),
  model: z.string(),
  brief: z.string(),
  sourceAssignmentId: z.string().default(""),
  instructions: z.string(),
  feedback: z.string(),
  result: z.string(),
  output: z.enum(["text", "image"]).default("text"),
  mediaId: z.string().nullable().default(null),
  sources: z.array(sourceSchema),
  error: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  searchCalls: z.number(),
  estimatedCostUsd: z.number().nullable(),
  createdAt: z.string(),
  events: z.array(
    z.object({ action: z.string(), note: z.string(), createdAt: z.string() }),
  ),
});
export type AssignmentView = z.infer<typeof assignmentViewSchema>;
export type AssignmentSummary = Pick<
  AssignmentView,
  | "id"
  | "briefId"
  | "agent"
  | "parentId"
  | "status"
  | "reviewStatus"
  | "createdAt"
  | "brief"
>;
export const assignmentSummarySchema = assignmentViewSchema.pick({
  id: true,
  briefId: true,
  agent: true,
  parentId: true,
  status: true,
  reviewStatus: true,
  createdAt: true,
  brief: true,
});
export function safeSourceUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

export const assignmentTransferSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("brief"),
    agent: z.enum(["lead", "creator", "researcher"]),
    text: z.string().trim().min(1).max(6000),
  }),
  z.object({
    kind: z.literal("draft"),
    title: z.string().trim().min(1).max(120),
    caption: z.string().trim().min(1).max(6000),
    channel: z.enum(["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn"]),
    format: z.enum(["Image", "Carousel", "Video", "Text"]),
  }),
]);
export type AssignmentTransfer = z.infer<typeof assignmentTransferSchema>;

// A deterministic display avoids server/browser timezone hydration mismatches.
export function formatAssignmentTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time)
    ? new Date(time + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ") + " PHT"
    : "Unknown time";
}
