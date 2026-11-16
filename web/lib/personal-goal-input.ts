import { z } from "zod";

export const personalGoalInput = z.object({
  id: z.string().min(1).max(100).optional(),
  goal: z.enum(["save_more", "pay_down_debt", "track_spending", "build_emergency_fund", "invest_better"]),
  targetAmount: z.coerce.number().finite().min(0.01).max(999999999999.99).transform((amount) => Math.round(amount * 100) / 100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  goalPlan: z.object({
    cadence: z.enum(["monthly", "annual"]),
    purpose: z.string().trim().max(120).nullable(),
  }),
});
