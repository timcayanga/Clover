import { z } from "zod";
import {
  mergeSplitBillItemSplitMetadata,
  hasSplitBillAllocationChanges,
  type SplitBillSerializedBill,
} from "./split-bill";
const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0 && Number(v) <= 1_000_000_000);
export const mobileBillEdit = z
  .object({
    title: z.string().trim().min(1).max(100),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1),
            description: z.string().trim().min(1).max(500),
            amount,
            participantIds: z.array(z.string().min(1)).min(1).max(30),
            splitMethod: z.enum(["equal", "exact", "percentage", "shares"]),
            allocations: z
              .array(
                z
                  .object({
                    participantId: z.string(),
                    value: z.string().regex(/^\d+(\.\d{1,4})?$/),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export function mergeMobileBillEdit(
  bill: SplitBillSerializedBill,
  input: unknown,
) {
  const body = mobileBillEdit.parse(input);
  const people = new Set(bill.participants.map((p) => p.id));
  const ids = new Set(bill.items.map((i) => i.id));
  if (
    body.items.length !== ids.size ||
    new Set(body.items.map((i) => i.id)).size !== ids.size
  )
    throw new Error("Reload this bill before editing its items.");
  for (const item of body.items) {
    if (
      !ids.has(item.id) ||
      item.participantIds.some((id) => !people.has(id)) ||
      new Set(item.participantIds).size !== item.participantIds.length
    )
      throw new Error("Choose people in this bill.");
    if (item.splitMethod !== "equal") {
      if (
        item.allocations.length !== item.participantIds.length ||
        new Set(item.allocations.map((a) => a.participantId)).size !==
          item.participantIds.length ||
        item.allocations.some(
          (a) => !item.participantIds.includes(a.participantId),
        )
      )
        throw new Error("Enter an allocation for each selected person.");
      const total = item.allocations.reduce((s, a) => s + Number(a.value), 0);
      if (item.splitMethod === "percentage" && Math.abs(total - 100) > 0.001)
        throw new Error("Percentages must total 100%.");
      if (
        item.splitMethod === "exact" &&
        Math.abs(total - Number(item.amount)) > 0.005
      )
        throw new Error("Amounts must match the item total.");
      if (item.splitMethod === "shares" && total <= 0)
        throw new Error("Enter at least one share.");
    }
  }
  // Preserve original receipt, payment and transaction-link fields on the server.
  // Changing items preserves existing tax/tip/discount adjustments.
  const oldItems = bill.items.reduce((sum, i) => sum + Number(i.amount), 0);
  const newItems = body.items.reduce((sum, i) => sum + Number(i.amount), 0);
  const total = Number(bill.total ?? oldItems) + newItems - oldItems;
  if (!Number.isFinite(total) || total <= 0)
    throw new Error("The bill total must remain positive.");
  return {
    ...bill,
    ...body,
    total: total.toFixed(2),
    subtotal: newItems.toFixed(2),
    items: body.items.map((item, index) => ({ ...item, sortOrder: index })),
    rawPayload: {
      ...mergeSplitBillItemSplitMetadata(bill.rawPayload, body.items),
      userItemAllocations: bill.rawPayload?.userItemAllocations === true || hasSplitBillAllocationChanges(bill, body.items),
    },
  };
}
