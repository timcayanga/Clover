import { z } from "zod";
import { prisma } from "./prisma";
import { assertWorkspaceAccess } from "./workspace-access";
import { withMobileRequestContext } from "./mobile-request-context";
const deletion = z
  .object({
    workspaceId: z.string().min(1),
    beforeDate: z.string().datetime(),
    scope: z.enum(["transactions", "balances", "accounts"]),
    confirmation: z.literal("DELETE"),
  })
  .strict();
export async function handleMobileDataSettings(
  request: Request,
  userId: string,
  operation: string,
  kind?: string,
) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("content-length");
  if (operation === "settings-wipe-data") {
    z.object({ confirmation: z.literal("DELETE ALL DATA") })
      .strict()
      .parse(await request.json());
    const forwarded = new Request(url, { method: "POST", headers });
    return withMobileRequestContext(userId, forwarded, () =>
      import("@/app/api/account/wipe-data/route").then((route) =>
        route.POST(forwarded),
      ),
    );
  }
  if (operation === "settings-delete-account") {
    z.object({ confirmation: z.literal("DELETE MY ACCOUNT") })
      .strict()
      .parse(await request.json());
    const forwarded = new Request(url, { method: "POST", headers });
    return withMobileRequestContext(userId, forwarded, () =>
      import("@/app/api/account/delete/route").then((route) =>
        route.POST(forwarded),
      ),
    );
  }
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  await assertWorkspaceAccess(userId, workspaceId);
  if (operation === "settings-data" && request.method === "GET") {
    const [accounts, transactions, checkpoints, imports] = await Promise.all([
      prisma.account.count({ where: { workspaceId } }),
      prisma.transaction.count({ where: { workspaceId } }),
      prisma.accountStatementCheckpoint.count({ where: { workspaceId } }),
      prisma.importFile.count({ where: { workspaceId } }),
    ]);
    return Response.json({
      counts: { accounts, transactions, checkpoints, imports },
    });
  }
  if (operation === "settings-data") {
    const input = deletion.parse(await request.json());
    if (input.workspaceId !== workspaceId)
      return Response.json(
        { error: "The selected Profile changed. Review the deletion again." },
        { status: 400 },
      );
    const { confirmation, ...body } = input;
    const forwarded = new Request(url, {
      method: "DELETE",
      headers,
      body: JSON.stringify(body),
    });
    return withMobileRequestContext(userId, forwarded, () =>
      import("@/app/api/settings/data/route").then((route) =>
        route.DELETE(forwarded),
      ),
    );
  }
  const forwarded = new Request(url, { method: "GET", headers });
  return withMobileRequestContext(userId, forwarded, async () => {
    const route =
      kind === "transactions"
        ? await import("@/app/api/settings/export/transactions/route")
        : await import("@/app/api/settings/export/account-balances/route");
    return route.GET(forwarded);
  });
}
