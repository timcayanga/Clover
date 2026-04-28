export type PlanFeatureKey =
  | "manualTracking"
  | "receiptScanning"
  | "accounts"
  | "uploads"
  | "rows"
  | "investments"
  | "reports"
  | "goals";

export type PlanFeatureDetail = {
  key: PlanFeatureKey;
  title: string;
  summary: string;
  freeLabel: string;
  proLabel: string;
  freeItems: string[];
  proItems: string[];
};

const createDetail = (detail: PlanFeatureDetail) => detail;

export const PLAN_FEATURE_DETAILS: Record<PlanFeatureKey, PlanFeatureDetail> = {
  manualTracking: createDetail({
    key: "manualTracking",
    title: "Manual transaction tracking",
    summary: "Free keeps the core manual workflow open. Pro keeps the same manual tools and adds more room for heavier use.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: ["Add and edit transactions by hand", "Use manual tracking for cleanup and one-off entries"],
    proItems: ["Keep the same manual entry flow", "Pair it with higher limits and broader analysis"],
  }),
  receiptScanning: createDetail({
    key: "receiptScanning",
    title: "Receipt scanning",
    summary: "Receipt capture stays available across both plans so paper slips and small purchases can stay attached to the story.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: ["Scan and upload receipts", "Attach receipts to support manual or imported activity"],
    proItems: ["Keep receipt scanning turned on", "Use it with higher monthly upload room"],
  }),
  accounts: createDetail({
    key: "accounts",
    title: "Non-cash accounts",
    summary: "Free covers the essentials; Pro gives you more accounts so the whole picture stays connected.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: ["5 non-cash accounts", "Add bank, wallet, card, and investment accounts"],
    proItems: ["20 non-cash accounts", "Model more of your day-to-day and long-term money in one workspace"],
  }),
  uploads: createDetail({
    key: "uploads",
    title: "Monthly uploads",
    summary: "Uploads stay light on Free and expand significantly on Pro for larger statement and receipt workflows.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: ["10 monthly uploads total", "Includes statements and receipts"],
    proItems: ["100 monthly uploads total", "More room for heavier importing and ongoing reconciliation"],
  }),
  rows: createDetail({
    key: "rows",
    title: "Transaction rows",
    summary: "Free is enough for a smaller history. Pro removes the row ceiling so Clover can keep more of the full story.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: ["1,000 transaction rows total", "Enough for a lighter operating history and review workflow"],
    proItems: ["Unlimited transaction rows", "Keep the full timeline without trimming older activity"],
  }),
  investments: createDetail({
    key: "investments",
    title: "Investment tracking",
    summary: "Free covers a basic holdings view. Pro adds a fuller portfolio lens with market tracking and richer analysis.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: [
      "Add an investment and create investment accounts",
      "View Accounts shortcut",
      "Search, subtype filter, sort, and reset filters",
      "Portfolio summary cards",
      "Portfolio mix by subtype",
      "Inline edit for holdings",
      "Per-holding current value, purchase value/principal, gain/loss, and return %",
    ],
    proItems: [
      "Full Market Tracker",
      "Multi-market support, especially PH + US + Crypto in one place",
      "Currency conversion toggle",
      "Benchmark comparison",
      "Full date-range history",
      "Live intraday / richer charting",
      "Unlimited saved tickers or watchlist-style tracking",
      "Advanced portfolio analytics later, like performance over time, XIRR, allocation trends, and alerts",
    ],
  }),
  reports: createDetail({
    key: "reports",
    title: "Reports and insights",
    summary: "Free covers the everyday summary views. Pro adds the decision layer that explains movement and next steps.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: [
      "Total Income",
      "Total Expenses",
      "Total Net Income",
      "Savings Rate %",
      "Income flow map",
      "Spending by category",
      "Recurring payments",
      "Top merchants",
      "Monthly summary",
    ],
    proItems: ["What changed", "Why it changed", "What to do next", "Goal lens", "Attention", "Decision lens"],
  }),
  goals: createDetail({
    key: "goals",
    title: "Goals and recommendations",
    summary: "Free gives you a simple goal lane and basic progress. Pro adds a fuller coaching layer, richer history, and more actions.",
    freeLabel: "Free",
    proLabel: "Pro",
    freeItems: [
      "Pick one active goal lane",
      "Set a simple monthly peso target",
      "Track basic progress against that target",
      "See a simple progress ring / bar",
      "Get plain-language encouragement",
      "Use the onboarding goal as the default",
      "See a basic checklist of next steps",
      "See a limited history of goal changes",
      "Let the goal show up in Insights and Reports in a basic way",
      "One strong snapshot",
      "One cashflow view",
      "One spending view",
      "Basic insights",
      "Light investment summary",
    ],
    proItems: [
      "Set percent-of-salary goals",
      "Set annual targets, not just monthly",
      "Add a purpose, like car, phone, house, or emergency fund",
      "Use investment-aware goals like invest x pesos or invest x% of salary",
      "See portfolio value, gain/loss, and monthly investing flow inside Goals",
      "Get milestone roadmaps and progress bands",
      "See what changed since last week and trend-based coaching",
      "Get richer goal history and comparison views",
      "Get more advanced advice tied to spending, savings, and recurring costs",
      "Get the more visual / celebratory states when on track",
      "Full insight story",
      "Deeper patterns",
      "Richer investment analysis",
      "More actions and comparisons",
    ],
  }),
};

const normalizeLabel = (label: string) =>
  label
    .toLowerCase()
    .replace(/[().,%]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const PLAN_FEATURE_LABEL_MAP: Record<string, PlanFeatureKey> = {
  "manual transaction tracking": "manualTracking",
  "receipt scanning": "receiptScanning",
  "5 non-cash accounts": "accounts",
  "5 accounts in addition to cash": "accounts",
  "10 monthly uploads": "uploads",
  "10 monthly uploads total including statements and receipts": "uploads",
  "1000 transaction rows": "rows",
  "1000 transaction rows total": "rows",
  "basic investment tracking": "investments",
  "full investment portfolio tools": "investments",
  "basic reports and insights": "reports",
  "advanced reports and insights": "reports",
  "basic goal tracking": "goals",
  "enhanced goal tracking and recommendations": "goals",
};

export const getPlanFeatureDetailByLabel = (label: string) => {
  const key = PLAN_FEATURE_LABEL_MAP[normalizeLabel(label)];

  if (!key) {
    return null;
  }

  return PLAN_FEATURE_DETAILS[key];
};
