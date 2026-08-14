import { NextResponse } from "next/server";
import { z } from "zod";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { sanitizeTransactionTagNames } from "@/lib/transaction-tags";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const transferSchema = z.object({
  workspaceId: z.string().min(1),
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  date: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().min(3),
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  feeAmount: z.union([z.string(), z.number()]).optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const resolveUserId = async () => {
  if (await isLocalDevHost()) return "local-admin";
  const { userId } = await requireAuth();
  return userId;
};

const normalizeTag = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const buildTagLinks = (workspaceId: string, values: string[] | undefined) => {
  const tags = sanitizeTransactionTagNames(values ?? []);
  return tags.length > 0
    ? {
        create: tags.map((name) => ({
          tag: {
            connectOrCreate: {
              where: { workspaceId_normalizedName: { workspaceId, normalizedName: normalizeTag(name) } },
              create: { workspaceId, name, normalizedName: normalizeTag(name) },
            },
          },
        })),
      }
    : undefined;
};

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveUserId();
    const payload = transferSchema.parse(await request.json());
    await assertWorkspaceAccess(userId, payload.workspaceId);

    if (payload.sourceAccountId === payload.destinationAccountId) {
      return NextResponse.json({ error: "Choose two different accounts." }, { status: 400 });
    }

    const amount = Math.abs(Number(payload.amount));
    const feeAmount = Math.abs(Number(payload.feeAmount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(feeAmount)) {
      return NextResponse.json({ error: "Enter a valid transfer amount." }, { status: 400 });
    }

    const accounts = await prisma.account.findMany({
      where: {
        workspaceId: payload.workspaceId,
        id: { in: [payload.sourceAccountId, payload.destinationAccountId] },
      },
      select: { id: true, name: true, currency: true },
    });
    const source = accounts.find((account) => account.id === payload.sourceAccountId);
    const destination = accounts.find((account) => account.id === payload.destinationAccountId);
    if (!source || !destination) {
      return NextResponse.json({ error: "One of the selected accounts is unavailable." }, { status: 404 });
    }

    const currency = payload.currency.trim().toUpperCase();
    if (source.currency.toUpperCase() !== currency || destination.currency.toUpperCase() !== currency) {
      return NextResponse.json(
        { error: "Transfers between different currencies need separate converted amounts. Choose accounts in the same currency for now." },
        { status: 400 }
      );
    }

    const [transferCategory, feeCategory] = await Promise.all([
      prisma.category.findFirst({ where: { workspaceId: payload.workspaceId, name: { equals: "Transfers", mode: "insensitive" }, isArchived: false } }),
      feeAmount > 0
        ? prisma.category.findFirst({ where: { workspaceId: payload.workspaceId, name: { equals: "Financial", mode: "insensitive" }, isArchived: false } })
        : Promise.resolve(null),
    ]);
    const transferId = crypto.randomUUID();
    const transferName = payload.name?.trim() || `Transfer to ${destination.name}`;
    const date = new Date(payload.date);

    const created = await prisma.$transaction(async (tx) => {
      const sharedPayload = {
        source: "manual_transfer",
        manualTransferId: transferId,
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
      };
      const sourceTransaction = await tx.transaction.create({
        data: {
          workspaceId: payload.workspaceId,
          accountId: source.id,
          categoryId: transferCategory?.id ?? null,
          date,
          amount: amount.toFixed(2),
          currency,
          type: "transfer",
          merchantRaw: transferName,
          merchantClean: transferName,
          description: payload.description?.trim() || null,
          isTransfer: true,
          reviewStatus: "confirmed",
          parserConfidence: 100,
          categoryConfidence: transferCategory ? 100 : 0,
          accountMatchConfidence: 100,
          transferConfidence: 100,
          rawPayload: { ...sharedPayload, transferDirection: "out", amountDelta: -amount },
          normalizedPayload: { ...sharedPayload, transferDirection: "out", type: "transfer" },
          learnedRuleIdsApplied: [],
          transactionTags: buildTagLinks(payload.workspaceId, payload.tags),
        },
      });
      const destinationName = `Transfer from ${source.name}`;
      const destinationTransaction = await tx.transaction.create({
        data: {
          workspaceId: payload.workspaceId,
          accountId: destination.id,
          categoryId: transferCategory?.id ?? null,
          date,
          amount: amount.toFixed(2),
          currency,
          type: "transfer",
          merchantRaw: destinationName,
          merchantClean: destinationName,
          description: payload.description?.trim() || null,
          isTransfer: true,
          reviewStatus: "confirmed",
          parserConfidence: 100,
          categoryConfidence: transferCategory ? 100 : 0,
          accountMatchConfidence: 100,
          transferConfidence: 100,
          rawPayload: { ...sharedPayload, transferDirection: "in", amountDelta: amount },
          normalizedPayload: { ...sharedPayload, transferDirection: "in", type: "transfer" },
          learnedRuleIdsApplied: [],
          transactionTags: buildTagLinks(payload.workspaceId, payload.tags),
        },
      });
      const feeTransaction = feeAmount > 0
        ? await tx.transaction.create({
            data: {
              workspaceId: payload.workspaceId,
              accountId: source.id,
              categoryId: feeCategory?.id ?? null,
              date,
              amount: feeAmount.toFixed(2),
              currency,
              type: "expense",
              merchantRaw: "Transfer fee",
              merchantClean: "Transfer fee",
              description: `Fee for ${transferName}`,
              reviewStatus: "confirmed",
              parserConfidence: 100,
              categoryConfidence: feeCategory ? 100 : 0,
              accountMatchConfidence: 100,
              rawPayload: { source: "manual_transfer_fee", manualTransferId: transferId, amountDelta: -feeAmount },
              normalizedPayload: { source: "manual_transfer_fee", manualTransferId: transferId, type: "expense" },
              learnedRuleIdsApplied: [],
            },
          })
        : null;

      return { sourceTransaction, destinationTransaction, feeTransaction };
    });

    void capturePostHogServerEvent("manual_transfer_created", userId, {
      workspace_id: payload.workspaceId,
      source_account_id: source.id,
      destination_account_id: destination.id,
      currency,
      has_fee: feeAmount > 0,
    });

    return NextResponse.json(
      {
        transferId,
        transactions: [created.sourceTransaction, created.destinationTransaction, created.feeTransaction]
          .filter(Boolean)
          .map((transaction) => ({
            id: transaction?.id,
            amount: transaction?.amount.toString(),
            date: transaction?.date.toISOString(),
            type: transaction?.type,
          })),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unable to create transfer." }, { status: 400 });
  }
}
