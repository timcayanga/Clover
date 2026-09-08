import { adviserAttachmentIds } from "./adviser-attachments";
import { entryDraftSchema, entryFormSchema } from "./adviser-entry-schema";
import { z } from "zod";

export const mobileAdviserInput = z.object({
  attachmentIds: adviserAttachmentIds.optional(),
  clientDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entryDraft: entryDraftSchema.optional(),
  formContext: entryFormSchema.optional(),
  preferOnDevice: z.boolean().optional(),
  page: z.enum(["home", "accounts", "transactions", "recurring", "budgeting", "goals", "investments", "reports", "circles", "split-bills", "general"]).optional(),
  selection: z.object({ kind: z.enum(["account", "transaction"]), id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/) }).strict().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4000),
  }).strict()).min(1).max(6),
}).strict().refine(value => value.messages.at(-1)?.role === "user", "Ask a question first.");
