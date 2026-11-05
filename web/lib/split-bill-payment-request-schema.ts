import { z } from "zod";

export const paymentRequestSchema = z.object({
  recipientParticipantId: z.string().min(1),
  payeeParticipantId: z.string().min(1),
  paymentProfileId: z.string().nullable().optional(),
  recipientEmail: z.preprocess((value) => typeof value === "string" ? value.trim() || null : value, z.string().email().nullable().optional()),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  billAmount: z.union([z.string(), z.number()]).optional(),
  billCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  amount: z.union([z.string(), z.number()]),
  dueDate: z.string().nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
});
