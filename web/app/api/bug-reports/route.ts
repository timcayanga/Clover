import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { createContactInquiry } from "@/lib/contact-inquiries";
import { sendContactInquiryEmail } from "@/lib/contact-email";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { assertContentLengthWithin, assertTrustedRequestOrigin, getRequestClientIp } from "@/lib/request-security";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_DATA_URL_LENGTH = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 512;

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(128).refine((value) => value.startsWith("image/"), "Attachment must be an image."),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
  dataUrl: z.string().trim().min(1).max(MAX_ATTACHMENT_DATA_URL_LENGTH).refine((value) => value.startsWith("data:image/"), "Attachment must be an image."),
});

const diagnosticSchema = z.object({
  kind: z.enum(["navigation", "runtime_error", "unhandled_rejection"]),
  message: z.string().trim().min(1).max(600),
  route: z.string().trim().max(255),
  occurredAt: z.string().datetime(),
});

const schema = z.object({
  report: z.string().trim().min(10).max(4000),
  attachment: attachmentSchema.nullable().optional(),
  workspaceId: z.string().trim().min(1).max(120),
  sourcePage: z.string().trim().min(1).max(2048),
  clientDiagnostics: z.array(diagnosticSchema).max(24).default([]),
  device: z.object({
    viewport: z.string().trim().max(40),
    screen: z.string().trim().max(40),
    pixelRatio: z.number().finite().min(0.1).max(20),
    locale: z.string().trim().max(80),
    timezone: z.string().trim().max(120),
    online: z.boolean(),
    buildId: z.string().trim().max(160),
  }),
});

const safeSourcePath = (value: string, requestUrl: string) => {
  try {
    const url = new URL(value, requestUrl);
    return url.pathname.slice(0, 255);
  } catch {
    return "/unknown";
  }
};

const formatDiagnostics = (input: {
  sourcePath: string;
  device: z.infer<typeof schema>["device"];
  clientDiagnostics: z.infer<typeof diagnosticSchema>[];
  serverLogs: Array<{
    occurredAt: Date;
    name: string | null;
    message: string;
    source: string;
    route: string | null;
    statusCode: number | null;
    buildId: string;
  }>;
}) => {
  const clientLines = input.clientDiagnostics.length
    ? input.clientDiagnostics.map(
        (entry) => `- ${entry.occurredAt} | ${entry.kind} | ${entry.route || input.sourcePath} | ${entry.message}`
      )
    : ["- No browser runtime errors were captured in this session."];
  const serverLines = input.serverLogs.length
    ? input.serverLogs.map(
        (entry) =>
          `- ${entry.occurredAt.toISOString()} | ${entry.name ?? "Error"} | ${entry.source} | ${entry.route ?? input.sourcePath} | ${entry.statusCode ?? "n/a"} | ${entry.buildId} | ${entry.message}`
      )
    : ["- No recent structured server errors were found for this user."];

  return [
    `Page: ${input.sourcePath}`,
    `Build: ${input.device.buildId}`,
    `Viewport: ${input.device.viewport}`,
    `Screen: ${input.device.screen} at ${input.device.pixelRatio}x`,
    `Locale/timezone: ${input.device.locale} / ${input.device.timezone}`,
    `Online: ${input.device.online ? "yes" : "no"}`,
    "",
    "Browser session log:",
    ...clientLines,
    "",
    "Recent Clover error log (last 24 hours, up to 12):",
    ...serverLines,
  ].join("\n");
};

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, MAX_BODY_BYTES);
    assertRateLimit(`bug-report:${getRequestClientIp(request)}`, 5, 15 * 60_000);

    const { userId: clerkUserId, isGuest } = await requireAuth();
    if (isGuest) {
      throw new Error("Please sign in before reporting a bug.");
    }
    const payload = schema.parse(await request.json());
    if (payload.attachment) {
      const expectedPrefix = `data:${payload.attachment.type};base64,`;
      const encoded = payload.attachment.dataUrl.startsWith(expectedPrefix)
        ? payload.attachment.dataUrl.slice(expectedPrefix.length)
        : "";
      if (!encoded || Buffer.from(encoded, "base64").byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error("The attached image is invalid or larger than 2 MB.");
      }
    }
    await assertWorkspaceAccess(clerkUserId, payload.workspaceId);

    const appUser = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!appUser) {
      throw new Error("Clover could not identify the signed-in account.");
    }

    const sourcePath = safeSourcePath(payload.sourcePage, request.url);
    const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const serverLogs = await prisma.appErrorLog.findMany({
      where: {
        occurredAt: { gte: recentSince },
        OR: [{ clerkUserId }, { userId: appUser.id }],
        AND: [{ OR: [{ workspaceId: payload.workspaceId }, { workspaceId: null }] }],
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: {
        occurredAt: true,
        name: true,
        message: true,
        source: true,
        route: true,
        statusCode: true,
        buildId: true,
      },
    });
    const diagnostics = formatDiagnostics({
      sourcePath,
      device: payload.device,
      clientDiagnostics: payload.clientDiagnostics,
      serverLogs,
    });
    const reporterName = [appUser.firstName, appUser.lastName].filter(Boolean).join(" ") || appUser.email.split("@")[0] || "Clover user";
    const storedMessage = `[Bug report]\n${payload.report}\n\n[Diagnostics]\n${diagnostics}`;
    const inquiry = await createContactInquiry({
      name: reporterName,
      email: appUser.email,
      message: storedMessage,
      attachment: payload.attachment ?? null,
      sourcePage: sourcePath,
      userAgent: request.headers.get("user-agent"),
    });

    after(async () => {
      try {
        await sendContactInquiryEmail({
          name: reporterName,
          email: appUser.email,
          message: payload.report,
          attachment: payload.attachment ?? null,
          sourcePage: sourcePath,
          kind: "bug_report",
          diagnostics,
        });
      } catch (error) {
        console.error("Bug report email delivery failed", error);
      }
    });

    void capturePostHogServerEvent("support_contacted", clerkUserId, {
      report_type: "bug_report",
      inquiry_source_page: sourcePath,
      has_attachment: Boolean(payload.attachment),
      browser_log_count: payload.clientDiagnostics.length,
      server_log_count: serverLogs.length,
    });

    return NextResponse.json({ ok: true, inquiryId: inquiry?.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit the bug report." },
      { status: 400 }
    );
  }
}
