import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
const amount = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/);
export const mobileEditSchema = z.object({
  merchantClean: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  userNote: z.string().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  tagAction: z.enum(["add", "remove"]).optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  date: date.optional(),
  amount: amount.optional(),
  type: z.enum(["income", "expense", "transfer"]).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export const mobileCreateSchema = z.object({
  accountId: z.string().min(1), categoryId: z.string().min(1).nullable(),
  merchantRaw: z.string().trim().min(1).max(200), date, amount,
  currency: z.string().regex(/^[A-Z]{3}$/), type: z.enum(["income", "expense", "transfer"]),
  description: z.string().max(2000).optional(), tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
}).strict();
