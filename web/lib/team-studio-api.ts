import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertTrustedRequestOrigin } from "./request-security";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
export async function readStudioJson(request: Request, maxBytes = 2_000_000) {
  try {
    assertTrustedRequestOrigin(request);
  } catch {
    throw new Error("UNTRUSTED_ORIGIN");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("INVALID_STATE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_STATE");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("INVALID_STATE");
  }
}
export function studioError(error: unknown) {
  const name = error instanceof Error ? error.message : "";
  const errors: Record<string, [number, string]> = {
    ASSIGNMENT_SUPERSEDED: [
      409,
      "Another revision already exists. Your feedback was not submitted. Open the latest version before requesting changes.",
    ],
    SOURCE_NOT_APPROVED: [
      409,
      "Approve the latest source result before creating or starting follow-up work.",
    ],
    STUDIO_CAPACITY: [
      409,
      "This workspace has reached its saved-item limit. Your existing work is safe.",
    ],
    AGENT_UNAVAILABLE: [
      503,
      "Agent execution is not configured or is paused. Your brief is saved.",
    ],
    ASSIGNMENT_NOT_FOUND: [404, "This assignment is unavailable."],
    INVALID_ASSIGNMENT: [
      409,
      "This assignment cannot be started or reviewed in its current state. Refresh and check the latest version.",
    ],
    IMAGE_LIMIT: [429, "You can start up to 5 image assignments per UTC day, including revisions and retries."],
    ASSIGNMENT_LIMIT: [
      429,
      "You can run up to 3 assignments at once and start 20 per UTC day, including retries. Please try later.",
    ],
    AGENT_REFRESH_FAILED: [
      503,
      "Could not check progress. The saved assignment is safe; try refreshing shortly.",
    ],
    UNAUTHORIZED: [401, "Please sign in again."],
    FORBIDDEN: [403, "Owner access is required."],
    UNTRUSTED_ORIGIN: [
      403,
      "This request did not originate from the workspace.",
    ],
    CONFLICT: [
      409,
      "This workspace changed on another tab or device. Copy your unsaved edits, then reload before saving.",
    ],
    INVALID_STATE: [400, "The submitted workspace is invalid."],
    BODY_TOO_LARGE: [413, "This request is too large."],
    MEDIA_NOT_FOUND: [404, "The media is unavailable."],
    INVALID_MEDIA: [
      400,
      "The uploaded media does not match its declared type or size.",
    ],
    STORAGE_UNAVAILABLE: [503, "Private media storage is not configured yet."],
    UPLOAD_LIMIT: [429, "Too many uploads. Please try again later."],
  };
  const [status, message] =
    error instanceof ZodError
      ? [400, "The submitted fields are invalid."]
      : (errors[name] ?? [
          503,
          "Workspace storage is unavailable. Your edits have not been saved; please try again.",
        ]);
  return NextResponse.json(
    { error: message },
    { status, headers: privateHeaders },
  );
}
