import { getSessionContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProAccess } from "@/lib/pro-access";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
export async function GET() {
  try {
    const session = await getSessionContext();
    const user = await prisma.user.findFirstOrThrow({ where: { clerkUserId: session.userId, environment: getDeploymentEnvironment() }, select: { id: true } });
    return Response.json((await getProAccess(user.id)).analytics, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
}
