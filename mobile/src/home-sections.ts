import { buildHomeAdviserInsights, type HomeInsight } from "../../shared/home-adviser-insights";
type NextStep = { id: string; title: string; description: string; count: number; href: string };
export type HomeBudget = { id: string; name: string; currency: string; actualAmount: number; targetAmount: number; progressPercent: number; statusLabel: string; periodLabel: string; isAtRisk: boolean };
export type HomeDetails = { budgets: HomeBudget[]; nextSteps: NextStep[]; paymentTitles: string[]; recurringCount: number };
export type HomeSections = {
  budgets?: HomeBudget[]; nextSteps?: NextStep[]; insights?: HomeInsight[];
  insightInput?: Parameters<typeof buildHomeAdviserInsights>[0]; detailsPending?: boolean;
};
export function mergeHomeDetails<T extends HomeSections>(overview: T, details: HomeDetails | null): T {
  if (!details || !overview.detailsPending) return overview;
  return {
    ...overview, detailsPending: false, budgets: details.budgets,
    nextSteps: [...(overview.nextSteps ?? []).filter(s => s.id === 'transactions'), ...details.nextSteps],
    insights: overview.insightInput ? buildHomeAdviserInsights({ ...overview.insightInput, paymentTitles: details.paymentTitles, recurringCount: details.recurringCount }) : overview.insights,
  };
}
