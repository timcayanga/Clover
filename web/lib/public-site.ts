export type PublicNavLink = {
  label: string;
  href: string;
  description?: string;
  featured?: boolean;
};

export type PublicNavCategory = {
  label: string;
  items: PublicNavLink[];
};

export type FeatureNeedSection = {
  id: string;
  eyebrow: string;
  title: string;
  body: string[];
  placeholder: string;
};

export type FeatureNeedPage = {
  slug: string;
  navLabel: string;
  shortLabel: string;
  overview: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroCopy?: string;
  heroPlaceholder?: string;
  accent: "teal" | "mint" | "sky" | "gold" | "violet" | "coral";
  featured?: boolean;
  sections: FeatureNeedSection[];
};

export const FEATURE_PAGES: FeatureNeedPage[] = [
  {
    slug: "manage-money",
    navLabel: "Manage Money",
    shortLabel: "Manage Money",
    overview: "Organize uploads, accounts, transactions, and recurring activity without rebuilding everything by hand.",
    heroEyebrow: "Manage money",
    heroTitle: "Organize months of money without starting from zero.",
    heroCopy:
      "Upload statements, receipts, screenshots, or spreadsheets. Clover turns the records you already have into a financial history you can review and use.",
    heroPlaceholder: "Placeholder showing uploaded records becoming organized financial data",
    accent: "teal",
    sections: [
      {
        id: "accounts",
        eyebrow: "Accounts",
        title: "See every account in context.",
        body: [
          "Bring cash, bank accounts, cards, e-wallets, and other balances into one view.",
          "You can see what each account holds and how it contributes to your overall financial picture.",
        ],
        placeholder: "Placeholder showing connected accounts and balances",
      },
      {
        id: "transactions",
        eyebrow: "Transactions",
        title: "Keep transactions clean without doing everything by hand.",
        body: [
          "Clover organizes imported activity so categories, merchant names, and account details are easier to review.",
          "Correct anything that needs attention, confirm it once, and keep the final record under your control.",
        ],
        placeholder: "Placeholder showing organized transactions ready for review",
      },
      {
        id: "recurring",
        eyebrow: "Recurring",
        title: "Know what keeps coming back.",
        body: [
          "Spot repeating bills, subscriptions, income, installments, and other commitments from the history already inside Clover.",
          "See what is expected next so fewer payments or changes catch you by surprise.",
        ],
        placeholder: "Placeholder showing recurring bills, income, and upcoming commitments",
      },
    ],
  },
  {
    slug: "gain-insights",
    navLabel: "Gain Insights",
    shortLabel: "Gain Insights",
    overview: "Turn organized financial data into reports, Adviser guidance, and clearer next steps.",
    accent: "gold",
    sections: [
      {
        id: "adviser",
        eyebrow: "Adviser",
        title: "Ask about your money in plain language.",
        body: [
          "Ask Adviser what changed, where money went, or what deserves attention next.",
          "Its guidance is grounded in the financial history you have organized in Clover, so the answer starts with your actual situation.",
        ],
        placeholder: "Placeholder showing a conversation with Clover Adviser",
      },
      {
        id: "reports",
        eyebrow: "Reports",
        title: "See the pattern behind the total.",
        body: [
          "Break down money by category, merchant, account, or time period whenever a balance alone does not explain enough.",
          "Compare what changed and trace the movement back to the transactions behind it.",
        ],
        placeholder: "Placeholder showing spending and account reports",
      },
    ],
  },
  {
    slug: "plan-ahead",
    navLabel: "Plan Ahead",
    shortLabel: "Plan Ahead",
    overview: "Use real financial history to shape budgets, goals, and investment decisions.",
    accent: "sky",
    sections: [
      {
        id: "budgeting",
        eyebrow: "Budgeting",
        title: "Set limits using real spending, not guesswork.",
        body: [
          "Build a budget from the categories and patterns already visible in your history.",
          "Watch actual spending against the plan and adjust it when real life changes.",
        ],
        placeholder: "Placeholder showing a practical budget based on real spending",
      },
      {
        id: "goals",
        eyebrow: "Goals",
        title: "Give each goal a clear path forward.",
        body: [
          "Set the amount, timing, and progress you want to protect, from an emergency fund to a major purchase.",
          "Clover connects the goal to your broader finances so you can see what is helping or slowing it down.",
        ],
        placeholder: "Placeholder showing goal progress and recommended actions",
      },
      {
        id: "investments",
        eyebrow: "Investments",
        title: "Keep long-term growth in the same picture.",
        body: [
          "Track holdings, purchases, dividends, and market movement alongside the rest of your accounts.",
          "See how investing contributes to your net worth without losing sight of the money you use today.",
        ],
        placeholder: "Placeholder showing investments alongside a complete net worth view",
      },
    ],
  },
  {
    slug: "grow-together",
    navLabel: "Grow Together",
    shortLabel: "Grow Together",
    overview: "Manage group plans and shared expenses without mixing them into your private finances.",
    accent: "mint",
    sections: [
      {
        id: "circles",
        eyebrow: "Circles",
        title: "Give every group one place to stay aligned.",
        body: [
          "Create a Circle for a household, trip, family plan, or other shared purpose.",
          "Keep the relevant goals, budgets, commitments, and activity together without giving everyone access to your personal financial history.",
        ],
        placeholder: "Placeholder showing a Clover Circle with shared plans and activity",
      },
      {
        id: "split-bills",
        eyebrow: "Split Bills",
        title: "Settle expenses without awkward math.",
        body: [
          "Turn a receipt or transaction into a shared expense, then split it equally or by item.",
          "Track who paid, who owes, and what has already been settled without chasing everyone manually.",
        ],
        placeholder: "Placeholder showing a receipt divided into clear shares",
      },
    ],
  },
  {
    slug: "security",
    navLabel: "Security",
    shortLabel: "Security",
    overview: "See how Clover protects access, preserves traceability, and keeps you in control of your data.",
    accent: "coral",
    sections: [
      {
        id: "uploaded-files",
        eyebrow: "Uploaded files",
        title: "Know what happens to every file you upload.",
        body: [
          "Clover uses a statement, receipt, screenshot, or spreadsheet to extract the financial details needed for your account.",
          "The source stays connected to the import for traceability, and you can remove files or related data when you no longer want Clover to keep them.",
        ],
        placeholder: "Placeholder showing a source file connected to reviewed transactions",
      },
      {
        id: "private-account",
        eyebrow: "Private account",
        title: "Keep your account private.",
        body: [
          "Your financial records belong to your Clover account and are not available for other users to browse.",
          "Clover does not sell your personal information, and sharing only happens when you deliberately use a feature designed for it.",
        ],
        placeholder: "Placeholder showing private account access and protected records",
      },
    ],
  },
  {
    slug: "pro",
    navLabel: "Pro",
    shortLabel: "Pro",
    overview: "Add more capacity, richer guidance, and deeper investment tools as your finances grow.",
    accent: "violet",
    featured: true,
    sections: [
      {
        id: "more-history",
        eyebrow: "More history",
        title: "Keep more of your financial history together.",
        body: [
          "Increase upload, account, transaction, and Profile limits as the amount you manage grows.",
          "You can keep the fuller story inside Clover instead of trimming the history that gives your numbers context.",
        ],
        placeholder: "Placeholder showing expanded upload, account, and Profile capacity",
      },
      {
        id: "deeper-guidance",
        eyebrow: "Deeper guidance",
        title: "See deeper patterns before they become problems.",
        body: [
          "Use advanced reports and richer Adviser guidance to compare periods, investigate movement, and identify what deserves attention.",
          "More complete data gives Clover more context for practical recommendations.",
        ],
        placeholder: "Placeholder showing advanced reports and Adviser recommendations",
      },
      {
        id: "investment-context",
        eyebrow: "Investment context",
        title: "Track investments with the rest of your financial picture.",
        body: [
          "Use fuller portfolio tools for holdings, purchases, dividends, and market movement.",
          "Connect long-term growth with your accounts, spending, goals, and net worth in one place.",
        ],
        placeholder: "Placeholder showing a full investment portfolio within Clover",
      },
    ],
  },
];

export const FEATURE_PAGE_MAP = new Map(FEATURE_PAGES.map((page) => [page.slug, page] as const));

export const FEATURE_SLUG_ALIASES: Record<string, string> = {
  "track-finances": "manage-money",
  "budgeting": "plan-ahead",
  "split-bills": "grow-together",
};

export const resolveFeatureSlug = (slug: string) => FEATURE_SLUG_ALIASES[slug] ?? slug;

export const PRODUCT_LINKS: PublicNavLink[] = [
  {
    label: "Help",
    href: "/help",
    description: "Find setup, import, budgeting, and troubleshooting guidance.",
  },
  {
    label: "Contact",
    href: "/contact-us",
    description: "Reach Clover for questions, feedback, or support.",
  },
];

export const LEGAL_LINKS: PublicNavLink[] = [
  {
    label: "Privacy Policy",
    href: "/privacy-policy",
    description: "Review how Clover handles data and privacy.",
  },
  {
    label: "Terms of Service",
    href: "/terms-of-service",
    description: "Read the current terms that govern use of Clover.",
  },
];

export const FEATURE_LINKS: PublicNavLink[] = [
  ...FEATURE_PAGES.map((page) => ({
    label: page.navLabel,
    href: `/features/${page.slug}`,
    description: page.overview,
    featured: page.featured ?? false,
  })),
];

export const HEADER_NAV_CATEGORIES: PublicNavCategory[] = [
  {
    label: "Features",
    items: FEATURE_LINKS,
  },
];

export const PUBLIC_NAV_CATEGORIES: PublicNavCategory[] = [
  {
    label: "Features",
    items: FEATURE_LINKS,
  },
  {
    label: "Product",
    items: PRODUCT_LINKS,
  },
  {
    label: "Legal",
    items: LEGAL_LINKS,
  },
];

export const isFeatureSlug = (slug: string): slug is FeatureNeedPage["slug"] => FEATURE_PAGE_MAP.has(resolveFeatureSlug(slug));
