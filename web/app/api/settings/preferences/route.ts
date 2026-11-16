import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getAppPreferences, updateAppPreferences } from "@/lib/app-preferences";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    return Response.json({ preferences: await getAppPreferences(user.id) }, { headers });
  } catch { return Response.json({ error: "Unable to load preferences." }, { status: 401, headers }); }
}
export async function PATCH(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const raw = await request.text();
    if (raw.length > 8192) throw new Error("Preferences payload is too large.");
    return Response.json({ preferences: await updateAppPreferences(user.id, JSON.parse(raw)) }, { headers });
  } catch { return Response.json({ error: "Unable to save preferences. Check your choices and try again." }, { status: 400, headers }); }
}
