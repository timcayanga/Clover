import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { loadSplitBillWorkspaceData } from "@/lib/split-bill-loaders";
import { getEnv } from "@/lib/env";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { getGoalProgressSnapshot, normalizeGoalPlan, type GoalKey } from "@/lib/goals";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
};

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");
const formatSignedCurrency = (value: number, currency?: string | null) =>
  `${value < 0 ? "-" : ""}${formatCurrencyAmount(Math.abs(value), currency ?? "MIXED")}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const buildTransactionSummary = (
  transactions: Array<{
    amount: unknown;
    type: "income" | "expense" | "transfer";
    category: {
      name: string;
    } | null;
  }>
) =>
  transactions.reduce(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
        const categoryName = transaction.category?.name ?? "Uncategorized";
        accumulator.expenseCategories.set(
          categoryName,
          (accumulator.expenseCategories.get(categoryName) ?? 0) + Math.abs(amount)
        );
      } else {
        accumulator.transfer += amount;
      }

      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      expenseCategories: new Map<string, number>(),
    }
  );
const extractOutputText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const typedContent = contentItem as { type?: unknown; text?: unknown };
      if (typedContent.type === "output_text" && typeof typedContent.text === "string" && typedContent.text.trim()) {
        return typedContent.text.trim();
      }
    }
  }

  return null;
};

export async function POST(request: Request) {
  try {
    const { userId } = await getSessionContext();
    const user = await getOrCreateCurrentUser(userId);

    if (user.planTier !== "pro") {
      return NextResponse.json({ error: "Adviser chat is available on Pro only." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const incomingMessages = Array.isArray(body?.messages)
      ? body?.messages
          .filter(
            (message): message is ChatMessage =>
              Boolean(message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
          )
          .slice(-10)
      : [];

    if (incomingMessages.length === 0) {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const selectedWorkspaceId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";

    const workspace =
      (selectedWorkspaceId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceId,
              user: {
                clerkUserId: user.clerkUserId,
              },
            },
            select: {
              id: true,
              name: true,
              accounts: {
                select: {
                  name: true,
                  type: true,
                  currency: true,
                  balance: true,
                },
              },
            },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: {
          user: {
            clerkUserId: user.clerkUserId,
          },
        },
        select: {
          id: true,
          name: true,
          accounts: {
            select: {
              name: true,
              type: true,
              currency: true,
              balance: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }));

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    await assertWorkspaceAccess(user.clerkUserId, workspace.id);

    const now = new Date();
    const nextSevenDays = new Date(now);
    nextSevenDays.setDate(nextSevenDays.getDate() + 7);
    const nextFourteenDays = new Date(now);
    nextFourteenDays.setDate(nextFourteenDays.getDate() + 14);

    const [allTransactionsQuery, recurringPatterns, financialCommitments, investmentSnapshots, splitBillWorkspaceData] =
      await Promise.all([
        prisma.transaction.findMany({
          where: {
            workspaceId: workspace.id,
            isExcluded: false,
          },
          select: {
            date: true,
            amount: true,
            type: true,
            merchantRaw: true,
            merchantClean: true,
            account: {
              select: {
                name: true,
              },
            },
            category: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { date: "desc" },
          take: 1000,
        }),
        prisma.recurringPattern.findMany({
        where: { workspaceId: workspace.id },
        orderBy: [{ nextExpectedDate: "asc" }, { lastSeenDate: "desc" }],
        take: 12,
      }),
        prisma.financialCommitment.findMany({
          where: {
            workspaceId: workspace.id,
            status: "active",
          },
          orderBy: [{ nextDueDate: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.investmentSnapshot.findMany({
          where: {
            workspaceId: workspace.id,
          },
          orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }],
          take: 2,
          select: {
            snapshotDate: true,
            totalValue: true,
            currency: true,
            account: {
              select: {
                name: true,
              },
            },
          },
        }),
        loadSplitBillWorkspaceData(user.id),
      ]);

    const allTransactions = allTransactionsQuery as Array<{
      date: Date;
      amount: unknown;
      type: "income" | "expense" | "transfer";
      merchantRaw: string;
      merchantClean: string | null;
      account: {
        name: string;
      };
      category: {
        name: string;
      } | null;
    }>;

    const analysisAnchorDate = allTransactions[0]?.date ?? now;
    const currentWindowStart = new Date(analysisAnchorDate);
    currentWindowStart.setDate(currentWindowStart.getDate() - 30);
    const previousWindowStart = new Date(analysisAnchorDate);
    previousWindowStart.setDate(previousWindowStart.getDate() - 60);

    const currentWindowTransactions = allTransactions.filter(
      (transaction) => transaction.date > currentWindowStart && transaction.date <= analysisAnchorDate
    );
    const previousWindowTransactions = allTransactions.filter(
      (transaction) => transaction.date > previousWindowStart && transaction.date <= currentWindowStart
    );
    const activeTransactions = currentWindowTransactions.length > 0 ? currentWindowTransactions : allTransactions;
    const comparisonWindowTransactions =
      previousWindowTransactions.length > 0
        ? previousWindowTransactions
        : allTransactions.filter((transaction) => transaction.date <= currentWindowStart);

    const currentSummary = buildTransactionSummary(activeTransactions);
    const previousSummary = buildTransactionSummary(comparisonWindowTransactions);
    const allSummary = buildTransactionSummary(allTransactions);

    const currentSpend = currentSummary.expense;
    const previousSpend = previousSummary.expense;
    const currentNet = currentSummary.income - currentSummary.expense;
    const previousNet = previousSummary.income - previousSummary.expense;
    const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
    const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
    const historySpanDays = allTransactions.length > 0 ? Math.max(1, Math.ceil((analysisAnchorDate.getTime() - allTransactions[allTransactions.length - 1].date.getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const historyWindowCount = Math.max(historySpanDays / 30, 1);
    const longTermAverageSpend = allSummary.expense / historyWindowCount;
    const longTermAverageIncome = allSummary.income / historyWindowCount;
    const longTermAverageNet = longTermAverageIncome - longTermAverageSpend;
    const longTermAverageSavingsRate = longTermAverageIncome > 0 ? longTermAverageNet / longTermAverageIncome : null;
    const baselineSpend = previousSpend > 0 ? previousSpend : longTermAverageSpend;
    const baselineIncome = previousSummary.income > 0 ? previousSummary.income : longTermAverageIncome;
    const baselineSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : longTermAverageSavingsRate;
    const spendDelta = baselineSpend > 0 ? ((currentSpend - baselineSpend) / baselineSpend) * 100 : null;
    const incomeDelta = baselineIncome > 0 ? ((currentSummary.income - baselineIncome) / baselineIncome) * 100 : null;
    const currencyCandidates = new Set(workspace.accounts.map((account) => formatCurrencyCode(account.currency)).filter((currency) => currency.length > 0));
    const displayCurrency = currencyCandidates.size === 1 ? Array.from(currencyCandidates)[0] : "MIXED";
    const goalValue = user.primaryGoal?.trim() ?? null;
    const goalTargetAmount = user.goalTargetAmount ? Number(user.goalTargetAmount) : null;
    const goalPlan = normalizeGoalPlan(user.goalPlan, goalValue as GoalKey | null, goalTargetAmount);
    const goalProgress = getGoalProgressSnapshot(
      {
        goalKey: goalValue as GoalKey | null,
        targetAmount: goalTargetAmount,
        goalPlan,
        currentNet,
        currentSpend,
        monthlyIncome: currentSummary.income > 0 ? currentSummary.income : null,
        currentSavingsRate,
        previousSavingsRate,
        spendDelta,
        recurringShare: 0,
      },
      displayCurrency
    );

    const topCategories = Array.from(currentSummary.expenseCategories.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);
    const topCategoryName = topCategories[0]?.[0] ?? null;
    const topCategoryAmount = topCategories[0]?.[1] ?? 0;
    const topCategoryShare = currentSpend > 0 ? topCategoryAmount / currentSpend : 0;

    const recurringDueSoon = recurringPatterns
      .filter((pattern) => pattern.nextExpectedDate && pattern.nextExpectedDate <= nextFourteenDays)
      .slice(0, 3)
      .map((pattern) => ({
        label: pattern.merchantClean ?? pattern.merchantRaw,
        due: pattern.nextExpectedDate ? toMonthLabel(pattern.nextExpectedDate) : null,
      }));

    const commitmentsDueSoon = financialCommitments
      .filter((commitment) => commitment.nextDueDate && commitment.nextDueDate <= nextSevenDays)
      .slice(0, 3)
      .map((commitment) => ({
        title: commitment.title,
        due: commitment.nextDueDate ? toMonthLabel(commitment.nextDueDate) : null,
      }));

    const openSplitBills = splitBillWorkspaceData.bills
      .map((bill) => ({
        title: bill.title,
        outstanding: bill.settlement.transfers.reduce((sum, transfer) => sum + Number(transfer.amount), 0),
      }))
      .filter((bill) => bill.outstanding > 0)
      .sort((left, right) => right.outstanding - left.outstanding)
      .slice(0, 3);

    const latestInvestmentSnapshot = investmentSnapshots[0] ?? null;
    const previousInvestmentSnapshot = investmentSnapshots[1] ?? null;
    const investmentDelta =
      latestInvestmentSnapshot &&
      previousInvestmentSnapshot &&
      latestInvestmentSnapshot.currency === previousInvestmentSnapshot.currency
        ? Number(latestInvestmentSnapshot.totalValue ?? 0) - Number(previousInvestmentSnapshot.totalValue ?? 0)
        : null;

    const liquidBalance = workspace.accounts
      .filter((account) => ["bank", "wallet", "cash"].includes(account.type))
      .reduce((sum, account) => sum + Number(account.balance ?? 0), 0);

    const currentWindowLabel = currentWindowTransactions.length > 0 ? "Current 30 days" : "Latest available window";
    const previousWindowLabel = previousWindowTransactions.length > 0 ? "Previous 30 days" : "Earlier available window";
    const longTermWindowLabel = historySpanDays > 0 ? `All available history (${Math.ceil(historySpanDays / 30)} month${Math.ceil(historySpanDays / 30) === 1 ? "" : "s"})` : "All available history";

    const summaryLines = [
      `Workspace: ${workspace.name}`,
      `${currentWindowLabel}: income ${formatCurrency(currentSummary.income)}, spend ${formatCurrency(currentSpend)}, net ${formatSignedCurrency(currentNet)}`,
      `${previousWindowLabel}: income ${formatCurrency(previousSummary.income)}, spend ${formatCurrency(previousSpend)}, net ${formatSignedCurrency(previousNet)}`,
      `${longTermWindowLabel}: avg income ${formatCurrency(longTermAverageIncome)}, avg spend ${formatCurrency(longTermAverageSpend)}, avg net ${formatSignedCurrency(longTermAverageNet)}`,
      `Savings rate: ${currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100)}${baselineSavingsRate === null ? "" : `; baseline ${formatPercent(baselineSavingsRate * 100)}`}`,
      `Top category: ${topCategoryName ?? "none"}`,
      `Recurring due soon: ${recurringDueSoon.map((item) => `${item.label}${item.due ? ` (${item.due})` : ""}`).join("; ") || "none"}`,
      `Commitments due soon: ${commitmentsDueSoon.map((item) => `${item.title}${item.due ? ` (${item.due})` : ""}`).join("; ") || "none"}`,
      `Split bills open: ${openSplitBills.map((item) => `${item.title} (${formatCurrency(item.outstanding)})`).join("; ") || "none"}`,
      `Latest investment snapshot: ${latestInvestmentSnapshot ? `${formatCurrency(Number(latestInvestmentSnapshot.totalValue ?? 0), latestInvestmentSnapshot.currency)}${investmentDelta === null ? "" : `, change ${formatSignedCurrency(investmentDelta, latestInvestmentSnapshot.currency)}`}` : "none"}`,
      `Liquid balance: ${formatCurrency(liquidBalance, displayCurrency)}`,
      `Goal: ${goalValue ?? "none"} (${goalProgress.bandLabel})`,
    ].join("\n");

    const systemPrompt = [
      "You are Clover Adviser, a calm, specific, and trustworthy financial guide inside a personal finance app.",
      "Use the workspace context to answer the user's question clearly and directly.",
      "Prefer concrete data over generic advice.",
      "If you can, mention the exact source of the signal, the relevant period, and one practical next step.",
      "Do not pretend to be a financial advisor. Keep guidance educational and contextual.",
      "If the user's question asks for investment advice, stay cautious and avoid personalized investment recommendations.",
      "If the data is insufficient, say what is missing and suggest where to check in Clover.",
      "",
      "Workspace context:",
      summaryLines,
    ].join("\n");

    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI is not configured for Adviser chat." }, { status: 503 });
    }

    const model = env.OPENAI_ADVISER_MODEL?.trim() || "gpt-4.1";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          ...incomingMessages.map((message) => ({
            role: message.role,
            content: [{ type: "input_text", text: message.content }],
          })),
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error: errorText || "Unable to generate an Adviser response.",
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const reply = extractOutputText(payload) || "I could not generate a response right now.";

    return NextResponse.json({
      reply,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate an Adviser response.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
