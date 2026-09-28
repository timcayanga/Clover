export const NAVIGATION_ICON_ASSET_ROOT = "/assets/3d%20icons/navigation/figma-v5";

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
  plan: "menu-transparent/plan.png",
  more: "more.png",
  notifications: "menu-transparent/notifications.png",
  settings: "menu-transparent/settings.png",
  help: "menu-transparent/help.png",
  search: "search.png",
  profile: "menu-transparent/profile.png",
  signOut: "menu-transparent/signOut.png",
  profiles: "menu/profiles.png",
  display: "menu/display.png",
  data: "menu/data.png",
  review: "menu/review.png",
  categories: "menu/categories.png",
  security: "menu-transparent/security.png",
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
