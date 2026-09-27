export const NAVIGATION_ICON_ASSET_ROOT = "/assets/3d%20icons/navigation/figma-v2";

export const NAVIGATION_ICON_SOURCE_FILES = {
  home: "home.png",
  accounts: "bank account.png",
  investments: "investments.png",
  splitBills: "split bills.png",
  circles: "circles.png",
  transactions: "transactions.png",
  recurring: "recurring.png",
  reports: "reports.png",
  adviser: "adviser.png",
  budgeting: "budgeting.png",
  goals: "goals.png",
  plan: "figma-current/plan.png",
  more: "more.png",
  notifications: "figma-current/notifications.png",
  settings: "settings.png",
  help: "figma-current/help.png",
  search: "search.png",
  profile: "figma-current/profile.png",
  signOut: "log out.png",
  profiles: "figma-current/profiles.png",
  display: "figma-current/display.png",
  data: "figma-current/data.png",
  review: "figma-current/review.png",
  categories: "figma-current/categories.png",
  security: "figma-current/security.png",
  region: "figma-current/region.png",
} as const;

export type NavigationIconName = keyof typeof NAVIGATION_ICON_SOURCE_FILES;

export const getNavigationIconSrc = (name: NavigationIconName) =>
  `${NAVIGATION_ICON_ASSET_ROOT}/${name}.webp`;

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
