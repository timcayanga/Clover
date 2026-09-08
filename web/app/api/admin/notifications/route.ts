import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdminAuth, getAdminDataEnvironment } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { loadNotificationTemplates } from "@/lib/notification-templates.server";
import {
  defaultNotificationTemplates,
  notificationTemplateSchema,
} from "@/lib/notification-template-rules";

export const dynamic = "force-dynamic";
const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const mutationSchema = z
  .object({
    action: z.enum(["create", "update", "delete", "restore"]),
    key: z.string().min(1).max(100).optional(),
    version: z.number().int().nonnegative(),
    template: notificationTemplateSchema.optional(),
  })
  .strict();
export async function GET() {
  try {
    await requireAdminAuth();
  } catch {
    return response({ error: "Admin access required." }, 403);
  }
  try {
    const environment = getAdminDataEnvironment();
    const [templates, history, deliveries, cursor] = await Promise.all([
      loadNotificationTemplates(environment),
      prisma.notificationTemplateAudit.findMany({
        where: { environment },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          templateKey: true,
          actorId: true,
          action: true,
          createdAt: true,
        },
      }),
      prisma.notificationEmailDelivery.findMany({
        where: { environment },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, templateKey: true, status: true, createdAt: true },
      }),
      prisma.notificationDispatchCursor.findUnique({
        where: { environment },
        select: { updatedAt: true },
      }),
    ]);
    return response({
      templates,
      history,
      deliveries,
      environment,
      lastDispatchAt: cursor?.updatedAt ?? null,
    });
  } catch {
    return response(
      {
        error:
          "Unable to load notification configuration. Check database migration and connectivity.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  let admin;
  try {
    assertTrustedRequestOrigin(request);
    admin = await requireAdminAuth();
  } catch {
    return response(
      { error: "Admin access and a trusted origin are required." },
      403,
    );
  }
  const text = await request.text();
  if (text.length > 32_000)
    return response({ error: "Notification is too large." }, 413);
  const parsed = mutationSchema.safeParse(
    (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success)
    return response(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      400,
    );
  const { action, template, version } = parsed.data;
  const key = action === "create" ? `custom-${randomUUID()}` : parsed.data.key;
  if (!key || (["create", "update"].includes(action) && !template))
    return response(
      { error: "Choose a template and complete its content." },
      400,
    );
  const environment = getAdminDataEnvironment();
  try {
    await prisma.$transaction(
      async (tx) => {
        const stored = await tx.notificationTemplate.findUnique({
          where: { environment_key: { environment, key } },
        });
        const original =
          stored ?? defaultNotificationTemplates.find((t) => t.key === key);
        if (action !== "create" && !original) throw new Error("NOT_FOUND");
        if ((stored?.version ?? 0) !== version) throw new Error("CONFLICT");
        if (action === "update" && original?.archived)
          throw new Error("ARCHIVED");
        if (template && original && original.triggerKey !== template.triggerKey)
          throw new Error("TRIGGER_LOCKED");
        const source = template ?? original!;
        const draft = notificationTemplateSchema.parse(
          Object.fromEntries(
            [
              "name",
              "triggerKey",
              "enabled",
              "inApp",
              "email",
              "title",
              "body",
              "ctaLabel",
              "emailSubject",
              "emailBody",
            ].map((field) => [field, source[field as keyof typeof source]]),
          ),
        );
        const archived =
          action === "delete"
            ? true
            : action === "restore"
              ? false
              : (original?.archived ?? false);
        // Re-enabling email starts from now. Editing copy alone does not resend history.
        const wasEmailActive =
          original?.enabled && original.email && !original.archived;
        const emailEnabledAt =
          draft.enabled && draft.email && !archived
            ? wasEmailActive
              ? (stored?.emailEnabledAt ?? null)
              : new Date()
            : (stored?.emailEnabledAt ?? null);
        const data = {
          ...draft,
          archived,
          emailEnabledAt,
          version: version + 1,
        };
        const after = stored
          ? await tx.notificationTemplate.update({
              where: { environment_key: { environment, key } },
              data,
            })
          : await tx.notificationTemplate.create({
              data: { ...data, environment, key },
            });
        await tx.notificationTemplateAudit.create({
          data: {
            environment,
            templateKey: key,
            actorId: admin.userId,
            action,
            before: original
              ? JSON.parse(JSON.stringify(original))
              : Prisma.JsonNull,
            after: JSON.parse(JSON.stringify(after)),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return response({ ok: true, key });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (
      code === "CONFLICT" ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code))
    )
      return response(
        { error: "Another Admin changed this template. Reload before saving." },
        409,
      );
    if (code === "TRIGGER_LOCKED")
      return response(
        { error: "Create a new template to use a different trigger." },
        400,
      );
    if (code === "ARCHIVED")
      return response({ error: "Restore this template before editing." }, 400);
    if (code === "NOT_FOUND")
      return response({ error: "Template not found." }, 404);
    return response(
      { error: "Unable to save notification. No changes were applied." },
      500,
    );
  }
}
