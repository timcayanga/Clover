/** Page hints are navigation data, never financial facts or instructions. */
export const ASK_PAGES = ["general", "home", "accounts", "transactions", "reports", "recurring", "budgeting", "goals", "investments", "circles", "split-bills"] as const;
export type AskPage = typeof ASK_PAGES[number];
export type AskPageContext = { page: AskPage; title: string; transactionId?: string; accountId?: string; circleId?: string; billId?: string; budgetId?: string; goalId?: string; currency?: string; from?: string; to?: string; tab?: string; reportParams?: string; prompt?: string };
const suggestions: Record<AskPage, string[]> = {
 general: ["What should I focus on next?", "What’s due before payday?", "How are my goals doing?"],
 home: ["What should I focus on today?", "What can I safely spend?", "Which confirmed payments are due next?"],
 accounts: ["How much spendable cash do I have?", "Which accounts can cover upcoming bills?", "Show my cash by currency"],
 transactions: ["What spending patterns stand out?", "Which transactions need attention?", "How has my spending changed?"],
 reports: ["What explains my biggest spending categories?", "How did income and expenses change?", "What does this report tell me?"],
 recurring: ["Which confirmed payments are due in the next 30 days?", "Can I cover my upcoming payments?", "Which recurring costs changed?"],
 budgeting: ["How are my budgets tracking?", "Which budget needs attention?", "Help me plan a realistic budget"],
 goals: ["How are my goals progressing?", "What can I set aside each month?", "Help me plan my next goal"],
 investments: ["How is my portfolio allocated?", "What should I review in my holdings?", "Explain purchase value and current value"],
 circles: ["Summarize this Circle’s shared expenses", "How are this Circle’s budgets and goals tracking?", "What shared payments are coming up?"],
 "split-bills": ["Explain how this bill is split", "Who still needs to pay?", "How can I request payment?"],
};
export function askPageContext(path: string, params: Record<string, unknown> = {}, title?: string): AskPageContext {
 const clean = path.replace(/\/\([^/]+\)/g, "");
 const segment = clean.split("/").filter(Boolean)[0] || "home";
 const page: AskPage = segment === "transaction" ? "transactions" : (ASK_PAGES as readonly string[]).includes(segment) ? segment as AskPage : "general";
 const context: AskPageContext = { page, title: (title || (page === "home" ? "Home" : page.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()))).slice(0, 80) };
 params = {...params};
 for (const [alias,key] of Object.entries({circle:"circleId",account:"accountId",bill:"billId",budget:"budgetId",goal:"goalId",startDate:"from",endDate:"to"})) if (!params[key]) params[key] = params[alias];
 const accountPathId = clean.split("/")[2];
 if (segment === "accounts" && accountPathId && !["new", "institutions"].includes(accountPathId)) params.accountId = accountPathId;
 const keys = ["transactionId", "accountId", "circleId", "billId", "budgetId", "goalId", "currency", "from", "to", "tab"] as const;
 for (const key of keys) { const value = params[key]; if (typeof value === "string" && /^[a-zA-Z0-9_ .:-]{1,80}$/.test(value)) context[key] = value; }
 if (segment === "transaction") { const id = clean.split("/")[2] || params.id; if (typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id)) context.transactionId = id; }
 if (context.currency && (context.currency === "ALL" || !/^[A-Z]{3}$/.test(context.currency))) delete context.currency;
 for (const key of ["from", "to"] as const) if (context[key] && !/^\d{4}-\d{2}-\d{2}$/.test(context[key]!)) delete context[key];
 if (page === "reports" && typeof params.reportParams === "string" && params.reportParams.length <= 4000) context.reportParams = params.reportParams;
 return context;
}
export function askPagePrompts(context: AskPageContext): string[] {
 if (context.page === "budgeting" && context.budgetId) return ["How is this budget tracking?", "How much is left?", "Chart this budget’s progress"];
 if (context.page === "goals" && context.goalId) return ["How is this goal progressing?", "Chart this goal’s progress"];
 if (context.accountId) return ["What’s the balance of this account?", "Is this balance up to date?"];
 if (context.transactionId) return ["Explain this transaction", "What category fits this transaction?", "How does this transaction affect my spending?"];
 return suggestions[context.page];
}
