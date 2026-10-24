import type { Prisma } from '@prisma/client';
import { SIGNUP_TRIAL_SOURCE, signupTrialEligible, TRIAL_DURATION_MS } from '../../shared/signup-trial';
/** Identity creation and redemption run inside the same Clerk identity lock. */
export async function ensureSignupTrial(tx: Prisma.TransactionClient, userId: string, accountCreatedAt: Date | null | undefined, now = new Date()) {
  if (!accountCreatedAt || !Number.isFinite(+accountCreatedAt)) return;
  const policy = await tx.signupTrialPolicy.findUnique({ where: { id: 'signup-plus-v1' } });
  if (!policy) return;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.signupTrialEvaluatedAt) return;
  await tx.user.update({ where: { id: userId }, data: { signupTrialEvaluatedAt: now } });
  if (user.createdAt < policy.startsAt || !signupTrialEligible(accountCreatedAt, policy.startsAt, now)) return;
  const trial = await tx.signupTrial.upsert({ where: { userId }, update: {}, create: {
    userId, startsAt: accountCreatedAt!, endsAt: new Date(+accountCreatedAt! + TRIAL_DURATION_MS),
  } });
  // Upsert has an empty update: retries cannot extend/revive a revoked redemption.
  await tx.proAccessGrant.upsert({ where: { rewardId: `signup-trial:${trial.id}` }, update: {}, create: {
    userId, planTier: 'pro', startsAt: trial.startsAt, endsAt: trial.endsAt,
    revokedAt: trial.revokedAt, source: SIGNUP_TRIAL_SOURCE, actorId: 'system',
    reason: '30-day signup Plus trial; no card required', rewardId: `signup-trial:${trial.id}`,
  } });
}
/** Called only from verified provider processing, never from checkout/client claims. */
export async function revokeSignupTrial(tx: Prisma.TransactionClient, userId: string, reason: string, now = new Date()) {
  const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  await tx.signupTrial.upsert({ where: { userId }, create: { userId, startsAt: owner.createdAt, endsAt: new Date(+owner.createdAt + TRIAL_DURATION_MS), revokedAt: now, revocationReason: reason }, update: {} });
  await tx.signupTrial.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revocationReason: reason } });
  await tx.proAccessGrant.updateMany({ where: { userId, source: SIGNUP_TRIAL_SOURCE, revokedAt: null }, data: { revokedAt: now } });
}
