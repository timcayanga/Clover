import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SplitBillTransferSettlementDbRow = {
  id: string;
  billId: string;
  fromParticipantId: string;
  fromParticipantName: string;
  toParticipantId: string;
  toParticipantName: string;
  amount: { toString: () => string };
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const loadSplitBillTransferSettlementsForBills = async (billIds: string[]) => {
  if (billIds.length === 0) {
    return new Map<string, SplitBillTransferSettlementDbRow[]>();
  }

  const rows = await prisma.$queryRaw<SplitBillTransferSettlementDbRow[]>`
    SELECT
      id,
      "billId",
      "fromParticipantId",
      "fromParticipantName",
      "toParticipantId",
      "toParticipantName",
      amount,
      note,
      "createdAt",
      "updatedAt"
    FROM "SplitBillTransferSettlement"
    WHERE "billId" IN (${Prisma.join(billIds)})
    ORDER BY "createdAt" ASC
  `;

  return rows.reduce<Map<string, SplitBillTransferSettlementDbRow[]>>((map, row) => {
    const existing = map.get(row.billId) ?? [];
    existing.push(row);
    map.set(row.billId, existing);
    return map;
  }, new Map());
};

export const loadSplitBillTransferSettlementsForBill = async (billId: string) => {
  const settlementsByBillId = await loadSplitBillTransferSettlementsForBills([billId]);
  return settlementsByBillId.get(billId) ?? [];
};

export const createSplitBillTransferSettlement = async (input: {
  billId: string;
  fromParticipantId: string;
  fromParticipantName: string;
  toParticipantId: string;
  toParticipantName: string;
  amount: string;
  note?: string | null;
}) => {
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "SplitBillTransferSettlement" (
      id,
      "billId",
      "fromParticipantId",
      "fromParticipantName",
      "toParticipantId",
      "toParticipantName",
      amount,
      note,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.billId},
      ${input.fromParticipantId},
      ${input.fromParticipantName},
      ${input.toParticipantId},
      ${input.toParticipantName},
      ${input.amount}::numeric,
      ${input.note ?? null},
      NOW(),
      NOW()
    )
  `;

  return id;
};
