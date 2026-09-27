import { prisma } from "./prisma";
import { AI_CONSENT_VERSION, hasCurrentAiConsent, type AiConsent } from "../../shared/ai-consent";
import { z } from "zod";
export const aiConsentDecision = z.object({ allow: z.boolean(), version: z.literal(AI_CONSENT_VERSION) }).strict();
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export async function getAiConsent(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { appPreferences: true, clerkUserId: true } });
  const consent = object(user.appPreferences).aiConsent;
  return { allowed: user.clerkUserId !== "staging-guest" && hasCurrentAiConsent(consent), version: AI_CONSENT_VERSION };
}
export async function setAiConsent(userId: string, input: unknown) {
  const { allow } = aiConsentDecision.parse(input);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { appPreferences: true, clerkUserId: true } });
    if (user.clerkUserId === "staging-guest") throw new Error("Sign in to manage AI permission.");
    const previous = object(user.appPreferences);
    const consent: AiConsent = { version: AI_CONSENT_VERSION, grantedAt: allow ? new Date().toISOString() : null, withdrawnAt: allow ? null : new Date().toISOString() };
    await tx.user.update({ where: { id: userId }, data: { appPreferences: JSON.parse(JSON.stringify({ ...previous, aiConsent: consent })) } });
    const workspace = await tx.workspace.findFirst({ where: { userId }, select: { id: true } });
    if (workspace) await tx.auditLog.create({ data: { workspaceId: workspace.id, actorUserId: userId, action: allow ? "privacy.ai_consent_granted" : "privacy.ai_consent_withdrawn", entity: "User", entityId: userId, metadata: consent } });
  });
  return { allowed: allow, version: AI_CONSENT_VERSION };
}
/** Fail closed before each external transmission, including retries after withdrawal. */
export async function maySendToCloudAi(userId?: string | null) {
  if (!userId) return false;
  try { return (await getAiConsent(userId)).allowed; } catch { return false; }
}
export async function assertCloudAiConsent(userId: string) {
  if (!(await maySendToCloudAi(userId))) throw new Error("Allow AI processing in Privacy and Data Use before using cloud AI.");
}
