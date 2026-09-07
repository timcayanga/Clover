import { verifyToken } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminOnlyUserId, isConfiguredAdminEmail } from "@/lib/admin-access";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { withMobileRequestContext } from "@/lib/mobile-request-context";
import {
  mobileOperation,
  mobileResponseHeaders,
  mobileSessionUser,
} from "@/lib/mobile-api-policy";
import { getProAccess } from "@/lib/pro-access";
import { mobileApiResponse } from "@/lib/mobile-api-response";
import { getCurrentUserEnvironment } from "@/lib/user-environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "sin1";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: mobileResponseHeaders });
const editSchema = z
  .object({
    merchantClean: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  // Launch separately from the web app. Never inherit staging/local guest auth.
  if (process.env.CLOVER_MOBILE_API_ENABLED !== "true")
    return reply({ error: "Mobile account access is not enabled yet." }, 503);
  // Reject local fixtures before authentication, entitlement reads, or dispatch.
  if (getCurrentUserEnvironment() === "local")
    return reply({ error: "Use the configured staging API for native account testing." }, 503);
  const { path } = await context.params;
  const operation = mobileOperation(request.method, path);
  if (!operation || path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part)))
    return reply({ error: "Not found" }, 404);
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return reply({ error: "Sign in to Clover." }, 401);
  let userId: string;
  try {
    const claims = await verifyToken(bearer, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const verifiedUser = mobileSessionUser(claims);
    if (!verifiedUser)
      return reply({ error: "A valid Clover session is required." }, 401);
    userId = verifiedUser;
  } catch {
    return reply({ error: "Your session expired. Please sign in again." }, 401);
  }
  try {
    if (isAdminOnlyUserId(userId) || (await isConfiguredAdminEmail(userId)))
      return reply({ error: "Use the Admin website for this account." }, 403);
    // Existing accounts only during the first native preview; onboarding stays
    // on the website until its native equivalent is ready.
    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      select: { id: true, firstName: true },
    });
    if (!user)
      return reply(
        {
          error:
            "Please finish setting up your Clover account on the website first.",
        },
        409,
      );
    if (operation === "bootstrap") {
      const [profiles, access] = await Promise.all([
        prisma.workspace.findMany({
          where: { userId: user.id },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        }),
        getProAccess(user.id),
      ]);
      return reply({
        apiVersion: 1,
        firstName: user.firstName,
        profiles,
        entitlement: {
          planTier: access.planTier,
          accessEndsAt: access.accessEndsAt,
          renewing: access.renewing,
          nativePurchasesAvailable: false,
        },
      });
    }
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) return reply({ error: "Choose a Profile first." }, 400);
    await assertWorkspaceAccess(userId, workspaceId);
    if (operation === "transaction") {
      const row = await prisma.transaction.findFirst({
        where: { id: path[1], workspaceId, deletedAt: null },
        select: { id: true },
      });
      if (!row) return reply({ error: "Transaction not found" }, 404);
    }
    if (operation.startsWith("import-")) {
      const row = await prisma.importFile.findFirst({
        where: { id: path[1] },
        select: { workspaceId: true },
      });
      if (
        row ? row.workspaceId !== workspaceId : operation !== "import-process"
      )
        return reply({ error: "Import not found" }, 404);
    }
    let forwarded = request;
    if (operation === "transaction" && request.method === "PATCH") {
      if (Number(request.headers.get("content-length") ?? 0) > 16384)
        return reply({ error: "Edit is too large." }, 413);
      const body = editSchema.parse(await request.json());
      forwarded = new Request(request.url, {
        method: "PATCH",
        headers: request.headers,
        body: JSON.stringify(body),
      });
    }
    if (["transactions", "accounts", "imports"].includes(operation)) {
      // Do not expose unbounded list queries to mobile.
      url.searchParams.set("pageSize", "30");
      url.searchParams.set("summaryMode", "light");
      const page = Number(url.searchParams.get("page") ?? 1);
      url.searchParams.set(
        "page",
        String(Number.isInteger(page) && page > 0 && page < 100000 ? page : 1),
      );
      forwarded = new Request(url, { headers: request.headers });
    }
    if (operation === "import-process") {
      if (!request.headers.get("content-type")?.includes("multipart/form-data"))
        return reply({ error: "Choose a file to upload." }, 400);
      // This first native transport respects the host's 4.5 MB request limit.
      if (Number(request.headers.get("content-length") ?? 0) > 4_000_000)
        return reply(
          { error: "For files over 3.5 MB, use Clover on the web for now." },
          413,
        );
      const data = await request.formData();
      const file = data.get("file");
      if (!(file instanceof File) || file.size > 3_500_000)
        return reply(
          { error: "Choose a file smaller than 3.5 MB for this preview." },
          413,
        );
      // Reconstruct only supported fields; no training/duplicate bypass flags.
      const safe = new FormData();
      safe.set("file", file);
      safe.set("workspaceId", workspaceId);
      safe.set("fileName", file.name);
      safe.set("fileType", file.type);
      if (typeof data.get("password") === "string")
        safe.set("password", String(data.get("password")));
      const headers = new Headers(request.headers);
      headers.delete("content-type");
      headers.delete("content-length");
      forwarded = new Request(request.url, {
        method: "POST",
        headers,
        body: safe,
      });
    }
    const response = await withMobileRequestContext(
      userId,
      forwarded,
      async () => {
        switch (operation) {
          case "transactions":
            return (await import("@/app/api/transactions/route")).GET(
              forwarded,
            );
          case "accounts":
            return (await import("@/app/api/accounts/route")).GET(forwarded);
          case "imports":
            return (await import("@/app/api/imports/route")).GET(forwarded);
          case "transaction": {
            const route = await import(
              "@/app/api/transactions/[transactionId]/route"
            );
            const params = {
              params: Promise.resolve({ transactionId: path[1] }),
            };
            return request.method === "PATCH"
              ? route.PATCH(forwarded, params)
              : route.GET(forwarded, params);
          }
          case "import-process":
            return (
              await import("@/app/api/imports/[importId]/process/route")
            ).POST(forwarded, {
              params: Promise.resolve({ importId: path[1] }),
            });
          case "import-status":
            return (
              await import("@/app/api/imports/[importId]/status/route")
            ).GET(forwarded, {
              params: Promise.resolve({ importId: path[1] }),
            });
          case "import-resume":
            return (
              await import("@/app/api/imports/[importId]/resume/route")
            ).POST(forwarded, {
              params: Promise.resolve({ importId: path[1] }),
            });
          default:
            return reply({ error: "Not found" }, 404);
        }
      },
    );
    return reply(
      mobileApiResponse(operation, await response.json()),
      response.status,
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply({ error: "Please check the transaction fields." }, 400);
    if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND")
      return reply({ error: "Profile not found" }, 404);
    return reply(
      { error: "Clover could not complete this request. Please retry." },
      503,
    );
  }
}

export { handle as GET, handle as PATCH, handle as POST };
