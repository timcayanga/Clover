import { z } from "zod";
import { prisma } from "./prisma";
import { assertWorkspaceAccess } from "./workspace-access";
import { withMobileRequestContext } from "./mobile-request-context";

const name = z.string().trim().min(1).max(80);
const id = z.string().min(1).max(240);
const categoryFields = [
  "id",
  "name",
  "type",
  "isSystem",
  "isArchived",
  "parentCategoryId",
] as const;
const projectCategory = (input: Record<string, unknown>) =>
  Object.fromEntries(categoryFields.map((key) => [key, input[key]]));
const json = (data: unknown, status = 200) => Response.json(data, { status });

// Called only after native JWT verification. Every forwarded Request gets its
// own exact request-local principal; payloads never choose a different owner.
export async function handleMobileSettings(
  request: Request,
  userId: string,
  operation: string,
  resourceId?: string,
) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("content-length");
  let body: unknown;
  if (
    ["POST", "PATCH", "DELETE"].includes(request.method) &&
    !(operation === "settings-profile" && request.method === "DELETE")
  ) {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 8192)
      return json({ error: "Details are too large." }, 413);
    body = JSON.parse(text);
  }
  if (operation === "settings-profiles" && request.method === "GET") {
    const profiles = await prisma.workspace.findMany({
      where: { user: { clerkUserId: userId } },
      select: { id: true, name: true, type: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const required = profiles.find((profile) => profile.type === "personal");
    return json({
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        required: profile.id === required?.id,
      })),
    });
  }
  if (operation === "settings-profiles")
    body = { ...z.object({ name }).strict().parse(body), type: "personal" };
  if (operation === "settings-profile") {
    id.parse(resourceId);
    await assertWorkspaceAccess(userId, resourceId!);
    if (request.method === "PATCH")
      body = z.object({ name }).strict().parse(body);
  }
  if (operation === "settings-categories") {
    const workspaceId = id.parse(url.searchParams.get("workspaceId"));
    await assertWorkspaceAccess(userId, workspaceId);
    if (request.method === "POST")
      body = {
        ...z
          .object({
            name,
            type: z.enum(["income", "expense", "transfer"]),
            parentCategoryId: id.nullable().optional(),
          })
          .strict()
          .parse(body),
        workspaceId,
      };
    if (request.method === "PATCH" || request.method === "DELETE") {
      const data =
        request.method === "DELETE"
          ? z.object({ id }).strict().parse(body)
          : z
              .object({
                id,
                name: name.optional(),
                type: z.enum(["income", "expense", "transfer"]).optional(),
                isArchived: z.boolean().optional(),
                parentCategoryId: id.nullable().optional(),
              })
              .strict()
              .parse(body);
      if (
        !(await prisma.category.findFirst({
          where: { id: data.id, workspaceId },
          select: { id: true },
        }))
      )
        return json({ error: "Category not found in this Profile." }, 404);
      body = data;
    }
  }
  const forwarded = new Request(url, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return withMobileRequestContext(userId, forwarded, async () => {
    let response: Response;
    if (operation === "settings-profiles")
      response = await (
        await import("@/app/api/workspaces/route")
      ).POST(forwarded);
    else if (operation === "settings-profile") {
      const route = await import("@/app/api/workspaces/[workspaceId]/route");
      const context = { params: Promise.resolve({ workspaceId: resourceId! }) };
      response =
        request.method === "PATCH"
          ? await route.PATCH(forwarded, context)
          : await route.DELETE(forwarded, context);
    } else {
      const route = await import("@/app/api/categories/route");
      response =
        await route[request.method as "GET" | "POST" | "PATCH" | "DELETE"](
          forwarded,
        );
    }
    const data = await response.json();
    if (!response.ok)
      return json(
        {
          error:
            typeof data.error === "string"
              ? data.error
              : "Check the selected details.",
        },
        response.status,
      );
    if (operation.startsWith("settings-profile"))
      return json({
        ...(data.workspace
          ? { profile: { id: data.workspace.id, name: data.workspace.name } }
          : {}),
        ...(data.ok ? { deleted: true } : {}),
      });
    return json({
      ...(Array.isArray(data.categories)
        ? { categories: data.categories.map(projectCategory) }
        : {}),
      ...(data.category ? { category: projectCategory(data.category) } : {}),
      ...(data.ok || data.success ? { deleted: true } : {}),
    });
  });
}
