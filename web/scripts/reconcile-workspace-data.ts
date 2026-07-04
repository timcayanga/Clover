import { prisma } from "@/lib/prisma";
import { reconcileWorkspaceData } from "@/lib/reconciliation";

const shouldApply = process.argv.includes("--apply");

const run = async () => {
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      user: {
        select: {
          email: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const summary = {
    workspaces: workspaces.length,
    repairedTransactionWorkspaceRows: 0,
    issues: 0,
  };

  for (const workspace of workspaces) {
    const issues = shouldApply
      ? await reconcileWorkspaceData(workspace.id)
      : await prisma.$transaction(async (tx) => {
          const mismatchedRows = await tx.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count
            FROM "Transaction" t
            INNER JOIN "Account" a ON a."id" = t."accountId"
            WHERE a."workspaceId" = ${workspace.id}
              AND t."workspaceId" <> a."workspaceId"
              AND t."deletedAt" IS NULL
          `;

          return [
            ...(Number(mismatchedRows[0]?.count ?? 0) > 0
              ? [
                  {
                    type: "transaction_workspace_mismatch" as const,
                    severity: "warning" as const,
                    message: `${Number(mismatchedRows[0]?.count ?? 0)} transaction rows would be reconnected to this profile from their linked accounts.`,
                    entityIds: [],
                  },
                ]
              : []),
          ];
        });

    const repairedIssue = issues.find((issue) => issue.type === "transaction_workspace_mismatch");
    const repairedRows = Number(repairedIssue?.message.match(/^\d+/)?.[0] ?? 0);
    summary.repairedTransactionWorkspaceRows += repairedRows;
    summary.issues += issues.length;

    if (issues.length > 0) {
      console.info(
        `[${shouldApply ? "reconciled" : "dry-run"}] ${workspace.name} (${workspace.user.email})`,
        issues.map((issue) => `${issue.severity}:${issue.type}`).join(", ")
      );
    }
  }

  console.info(
    `${shouldApply ? "Reconciliation complete" : "Dry run complete"}. ` +
      `${summary.workspaces} workspaces checked, ${summary.repairedTransactionWorkspaceRows} transaction workspace rows ${
        shouldApply ? "repaired" : "would be repaired"
      }, ${summary.issues} issues ${shouldApply ? "reported" : "detected"}.`
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
