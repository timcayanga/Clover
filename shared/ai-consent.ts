export const AI_CONSENT_VERSION = "2026-09-27-openai-v1";
export const AI_CONSENT_TITLE = "Allow AI processing?";
export const AI_CONSENT_DESCRIPTION = "Clover uses OpenAI to help read files and answer your financial questions. We send the text and images in files you choose to process with AI, your Ask Clover questions, and relevant financial records. Permission applies across your devices. You can withdraw it in Settings → Privacy and Data Use.";
export const AI_CONSENT_ALTERNATIVE = "Manual entry, bank connections and imports that do not need cloud AI remain available.";
export type AiConsent = { version: string; grantedAt: string | null; withdrawnAt: string | null };
export function hasCurrentAiConsent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const consent = value as Partial<AiConsent>;
  return consent.version === AI_CONSENT_VERSION && typeof consent.grantedAt === "string" && Number.isFinite(Date.parse(consent.grantedAt)) && consent.withdrawnAt === null;
}
