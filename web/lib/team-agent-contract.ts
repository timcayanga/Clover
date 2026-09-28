import { z } from "zod";

export const activeRunStatuses = ["starting", "queued", "running", "canceling"];
export const startAssignmentSchema = z.object({
  briefId: z.string().min(1).max(100),
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
  instructions: z.string(),
  feedback: z.string(),
  result: z.string(),
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
>;
export const assignmentSummarySchema = assignmentViewSchema.pick({
  id: true,
  briefId: true,
  agent: true,
  parentId: true,
  status: true,
  reviewStatus: true,
  createdAt: true,
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
