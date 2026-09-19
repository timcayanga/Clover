import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { listAdviserConversations, loadAdviserConversation, saveAdviserConversation } from "@/lib/adviser-history-store";
import { adviserHistoryInput } from "@/lib/adviser-history";

export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorize(request: Request) {
  const userId = getMobileRequestContext()?.userId ?? (await getSessionContext()).userId;
  const user = await getOrCreateCurrentUser(userId);
  const workspaceId = z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("workspaceId"));
  await assertWorkspaceAccess(user.clerkUserId, workspaceId);
  return { user, workspaceId };
}
export async function GET(request: Request) {
  try {
    const { user, workspaceId } = await authorize(request);
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      z.string().uuid().parse(id);
      const conversation = await loadAdviserConversation(user.id,workspaceId,id);
      return conversation ? respond({conversation}) : respond({error:"Chat not found in this Profile."},404);
    }
    const conversations = await listAdviserConversations(user.id,workspaceId);
    return respond({ conversations, firstName: user.firstName });
  } catch { return respond({error:"Unable to load chats for this Profile."},403); }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { user, workspaceId } = await authorize(request);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 500000) return respond({error:"This conversation is too long. Start a new chat."},413);
    const input = adviserHistoryInput.parse(JSON.parse(text));
    const revision = await saveAdviserConversation(user.id,workspaceId,input);
    if (!revision) return respond({error:"This chat changed elsewhere. Reopen it from Your chats before continuing."},409);
    return respond({revision});
  } catch { return respond({error:"Unable to save chat history. Your conversation is still on this screen."},400); }
}
