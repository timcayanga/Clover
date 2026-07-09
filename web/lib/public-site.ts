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
    slug: "track-finances",
    navLabel: "Track Finances",
    shortLabel: "Track Finances",
    overview: "Bring your files, transactions, accounts, and recurring activity into one place.",
    heroEyebrow: "Track finances",
    heroTitle: "Bring months of finances into one place.",
    heroCopy:
      "Step 1: Upload the records and accounts you already have. Step 2: Start tracking from real history instead of a blank page.",
    heroPlaceholder: "Placeholder for a Track Finances overview image",
    accent: "teal",
    sections: [
      {
        id: "file-uploads",
        eyebrow: "File uploads",
        title: "Start with the records you already have.",
        body: [
          "Step 1: Upload statements, receipts, screenshots, or exports.",
          "Step 2: Clover turns them into usable data so you do not have to type everything by hand.",
        ],
        placeholder: "Placeholder for file upload image",
      },
      {
        id: "transactions",
        eyebrow: "Transactions",
        title: "Review your transactions faster.",
        body: [
          "Step 1: Review categories, merchant names, and transaction details in one place.",
          "Step 2: Fix what matters and keep the final result under your control.",
        ],
        placeholder: "Placeholder for transactions review image",
      },
      {
        id: "accounts-recurring-investments",
        eyebrow: "Accounts and visibility",
        title: "Keep your accounts and repeating activity clear.",
        body: [
          "Step 1: Organize accounts, spot repeating bills, and keep investments visible.",
          "Step 2: See what is fixed, what changed, and what needs attention next from one account view.",
        ],
        placeholder: "Placeholder for accounts, recurring activity, and investments image",
      },
    ],
  },
  {
    slug: "gain-insights",
    navLabel: "Gain Insights",
    shortLabel: "Gain Insights",
    overview: "Turn uploaded data into reports, guidance, and simple next steps.",
    heroEyebrow: "Gain insights",
    heroTitle: "See what your money is telling you.",
    heroCopy:
      "Step 1: Turn your data into reports and insights. Step 2: See patterns faster and decide what to do next.",
    heroPlaceholder: "Placeholder for a Gain Insights overview image",
    accent: "gold",
    sections: [
      {
        id: "reports",
        eyebrow: "Reports",
        title: "See where your money goes.",
        body: [
          "Step 1: Open reports by category, merchant, account, or time.",
          "Step 2: See what changed and where most of your money is going.",
        ],
        placeholder: "Placeholder for reports image",
      },
      {
        id: "adviser",
        eyebrow: "Adviser",
        title: "Catch issues earlier.",
        body: [
          "Step 1: Let Adviser surface spending spikes, repeating costs, and unusual changes.",
          "Step 2: Focus on what needs attention without digging through everything yourself.",
        ],
        placeholder: "Placeholder for Adviser image",
      },
      {
        id: "progress",
        eyebrow: "Progress",
        title: "Turn insights into your next step.",
        body: [
          "Step 1: Use what you learn to adjust spending, budgets, savings, or investing.",
          "Step 2: Keep moving with a clearer picture of your account.",
        ],
        placeholder: "Placeholder for progress and next-step image",
      },
    ],
  },
  {
    slug: "split-bills",
    navLabel: "Split Bills",
    shortLabel: "Split Bills",
    overview: "Track shared expenses, see who owes what, and settle up without the usual back-and-forth.",
    heroEyebrow: "Split bills",
    heroTitle: "Share expenses without the hassle.",
    heroCopy:
      "Step 1: Add a shared expense. Step 2: Split it clearly and keep track of what is still unpaid.",
    heroPlaceholder: "Placeholder for Split Bills image",
    accent: "mint",
    sections: [],
  },
  {
    slug: "budgeting",
    navLabel: "Budgeting",
    shortLabel: "Budgeting",
    overview: "Build practical budgets from your real spending instead of starting from guesswork.",
    heroEyebrow: "Budgeting",
    heroTitle: "Create budgets that match real life.",
    heroCopy:
      "Step 1: Use your real spending history to set better limits. Step 2: Watch progress and stay closer to your goals.",
    heroPlaceholder: "Placeholder for Budgeting image",
    accent: "sky",
    sections: [],
  },
  {
    slug: "pro",
    navLabel: "Pro",
    shortLabel: "Pro",
    overview: "Unlock more room, deeper insights, and investment tools when you need more.",
    heroEyebrow: "Clover Pro",
    heroTitle: "Get more when your finances need more.",
    heroCopy:
      "Step 1: Unlock more room and deeper reporting. Step 2: Add investment tools when you need a fuller account.",
    heroPlaceholder: "Placeholder for a Pro overview image",
    accent: "violet",
    featured: true,
    sections: [
      {
        id: "advanced-reporting",
        eyebrow: "Advanced reporting",
        title: "See more detail when you need it.",
        body: [
          "Step 1: Compare time periods and trends in more detail.",
          "Step 2: Make decisions with a fuller picture of your finances.",
        ],
        placeholder: "Placeholder for advanced reporting image",
      },
      {
        id: "higher-limits",
        eyebrow: "Higher limits",
        title: "Keep more of your financial history in Clover.",
        body: [
          "Step 1: Add more uploads, more accounts, and more history.",
          "Step 2: Keep using the same account without running into limits too quickly.",
        ],
        placeholder: "Placeholder for higher limits image",
      },
      {
        id: "investment-tools",
        eyebrow: "Investment tools",
        title: "Keep investing in the same place.",
        body: [
          "Step 1: Add investment tools to the rest of your finances.",
          "Step 2: See spending and long-term money in the same account.",
        ],
        placeholder: "Placeholder for investment tools image",
      },
    ],
  },
  {
    slug: "security",
    navLabel: "Security",
    shortLabel: "Security",
    overview: "Understand how Clover protects access, preserves traceability, and handles sensitive financial data carefully.",
    heroEyebrow: "Security",
    heroTitle: "Keep your data safe and secure.",
    heroCopy:
      "Step 1: Keep account access protected. Step 2: Keep imported data reviewable and important changes easy to trace.",
    heroPlaceholder: "Placeholder for Security image",
    accent: "coral",
    sections: [],
  },
];

export const FEATURE_PAGE_MAP = new Map(FEATURE_PAGES.map((page) => [page.slug, page] as const));

export const PRODUCT_LINKS: PublicNavLink[] = [
  {
    label: "Pricing",
    href: "/pricing",
    description: "Compare Free and Pro, including monthly and annual billing.",
  },
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
  ...[...FEATURE_PAGES]
    .sort((left, right) => {
      const order = ["track-finances", "gain-insights", "split-bills", "budgeting", "security", "pro"];
      return order.indexOf(left.slug) - order.indexOf(right.slug);
    })
    .map((page) => ({
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

export const isFeatureSlug = (slug: string): slug is FeatureNeedPage["slug"] => FEATURE_PAGE_MAP.has(slug);
