import type { Prisma } from '@prisma/client';
import { SIGNUP_TRIAL_SOURCE, TRIAL_DURATION_MS } from '../../shared/signup-trial';
/** Signup now starts on Free. Keep the evaluation marker for callback/bootstrap
 * compatibility, but never create or revive a trial or access grant. Existing
 * redemptions retain their original expiry and independent billing precedence.
 */
export async function ensureSignupTrial(tx: Prisma.TransactionClient, userId: string, _accountCreatedAt: Date | null | undefined, now = new Date()) {
  await tx.user.updateMany({
    where: { id: userId, signupTrialEvaluatedAt: null },
    data: { signupTrialEvaluatedAt: now },
  });
}
/** Called only from verified provider processing, never from checkout/client claims. */
export async function revokeSignupTrial(tx: Prisma.TransactionClient, userId: string, reason: string, now = new Date()) {
  const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  await tx.signupTrial.upsert({ where: { userId }, create: { userId, startsAt: owner.createdAt, endsAt: new Date(+owner.createdAt + TRIAL_DURATION_MS), revokedAt: now, revocationReason: reason }, update: {} });
  await tx.signupTrial.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revocationReason: reason } });
  await tx.proAccessGrant.updateMany({ where: { userId, source: SIGNUP_TRIAL_SOURCE, revokedAt: null }, data: { revokedAt: now } });
}
