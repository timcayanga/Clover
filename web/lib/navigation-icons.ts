export const NAVIGATION_ICON_ASSET_ROOT = "/assets/3d%20icons/navigation/figma-v7";

export const NAVIGATION_ICON_SOURCE_FILES = {
  home: "home.png",
  accounts: "bank account.png",
  investments: "investments.png",
  splitBills: "split bills.png",
  circles: "circles.png",
  transactions: "transactions.png",
  recurring: "recurring.png",
  reports: "reports.png",
  adviser: "../mascots/velvet-compact.png",
  budgeting: "budgeting.png",
  goals: "goals.png",
  plan: "figma-library-transparent/plan.png",
  more: "more.png",
  notifications: "figma-library-transparent/notifications.png",
  settings: "figma-library-transparent/settings.png",
  help: "figma-library-transparent/help.png",
  search: "search.png",
  profile: "figma-library-transparent/profile.png",
  signOut: "figma-library-transparent/signOut.png",
  profiles: "figma-library-transparent/profiles.png",
  display: "figma-library-transparent/display.png",
  data: "figma-library-transparent/data.png",
  review: "figma-library-transparent/review.png",
  categories: "figma-library-transparent/categories.png",
  security: "figma-library-transparent/security.png",
  region: "figma-library-transparent/region.png",
} as const;

export type NavigationIconName = keyof typeof NAVIGATION_ICON_SOURCE_FILES;

export const getNavigationIconSrc = (name: NavigationIconName) =>
  `${NAVIGATION_ICON_ASSET_ROOT}/${name === "adviser" ? "adviser-velvet-v3" : name}.webp`;

// These are visible in the primary desktop or mobile navigation on first paint.
export const CRITICAL_NAVIGATION_ICON_NAMES: NavigationIconName[] = [
  "home",
  "adviser",
  "accounts",
  "transactions",
  "recurring",
  "circles",
  "splitBills",
  "budgeting",
  "goals",
  "investments",
  "more",
  "profile",
  "notifications",
  "help",
];
