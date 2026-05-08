import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { resolveReceiptAccountHintToAccount } from "@/lib/receipt-account-resolution";
import {
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";

export const dynamic = "force-dynamic";

const participantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
});

const itemSchema = z.object({
  id: z.string().optional(),
  description: z.string().trim().min(1),
  amount: z.union([z.string(), z.number()]),
  participantIds: z.array(z.string()).default([]),
});

const paymentSchema = z.object({
  id: z.string().optional(),
  participantId: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  note: z.string().trim().nullable().optional(),
});

const billSchema = z.object({
  title: z.string().trim().min(1),
  note: z.string().trim().nullable().optional(),
  billDate: z.string().min(1),
  currency: z.string().trim().min(1).default("PHP"),
  sourceType: z.enum(["manual", "receipt"]).default("manual"),
  merchantName: z.string().trim().nullable().optional(),
  receiptFileName: z.string().trim().nullable().optional(),
  receiptMimeType: z.string().trim().nullable().optional(),
  receiptText: z.string().nullable().optional(),
  receiptConfidence: z.number().int().min(0).max(100).optional().default(0),
  subtotal: z.union([z.string(), z.number(), z.null()]).optional(),
  tax: z.union([z.string(), z.number(), z.null()]).optional(),
  tip: z.union([z.string(), z.number(), z.null()]).optional(),
  discount: z.union([z.string(), z.number(), z.null()]).optional(),
  total: z.union([z.string(), z.number(), z.null()]).optional(),
  groupId: z.string().nullable().optional(),
  rawPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  participants: z.array(participantSchema).default([]),
  items: z.array(itemSchema).default([]),
  payments: z.array(paymentSchema).default([]),
});

const normalizeOptionalString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeOptionalDecimal = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : null;
};

const resolveReceiptAccountResolution = async (
  userId: string,
  rawPayload: Record<string, unknown> | null | undefined
) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return rawPayload ?? null;
  }

  const receiptAccountMatch = rawPayload.receiptAccountMatch;
  if (!receiptAccountMatch || typeof receiptAccountMatch !== "object" || Array.isArray(receiptAccountMatch)) {
    return rawPayload;
  }

  const accountName = typeof receiptAccountMatch.accountName === "string" ? receiptAccountMatch.accountName : null;
  const accountLast4 = typeof receiptAccountMatch.accountLast4 === "string" ? receiptAccountMatch.accountLast4 : null;
  const confidence = typeof receiptAccountMatch.confidence === "number" ? receiptAccountMatch.confidence : 0;
  const reason = typeof receiptAccountMatch.reason === "string" ? receiptAccountMatch.reason : null;

  if (!accountName && !accountLast4) {
    return rawPayload;
  }

  const workspaces = await prisma.workspace.findMany({
    where: { userId },
    select: { id: true },
  });

  if (workspaces.length !== 1) {
    return rawPayload;
  }

  const workspace = workspaces[0];
  if (!workspace) {
    return rawPayload;
  }

  const accounts = await prisma.account.findMany({
    where: { workspaceId: workspace.id },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
    },
  });

  const resolution = resolveReceiptAccountHintToAccount(
    {
      accountName,
      accountLast4,
      confidence,
      reason,
    },
    accounts
  );

  if (!resolution) {
    return rawPayload;
  }

  return {
    ...rawPayload,
    receiptAccountResolution: resolution,
  };
};

const getBillInclude = {
  group: {
    include: {
      members: {
        orderBy: splitBillGroupMemberOrderBy,
      },
    },
  },
  participants: true,
  items: {
    include: {
      participants: true,
    },
    orderBy: splitBillItemOrderBy,
  },
  payments: true,
};

const buildBillPayload = async (userId: string, input: z.infer<typeof billSchema>, existingBillId?: string) => {
  const groupId = normalizeOptionalString(input.groupId ?? null);
  if (groupId) {
    const group = await prisma.splitBillGroup.findFirst({
      where: {
        id: groupId,
        userId,
      },
      select: { id: true },
    });

    if (!group) {
      throw new Error("Selected group does not belong to this Clover account.");
    }
  }

  const participantEntries = input.participants.map((participant) => ({
    sourceId: participant.id?.trim() || randomUUID(),
    name: participant.name.trim(),
  }));

  if (participantEntries.length === 0) {
    throw new Error("Add at least one person to split the bill.");
  }

  const participantIdMap = new Map(participantEntries.map((entry) => [entry.sourceId, entry.sourceId]));
  const participantIds = participantEntries.map((entry) => entry.sourceId);

  const itemEntries = input.items.length > 0 ? input.items : [{ description: "Total", amount: input.total ?? "0", participantIds: [] }];
  const normalizedItems = itemEntries.map((item, index) => {
    const itemId = item.id?.trim() || randomUUID();
    const itemParticipantIds = item.participantIds.length > 0 ? item.participantIds.filter((participantId) => participantIdMap.has(participantId)) : participantIds;

    return {
      sourceId: itemId,
      description: item.description.trim(),
      amount: normalizeOptionalDecimal(item.amount) ?? "0.00",
      participantIds: itemParticipantIds.length > 0 ? itemParticipantIds : participantIds,
      sortOrder: index,
    };
  });

  const normalizedPayments = input.payments.map((payment) => {
    const participantId = payment.participantId.trim();
    if (!participantIdMap.has(participantId)) {
      throw new Error("Every payment must be assigned to a listed person.");
    }

    return {
      sourceId: payment.id?.trim() || randomUUID(),
      participantId,
      amount: normalizeOptionalDecimal(payment.amount) ?? "0.00",
      note: normalizeOptionalString(payment.note ?? null),
    };
  });
  const resolvedRawPayload = await resolveReceiptAccountResolution(userId, input.rawPayload ?? null);

  return {
    groupId,
    participants: participantEntries,
    items: normalizedItems,
    payments: normalizedPayments,
    billData: {
      title: input.title.trim(),
      note: normalizeOptionalString(input.note ?? null),
      billDate: new Date(input.billDate),
      currency: input.currency.trim().toUpperCase(),
      sourceType: input.sourceType,
      merchantName: normalizeOptionalString(input.merchantName ?? null),
      receiptFileName: normalizeOptionalString(input.receiptFileName ?? null),
      receiptMimeType: normalizeOptionalString(input.receiptMimeType ?? null),
      receiptText: normalizeOptionalString(input.receiptText ?? null),
      receiptConfidence: input.receiptConfidence ?? 0,
      subtotal: normalizeOptionalDecimal(input.subtotal ?? null),
      tax: normalizeOptionalDecimal(input.tax ?? null),
      tip: normalizeOptionalDecimal(input.tip ?? null),
      discount: normalizeOptionalDecimal(input.discount ?? null),
      total: normalizeOptionalDecimal(input.total ?? null),
      rawPayload: resolvedRawPayload ?? undefined,
    } as Omit<Prisma.SplitBillUncheckedCreateInput, "userId">,
  };
};

const persistSplitBill = async (
  userId: string,
  input: z.infer<typeof billSchema>,
  mode: "create" | "update",
  billId?: string
) => {
  const payload = await buildBillPayload(userId, input, billId);

  return prisma.$transaction(async (tx) => {
    if (mode === "update") {
      if (!billId) {
        throw new Error("Bill id is required.");
      }

      const existing = await tx.splitBill.findFirst({
        where: { id: billId, userId },
        select: { id: true },
      });

      if (!existing) {
        throw new Error("Bill not found.");
      }

      await tx.splitBill.update({
        where: { id: billId },
        data: {
          ...payload.billData,
          groupId: payload.groupId,
        } as Prisma.SplitBillUncheckedUpdateInput,
      });

      await tx.splitBillItemParticipant.deleteMany({
        where: {
          item: {
            billId,
          },
        },
      });
      await tx.splitBillPayment.deleteMany({
        where: { billId },
      });
      await tx.splitBillItem.deleteMany({
        where: { billId },
      });
      await tx.splitBillParticipant.deleteMany({
        where: { billId },
      });

    }

    const bill = mode === "create"
      ? await tx.splitBill.create({
          data: {
            userId,
            groupId: payload.groupId,
            ...payload.billData,
          },
        })
      : await tx.splitBill.findUniqueOrThrow({
          where: { id: billId as string },
        });

    if (mode === "create") {
      await tx.splitBillParticipant.createMany({
        data: payload.participants.map((participant) => ({
          id: participant.sourceId,
          billId: bill.id,
          name: participant.name,
        })),
      });

      await tx.splitBillItem.createMany({
        data: payload.items.map((item) => ({
          id: item.sourceId,
          billId: bill.id,
          description: item.description,
          amount: item.amount,
          sortOrder: item.sortOrder,
        })),
      });

      await tx.splitBillPayment.createMany({
        data: payload.payments.map((payment) => ({
          id: payment.sourceId,
          billId: bill.id,
          participantId: payment.participantId,
          amount: payment.amount,
          note: payment.note,
        })),
      });

      await tx.splitBillItemParticipant.createMany({
        data: payload.items.flatMap((item) =>
          item.participantIds.map((participantId) => ({
            itemId: item.sourceId,
            participantId,
          }))
        ),
      });
    } else if (billId) {
      await tx.splitBillParticipant.createMany({
        data: payload.participants.map((participant) => ({
          id: participant.sourceId,
          billId,
          name: participant.name,
        })),
      });

      await tx.splitBillItem.createMany({
        data: payload.items.map((item) => ({
          id: item.sourceId,
          billId,
          description: item.description,
          amount: item.amount,
          sortOrder: item.sortOrder,
        })),
      });

      await tx.splitBillPayment.createMany({
        data: payload.payments.map((payment) => ({
          id: payment.sourceId,
          billId,
          participantId: payment.participantId,
          amount: payment.amount,
          note: payment.note,
        })),
      });

      await tx.splitBillItemParticipant.createMany({
        data: payload.items.flatMap((item) =>
          item.participantIds.map((participantId) => ({
            itemId: item.sourceId,
            participantId,
          }))
        ),
      });
    }

    return tx.splitBill.findUniqueOrThrow({
      where: { id: bill.id },
      include: getBillInclude,
    });
  });
};

export async function GET() {
  try {
    const user = await getSplitBillCurrentUser();
    const bills = await prisma.splitBill.findMany({
      where: { userId: user.id },
      orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
      include: getBillInclude,
    });

    return NextResponse.json({
      bills: bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0])),
    });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load split bills" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSplitBillCurrentUser();
    const body = billSchema.parse(await request.json());
    const bill = await persistSplitBill(user.id, body, "create");

    return NextResponse.json({ bill: serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create split bill",
      },
      { status: 400 }
    );
  }
}
