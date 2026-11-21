/** Read-only projection from explicit planning assumptions; never changes a goal. */
export type AdviserSavingsPlan = {
  fractionDigits: number; target: number; startingAmount: number; months: number; monthlyContribution: number;
  monthlyIncome: number | null; monthlyExpenses: number | null; monthlyBuffer: number | null;
  confidence: { score: number; label: 'high' }; basis: 'user_assumptions';
  points: Array<{month: number; amount: number}>;
};
export const savingsColors = ['#03a8c0', '#62b991', '#e6b953', '#ef9c70', '#799ed6', '#af88ca', '#5ed3d0', '#719b8f'];
export const moneyRound = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function savingsPoints(target: number, startingAmount: number, months: number, monthlyContribution: number, fractionDigits = 2) {
  const checkpoints = [...new Set(Array.from({length: Math.min(months, 8)}, (_, i) => Math.ceil((i + 1) * months / Math.min(months, 8))))];
  return checkpoints.map(month => ({month, amount: Number(Math.min(target, startingAmount + month * monthlyContribution).toFixed(fractionDigits))}));
}
export function parseAdviserSavingsPlan(value: unknown): AdviserSavingsPlan | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as AdviserSavingsPlan;
  if (!Number.isInteger(p.fractionDigits) || p.fractionDigits < 0 || p.fractionDigits > 3) return null;
  if (p.basis !== 'user_assumptions' || !Number.isFinite(p.target) || p.target <= 0 || p.target > 1e12 || !Number.isFinite(p.startingAmount) || p.startingAmount < 0 || p.startingAmount > p.target || !Number.isInteger(p.months) || p.months < 1 || p.months > 120 || !Number.isFinite(p.monthlyContribution) || p.monthlyContribution < 0) return null;
  const required = Math.ceil((p.target - p.startingAmount) * 10 ** p.fractionDigits / p.months) / 10 ** p.fractionDigits;
  if (Math.abs(required - p.monthlyContribution) > .001 || !p.confidence || p.confidence.score !== 100 || p.confidence.label !== 'high') return null;
  if ([p.monthlyIncome,p.monthlyExpenses].some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e12))) return null;
  const buffer = p.monthlyIncome !== null && p.monthlyExpenses !== null ? Number((p.monthlyIncome - p.monthlyExpenses - required).toFixed(p.fractionDigits)) : null;
  if (p.monthlyBuffer !== buffer) return null;
  const points = savingsPoints(p.target,p.startingAmount,p.months,required,p.fractionDigits);
  if (!Array.isArray(p.points) || p.points.length !== points.length || p.points.some((v,i) => v.month !== points[i].month || v.amount !== points[i].amount)) return null;
  return {fractionDigits:p.fractionDigits,target:p.target,startingAmount:p.startingAmount,months:p.months,monthlyContribution:required,monthlyIncome:p.monthlyIncome,monthlyExpenses:p.monthlyExpenses,monthlyBuffer:buffer,basis:'user_assumptions',confidence:{score:100,label:'high'},points};
}
