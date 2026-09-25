import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getPlanRetentionSnapshot } from "@/lib/plan-retention.server";
export const dynamic = "force-dynamic";
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to view plan usage." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { clerkUserId: userId }, select: { id: true } });
  if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
  return Response.json(await getPlanRetentionSnapshot(user.id), { headers: { "Cache-Control": "private, no-store" } });
}
