import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getAiConsent, setAiConsent } from "@/lib/ai-consent";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { const { userId } = await requireAuth(); const user = await getOrCreateCurrentUser(userId); return Response.json(await getAiConsent(user.id), { headers }); }
  catch { return Response.json({ error: "Unable to load AI permission." }, { status: 401, headers }); }
}
export async function POST(request: Request) {
  try { assertTrustedRequestOrigin(request); const { userId } = await requireAuth(); const user = await getOrCreateCurrentUser(userId); return Response.json(await setAiConsent(user.id, await request.json()), { headers }); }
  catch { return Response.json({ error: "Unable to save AI permission. Please retry." }, { status: 400, headers }); }
}
