import { splitBillReadSurface, type SplitBillReadErrorCode } from "../../../../shared/split-bill-read";
import { homePendingSplitBills } from "../../../../shared/home-split-bills";
import { splitBillBalanceSummary } from "@/lib/split-bill-balance-summary";
import { loadSplitBillWorkspaceData } from "@/lib/split-bill-loaders";
import { getUserDisplayName } from "@/lib/user-display-name";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { resolveReceiptAccountHintToAccount } from "@/lib/receipt-account-resolution";
import {
  appendSplitBillActivity,
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";
import { loadSplitBillTransferSettlementsForBill, loadSplitBillTransferSettlementsForBills } from "@/lib/split-bill-transfer-settlements";

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
  transactionId: z.string().nullable().optional(),
  merchantName: z.string().trim().nullable().optional(),
  receiptFileName: z.string().trim().nullable().optional(),
  receiptMimeType: z.string().trim().nullable().optional(),
  receiptStorageKey: z.string().trim().nullable().optional(),
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

  const receiptAccountMatchRecord = receiptAccountMatch as Record<string, unknown>;
  const accountName = typeof receiptAccountMatchRecord.accountName === "string" ? receiptAccountMatchRecord.accountName : null;
  const accountLast4 = typeof receiptAccountMatchRecord.accountLast4 === "string" ? receiptAccountMatchRecord.accountLast4 : null;
  const confidence = typeof receiptAccountMatchRecord.confidence === "number" ? receiptAccountMatchRecord.confidence : 0;
  const reason = typeof receiptAccountMatchRecord.reason === "string" ? receiptAccountMatchRecord.reason : null;

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

const resolveLinkedTransactionId = async (userId: string, transactionId: string | null | undefined, existingBillId?: string) => {
  const normalizedTransactionId = transactionId?.trim() || null;
  if (!normalizedTransactionId) {
    return null;
  }

  const transaction = await prisma.transaction.findFirst({
    where: {
      id: normalizedTransactionId,
      deletedAt: null,
      isExcluded: false,
    },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!transaction) {
    throw new Error("Linked transaction not found.");
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: transaction.workspaceId,
      userId,
    },
    select: { id: true },
  });

  if (!workspace) {
    throw new Error("Linked transaction does not belong to this Clover account.");
  }

  const existingLink = await prisma.splitBill.findFirst({
    where: {
      transactionId: normalizedTransactionId,
      ...(existingBillId ? { id: { not: existingBillId } } : {}),
    },
    select: { id: true },
  });

  if (existingLink) {
    throw new Error("That transaction is already linked to a split bill.");
  }

  return normalizedTransactionId;
};

const getBillInclude = {
  transaction: {
    select: {
      id: true,
      merchantRaw: true, category: { select: { name: true } },
      merchantClean: true,
      date: true,
      amount: true,
      currency: true,
      account: {
        select: {
          name: true,
        },
      },
    },
  },
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
  const transactionId = await resolveLinkedTransactionId(userId, input.transactionId ?? null, existingBillId);
  const groupMembers = groupId
    ? await prisma.splitBillGroup.findFirst({
        where: {
          id: groupId,
          OR: [
            { userId },
            { collaborators: { some: { userId } } },
            {
              circle: {
                memberships: {
                  some: {
                    userId,
                    status: "active",
                    role: { in: ["organizer", "member"] },
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          members: {
            orderBy: splitBillGroupMemberOrderBy,
            select: {
              name: true,
            },
          },
        },
      })
    : null;
  if (groupId) {
    if (!groupMembers) {
      throw new Error("Selected group does not belong to this Clover account.");
    }
  }

  const participantEntries = input.participants.map((participant) => ({
    sourceId: participant.id?.trim() || randomUUID(),
    name: participant.name.trim(),
  }));

  if (groupMembers) {
    const existingNames = new Set(participantEntries.map((participant) => participant.name.trim().toLowerCase()));
    for (const member of groupMembers.members) {
      const memberName = member.name.trim();
      if (!memberName || existingNames.has(memberName.toLowerCase())) {
        continue;
      }
      participantEntries.push({
        sourceId: randomUUID(),
        name: memberName,
      });
      existingNames.add(memberName.toLowerCase());
    }
  }

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
  const requestedReceiptStorageKey = normalizeOptionalString(input.receiptStorageKey ?? null);
  const existingReceiptStorageKey = existingBillId
    ? (
        await prisma.splitBill.findFirst({
          where: { id: existingBillId, userId },
          select: { receiptStorageKey: true },
        })
      )?.receiptStorageKey ?? null
    : null;
  const receiptStorageKey = requestedReceiptStorageKey?.startsWith(`split-bill-receipts/${userId}/`)
    ? requestedReceiptStorageKey
    : existingReceiptStorageKey;
  const rawPayloadWithActivity = appendSplitBillActivity(
    resolvedRawPayload,
    existingBillId ? "edited" : "created",
    existingBillId ? `Edited ${input.title.trim()}` : `Created ${input.title.trim()}`
  );

    return {
    groupId,
    transactionId,
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
      receiptStorageKey,
      receiptText: normalizeOptionalString(input.receiptText ?? null),
      receiptConfidence: input.receiptConfidence ?? 0,
      subtotal: normalizeOptionalDecimal(input.subtotal ?? null),
      tax: normalizeOptionalDecimal(input.tax ?? null),
      tip: normalizeOptionalDecimal(input.tip ?? null),
      discount: normalizeOptionalDecimal(input.discount ?? null),
      total: normalizeOptionalDecimal(input.total ?? null),
      rawPayload: rawPayloadWithActivity,
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
          transactionId: payload.transactionId,
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
            transactionId: payload.transactionId,
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

export async function GET(request: Request) {
  const native = getMobileRequestContext()?.request === request;
  const query = new URL(request.url).searchParams;
  const surface = splitBillReadSurface(query);
  let code: SplitBillReadErrorCode = "split_bills_user_context_failed";
  try {
    const user = await getSplitBillCurrentUser();
    if (surface === "home_split_bills_summary" || (native && surface === "split_bills_balance_summary")) {
      code = "split_bills_summary_load_failed";
      const { bills } = await loadSplitBillWorkspaceData(user.id);
      code = "split_bills_response_failed";
      return NextResponse.json(surface === "home_split_bills_summary"
        ? { pending: homePendingSplitBills(bills) }
        : { summary: splitBillBalanceSummary(bills, getUserDisplayName(user)) },
      { headers: { "Cache-Control": "private, no-store" } });
    }
    const requestedPage = native ? Number(query.get("page") ?? 1) : 1;
    const groupFilter = native ? query.get("groupId") : null;
    const personFilter = native ? query.get("person") : null;
    const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage < 100000 ? requestedPage : 1;
    code = "split_bills_list_query_failed";
    const bills = await prisma.splitBill.findMany({
      where: {
        ...(groupFilter ? {groupId:groupFilter} : {}),
        ...(personFilter ? {participants:{some:{name:personFilter}}} : {}),
        OR: [
          { userId: user.id },
          { group: { collaborators: { some: { userId: user.id } } } },
          { group: { circle: { memberships: { some: { userId: user.id, status: "active" } } } } },
        ],
      },
      orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
      ...(native ? { skip: (page - 1) * 30, take: 31 } : {}),
      include: getBillInclude,
    });
    code = "split_bills_settlement_load_failed";
    const transferSettlementsByBillId = await loadSplitBillTransferSettlementsForBills(bills.map((bill) => bill.id));

    code = "split_bills_response_failed";
    return NextResponse.json({
      ...(native ? { page, hasMore: bills.length > 30 } : {}),
      bills: (native ? bills.slice(0, 30) : bills).map((bill) =>
        serializeSplitBillRecord({
          ...bill,
          transferSettlements: transferSettlementsByBillId.get(bill.id) ?? [],
        } as Parameters<typeof serializeSplitBillRecord>[0])
      ),
    });
  } catch (error) {
    const reason = code === "split_bills_user_context_failed" && error instanceof Error ? error.message : "";
    const status = reason === "UNAUTHORIZED" ? 401 : reason === "ADMIN_ONLY" ? 403 : reason === "IDENTITY_ENVIRONMENT_CONFLICT" ? 409 : 500;
    if (status === 401) code = "split_bills_unauthorized";
    if (status === 403) code = "split_bills_forbidden";
    if (status === 409) code = "split_bills_identity_conflict";
    const message = status === 401 ? "Sign in to view your split bills."
      : status === 403 ? "This account cannot access split bills."
      : status === 409 ? "Use your original sign-in method or contact support."
      : "Unable to load split bills. Please try again.";
    if (native) console.warn("[mobile-split-bills-read]", { surface, status, code });
    return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSplitBillCurrentUser();
    const body = billSchema.parse(await request.json());
    const bill = await persistSplitBill(user.id, body, "create");
    const transferSettlements = await loadSplitBillTransferSettlementsForBill(bill.id);

    return NextResponse.json(
      {
        bill: serializeSplitBillRecord({
          ...bill,
          transferSettlements,
        } as Parameters<typeof serializeSplitBillRecord>[0]),
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create split bill",
      },
      { status: 400 }
    );
  }
}
