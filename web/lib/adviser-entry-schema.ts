import { adviserAttachmentIds } from "./adviser-attachments";
import { z } from "zod";
import { entryAccount, entryTransaction } from "./adviser-entry-types";
const text = z.string().max(500);
const identifier = z.string().max(128);
export const entryLineSchema = z
  .object({
    description: text,
    quantity: z.string().max(24),
    unitPrice: z.string().max(24),
    kind: z.enum(["item", "tax", "discount"]),
  })
  .strict();
const accountDefault = { ...entryAccount(""), currency: "" };
const transactionDefault = { ...entryTransaction(""), currency: "" };
export const entryAccountSchema = z
  .object({
    key: identifier,
    name: text,
    institution: text,
    type: z.enum([
      "bank",
      "wallet",
      "credit_card",
      "cash",
      "loan",
      "other",
      "investment",
    ]),
    currency: z.string().max(3),
    balance: z.string().max(24),
    investmentSubtype: text.default(""),
    investmentSymbol: text.default(""),
    investmentQuantity: z.string().max(24).default(""),
    investmentCostBasis: z.string().max(24).default(""),
  })
  .strict();
export const entryTransactionSchema = z
  .object({
    key: identifier,
    merchant: text,
    accountId: identifier,
    categoryId: identifier.default(""),
    type: z.enum(["expense", "income"]),
    currency: z.string().max(3),
    amount: z.string().max(24),
    date: z.string().max(10),
    description: text.default(""),
    lines: z.array(entryLineSchema).max(100).default([]),
  })
  .strict();
export const entryReceiptSchema = z
  .object({
    transactionId: identifier,
    expectedUpdatedAt: z.string().max(40),
    lines: z.array(entryLineSchema).min(1).max(100),
  })
  .strict();
export const entryDraftSchema = z
  .object({
    attachmentIds: adviserAttachmentIds.optional(),
    version: z.literal(1),
    id: z.string().min(1).max(120),
    workspaceId: identifier,
    sourceText: z.string().max(4000),
    confidence: z.number().min(0).max(100),
    accounts: z.array(entryAccountSchema).max(10),
    transactions: z.array(entryTransactionSchema).max(50),
    receipts: z.array(entryReceiptSchema).max(10),
  })
  .strict();
const allowedFields = [
  "name",
  "institution",
  "type",
  "currency",
  "balance",
  "investmentSubtype",
  "investmentSymbol",
  "investmentQuantity",
  "investmentCostBasis",
  "accountId",
  "categoryId",
  "merchant",
  "merchantRaw",
  "merchantClean",
  "amount",
  "date",
  "description",
  "transactionId",
  "updatedAt",
  "receiptLineItems",
];
export const entryFormSchema = z
  .object({
    kind: z.enum(["transaction", "account", "investment", "receipt"]),
    recordId: identifier.optional(),
    focusedField: z.string().max(80).optional(),
    fields: z
      .record(z.string(), z.string().max(3000))
      .refine(
        (value) =>
          Object.keys(value).length <= 20 &&
          Object.keys(value).every((key) => allowedFields.includes(key)),
      ),
    errors: z.array(z.string().max(200)).max(8).optional(),
  })
  .strict();
// Model proposals may leave missing values blank for the review editor. IDs,
// ownership, source and confidence are set server-side, never by the model.
export function normalizeEntryProposal(
  payload: Record<string, unknown>,
  envelope: { id: string; workspaceId: string; sourceText: string },
) {
  return entryDraftSchema.safeParse({
    version: 1,
    attachmentIds: payload.attachmentIds,
    ...envelope,
    confidence: 0,
    accounts: Array.isArray(payload.accounts)
      ? payload.accounts.map((row, index) => ({
          ...accountDefault,
          ...row,
          key: row?.key || `account-${index + 1}`,
        }))
      : [],
    transactions: Array.isArray(payload.transactions)
      ? payload.transactions.map((row, index) => ({
          ...transactionDefault,
          ...row,
          key: row?.key || `transaction-${index + 1}`,
        }))
      : [],
    receipts: Array.isArray(payload.receipts) ? payload.receipts : [],
  });
}
