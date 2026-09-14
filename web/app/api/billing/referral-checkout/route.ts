import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { prepareReferralCheckout } from "@/lib/growth";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { getVerifiedBillingOffers } from "@/lib/billing-offers.server";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401 },
      );
    const body = z
      .object({
        provider: z.enum(["paypal", "paddle"]),
        planId: z.string().min(1).max(100),
        code: z.string().max(64).default(""),
      })
      .parse(await request.json());
    const offers = await getVerifiedBillingOffers(request.headers.get("x-vercel-ip-country") ?? "");
    if (!Object.values(offers[body.provider]).includes(body.planId)) {
      return NextResponse.json({ error: "Checkout is temporarily unavailable for the advertised regional price. You can keep using Clover Free." }, { status: 409 });
    }
    const user = await getOrCreateCurrentUser(userId);
    const result = await prepareReferralCheckout(
      user.id,
      body.provider,
      body.planId,
      body.code,
      request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "",
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare checkout.",
      },
      { status: 400 },
    );
  }
}
