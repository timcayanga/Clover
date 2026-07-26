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
  heroEyebrow: string;
  heroTitle: string;
  heroCopy: string;
  heroPlaceholder: string;
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
    heroEyebrow: "Gain insights",
    heroTitle: "Understand what changed without digging through every transaction.",
    heroCopy:
      "Clover connects the activity across your accounts so important changes, patterns, and decisions are easier to see.",
    heroPlaceholder: "Placeholder showing a clear overview of financial changes and patterns",
    accent: "gold",
    sections: [
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
        id: "next-step",
        eyebrow: "Next steps",
        title: "Turn one useful insight into a better habit.",
        body: [
          "Use what you learn to adjust a budget, protect a goal, review a recurring cost, or make a more informed decision.",
          "Clover helps narrow the next step so progress feels practical instead of overwhelming.",
        ],
        placeholder: "Placeholder showing an insight becoming a practical next step",
      },
    ],
  },
  {
    slug: "plan-ahead",
    navLabel: "Plan Ahead",
    shortLabel: "Plan Ahead",
    overview: "Use real financial history to shape budgets, goals, and investment decisions.",
    heroEyebrow: "Plan ahead",
    heroTitle: "Make plans from the life you are already living.",
    heroCopy:
      "Clover uses the money patterns you already have to help you make realistic plans for what comes next.",
    heroPlaceholder: "Placeholder showing financial history becoming a forward-looking plan",
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
    heroEyebrow: "Grow together",
    heroTitle: "Handle shared money without shared confusion.",
    heroCopy:
      "Use Circles for the plans a group shares and Split Bills for the expenses that need to be settled.",
    heroPlaceholder: "Placeholder showing people coordinating shared money in Clover",
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
      {
        id: "sharing-boundaries",
        eyebrow: "Privacy",
        title: "Share the plan, not your entire financial life.",
        body: [
          "Clover keeps your Profiles private by default and only shares the information a collaborative feature needs.",
          "The group gets clarity while your unrelated accounts and transactions remain yours.",
        ],
        placeholder: "Placeholder showing a clear boundary between personal and shared finances",
      },
    ],
  },
  {
    slug: "security",
    navLabel: "Security",
    shortLabel: "Security",
    overview: "See how Clover protects access, preserves traceability, and keeps you in control of your data.",
    heroEyebrow: "Security",
    heroTitle: "Your financial data stays protected and under your control.",
    heroCopy:
      "Clover keeps your records private, traceable, and editable. You decide what is imported, corrected, shared, or removed.",
    heroPlaceholder: "Placeholder showing protected financial records and account controls",
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
      {
        id: "review-control",
        eyebrow: "Review and control",
        title: "Review every important detail before you trust it.",
        body: [
          "Imported records remain traceable and editable so you can verify what Clover extracted and correct anything that needs attention.",
          "Confirmed financial data stays under your control instead of being silently replaced by a later suggestion.",
        ],
        placeholder: "Placeholder showing an imported record being reviewed and confirmed",
      },
      {
        id: "sharing-control",
        eyebrow: "Sharing control",
        title: "Share only what you choose.",
        body: [
          "Circles and Split Bills can share the details needed for a group plan or expense without opening the rest of your financial life.",
          "Your unrelated Profiles, accounts, and transactions remain private.",
        ],
        placeholder: "Placeholder showing selected shared details separated from private data",
      },
    ],
  },
  {
    slug: "pro",
    navLabel: "Pro",
    shortLabel: "Pro",
    overview: "Add more capacity, richer guidance, and deeper investment tools as your finances grow.",
    heroEyebrow: "Clover Pro",
    heroTitle: "Grow with confidence with Pro.",
    heroCopy:
      "Start free, then upgrade when you need more room for history, accounts, profiles, reports, Adviser guidance, and investments.",
    heroPlaceholder: "Placeholder showing a richer Pro financial overview",
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
