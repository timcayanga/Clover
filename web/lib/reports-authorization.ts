import { getSessionContext } from "./auth";
import { getMobileRequestContext } from "./mobile-request-context";
import { getOrCreateCurrentUser } from "./user-context";
import { assertWorkspaceAccess } from "./workspace-access";
import { z } from "zod";
export async function authorizeReports(request: Request) {
  const mobile = getMobileRequestContext();
  const session = mobile
    ? { userId: mobile.userId, isGuest: false }
    : await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  const workspaceId = z
    .string()
    .min(1)
    .max(128)
    .parse(new URL(request.url).searchParams.get("workspaceId"));
  await assertWorkspaceAccess(user.clerkUserId, workspaceId);
  return { user, workspaceId, isGuest: session.isGuest };
}
export const reportResponse = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
