import { auth } from "@clerk/nextjs/server";
import { getVerifiedBillingOffers } from "@/lib/billing-offers.server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to view your offers." }, { status: 401 });
  const offers = await getVerifiedBillingOffers(request.headers.get("x-vercel-ip-country") ?? "");
  return Response.json(offers, { headers: { "Cache-Control": "private, no-store" } });
}
