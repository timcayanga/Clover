import { prisma } from "@/lib/prisma";

export const syncReceivableAccountCommitments = async (workspaceId: string) => {
  const receivableAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      type: "receivable",
    },
    select: {
      id: true,
      name: true,
      balance: true,
      currency: true,
    },
  });
  if (receivableAccounts.length === 0) {
    return 0;
  }

  const existingCommitments = await prisma.financialCommitment.findMany({
    where: {
      workspaceId,
      kind: "receivable",
      accountId: { in: receivableAccounts.map((account) => account.id) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      accountId: true,
      source: true,
    },
  });
  const existingByAccountId = new Map(
    existingCommitments
      .filter((commitment) => commitment.accountId)
      .map((commitment) => [commitment.accountId as string, commitment])
  );

  let synced = 0;
  for (const account of receivableAccounts) {
    const balance = Number(account.balance ?? 0);
    if (!Number.isFinite(balance)) {
      continue;
    }

    const amount = Math.max(0, balance);
    const existing = existingByAccountId.get(account.id);
    if (existing && existing.source !== "account_inventory_import") {
      // A user-created receivable owns its own title, amount, and lifecycle.
      continue;
    }

    const data = {
      title: account.name.trim() || "Accounts Receivable",
      amount: amount.toFixed(2),
      currency: (account.currency ?? "PHP").trim().toUpperCase() || "PHP",
      status: amount > 0 ? ("active" as const) : ("resolved" as const),
      accountId: account.id,
      source: "account_inventory_import",
      confidence: 100,
    };
    if (existing) {
      await prisma.financialCommitment.update({
        where: { id: existing.id },
        data,
      });
      synced += 1;
    } else if (amount > 0) {
      await prisma.financialCommitment.create({
        data: {
          workspaceId,
          kind: "receivable",
          counterparty: null,
          dueDate: null,
          recurrence: "once",
          nextDueDate: null,
          notes: "Synced from the imported Accounts Receivable balance.",
          transactionId: null,
          statementCheckpointId: null,
          ...data,
        },
      });
      synced += 1;
    }
  }

  return synced;
};
