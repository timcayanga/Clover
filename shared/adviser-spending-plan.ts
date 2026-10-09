/** A display-only view of the deterministic calculation, never editable balances. */
export type AdviserSpendingPlan = {
  horizonDays: number; availableCash: number; expectedIncome: number;
  knownObligations: number; everydaySpendingBuffer: number; goalContribution: number;
  additionalBuffer: number; safeToSpend: number; roomAfterProtection: number;
  confidence: { label: string; score: number }; caveats: string[];
};
export const spendingPlanRows = (s: AdviserSpendingPlan) => [
  { label: 'Bills + shared payments', amount: s.knownObligations, color: '#a58ad7', icon: 'recurring' },
  { label: 'Everyday spending', amount: s.everydaySpendingBuffer, color: '#e3af53', icon: 'budgeting' },
  { label: 'Goal contributions', amount: s.goalContribution, color: '#62b991', icon: 'goals' },
  { label: 'Extra buffer', amount: s.additionalBuffer, color: '#719adc', icon: 'security' },
];
export function parseAdviserSpendingPlan(value: unknown): AdviserSpendingPlan | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as AdviserSpendingPlan;
  const fields = ['availableCash','expectedIncome','knownObligations','everydaySpendingBuffer','goalContribution','additionalBuffer','safeToSpend'] as const;
  if (!Number.isInteger(s.horizonDays) || s.horizonDays < 1 || s.horizonDays > 90 || fields.some(k => typeof s[k] !== 'number' || !Number.isFinite(s[k]) || s[k] < 0) || !Number.isFinite(s.roomAfterProtection)) return null;
  if (!s.confidence || !['high','medium','low'].includes(s.confidence.label) || !Number.isFinite(s.confidence.score) || s.confidence.score < 0 || s.confidence.score > 100) return null;
  if (!Array.isArray(s.caveats) || s.caveats.length > 30 || s.caveats.some(c => typeof c !== 'string' || c.length > 1500)) return null;
  const calculated = s.availableCash + s.expectedIncome - spendingPlanRows(s).reduce((n, row) => n + row.amount, 0);
  if (Math.abs(calculated - s.roomAfterProtection) > .02 || Math.abs(Math.max(0, calculated) - s.safeToSpend) > .02) return null;
  return { horizonDays:s.horizonDays, ...Object.fromEntries(fields.map(k => [k,s[k]])), roomAfterProtection:s.roomAfterProtection, confidence:{label:s.confidence.label,score:s.confidence.score}, caveats:[...s.caveats] } as AdviserSpendingPlan;
}
