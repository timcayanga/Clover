// Shared by the main menu and mobile Home feature grid.
export const FEATURE_NAVIGATION = [
  {
    label: "Understand",
    icon: "reports" as const,
    items: [
      { href: "/reports", label: "Reports", key: "reports" as const },
      { href: "/adviser", label: "Adviser", key: "adviser" as const },
    ],
  },
  {
    label: "Money",
    icon: "accounts" as const,
    items: [
      { href: "/accounts", label: "Accounts", key: "accounts" as const },
      { href: "/transactions", label: "Transactions", key: "transactions" as const },
      { href: "/recurring", label: "Recurring", key: "recurring" as const },
    ],
  },
  {
    label: "Together",
    icon: "circles" as const,
    items: [
      { href: "/split-bill", label: "Split Bills", key: "split-bill" as const },
      { href: "/circles", label: "Circles", key: "circles" as const },
    ],
  },
  {
    label: "Plan",
    icon: "plan" as const,
    items: [
      { href: "/budgeting", label: "Budgeting", key: "budgeting" as const },
      { href: "/goals", label: "Goals", key: "goals" as const },
      { href: "/investments", label: "Investments", key: "investments" as const },
    ],
  },
] as const;
