export const SETTINGS_GUIDANCE_MENU_KEY = "clover.settings.guidance-menu.v1";
export const SETTINGS_GUIDANCE_MENU_EVENT = "clover-guidance-menu-change";

export const guidanceMenuItems = [
  { key: "dashboard", label: "Home", description: "Your overview and next useful actions." },
  { key: "reports", label: "Reports", description: "Charts, cash flow, spending, and financial trends." },
  { key: "adviser", label: "Adviser", description: "Personal guidance, trends, and recommendations." },
  { key: "accounts", label: "Accounts", description: "Banks, cash, and connected account balances." },
  { key: "transactions", label: "Transactions", description: "Search, review, and categorize activity." },
  { key: "recurring", label: "Recurring", description: "Upcoming payments and repeating costs." },
  { key: "circles", label: "Circles", description: "Coordinate shared expenses, budgets, goals, and commitments." },
  { key: "split-bill", label: "Split Bills", description: "Split receipts and track shared balances." },
  { key: "budgeting", label: "Budgeting", description: "Budgets, pacing, and spending guardrails." },
  { key: "goals", label: "Goals", description: "Track progress toward your money goals." },
  { key: "investments", label: "Investments", description: "Portfolio, holdings, and market views." },
] as const;

export type GuidanceMenuKey = (typeof guidanceMenuItems)[number]["key"];
export type GuidanceMenuVisibility = Record<GuidanceMenuKey, boolean>;

export const guidanceMenuPresets: Record<"learning" | "comfortable" | "very-comfortable", GuidanceMenuVisibility> = {
  learning: {
    dashboard: true,
    reports: true,
    adviser: true,
    accounts: true,
    transactions: true,
    recurring: false,
    circles: false,
    "split-bill": true,
    budgeting: false,
    goals: false,
    investments: false,
  },
  comfortable: {
    dashboard: true,
    reports: true,
    adviser: true,
    accounts: true,
    transactions: true,
    recurring: true,
    circles: true,
    "split-bill": true,
    budgeting: true,
    goals: false,
    investments: false,
  },
  "very-comfortable": {
    dashboard: true,
    reports: true,
    adviser: true,
    accounts: true,
    transactions: true,
    recurring: true,
    circles: true,
    "split-bill": true,
    budgeting: true,
    goals: true,
    investments: true,
  },
};

export const cloneGuidanceMenuVisibility = (value: GuidanceMenuVisibility): GuidanceMenuVisibility => ({ ...value });

export const isGuidanceMenuVisibility = (value: unknown): value is GuidanceMenuVisibility => {
  if (!value || typeof value !== "object") {
    return false;
  }

  return guidanceMenuItems.every(({ key }) => typeof (value as Record<string, unknown>)[key] === "boolean");
};

export const getGuidanceMenuPreset = (level: "learning" | "comfortable" | "very-comfortable") =>
  cloneGuidanceMenuVisibility(guidanceMenuPresets[level]);
