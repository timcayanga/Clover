export type HomeNextStepCounts = {
  transactionCount: number;
  recurringCount: number;
  statementCount: number;
};

// These counts come from unresolved review queues, never onboarding history.
export function buildHomeNextSteps(counts: HomeNextStepCounts) {
  return [
    {
      id: "transactions",
      count: counts.transactionCount,
      title: "Review transactions",
      description: "Confirm or correct the details Clover needs you to check.",
      href: "/review",
    },
    {
      id: "recurring",
      count: counts.recurringCount,
      title: "Review recurring suggestions",
      description: "Keep or dismiss the repeat payments Clover found.",
      href: "/recurring",
    },
    {
      id: "statements",
      count: counts.statementCount,
      title: "Review payment reminders",
      description: "Check suggested payments from your statements.",
      href: "/recurring",
    },
  ].filter((step) => step.count > 0);
}
