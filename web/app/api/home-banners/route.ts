import { auth } from "@clerk/nextjs/server";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { homeBannersForUser } from "@/lib/home-banners.server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { userId } = getMobileRequestContext() ?? await auth();
    if (!userId) return Response.json({ banners: [] }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const user = await getOrCreateCurrentUser(userId);
    return Response.json(await homeBannersForUser(user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Offers are unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
