import { PLAN_CATALOG, type CloverPlanTier } from './plan-catalog';
export type OnboardingStage = 'upgrade' | 'experience' | 'upload';
export const ONBOARDING_PAID_TIERS = ['pro', 'premium'] as const;
export const onboardingCanConnect = (tier: unknown) => tier === 'pro' || tier === 'premium';
export function onboardingPlanBenefits(tier: 'pro' | 'premium') {
  const plan = PLAN_CATALOG[tier];
  return [`${plan.linkedBanks} linked bank accounts · automatic sync`, `${plan.profiles} Profiles · ${plan.accounts} non-cash accounts`, `${plan.budgets} budgets, goals and Circles`, 'Advanced Reports and Ask Clover'];
}
export type OnboardingUpgradeDraft = { step: OnboardingStage; returnStep: 'experience' | 'upload'; experience: 'beginner' | 'comfortable' | 'advanced' | null; pending: boolean };
export function readOnboardingUpgradeDraft(raw: string | null): OnboardingUpgradeDraft | null {
  try { const d = JSON.parse(raw ?? 'null');
    if (!d || !['upgrade','experience','upload'].includes(d.step) || !['experience','upload'].includes(d.returnStep) || ![null,'beginner','comfortable','advanced'].includes(d.experience) || typeof d.pending !== 'boolean') return null;
    // A forged or incomplete draft cannot skip the knowledge question.
    if ((d.step === 'upload' || d.returnStep === 'upload') && !d.experience) return null;
    return { step:d.step, returnStep:d.returnStep, experience:d.experience, pending:d.pending };
  } catch { return null; }
}
export function stageAfterVerifiedUpgrade(tier: CloverPlanTier, returnStep: 'experience' | 'upload', experience: unknown): OnboardingStage {
  return onboardingCanConnect(tier) ? returnStep === 'upload' && experience ? 'upload' : 'experience' : 'upgrade';
}
