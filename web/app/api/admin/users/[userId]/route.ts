import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { updateAdminUser } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

const schema = z.object({
  firstName: z.union([z.string(), z.null()]).optional(),
  lastName: z.union([z.string(), z.null()]).optional(),
  email: z.string().email().optional(),
  planTier: z.enum(["free", "pro"]).optional(),
  planTierLocked: z.boolean().optional(),
  accountLimit: z.number().int().nullable().optional(),
  monthlyUploadLimit: z.number().int().nullable().optional(),
  transactionLimit: z.number().int().nullable().optional(),
  verified: z.boolean().optional(),
  financialExperience: z.enum(["beginner", "comfortable", "advanced"]).nullable().optional(),
  primaryGoal: z.union([z.string(), z.null()]).optional(),
  goalTargetAmount: z.union([z.string(), z.null()]).optional(),
  goalTargetSource: z.union([z.string(), z.null()]).optional(),
  onboardingCompletedAt: z.union([z.string(), z.null()]).optional(),
  dataWipedAt: z.union([z.string(), z.null()]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdminAuth();
    const { userId } = await context.params;
    const payload = schema.parse(await request.json());
    const updated = await updateAdminUser(userId, payload);

    return NextResponse.json({ user: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update user.";

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (message.includes("Another user already uses that email address.")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
