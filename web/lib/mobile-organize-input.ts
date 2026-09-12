import { z } from "zod";
import { ACCOUNT_TYPES } from "./account-types";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  });
const money = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/);
const positive = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);
const text = z.string().trim().max(200);
export const mobileAccountPatch = z
  .object({
    name: text.min(1).optional(),
    institution: text.nullable().optional(),
    accountNumber: text.nullable().optional(),
    favorite: z.boolean().optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    balance: money.nullable().optional(),
    creditLimit: positive.nullable().optional(),
    creditPeriodStart: date.nullable().optional(),
    creditPeriodEnd: date.nullable().optional(),
    investmentSubtype: text.nullable().optional(),
    investmentSymbol: text.nullable().optional(),
    investmentQuantity: positive.nullable().optional(),
    investmentCostBasis: positive.nullable().optional(),
    investmentPrincipal: positive.nullable().optional(),
    investmentInterestRate: positive.nullable().optional(),
    investmentMaturityValue: positive.nullable().optional(),
    investmentStartDate: date.nullable().optional(),
    investmentMaturityDate: date.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const tracking = z
  .object({
    version: z.literal(1),
    amountType: z.enum(["fixed", "variable"]),
    paymentAmount: z.number().finite().nonnegative().nullable(),
    totalPayments: z.number().int().min(1).max(1200).nullable(),
    paymentsMade: z.number().int().nonnegative(),
    endDate: date.nullable(),
    debtType: text,
    balanceDate: date.nullable(),
    liabilityAccountId: text.nullable(),
    interestRate: z.number().finite().nonnegative().nullable(),
    reminderDays: z
      .union([z.literal(0), z.literal(1), z.literal(3)])
      .nullable(),
    reference: text,
    monthEnd: z.boolean(),
  })
  .strict()
  .refine((v) => v.totalPayments === null || v.paymentsMade <= v.totalPayments);
const recurring = z
  .object({
    title: text.min(1),
    kind: z.enum(["planned_payment", "debt", "receivable", "reminder"]),
    amount: positive.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    dueDate: date.nullable(),
    plannedPaymentDate: date.nullable().optional(),
    nextDueDate: date.nullable().optional(),
    recurrence: z.enum([
      "once",
      "weekly",
      "biweekly",
      "monthly",
      "quarterly",
      "annual",
    ]),
    status: z.enum(["active", "paused", "resolved"]).optional(),
    accountId: text.nullable(),
    counterparty: text.nullable().optional(),
    categoryName: text.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    tracking: tracking.optional(),
    evidenceTransactionIds: z.array(text.min(1)).max(100).optional(),
    statementCheckpointId: text.nullable().optional(),
  })
  .strict();
export const mobileRecurringCreate = recurring;
export const mobileRecurringPatch = recurring
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const mobileRecurringCompletion = z
  .object({ dueDate: date, completed: z.boolean() })
  .strict();
export const mobileRecurringDismiss = z
  .object({ suggestionId: z.string().min(1).max(2000) })
  .strict();
