import { requireAdminAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getAdminContactInquiries } from "@/lib/contact-inquiries";
export async function GET(request: Request) {
  try {
    const actor = await requireAdminAuth();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const result = await getAdminContactInquiries({
      query: params.get("query") ?? "",
      page,
      pageSize: 50,
      queue: params.get("queue") ?? "all",
      actorId: actor.userId,
    });
    const members = await prisma.adminMember.findMany({
      where: { active: true, role: { in: ["owner", "admin", "support"] } },
      select: { clerkUserId: true, role: true },
      orderBy: { clerkUserId: "asc" },
    });
    if (
      actor.role !== "read_only" &&
      !members.some((m) => m.clerkUserId === actor.userId)
    )
      members.push({ clerkUserId: actor.userId, role: actor.role });
    return Response.json({
      ...result,
      actorId: actor.userId,
      role: actor.role,
      members,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load work queue.";
    return Response.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 403 },
    );
  }
}
