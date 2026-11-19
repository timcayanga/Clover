import { Prisma } from "@prisma/client";
import { getEffectiveUserLimits } from "./user-limits";
export type DirectBillExpense = {
  workspaceId: string;
  attemptId: string;
  accountId?: string | null;
  categoryId?: string | null;
};
/** Only new, explicitly submitted bills use this path. Never edits balances or existing transactions. */
export async function createDirectBillExpense(
  tx: Prisma.TransactionClient,
  userId: string,
  bill: {
    id: string;
    title: string;
    billDate: Date;
    currency: string;
    total: Prisma.Decimal | null;
    note: string | null;
  },
  expense: DirectBillExpense,
  items: { description: string; amount: string }[],
) {
  const count = await tx.splitBillParticipant.count({
    where: { billId: bill.id },
  });
  if (count < 2) throw Error("Add at least two people to the bill.");
  const itemTotal = items.reduce((sum, item) => {
    const amount = new Prisma.Decimal(item.amount);
    if (!amount.isFinite() || amount.lte(0))
      throw Error("Check each line item amount.");
    return sum.plus(amount);
  }, new Prisma.Decimal(0));
  if (!bill.total || !itemTotal.equals(bill.total))
    throw Error("Line items must match the bill total.");
  const workspace = await tx.workspace.findFirst({
    where: { id: expense.workspaceId, userId },
    select: { id: true },
  });
  if (!workspace)
    throw Error("Choose your current Profile before adding a bill.");
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } }),
    limit = getEffectiveUserLimits(user).transactionLimit;
  if (
    limit !== null &&
    (await tx.transaction.count({
      where: { workspace: { userId }, deletedAt: null },
    })) >= limit
  )
    throw Error("Your transaction limit has been reached.");
  if (
    !/^[A-Z]{3}$/.test(bill.currency) ||
    !bill.total ||
    bill.total.lte(0) ||
    !Number.isFinite(+bill.billDate)
  )
    throw Error("Add a valid total and date.");
  let account = expense.accountId
    ? await tx.account.findFirst({
        where: {
          id: expense.accountId,
          workspaceId: workspace.id,
          type: { not: "investment" },
        },
      })
    : await tx.account.findFirst({
        where: {
          workspaceId: workspace.id,
          type: "cash",
          currency: bill.currency,
        },
        orderBy: { createdAt: "asc" },
      });
  if (expense.accountId && !account)
    throw Error("Choose an account in this Profile.");
  if (!account)
    account = await tx.account.create({
      data: {
        workspaceId: workspace.id,
        name: "Cash",
        type: "cash",
        currency: bill.currency,
        source: "manual",
      },
    });
  if (account.currency !== bill.currency)
    throw Error("The account currency must match the bill.");
  const category = expense.categoryId
    ? await tx.category.findFirst({
        where: {
          id: expense.categoryId,
          workspaceId: workspace.id,
          isArchived: false,
        },
      })
    : await tx.category.findFirst({
        where: {
          workspaceId: workspace.id,
          name: { equals: "Other", mode: "insensitive" },
          isArchived: false,
        },
      });
  if (expense.categoryId && !category)
    throw Error("Choose a category in this Profile.");
  const receiptLineItems = items.map((i) => ({
    description: i.description,
    amount: i.amount,
  }));
  const transaction = await tx.transaction.create({
    data: {
      workspaceId: workspace.id,
      accountId: account.id,
      categoryId: category?.id ?? null,
      date: bill.billDate,
      amount: bill.total,
      currency: bill.currency,
      type: "expense",
      merchantRaw: bill.title,
      merchantClean: bill.title,
      description: bill.note,
      reviewStatus: "confirmed",
      parserConfidence: 100,
      categoryConfidence: expense.categoryId ? 100 : 0,
      accountMatchConfidence: 100,
      rawPayload: {
        source: "split_bill",
        splitBillId: bill.id,
        attemptId: expense.attemptId,
        receiptLineItems,
      },
      normalizedPayload: {
        merchantClean: bill.title,
        type: "expense",
        categoryId: category?.id ?? null,
      },
      learnedRuleIdsApplied: [],
    },
  });
  await tx.splitBill.update({
    where: { id: bill.id },
    data: { transactionId: transaction.id },
  });
}
