import { z } from 'zod';
import { parseReceiptLineItemsFromPayload } from './receipt-line-items';

export const lineItemAdditionSchema = z.object({
  requestId: z.string().uuid(),
  item: z.object({
    description: z.string().trim().min(1).max(500),
    amount: z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict(),
}).strict();

/** Call under the transaction row lock; raw source and financial fields stay untouched. */
export function appendedLineItems(rawPayload: unknown, normalizedPayload: unknown, input: z.infer<typeof lineItemAdditionSchema>) {
  const addition = lineItemAdditionSchema.parse(input);
  const normalized = normalizedPayload && typeof normalizedPayload === 'object' && !Array.isArray(normalizedPayload)
    ? normalizedPayload as Record<string, unknown> : {};
  const requests = Array.isArray(normalized.lineItemAdditionRequests)
    ? normalized.lineItemAdditionRequests.filter((id): id is string => typeof id === 'string') : [];
  if (requests.includes(addition.requestId)) return null;
  const current = parseReceiptLineItemsFromPayload(rawPayload, normalizedPayload);
  if (current.length >= 100) throw new Error('A transaction can have up to 100 line items.');
  return {
    ...normalized,
    receiptLineItems: [...current, addition.item],
    lineItemAdditionRequests: [...requests.slice(-199), addition.requestId],
  };
}
