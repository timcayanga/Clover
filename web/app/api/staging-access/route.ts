import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1),
});

const cookieName = "clover_staging_access";

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const expectedUsername = process.env.STAGING_BASIC_AUTH_USERNAME ?? "staging";
    const expectedPassword = process.env.STAGING_BASIC_AUTH_PASSWORD ?? "";

    if (!expectedPassword) {
      return NextResponse.json({ error: "Staging password is not configured" }, { status: 500 });
    }

    const [providedUsername, providedPassword] = payload.password.includes(":")
      ? payload.password.split(":", 2)
      : [expectedUsername, payload.password];

    if (providedUsername !== expectedUsername || providedPassword !== expectedPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to verify staging access" }, { status: 400 });
  }
}
