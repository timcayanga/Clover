import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
type Item = {
  label: string;
  route: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};
export const navigationGroups: {
  title: string;
  icon: Item["icon"];
  items: Item[];
}[] = [
  {
    title: "Overview",
    icon: "home-outline",
    items: [{ label: "Home", route: "/", icon: "home-outline" }],
  },
  {
    title: "Understand",
    icon: "pie-chart-outline",
    items: [
      { label: "Reports", route: "/reports", icon: "pie-chart-outline" },
      {
        label: "Adviser",
        route: "/adviser",
        icon: "chatbubble-ellipses-outline",
      },
    ],
  },
  {
    title: "Money",
    icon: "business-outline",
    items: [
      { label: "Accounts", route: "/accounts", icon: "business-outline" },
      {
        label: "Transactions",
        route: "/transactions",
        icon: "swap-horizontal-outline",
      },
      { label: "Recurring", route: "/recurring", icon: "repeat-outline" },
    ],
  },
  {
    title: "Together",
    icon: "people-circle-outline",
    items: [
      { label: "Split Bills", route: "/split-bills", icon: "receipt-outline" },
      { label: "Circles", route: "/circles", icon: "people-circle-outline" },
    ],
  },
  {
    title: "Plan",
    icon: "wallet-outline",
    items: [
      { label: "Budgeting", route: "/budgeting", icon: "wallet-outline" },
      { label: "Goals", route: "/goals", icon: "flag-outline" },
      {
        label: "Investments",
        route: "/investments",
        icon: "trending-up-outline",
      },
    ],
  },
  {
    title: "Personal",
    icon: "person-outline",
    items: [
      { label: "Settings", route: "/settings", icon: "settings-outline" },
      { label: "Help", route: "/help", icon: "help-circle-outline" },
      {
        label: "Account & Profiles",
        route: "/account",
        icon: "person-outline",
      },
    ],
  },
];
