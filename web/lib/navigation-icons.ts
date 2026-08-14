export const NAVIGATION_ICON_ASSET_ROOT = "/assets/3d%20icons/navigation";

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
  more: "more.png",
  notifications: "notifications.png",
  settings: "settings.png",
  help: "help.png",
  search: "search.png",
  profile: "account.png",
  signOut: "log out.png",
  profiles: "profiles.png",
  display: "display.png",
  data: "data.png",
  review: "review.png",
  categories: "categories.png",
  security: "security.png",
  region: "region.png",
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
