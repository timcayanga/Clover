import { prisma } from "./prisma";
import { audienceProperties, classifyAnalyticsIdentity, measurementConfig, syntheticSuffixes } from "./analytics-audience-rules";
import type { Prisma } from "@prisma/client";

// One small read per request via React.cache; no global identity cache across revocations/deletions.
import { cache } from "react";
export const analyticsStaffIds = cache(async () => (await prisma.adminMember.findMany({ where: { active: true }, select: { clerkUserId: true } })).map(x => x.clerkUserId));
const resolveAnalyticsAudience = async (clerkUserId: string, email?: string) => {
  try {
    const identity = email === undefined ? await prisma.user.findUnique({ where: clerkUserId.startsWith("user_") ? { clerkUserId } : { id: clerkUserId }, select: { clerkUserId: true, email: true } }) : { clerkUserId, email };
    if (!identity) return audienceProperties("unknown");
    const known = classifyAnalyticsIdentity(identity);
    if (known.analytics_excluded) return known;
    const member = await prisma.adminMember.findUnique({ where: { clerkUserId: identity.clerkUserId }, select: { active: true } });
    return classifyAnalyticsIdentity(identity, member?.active === true);
  } catch { return audienceProperties("unknown"); }
};
export const getAnalyticsAudience = cache(async (clerkUserId: string, email?: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([resolveAnalyticsAudience(clerkUserId, email), new Promise<ReturnType<typeof audienceProperties>>(resolve => { timer = setTimeout(() => resolve(audienceProperties("unknown")), 500); })]);
  } finally { if (timer) clearTimeout(timer); }
});
export async function customerAnalyticsUserWhere(environment: string): Promise<Prisma.UserWhereInput> {
  const c = measurementConfig(), assigned = await analyticsStaffIds();
  return { environment, NOT: [
    { clerkUserId: { in: [...c.staffIds, ...c.testIds, ...assigned] } },
    { email: { in: [...c.staffEmails, ...c.testEmails], mode: "insensitive" } },
    ...syntheticSuffixes.map(suffix => ({ email: { endsWith: suffix, mode: "insensitive" as const } })),
  ] };
}

/** Include old database-id aliases as well as Clerk ids in historical measurement. */
export const analyticsExcludedIds = cache(async (environment: string) => {
  const c = measurementConfig(), staff = await analyticsStaffIds();
  const ids = [...c.staffIds, ...c.testIds, ...staff];
  const users = await prisma.user.findMany({ where: { environment, OR: [
    { clerkUserId: { in: ids } },
    { email: { in: [...c.staffEmails, ...c.testEmails], mode: "insensitive" } },
    ...syntheticSuffixes.map(suffix => ({ email: { endsWith: suffix, mode: "insensitive" as const } })),
  ] }, select: { id: true, clerkUserId: true } });
  return [...new Set([...ids, ...users.flatMap(user => [user.id, user.clerkUserId])])];
});
