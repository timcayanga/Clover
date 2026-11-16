import type { CloverPlanTier } from './plan-catalog';
export const SIGNUP_TRIAL_SOURCE = 'signup_trial';
export const TRIAL_DAY_MS = 86_400_000;
export const TRIAL_DURATION_MS = 30 * TRIAL_DAY_MS;
export type TrialDates = { startsAt: Date; endsAt: Date; revokedAt: Date | null };
export type SignupTrialSnapshot = {
  startsAt: string; endsAt: string; status: 'active' | 'expired' | 'revoked';
  remainingDays: number; relyingOnTrial: boolean; linkedAccounts: 2;
};
export function trialActive(trial: TrialDates | null | undefined, now = new Date()) {
  return Boolean(trial && !trial.revokedAt && trial.startsAt <= now && now < trial.endsAt);
}
export function signupTrialEligible(createdAt: Date | null | undefined, rolloutAt: Date, now = new Date()) {
  return Boolean(createdAt && Number.isFinite(+createdAt) && createdAt >= rolloutAt && createdAt <= now);
}
export function trialSnapshot(trial: TrialDates | null | undefined, paid: boolean, tier: CloverPlanTier, now = new Date(), source = "trial"): SignupTrialSnapshot | null {
  if (!trial) return null;
  const status = trial.revokedAt ? 'revoked' : trialActive(trial, now) ? 'active' : 'expired';
  return { startsAt: trial.startsAt.toISOString(), endsAt: trial.endsAt.toISOString(), status,
    remainingDays: status === 'active' ? Math.ceil((+trial.endsAt - +now) / TRIAL_DAY_MS) : 0,
    relyingOnTrial: status === 'active' && !paid && tier === 'pro' && source === "trial", linkedAccounts: 2 };
}
export type TrialMilestone = 'seven_days' | 'one_day' | 'expired';
/** One current window only: late jobs never emit a burst of old countdowns. */
export function trialMilestone(trial: TrialDates, now = new Date()): TrialMilestone | null {
  if (trial.revokedAt || now < trial.startsAt) return null;
  const left = +trial.endsAt - +now;
  if (left <= 0) return left > -TRIAL_DAY_MS ? 'expired' : null;
  if (left <= TRIAL_DAY_MS) return 'one_day';
  if (left <= 7 * TRIAL_DAY_MS && left > 6 * TRIAL_DAY_MS) return 'seven_days';
  return null;
}
export const TRIAL_PURCHASE_COPY = 'A paid plan starts when your payment provider confirms the purchase and may charge immediately. Your original trial end date stays the same; unused trial days do not extend or delay billing. No payment is taken automatically when this trial ends.';
export function trialDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value)) + ' (Philippine time)';
}
export function trialPresentation(trial: SignupTrialSnapshot | null | undefined) {
  if (!trial || trial.status === 'revoked') return null;
  if (trial.status === 'expired') return { title: 'Your Clover Plus trial has ended', body: 'Your financial history and existing records stay available. Your current plan determines paid features and bank syncing.' };
  return { title: trial.relyingOnTrial ? 'You have 30 days of Clover Plus.' : 'Your original Clover Plus trial', body: `No card required. ${trial.remainingDays} day${trial.remainingDays === 1 ? '' : 's'} remaining, until ${trialDateLabel(trial.endsAt)}. Includes two linked accounts across all Profiles. Without other valid access, your plan returns to Free and bank syncing stops; your imported history stays available.` };
}
