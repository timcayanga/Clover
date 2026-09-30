import { randomUUID } from "node:crypto";
import { z } from "zod";
import { circleTypes } from "./circles";

export const mobileCircleInput = z
  .object({
    avatarUrl: z.string().max(200000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/).nullable().optional(),
    name: z.string().trim().min(1).max(100),
    type: z.enum(circleTypes),
    description: z.string().trim().max(300),
    currency: z.string().regex(/^[A-Z]{3}$/),
    color: z.enum(["teal", "green", "blue", "violet", "coral", "gold"]),
  })
  .strict();

export const mobileSplitBillInput = z
  .object({
    transactionId: z.string().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(100),
    note: z.string().trim().max(1000),
    billDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }),
    currency: z.string().regex(/^[A-Z]{3}$/),
    total: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000),
    participants: z
      .array(z.object({ name: z.string().trim().min(1).max(80) }).strict())
      .min(2)
      .max(30),
    paidByIndex: z.number().int().min(0).nullable(),
    reviewedItems: z.array(z.object({
      description: z.string().trim().min(1).max(500),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/).refine(value => Number(value) > 0 && Number(value) <= 1_000_000_000),
    }).strict()).min(1).max(500).optional(),
    receipt: z
      .object({
        fileName: z.string().max(240),
        mimeType: z.string().max(100),
        storageKey: z.string().max(600).startsWith("split-bill-receipts/"),
        text: z.string().max(200000),
        confidence: z.number().int().min(0).max(100),
        items: z
          .array(
            z
              .object({
                description: z.string().max(500),
                amount: z.string().max(40),
              })
              .strict(),
          )
          .max(500),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.paidByIndex !== null &&
      value.paidByIndex >= value.participants.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a listed payer.",
        path: ["paidByIndex"],
      });
    if (value.reviewedItems && Math.round(Number(value.total) * 100) !== value.reviewedItems.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0)) {
      ctx.addIssue({ code: "custom", message: "Reviewed items must add up to the confirmed bill total. Include any extra charges before saving.", path: ["reviewedItems"] });
    }
    const names = value.participants.map((person) =>
      person.name.toLocaleLowerCase(),
    );
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        message: "Use a distinct name for each person.",
        path: ["participants"],
      });
  });

export function mobileSplitBillPayload(
  input: z.infer<typeof mobileSplitBillInput>,
) {
  // Receipt evidence stays untouched. Only explicitly reviewed, reconciled items
  // become editable allocations; older clients retain their equal-total behavior.
  const participants = input.participants.map((person) => ({
    id: randomUUID(),
    name: person.name,
  }));
  return {
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    title: input.title,
    note: input.note,
    billDate: input.billDate,
    currency: input.currency,
    total: input.total,
    sourceType: input.receipt ? "receipt" : "manual",
    participants,
    ...(input.receipt
      ? {
          receiptFileName: input.receipt.fileName,
          receiptMimeType: input.receipt.mimeType,
          receiptStorageKey: input.receipt.storageKey,
          receiptText: input.receipt.text,
          receiptConfidence: input.receipt.confidence,
          rawPayload: {
            source: "native-receipt-review",
            receipt: {
              text: input.receipt.text,
              items: input.receipt.items,
              confidence: input.receipt.confidence,
            },
            allocationMethod: input.reviewedItems ? "user-reviewed-items" : "user-confirmed-equal-total",
          },
        }
      : {}),
    items: (input.reviewedItems ?? [{ description: input.title, amount: input.total }]).map(item => ({
      description: item.description,
      amount: item.amount,
      participantIds: participants.map(person => person.id),
    })),
    payments:
      input.paidByIndex === null
        ? []
        : [
            {
              participantId: participants[input.paidByIndex].id,
              amount: input.total,
            },
          ],
  };
}

export const mobileGroupInput = z.object({
  name: z.string().trim().min(1).max(100),
  members: z.array(z.object({name:z.string().trim().min(1).max(80)}).strict()).min(1).max(30),
}).strict();
