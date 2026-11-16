import { normalizeCapturedError, recordAppError } from "@/lib/error-logs";

const getNavigationDigest = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return "";
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : "";
};

export const isNextNavigationSignal = (error: unknown) => {
  const digest = getNavigationDigest(error);
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND");
};

type ServerPageErrorInput = {
  error: unknown;
  source: string;
  route: string;
  userId?: string | null;
  clerkUserId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordServerPageError({
  error,
  source,
  route,
  userId,
  clerkUserId,
  workspaceId,
  metadata,
}: ServerPageErrorInput) {
  const details = normalizeCapturedError(error);

  // Page components render a friendly recovery state, so retain a sanitized
  // diagnostic in runtime logs without exposing financial payloads to users.
  console.error("[clover:server-page-error]", {
    source,
    route,
    name: details.name,
    message: details.message,
    digest: getNavigationDigest(error) || null,
  });

  await recordAppError({
    ...details,
    source,
    route,
    userId,
    clerkUserId,
    workspaceId,
    metadata: {
      ...metadata,
      digest: getNavigationDigest(error) || null,
      serverComponentRender: true,
    },
  }).catch(() => null);
}
