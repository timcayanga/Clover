import { z } from "zod";
import { CARD_REPLACEMENT_REASONS } from "../../shared/card-replacement";
export const cardReplacementSchema = z.object({
  requestId: z.string().uuid(), expectedLastFour: z.string().regex(/^\d{4}$/).nullable(),
  newLastFour: z.string().regex(/^\d{4}$/, "Enter the new card’s last four digits."),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && +date <= Date.now() + 86400000;
  }, "Choose a valid replacement date."),
  reason: z.enum(CARD_REPLACEMENT_REASONS), confirmed: z.literal(true),
}).strict();
