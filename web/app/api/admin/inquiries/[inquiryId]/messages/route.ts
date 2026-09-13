import { requireAdminAuth, getAdminDataEnvironment } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { addSupportMessage } from "@/lib/admin-support-messages";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unable to load messages.";
  return Response.json(
    { error: message },
    {
      status:
        message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 400,
    },
  );
}
export async function GET(
  request: Request,
  context: { params: Promise<{ inquiryId: string }> },
) {
  try {
    await requireAdminAuth();
    const { inquiryId } = await context.params;
    await prisma.contactInquiry.findFirstOrThrow({
      where: { id: inquiryId, environment: getAdminDataEnvironment() },
      select: { id: true },
    });
    const before = new URL(request.url).searchParams.get("before");
    const cursor = before ? await prisma.adminSupportMessage.findFirstOrThrow({ where: { id: before, inquiryId }, select: { id: true } }) : null;
    const rows = await prisma.adminSupportMessage.findMany({
      where: { inquiryId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 201,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 200);
    return Response.json({ messages: [...page].reverse(), nextCursor: rows.length > 200 ? page.at(-1)?.id : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ inquiryId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("support");
    const { inquiryId } = await context.params;
    return Response.json({
      message: await addSupportMessage(
        inquiryId,
        actor.userId,
        await request.json(),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
