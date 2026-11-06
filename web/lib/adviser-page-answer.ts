import type { mobileGoals } from "./mobile-goals";
import { homeDateKey } from "./mobile-home-periods";
import { getBudgetPeriodStart, getPeriodEnd, type BudgetProgress } from "./budgeting";
import type { AdviserChart } from "../../shared/adviser-chart";
import { reportDay } from "../../shared/reports/analysis";
import type { ReportsWorkspace } from "../../shared/reports/workspace";
import { calendarQueryRange } from "./calendar-query-window";
import { adviserFactMoney, adviserRequestedCurrency, stripAdviserCurrencyPhrase, adviserTopCount, declinesChart, isAdviserChartFollowUp } from "./adviser-facts";

type TransactionContext = {
  date: Date;
  amount: { toString(): string };
  currency: string;
  merchantRaw: string;
  merchantClean: string | null;
  type: "income" | "expense" | "transfer";
  isTransfer: boolean;
  category: { name: string } | null;
};

export const asksForChart = (question: string) =>
  !declinesChart(question) && /\b(?:chart|graph|plot|visuali[sz]e|visual breakdown)\b/i.test(question);

export function adviserChartWindow(from: string, to: string, timeZone: string) {
  const instants = calendarQueryRange({
    gte: new Date(from),
    lte: new Date(to + "T23:59:59.999Z"),
  }, timeZone);
  return {
    calendarWindow: { from, through: to },
    from: instants.gte!.toISOString(),
    through: instants.lte!.toISOString(),
  };
}

export function adviserQuickReply(question: string) {
  const text = question.trim().replace(/[.!?]+$/, "").replace(/,\s+clover$/i, " Clover").trim();
  if (/^(?:hi|hello|hey)(?:\s+clover)?$/i.test(text)) return "Hi! What would you like to know about your money?";
  if (/^(?:thanks|thank you|thanks clover|thank you clover)$/i.test(text)) return "You’re welcome!";
  if (/^(?:what(?: is|[’']s) net worth|explain net worth)$/i.test(text)) {
    return "Net worth is what you own minus what you owe. It can include investments and other assets that aren’t available to spend.";
  }
  if (/^(?:what(?: is|[’']s) spendable cash|what does spendable mean)$/i.test(text)) {
    return "Spendable cash is the money in your positive bank, wallet, and cash balances. Upcoming bills can reduce what you can safely spend.";
  }
  if (/^(?:why (?:are|aren[’']t) transfers (?:excluded from|counted as) spending|why (?:don[’']t|do not) transfers count as spending)$/i.test(text)) {
    return "Moving money between your own accounts changes where it sits. Clover leaves those transfers out of spending so the same money doesn’t count as an expense.";
  }
  return null;
}

export function isAdviserGoalStatusQuestion(question: string, detail: boolean) {
  const clean = question.trim().replace(/[.!?]+$/, "").replace(/ (?:as|in) a (?:bar )?(?:chart|graph)$/i, "");
  if (/^(?:how (?:are|is) my (?:savings )?goals? (?:progressing|doing|tracking)|(?:show(?: me)?|chart|graph) my goal progress)$/i.test(clean)) return true;
  return detail && /^(?:how (?:is|am i doing on) this goal(?: progressing| doing| tracking)?|(?:show(?: me)?|chart|graph) this goal[’']s progress|how much (?:is left|do i still need))$/i.test(clean);
}

export function answerAdviserGoals(
  goals: Awaited<ReturnType<typeof mobileGoals>>["goals"], chart: boolean,
): { reply: string; visualization: AdviserChart | null } {
  if (!goals.length) return { reply: "I couldn’t find a goal here. Open Goals to see what’s available.", visualization: null };

  const lines = goals.slice(0, 3).map(goal => {
    const { progress, currency } = goal;
    const money = (amount: number) => adviserFactMoney(amount, currency);
    if (!progress.targetAmount) return `${goal.name} doesn’t have a target I can measure yet.`;
    if (goal.goal === "track_spending" && goal.activity) {
      const { spending } = goal.activity;
      const difference = progress.targetAmount - spending;
      return `${goal.name}: ${money(spending)} spent against a ${money(progress.targetAmount)} limit${difference < 0 ? `, ${money(-difference)} over` : `, ${money(difference)} left`}.`;
    }
    const label = goal.goal === "invest_better" ? "recorded investment activity" : "estimated surplus";
    return `${goal.name}: ${money(progress.currentAmount)} in ${label} toward ${money(progress.targetAmount)}. ${progress.achieved ? "Target reached for this period." : `${money(progress.remainingAmount ?? 0)} to go.`}`;
  });
  if (goals.length > 3) lines.push(`See Goals for the other ${goals.length - 3}.`);
  let visualization: AdviserChart | null = null;
  const [goal] = goals;
  if (chart && goals.length > 1) {
    lines.push("Open a goal and ask me to chart it so I can show its progress against its target.");
  } else if (chart && goal.progress.targetAmount && goal.activity) {
    const { start, end, spending } = goal.activity;
    const tracking = goal.goal === "track_spending";
    visualization = {
      title: goal.name.slice(0, 100), currency: goal.currency, from: start,
      through: new Date(+new Date(end) - 1).toISOString(),
      calendarWindow: { from: homeDateKey(new Date(start)), through: homeDateKey(new Date(+new Date(end) - 1)) },
      hideReportLink: true,
      bars: [
        { label: tracking ? "Spent" : goal.goal === "invest_better" ? "Investment activity" : "Estimated surplus", amount: tracking ? spending : goal.progress.currentAmount },
        { label: tracking ? "Limit" : "Target", amount: goal.progress.targetAmount },
      ],
    };
  }
  return { reply: ["Here’s what the last 30 days of activity show.", ...lines].join("\n\n"), visualization };
}

export function isAdviserBudgetStatusQuestion(question: string, detail = false) {
  const clean = question.trim().replace(/[.!?]+$/, "").replace(/ (?:as|in) a (?:bar )?(?:chart|graph)$/i, "");
  return /^(?:how (?:are|is) (?:my budgets?|this budget) (?:tracking|doing|looking)|which (?:of my )?budgets? (?:needs?|need) attention|(?:show|chart|graph)(?: me)? (?:my budget progress|this budget[’']s progress)|(?:what(?: is|[’']s) (?:my|this) budget(?:[’']s)? (?:progress|status)|how much (?:is left|have i spent) (?:in|on) (?:my|this) budget))(?: (?:right now|so far))?$/i.test(clean)
    || (detail && /^(?:how much is left|am i over budget|how much have i spent)$/i.test(clean));
}

export function answerAdviserBudgets(
  budgets: BudgetProgress[], question: string, now: Date, chart: boolean, budgetId?: string,
): { reply: string; visualization: AdviserChart | null } {
  const attention = /\battention\b/i.test(question);
  const matching = budgets.filter(budget => budgetId ? budget.id === budgetId : budget.isActive);
  if (!matching.length) return {
    reply: budgetId ? "I couldn’t find this budget in the current Profile." : "There aren’t any active budgets in this Profile yet.",
    visualization: null,
  };
  const eligible = attention ? matching.filter(budget => budget.isAtRisk) : matching;
  if (!eligible.length) return { reply: "None of your active budgets need attention right now.", visualization: null };
  const ranked = [...eligible].sort((a, b) => Number(b.isAtRisk) - Number(a.isAtRisk) || a.name.localeCompare(b.name));
  const lines = ranked.slice(0, 3).map(budget => {
    if (!budget.isActive) return `**${budget.name}** is paused.`;
    const money = (amount: number) => adviserFactMoney(amount, budget.currency);
    const period = budget.periodLabel.toLowerCase();
    const savings = budget.kind === "savings_target";
    const figures = `${money(budget.actualAmount)} ${savings ? "saved" : "used"} of ${money(budget.targetAmount)} (${period})`;
    const result = budget.remainingAmount > 0
      ? `${money(budget.remainingAmount)} ${savings ? "to go" : "left"}`
      : savings ? "target reached" : budget.remainingAmount < 0
        ? `${money(-budget.remainingAmount)} over` : "at the limit";
    return `**${budget.name}:** ${figures}, ${result}.`;
  });
  if (ranked.length > 3) lines.push(`See Budgeting for the other ${ranked.length - 3}.`);
  if (chart && ranked.length > 1) lines.push("Open a budget and ask me to chart it to see progress against its target.");
  let visualization: AdviserChart | null = null;
  if (chart && ranked.length === 1) {
    const budget = ranked[0];
    if (budget.isActive && budget.actualAmount >= 0 && budget.targetAmount > 0) {
      const start = getBudgetPeriodStart(budget.cadence, now);
      const end = new Date(+getPeriodEnd(budget.cadence, start) - 1);
      // Use Budgeting's calendar boundaries rather than shifting them to the device time zone.
      const day = (date: Date) => reportDay(date, Intl.DateTimeFormat().resolvedOptions().timeZone);
      visualization = {
        title: budget.name.slice(0, 100), currency: budget.currency,
        from: start.toISOString(), through: end.toISOString(),
        calendarWindow: { from: day(start), through: day(end) }, hideReportLink: true,
        bars: [{ label: budget.kind === "savings_target" ? "Saved" : "Used", amount: budget.actualAmount },
          { label: "Target", amount: budget.targetAmount }],
      };
    } else if (budget.isActive) {
      lines.push("I can’t chart negative progress or a zero target.");
    }
  }
  return { reply: lines.join("\n\n"), visualization };
}

export const isAdviserAccountQuestion = (question: string) =>
  /^(?:(?:what(?: is|[’']s)|show me|check) (?:the balance (?:of|in) this account|this account[’']s balance)|explain this balance|is this balance up to date)[.!?]*$/i.test(question.trim());

export function adviserCircleQuestion(question: string) {
  const clean = question.trim().replace(/[.!?]+$/, "");
  const text = stripAdviserCurrencyPhrase(clean).trim();
  return { text, currency: text !== clean ? adviserRequestedCurrency(clean) : undefined };
}

export function adviserCircleCurrencyFollowUp(question: string) {
  const match = /^(?:and |what about |how about |show me |in )(.+?)[.!?]*$/i.exec(question.trim());
  if (!match) return undefined;
  const phrase = match[1].replace(/^in +/i, "");
  return stripAdviserCurrencyPhrase(phrase).trim() ? undefined : adviserRequestedCurrency(phrase);
}

export const isAdviserCircleQuestion = (question: string) =>
  /^(?:summarize this circle[’']s shared expenses|how much did we spend in this circle(?: this month)?|(?:show|chart|graph) (?:this circle[’']s )?(?:shared expenses|contributions)(?: this month)?)[.!?]*$/i.test(adviserCircleQuestion(question).text);

export function answerAdviserAccount(account: {
  name: string;
  currency: string;
  balance: number | null;
  bankSnapshot?: { bankBalanceAt: string; bankConnectionStatus: string };
}, now: Date, timeZone: string) {
  if (account.balance === null || !Number.isFinite(account.balance)) {
    return `I don’t have a recorded balance for ${account.name} in ${account.currency} yet.`;
  }
  const snapshot = account.bankSnapshot;
  const date = snapshot ? new Date(snapshot.bankBalanceAt) : null;
  const disconnected = snapshot?.bankConnectionStatus === "disconnected";
  const stale = date && +now - +date > 2 * 86400000;
  const balance = adviserFactMoney(account.balance, account.currency);
  if (!date) return `Clover shows ${balance} for ${account.name}, based on the records available for this account.`;
  const detail = disconnected ? " The bank connection is unlinked." : stale ? " The bank may have newer activity." : "";
  return `The latest bank balance Clover has for ${account.name} is ${balance}, from ${reportDay(date, timeZone)}.${detail}`;
}

export function answerAdviserCircle(circle: {
  name: string;
  expenseCurrencyTotals?: Record<string, number>;
  contributionCurrencyTotals?: Record<string, number>;
}, period: { from: string; to: string }, question: string, chart: boolean, requestedCurrency?: string): {
  reply: string;
  visualization: AdviserChart | null;
} {
  const contribution = /\bcontributions\b/i.test(question);
  const label = contribution ? "recorded contributions" : "recorded shared expenses";
  const totals = contribution ? circle.contributionCurrencyTotals : circle.expenseCurrencyTotals;
  if (!totals) return { reply: `I couldn’t check ${label} for ${circle.name} right now. Please try again.`, visualization: null };
  const amounts = Object.entries(totals).filter(([currency]) => !requestedCurrency || currency === requestedCurrency);
  const summary = amounts.length
    ? `This month, ${circle.name} has ${amounts.map(([code, amount]) => `${adviserFactMoney(amount, code)} (${code})`).join(" and ")} in ${label}.`
    : `I don’t see any ${label} in ${circle.name}${requestedCurrency ? ` in ${requestedCurrency}` : ""} this month.`;
  const currency = requestedCurrency ?? (amounts.length === 1 ? amounts[0][0] : undefined);
  const bars = currency ? [
    { label: "Shared expenses", amount: circle.expenseCurrencyTotals?.[currency] ?? 0 },
    { label: "Recorded contributions", amount: circle.contributionCurrencyTotals?.[currency] ?? 0 },
  ].filter(bar => bar.amount > 0) : [];
  return {
    reply: chart && !currency && amounts.length > 1
      ? `${summary} Choose a currency to see a chart.` : summary,
    visualization: chart && currency && bars.length
      ? { title: "Circle activity this month", currency, ...adviserChartWindow(period.from, period.to, "UTC"), bars, hideReportLink: true }
      : null,
  };
}

const reportCategories = /^(?:what explains my biggest spending categories|(?:show|chart|graph|plot) (?:me )?(?:the |my )?(?:top \d+ )?spending categories (?:in|for) this report)$/i;
const reportComparison = /^(?:how did income and expenses change|(?:compare|chart|graph|plot) income and (?:expenses|spending)(?: (?:in|for) this report)?)$/i;
const reportOverview = /^(?:what does this report tell me|summarize this report|explain this report|show (?:me )?this report as a chart)$/i;
const reportTrend = /^(?:(?:show|chart|graph|plot) (?:me )?(?:my )?spending over time(?: in this report)?)$/i;
export function isAdviserReportQuestion(question: string) {
  const clean = question.trim().replace(/[.!?]+$/, "");
  return [reportCategories, reportComparison, reportOverview, reportTrend].some(pattern => pattern.test(clean));
}

export function answerAdviserPage(input: {
  question: string;
  report: ReportsWorkspace | null;
  transaction: TransactionContext | null;
  timeZone: string;
  priorQuestion?: string;
}): { reply: string; visualization: AdviserChart | null } | null {
  const { question, transaction, report, timeZone } = input;
  const showChart = isAdviserChartFollowUp(question);
  const clean = (showChart ? input.priorQuestion ?? "show this report as a chart" : question).trim().replace(/[.!?]+$/, "");
  if (transaction && /^(?:please )?(?:explain this transaction|what category fits this transaction|what is this transaction|what was this transaction for)$/i.test(clean)) {
    const name = transaction.merchantClean || transaction.merchantRaw;
    const amount = adviserFactMoney(Math.abs(Number(transaction.amount.toString())), transaction.currency);
    const type = transaction.isTransfer ? "transfer" : transaction.type;
    const date = reportDay(transaction.date, timeZone);
    if (/category/i.test(clean)) {
      return {
        reply: transaction.category
          ? `Clover has ${name} in ${transaction.category?.name}. You can change the category in Transaction Details if it doesn’t fit.`
          : `${name} doesn’t have a category yet. The transaction name alone may not tell us what you bought. You can choose a category in Transaction Details.`,
        visualization: null,
      };
    }
    return {
      reply: `Clover recorded ${name} as ${type === "income" ? "income" : `a ${type}`} of ${amount} on ${date}.${transaction.category ? ` Its category is ${transaction.category.name}.` : ""}`,
      visualization: null,
    };
  }

  if (!report) return null;
  const categoryRequest = reportCategories.test(clean);
  const comparison = reportComparison.test(clean);
  const overview = reportOverview.test(clean);
  const trend = reportTrend.test(clean);
  if (!categoryRequest && !comparison && !overview && !trend) return null;

  const reportData = report.reports.find(item => item.currency === report.view.currency) ??
    (report.reports.length === 1 ? report.reports[0] : null);
  if (!reportData) return { reply: "Choose one currency in Reports and I can explain the numbers for that view.", visualization: null };

  const { analysis, currency } = reportData;
  const money = (amount: number) => adviserFactMoney(amount, currency);
  const { income, expense } = analysis.current;
  const { from, to } = analysis;
  const period = `This report covers ${from} to ${to} in ${currency}, using your current filters.`;
  if (trend) {
    if (!expense) return { reply: `There’s no recorded spending in this view. ${period}`, visualization: null };
    const bucketSize = Math.max(1, Math.ceil(analysis.days.length / 6));
    const bars: AdviserChart["bars"] = [];
    for (let start = 0; start < analysis.days.length; start += bucketSize) {
      const days = analysis.days.slice(start, start + bucketSize);
      const first = days[0].date;
      const last = days[days.length - 1].date;
      bars.push({
        label: first === last ? first : `${first} to ${last}`,
        amount: days.reduce((sum, day) => sum + day.expense, 0),
      });
    }
    return {
      reply: `You recorded ${money(expense)} in spending. Here’s how it was spread across the period.\n\n${period}`,
      visualization: { title: "Spending over time", currency, ...adviserChartWindow(from, to, report.timeZone), bars, hideReportLink: true },
    };
  }
  if (categoryRequest) {
    const count = adviserTopCount(clean) ?? 3;
    const top = analysis.categories.slice(0, count);
    if (!top.length) return { reply: `There’s no recorded spending in this view. ${period}`, visualization: null };
    const bars = top.slice(0, 6).map(({ name, amount }) => ({ label: name.slice(0, 100), amount }));
    return {
      reply: `Your biggest categories here were ${top.slice(0, 6).map(({ name, amount }) => `${name} (${money(amount)})`).join(", ")}. Total spending was ${money(expense)}.\n\n${period}`,
      visualization: { title: "Spending in this report", currency, ...adviserChartWindow(from, to, report.timeZone), bars, hideReportLink: true },
    };
  }

  if (!income && !expense && (!comparison || (!analysis.previous.income && !analysis.previous.expense))) {
    return { reply: `There’s no recorded income or spending for the period you’re viewing. ${period}`, visualization: null };
  }
  const change = (amount: number) => amount === 0 ? "held steady" : `${amount > 0 ? "rose" : "fell"} by ${money(Math.abs(amount))}`;
  const bars = comparison
    ? [
        { label: "Income this period", amount: income },
        { label: "Income in comparison period", amount: analysis.previous.income },
        { label: "Spending this period", amount: expense },
        { label: "Spending in comparison period", amount: analysis.previous.expense },
      ]
    : [{ label: "Income", amount: income }, { label: "Spending", amount: expense }];
  return {
    reply: comparison
      ? `Recorded income ${change(income - analysis.previous.income)}, and spending ${change(expense - analysis.previous.expense)}, compared with ${analysis.previousFrom} to ${analysis.previousTo}.\n\n${period}`
      : `You recorded ${money(income)} in income and ${money(expense)} in spending. Your net cash flow was ${money(income - expense)}.\n\n${period}`,
    visualization: comparison || showChart || asksForChart(clean)
      ? { title: comparison ? "Cash flow comparison" : "Income and spending", currency, ...adviserChartWindow(from, to, report.timeZone), bars, hideReportLink: true }
      : null,
  };
}
