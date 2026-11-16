import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeReports, reportResponse } from "@/lib/reports-authorization";
import { reportViewSchema } from "@/lib/report-view";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { getProAccess } from "@/lib/pro-access";
import { hasFullFeatureAccess } from "@/lib/beta-access";
export const dynamic = "force-dynamic";
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      name: z.string().trim().min(1).max(80),
      view: reportViewSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id: z.string().min(1).max(128),
      revision: z.number().int().positive(),
      name: z.string().trim().min(1).max(80),
      view: reportViewSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      id: z.string().min(1).max(128),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const { workspaceId } = await authorizeReports(request);
    const reports = await prisma.savedReport.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, name: true, view: true, revision: true },
    });
    return reportResponse({
      reports: reports.filter(
        (r) => reportViewSchema.safeParse(r.view).success,
      ),
    });
  } catch {
    return reportResponse({ error: "Unable to load saved reports." }, 403);
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { user, workspaceId, isGuest } = await authorizeReports(request);
    if (isGuest)
      return reportResponse({ error: "Sign in to save a report." }, 403);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 24000)
      return reportResponse({ error: "Report settings are too large." }, 413);
    const input = inputSchema.parse(JSON.parse(raw));
    if (
      input.action !== "delete" &&
      !hasFullFeatureAccess((await getProAccess(user.id)).planTier)
    )
      return reportResponse(
        { error: "Saved reports are available with Clover Plus and Pro." },
        403,
      );
    const result = await prisma.$transaction(async (tx) => {
      // Serialize per Profile to keep the limit and optimistic revisions consistent.
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
      if (input.action === "create") {
        if ((await tx.savedReport.count({ where: { workspaceId } })) >= 50)
          return null;
        return tx.savedReport.create({
          data: {
            workspaceId,
            name: input.name,
            view: input.view as Prisma.InputJsonValue,
          },
        });
      }
      const where = { id: input.id, workspaceId, revision: input.revision };
      if (input.action === "delete")
        return (await tx.savedReport.deleteMany({ where })).count
          ? { deleted: true }
          : null;
      const changed = await tx.savedReport.updateMany({
        where,
        data: {
          name: input.name,
          view: input.view as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      return changed.count ? { updated: true } : null;
    });
    return result
      ? reportResponse({ ok: true })
      : reportResponse(
          {
            error:
              input.action === "create"
                ? "You can save up to 50 reports per Profile."
                : "This report changed elsewhere. Reload saved reports before trying again.",
          },
          409,
        );
  } catch {
    return reportResponse(
      {
        error:
          "Unable to save this report. Check its name and settings, then try again.",
      },
      400,
    );
  }
}
