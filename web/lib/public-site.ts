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
      "Upload the records and accounts you already have, and Clover helps you start from real history instead of a blank page.",
    heroPlaceholder: "Placeholder for a Track Finances overview image",
    accent: "teal",
    sections: [
      {
        id: "file-uploads",
        eyebrow: "File uploads",
        title: "Start with the records you already have.",
        body: [
          "Upload statements, receipts, screenshots, or exports instead of building everything manually.",
          "Clover turns them into usable data so you can start seeing results faster.",
        ],
        placeholder: "Placeholder for file upload image",
      },
      {
        id: "transactions",
        eyebrow: "Transactions",
        title: "Review your transactions faster.",
        body: [
          "Review categories, merchant names, and transaction details in one place.",
          "Fix what matters and keep the final result under your control.",
        ],
        placeholder: "Placeholder for transactions review image",
      },
      {
        id: "accounts-recurring-investments",
        eyebrow: "Accounts and visibility",
        title: "Keep your accounts and repeating activity clear.",
        body: [
          "Organize accounts, spot repeating bills, and keep investments visible without jumping between tools.",
          "That makes it easier to see what is fixed, what changed, and what needs attention next from one account view.",
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
      "Turn your data into reports and insights so you can see patterns faster and decide what to do next.",
    heroPlaceholder: "Placeholder for a Gain Insights overview image",
    accent: "gold",
    sections: [
      {
        id: "reports",
        eyebrow: "Reports",
        title: "See where your money goes.",
        body: [
          "Open reports by category, merchant, account, or time whenever you want a clearer breakdown.",
          "You can quickly see what changed and where most of your money is going.",
        ],
        placeholder: "Placeholder for reports image",
      },
      {
        id: "adviser",
        eyebrow: "Adviser",
        title: "Catch issues earlier.",
        body: [
          "Adviser can surface spending spikes, repeating costs, and unusual changes that deserve a closer look.",
          "Instead of digging through everything yourself, you can focus on what needs attention first.",
        ],
        placeholder: "Placeholder for Adviser image",
      },
      {
        id: "progress",
        eyebrow: "Progress",
        title: "Turn insights into your next step.",
        body: [
          "Use what you learn to adjust spending, budgets, savings, or investing.",
          "The point is not just to look at data, but to keep moving with a clearer picture of your account.",
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
      "Add a shared expense, split it clearly, and keep track of what is still unpaid without chasing people manually.",
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
      "Use your real spending history to set better limits, watch progress, and stay closer to your goals.",
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
      "Pro gives you more room, deeper reporting, and investment tools when you need a fuller account.",
    heroPlaceholder: "Placeholder for a Pro overview image",
    accent: "violet",
    featured: true,
    sections: [
      {
        id: "advanced-reporting",
        eyebrow: "Advanced reporting",
        title: "See more detail when you need it.",
        body: [
          "Compare time periods and trends in more detail when basic tracking is no longer enough.",
          "That gives you a fuller picture when you need to make bigger financial decisions.",
        ],
        placeholder: "Placeholder for advanced reporting image",
      },
      {
        id: "higher-limits",
        eyebrow: "Higher limits",
        title: "Keep more of your financial history in Clover.",
        body: [
          "Add more uploads, more accounts, and more history as your finances grow.",
          "You can keep using the same account without running into limits too quickly.",
        ],
        placeholder: "Placeholder for higher limits image",
      },
      {
        id: "investment-tools",
        eyebrow: "Investment tools",
        title: "Keep investing in the same place.",
        body: [
          "Add investment tools alongside the rest of your finances instead of splitting everything across separate apps.",
          "That makes it easier to see spending and long-term money in the same account.",
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
      "Clover is built to protect account access, keep uploaded data reviewable, and give you confidence that your information stays private.",
    heroPlaceholder: "Placeholder for Security image",
    accent: "coral",
    sections: [
      {
        id: "uploaded-files",
        eyebrow: "Uploaded files",
        title: "What happens to the files you upload?",
        body: [
          "When you upload a statement, receipt, or screenshot, Clover uses it to extract the financial details you need for tracking.",
          "The original file stays tied to your import so you can review where the data came from when you need it.",
        ],
        placeholder: "Placeholder for uploaded files security image",
      },
      {
        id: "data-safety",
        eyebrow: "Data safety",
        title: "Your data stays private to your account.",
        body: [
          "Your financial data is meant for your account and your review, not for other users to browse or access.",
          "That means the information you upload stays connected to your own Clover account unless you explicitly share something through a product feature.",
        ],
        placeholder: "Placeholder for private account access image",
      },
      {
        id: "protection",
        eyebrow: "Protection",
        title: "Security is built into how Clover handles your data.",
        body: [
          "Clover is designed to protect account access, preserve the link between uploaded files and imported data, and make important changes easier to trace.",
          "That helps keep your information secure while also making it easier for you to review and verify what Clover is showing you.",
        ],
        placeholder: "Placeholder for security protections image",
      },
      {
        id: "access-control",
        eyebrow: "Access control",
        title: "Can other people access your data?",
        body: [
          "Other people should not be able to access your financial data just by using Clover.",
          "Your information stays tied to your own account, and shared access only happens when a specific Clover feature is built for sharing, like split bills.",
        ],
        placeholder: "Placeholder for account access control image",
      },
    ],
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
