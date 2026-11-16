import type { Prisma } from '@prisma/client';
import { calculateProAccess } from './pro-access-rules';
import { hasStagingProAccess, hasStagingQaAccess } from './user-limits';
/** Request/worker quota boundaries cannot rely on a scheduled refresh having run. */
export async function trialAwareUser(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { signupTrial: true, proGrants: true, billingSubscription: true, storeAccess: true } });
  if (!user.signupTrial) return user; // Preserve established legacy/admin policies.
  const access = calculateProAccess({ ...user, subscription: user.billingSubscription, grants: user.proGrants,
    stagingQaAccess: hasStagingProAccess(user), stagingQaPlanTier: hasStagingQaAccess(user) ? 'premium' : undefined }, now);
  return { ...user, planTier: access.planTier };
}
