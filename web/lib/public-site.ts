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
    overview: "Bring uploads, transactions, accounts, and recurring activity into one clear tracking flow.",
    heroEyebrow: "Track finances",
    heroTitle: "Track your finances without starting from zero every month.",
    heroCopy:
      "If your money is spread across statements, receipts, screenshots, and different accounts, Clover helps you bring it together quickly so you can start from real history instead of a blank sheet.",
    heroPlaceholder: "Placeholder for a Track Finances overview image",
    accent: "teal",
    sections: [
      {
        id: "file-uploads",
        eyebrow: "File uploads",
        title: "Upload the records you already have.",
        body: [
          "Start by uploading statements, receipts, screenshots, or transaction exports.",
          "Clover turns them into usable data so you do not have to type months of activity line by line.",
        ],
        placeholder: "Placeholder for file upload image",
      },
      {
        id: "transactions",
        eyebrow: "Transactions",
        title: "Review and clean up your transactions with confidence.",
        body: [
          "Once your records are imported, Clover helps you review categories, merchant names, and details in one place.",
          "You stay in control of the final result while Clover removes most of the repetitive cleanup work.",
        ],
        placeholder: "Placeholder for transactions review image",
      },
      {
        id: "accounts-recurring-investments",
        eyebrow: "Accounts and visibility",
        title: "Keep accounts, recurring activity, and investments connected.",
        body: [
          "Organize accounts, spot repeating bills, and keep investments visible without bouncing between separate tools.",
          "When everything lives in one workflow, it becomes easier to see what is fixed, what is changing, and what needs your attention next.",
        ],
        placeholder: "Placeholder for accounts, recurring activity, and investments image",
      },
    ],
  },
  {
    slug: "gain-insights",
    navLabel: "Gain Insights",
    shortLabel: "Gain Insights",
    overview: "Turn uploaded data into reports, guidance, and clear next steps.",
    heroEyebrow: "Gain insights",
    heroTitle: "See what your money is telling you.",
    heroCopy:
      "Clover turns the data you upload into a clearer story so you can understand your spending, spot patterns, and decide what to do next with more confidence.",
    heroPlaceholder: "Placeholder for a Gain Insights overview image",
    accent: "gold",
    sections: [
      {
        id: "reports",
        eyebrow: "Reports",
        title: "Understand where your money is going.",
        body: [
          "Instead of reading a long list of transactions, Clover turns your history into reports that show spending by category, merchant, account, and time.",
          "That helps you answer the questions most people ask first: where did my money go, what changed, and what is driving it?",
        ],
        placeholder: "Placeholder for reports image",
      },
      {
        id: "adviser",
        eyebrow: "Adviser",
        title: "Notice problems and opportunities sooner.",
        body: [
          "Adviser helps surface changes that may matter, like spending spikes, recurring costs adding up, or patterns that could slow your goals down.",
          "The goal is simple: help you focus faster on what deserves attention instead of making you search for it yourself.",
        ],
        placeholder: "Placeholder for Adviser image",
      },
      {
        id: "progress",
        eyebrow: "Progress",
        title: "Turn insights into your next move.",
        body: [
          "Once you can see the pattern clearly, it becomes easier to decide what to do next, whether that means adjusting spending, tightening a budget, or making room for savings and investing.",
          "Clover helps the data feel useful, not just informative.",
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
      "Clover keeps shared bills clear from the start. Add an expense, split it fairly, and keep track of what is still unpaid without relying on chats, memory, or spreadsheets.",
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
      "Clover uses the financial history you already uploaded to help you set better limits. Review your spending, set a target, and stay closer to your goals without constant manual tracking.",
    heroPlaceholder: "Placeholder for Budgeting image",
    accent: "sky",
    sections: [],
  },
  {
    slug: "pro",
    navLabel: "Pro",
    shortLabel: "Pro",
    overview: "Unlock more room, deeper insights, and investment tools when you need a fuller financial view.",
    heroEyebrow: "Clover Pro",
    heroTitle: "Unlock more room when your finances need more.",
    heroCopy:
      "Pro is built for people who want Clover to go further, with more history, stronger analysis, and better visibility across both everyday finances and long-term money decisions.",
    heroPlaceholder: "Placeholder for a Pro overview image",
    accent: "violet",
    featured: true,
    sections: [
      {
        id: "advanced-reporting",
        eyebrow: "Advanced reporting",
        title: "Go deeper once your financial picture gets bigger.",
        body: [
          "Pro gives you stronger reporting so you can compare periods, understand trends more clearly, and work with a more complete picture of your finances.",
          "That makes Clover more useful when your needs move beyond basic tracking and into sharper decision-making.",
        ],
        placeholder: "Placeholder for advanced reporting image",
      },
      {
        id: "higher-limits",
        eyebrow: "Higher limits",
        title: "Keep more accounts, more uploads, and more history in view.",
        body: [
          "As your workflow grows, Pro gives you more room so Clover can hold a larger share of your financial life without feeling constrained.",
          "That is especially helpful when you manage multiple institutions, longer timelines, or more complex money activity.",
        ],
        placeholder: "Placeholder for higher limits image",
      },
      {
        id: "investment-tools",
        eyebrow: "Investment tools",
        title: "Bring investing into the same money system.",
        body: [
          "Pro adds investment tools for people who want a more complete view of their finances, not just day-to-day spending and bills.",
          "Instead of separating long-term wealth from the rest of your money, Clover helps you keep both in one connected workflow.",
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
      "Clover is designed to protect account access, keep imported data reviewable, and make important financial changes easier to trace. That helps you feel more confident using it.",
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
