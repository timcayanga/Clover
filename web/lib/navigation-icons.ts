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
  plan: "menu/plan.png",
  more: "more.png",
  notifications: "menu/notifications.png",
  settings: "menu/settings.png",
  help: "menu/help.png",
  search: "search.png",
  profile: "menu/account.png",
  signOut: "menu/log-out.png",
  profiles: "menu/profiles.png",
  display: "menu/display.png",
  data: "menu/data.png",
  review: "menu/review.png",
  categories: "menu/categories.png",
  security: "menu/security.png",
  region: "menu/region.png",
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
