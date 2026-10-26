import { requireAdminAuth, getAdminDataEnvironment } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { deliverContactNotification } from "@/lib/contact-notification.server";
import { toAdminContactInquiry } from "@/lib/contact-inquiries";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { z } from "zod";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ inquiryId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    await requireAdminAuth("support");
    z.object({ retry: z.literal(true) })
      .strict()
      .parse(await request.json());
    const { inquiryId } = await context.params;
    await prisma.contactInquiry.findFirstOrThrow({
      where: { id: inquiryId, environment: getAdminDataEnvironment() },
      select: { id: true },
    });
    return Response.json(
      {
        inquiry: toAdminContactInquiry(
          await deliverContactNotification(inquiryId, true),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to send inquiry notification.";
    return Response.json(
      { error: message },
      {
        status:
          message === "FORBIDDEN"
            ? 403
            : message === "UNAUTHORIZED"
              ? 401
              : 400,
      },
    );
  }
}
