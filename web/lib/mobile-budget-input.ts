import { z } from "zod";
import { isBudgetEmoji } from "./budget-appearance";

// The gateway accepts only editor fields. Ownership and calculations remain in
// the shared web handlers; a client cannot supply progress or a Profile ID.
export const mobileBudgetInput = z.object({
  name: z.string().trim().min(2).max(80),
  emoji: z.string().refine(isBudgetEmoji).nullable().optional(),
  planId: z.string().trim().min(1).max(200).nullable().optional(),
  kind: z.enum(["spend_limit", "savings_target"]),
  scope: z.enum(["global", "account", "category"]),
  cadence: z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"]),
  targetAmount: z.number().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  accountId: z.string().min(1).max(200).nullable(),
  categoryId: z.string().min(1).max(200).nullable(),
  isActive: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "savings_target" && value.scope !== "global") ctx.addIssue({ code: "custom", message: "Savings targets use all accounts.", path: ["scope"] });
  if (value.scope === "account" && !value.accountId) ctx.addIssue({ code: "custom", message: "Choose an account.", path: ["accountId"] });
  if (value.scope === "category" && !value.categoryId) ctx.addIssue({ code: "custom", message: "Choose a category.", path: ["categoryId"] });
});
