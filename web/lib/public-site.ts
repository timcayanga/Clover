export type PublicNavLink = {
  label: string;
  products?: string;
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
  imageSrc: string;
  imageAlt: string;
};

export type FeatureNeedPage = {
  slug: string;
  navLabel: string;
  shortLabel: string;
  overview: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroCopy?: string;
  heroImageSrc?: string;
  heroImageAlt?: string;
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
    heroImageSrc: "/assets/landing page/Organize months of money.png",
    heroImageAlt: "Uploaded financial records becoming organized Clover data",
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
        imageSrc: "/assets/landing page/See every account in context.png",
        imageAlt: "Clover accounts and balances shown together",
      },
      {
        id: "transactions",
        eyebrow: "Transactions",
        title: "Keep transactions clean without doing everything by hand.",
        body: [
          "Clover organizes imported activity so categories, merchant names, and account details are easier to review.",
          "Correct anything that needs attention, confirm it once, and keep the final record under your control.",
        ],
        imageSrc: "/assets/landing page/keep transactions clean.png",
        imageAlt: "Organized Clover transactions ready for review",
      },
      {
        id: "recurring",
        eyebrow: "Recurring",
        title: "Know what keeps coming back.",
        body: [
          "Spot repeating bills, subscriptions, income, installments, and other commitments from the history already inside Clover.",
          "See what is expected next so fewer payments or changes catch you by surprise.",
        ],
        imageSrc: "/assets/landing page/Know what keeps coming back.png",
        imageAlt: "Recurring bills, income, and upcoming commitments in Clover",
      },
    ],
  },
  {
    slug: "understand-your-money",
    navLabel: "Understand Your Money",
    shortLabel: "Understand Your Money",
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
        imageSrc: "/assets/landing page/Ask about your money in plain language.png",
        imageAlt: "A conversation with Clover Adviser about personal finances",
      },
      {
        id: "reports",
        eyebrow: "Reports",
        title: "See the pattern behind the total.",
        body: [
          "Break down money by category, merchant, account, or time period whenever a balance alone does not explain enough.",
          "Compare what changed and trace the movement back to the transactions behind it.",
        ],
        imageSrc: "/assets/landing page/See the pattern behind the total.png",
        imageAlt: "Clover spending and account reports revealing financial patterns",
      },
    ],
  },
  {
    slug: "plan-ahead",
    navLabel: "Plan Ahead",
    shortLabel: "Plan Ahead",
    overview: "Track your investments, shape practical budgets, and work toward savings goals in one financial picture.",
    accent: "sky",
    sections: [
      {
        id: "investments",
        eyebrow: "Investments",
        title: "See how your investments fit into the bigger picture.",
        body: [
          "Track your holdings, estimated values, and returns alongside your accounts, budgets, and goals.",
          "Review your portfolio as part of your wider finances, with estimates clearly distinguished from live investment values.",
        ],
        imageSrc: "/assets/feature-stories/plan-hero.webp",
        imageAlt: "A person reviewing financial plans at a desk",
      },
      {
        id: "budgeting",
        eyebrow: "Budgeting",
        title: "Set limits using real spending, not guesswork.",
        body: [
          "Build a budget from the categories and patterns already visible in your history.",
          "Watch actual spending against the plan and adjust it when real life changes.",
        ],
        imageSrc: "/assets/landing page/Set limits using real spending, not guesswork.png",
        imageAlt: "A practical Clover budget based on real spending",
      },
      {
        id: "goals",
        eyebrow: "Goals",
        title: "Give each goal a clear path forward.",
        body: [
          "Set the amount, timing, and progress you want to protect, from an emergency fund to a major purchase.",
          "Clover connects the goal to your broader finances so you can see what is helping or slowing it down.",
        ],
        imageSrc: "/assets/landing page/Give each goal a clear path forward.png",
        imageAlt: "Financial goal progress and recommended actions in Clover",
      },
    ],
  },
  {
    slug: "manage-money-together",
    navLabel: "Manage Money Together",
    shortLabel: "Manage Money Together",
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
        imageSrc: "/assets/landing page/Give every group one place to stay aligned.png",
        imageAlt: "A Clover Circle with shared plans and activity",
      },
      {
        id: "split-bills",
        eyebrow: "Split Bills",
        title: "Settle expenses without awkward math.",
        body: [
          "Turn a receipt or transaction into a shared expense, then split it equally or by item.",
          "Track who paid, who owes, and what has already been settled without chasing everyone manually.",
        ],
        imageSrc: "/assets/landing page/Settle expenses without awkward math.png",
        imageAlt: "A shared expense divided into clear shares in Clover",
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
        imageSrc: "/assets/landing page/Know what happens to every file you upload.png",
        imageAlt: "An uploaded source file connected to reviewed Clover transactions",
      },
      {
        id: "private-account",
        eyebrow: "Private account",
        title: "Keep your account private.",
        body: [
          "Your financial records belong to your Clover account and are not available for other users to browse.",
          "Clover does not sell your personal information, and sharing only happens when you deliberately use a feature designed for it.",
        ],
        imageSrc: "/assets/landing page/Keep your account private.png",
        imageAlt: "Private Clover account access and protected financial records",
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
        imageSrc: "/assets/landing page/Keep more of your financial history together.png",
        imageAlt: "Expanded upload, account, and Profile capacity with Clover Pro",
      },
      {
        id: "deeper-guidance",
        eyebrow: "Deeper guidance",
        title: "See deeper patterns before they become problems.",
        body: [
          "Use advanced reports and richer Adviser guidance to compare periods, investigate movement, and identify what deserves attention.",
          "More complete data gives Clover more context for practical recommendations.",
        ],
        imageSrc: "/assets/landing page/See deeper patterns before they become problems.png",
        imageAlt: "Advanced Clover reports and Adviser recommendations",
      },
      {
        id: "investment-context",
        eyebrow: "Investment context",
        title: "Track investments with the rest of your financial picture.",
        body: [
          "Use fuller portfolio tools for holdings, purchases, dividends, and market movement.",
          "Connect long-term growth with your accounts, spending, goals, and net worth in one place.",
        ],
        imageSrc: "/assets/landing page/Track investments with the rest of your financial picture.png",
        imageAlt: "A complete investment portfolio within Clover",
      },
    ],
  },
];

export const FEATURE_PAGE_MAP = new Map(FEATURE_PAGES.map((page) => [page.slug, page] as const));

export const FEATURE_SLUG_ALIASES: Record<string, string> = {
  "track-finances": "manage-money",
  "budgeting": "plan-ahead",
  "split-bills": "manage-money-together",
  "gain-insights": "understand-your-money",
  "grow-together": "manage-money-together",
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
    products: ({
      "manage-money": "Transactions · Accounts · Recurring",
      "understand-your-money": "Adviser · Reports",
      "plan-ahead": "Investments · Budgeting · Goals",
      "manage-money-together": "Circles · Split Bills",
    } as Record<string, string>)[page.slug],
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
