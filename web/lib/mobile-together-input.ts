import { randomUUID } from "node:crypto";
import { z } from "zod";
import { editableReceiptItems } from "../../shared/split-bill-experience";
import { hasPrintedItemizedTotal } from "./receipt-item-table";
import { readLocalReceiptOcrText } from "./local-receipt-ocr-envelope";
import { parseReceiptPhotoText } from "./split-bill";
import { circleTypes } from "./circles";

export const mobileCircleInput = z
  .object({
    avatarUrl: z
      .string()
      .max(200000)
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
    name: z.string().trim().min(1).max(100),
    type: z.enum(circleTypes),
    description: z.string().trim().max(300),
    currency: z.string().regex(/^[A-Z]{3}$/),
    color: z.enum(["teal", "green", "blue", "violet", "coral", "gold"]),
  })
  .strict();

export const mobileSplitBillInput = z
  .object({
    expense: z.object({workspaceId:z.string().min(1),attemptId:z.string().uuid(),splitOnly:z.boolean().optional(),accountId:z.string().nullable().optional(),categoryId:z.string().nullable().optional()}).optional(),
    groupId:z.string().min(1).optional(),
    circleId:z.string().min(1).max(128).optional(),
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
      .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000).or(z.literal("")),
    participants: z
      .array(z.object({ name: z.string().trim().min(1).max(80) }).strict())
      .min(1)
      .max(30),
    paidByIndex: z.number().int().min(0).nullable(),
    contributions: z.array(z.object({participantIndex:z.number().int().nonnegative(), amount:z.string().regex(/^\d+(\.\d{1,2})?$/).refine(v => Number(v) > 0)}).strict()).min(1).max(30).optional(),
    reviewedItems: z
      .array(
        z
          .object({
            participantIndexes: z
              .array(z.number().int().min(0).max(29))
              .min(1)
              .max(30)
              .optional(),
            splitMethod: z.enum(["equal", "exact", "percentage"]).optional(),
            allocations: z
              .array(
                z
                  .object({
                    participantIndex: z.number().int().min(0).max(29),
                    value: z.string().regex(/^\d+(\.\d{1,4})?$/),
                  })
                  .strict(),
              )
              .max(30)
              .optional(),
            description: z.string().trim().min(1).max(500),
            amount: z
              .string()
              .regex(/^\d+(\.\d{1,2})?$/)
              .refine(
                (value) => Number(value) > 0 && Number(value) <= 1_000_000_000,
              ),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .optional(),
    receipt: z
      .object({
        fileName: z.string().max(240),
        mimeType: z.string().max(100),
        needsReview:z.boolean().optional(),
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
              // The editor sends OCR metadata on background refinement. Persist
              // only the description and amount of each source line.
              .strip(),
          )
          .max(500),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const standalone = value.expense?.splitOnly && !value.circleId && !value.transactionId;
    if (!standalone && !value.total) ctx.addIssue({code:"custom", path:["total"], message:"Enter a positive amount."});
    if (value.expense?.splitOnly && !standalone) ctx.addIssue({code:"custom",path:["expense"],message:"Standalone bills cannot create a Circle expense or link an existing transaction."});
    if (value.contributions) {
      const indexes = value.contributions.map(row => row.participantIndex);
      const cents = value.contributions.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
      if (value.circleId || value.paidByIndex !== null || new Set(indexes).size !== indexes.length || indexes.some(i => i >= value.participants.length) || cents !== Math.round(Number(value.total) * 100))
        ctx.addIssue({code:"custom", path:["contributions"], message:"Choose bill participants and enter contributions totaling the bill amount."});
    }
    if (value.circleId ? !value.expense : !standalone && value.participants.length < 2)
      ctx.addIssue({code:"custom", message: value.circleId ? "Choose a Circle for this expense." : "Choose at least two people.", path:["participants"]});
    if (
      value.paidByIndex !== null &&
      value.paidByIndex >= value.participants.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a listed payer.",
        path: ["paidByIndex"],
      });
    if (
      value.reviewedItems &&
      Math.round(Number(value.total) * 100) !==
        value.reviewedItems.reduce(
          (sum, item) => sum + Math.round(Number(item.amount) * 100),
          0,
        )
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Reviewed items must add up to the confirmed bill total. Include any extra charges before saving.",
        path: ["reviewedItems"],
      });
    }
    for (const item of value.reviewedItems ?? []) {
      const selected =
        item.participantIndexes ?? value.participants.map((_, i) => i);
      if (
        selected.some((index) => index >= value.participants.length) ||
        new Set(selected).size !== selected.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Choose people in this bill.",
          path: ["reviewedItems"],
        });
      if (item.splitMethod && item.splitMethod !== "equal") {
        const allocations = item.allocations ?? [];
        const sum = allocations.reduce(
          (total, a) => total + Number(a.value),
          0,
        );
        if (
          allocations.length !== selected.length ||
          new Set(allocations.map((a) => a.participantIndex)).size !==
            selected.length ||
          allocations.some((a) => !selected.includes(a.participantIndex)) ||
          (item.splitMethod === "percentage"
            ? Math.abs(sum - 100) > 0.001
            : Math.abs(sum - Number(item.amount)) > 0.005)
        )
          ctx.addIssue({
            code: "custom",
            message: "Check each person's amount or percentage.",
            path: ["reviewedItems"],
          });
      }
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
  // Older apps omitted reviewed rows when they lost a separately printed service charge.
  // Recover only when the recorded scan agrees with the submitted total and currency.
  let recovered: ReturnType<typeof editableReceiptItems> = [];
  if (input.expense?.splitOnly && !input.reviewedItems && input.receipt?.items.length && input.total) {
    const parsed = parseReceiptPhotoText(input.receipt.text, input.currency);
    if (parsed.currency === input.currency && parsed.total && Number(parsed.total) === Number(input.total) &&
        hasPrintedItemizedTotal(readLocalReceiptOcrText(input.receipt.text) ?? input.receipt.text, parsed.total) &&
        parsed.items.length === input.receipt.items.length && parsed.items.every((row, index) =>
          row.description === input.receipt!.items[index].description && row.amount === input.receipt!.items[index].amount)) {
      recovered = editableReceiptItems(parsed);
    }
  }
  const unitemized = Boolean(!input.reviewedItems && !recovered.length && input.receipt?.items.length);
  const needsReview = input.receipt?.needsReview === true || unitemized || recovered.length > 0;
  const items: NonNullable<typeof input.reviewedItems> = input.reviewedItems ??
    (recovered.length ? recovered : input.total ? [{description:unitemized ? "Unitemized amount" : input.title,amount:input.total}] : []);
  return {
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    ...(input.expense?{expense:input.expense}:{}),
    ...(input.circleId ? {circleId:input.circleId} : {}),
    ...(input.groupId?{groupId:input.groupId}:{}),
    title: input.title,
    note: input.note,
    billDate: input.billDate,
    currency: input.currency,
    total: input.total || null,
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
            receiptNeedsReview: needsReview,
            allocationMethod: needsReview ? "receipt-review-pending" : input.reviewedItems
              ? "user-reviewed-items"
              : "user-confirmed-equal-total",
          },
        }
      : {}),
    items: items.map((item) => ({
      description: item.description,
      amount: item.amount,
      participantIds: ("participantIndexes" in item && item.participantIndexes
        ? item.participantIndexes
        : participants.map((_, i) => i)
      ).map((index) => participants[index].id),
      splitMethod: "splitMethod" in item ? item.splitMethod : "equal",
      allocations:
        "allocations" in item
          ? (item.allocations?.map((a) => ({
              participantId: participants[a.participantIndex].id,
              value: a.value,
            })) ?? [])
          : [],
    })),
    payments: input.contributions ? input.contributions.map(row => ({participantId:participants[row.participantIndex].id, amount:row.amount})) :
      input.paidByIndex === null || !input.total
        ? []
        : [
            {
              participantId: participants[input.paidByIndex].id,
              amount: input.total,
            },
          ],
  };
}

export const mobileGroupInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    members: z
      .array(z.object({ name: z.string().trim().min(1).max(80) }).strict())
      .min(1)
      .max(30),
  })
  .strict();
