import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminRealUserSqlPredicate } from "@/lib/admin-data-scope";

export type AdminTrackedVolumeCurrency = {
  currency: string;
  amount: string;
  transactionCount: number;
};

export type AdminTransactionVolumeSnapshot = {
  transactionCount: number;
  trackedVolumeByCurrency: AdminTrackedVolumeCurrency[];
};

type AdminTransactionVolumeRow = {
  currency: string;
  transactionCount: bigint;
  trackedTransactionCount: bigint;
  trackedAmount: Prisma.Decimal | string | number | null;
};

export async function getAdminTransactionVolumeSnapshot(): Promise<AdminTransactionVolumeSnapshot> {
  const rows = await prisma.$queryRaw<AdminTransactionVolumeRow[]>(Prisma.sql`
    SELECT
      UPPER(COALESCE(NULLIF(TRIM(t."currency"), ''), 'PHP')) AS "currency",
      COUNT(*)::bigint AS "transactionCount",
      COUNT(*) FILTER (
        WHERE t."isExcluded" = false
          AND t."isTransfer" = false
          AND t."type" <> 'transfer'::"TransactionType"
      )::bigint AS "trackedTransactionCount",
      COALESCE(
        SUM(ABS(t."amount")) FILTER (
          WHERE t."isExcluded" = false
            AND t."isTransfer" = false
            AND t."type" <> 'transfer'::"TransactionType"
        ),
        0
      ) AS "trackedAmount"
    FROM "Transaction" t
    INNER JOIN "Workspace" w ON w."id" = t."workspaceId"
    INNER JOIN "User" u ON u."id" = w."userId" AND ${adminRealUserSqlPredicate("u")}
    WHERE t."deletedAt" IS NULL
    GROUP BY UPPER(COALESCE(NULLIF(TRIM(t."currency"), ''), 'PHP'))
  `);

  const trackedVolumeByCurrency = rows
    .filter((row) => Number(row.trackedTransactionCount) > 0)
    .map((row) => ({
      currency: row.currency,
      amount: String(row.trackedAmount ?? 0),
      transactionCount: Number(row.trackedTransactionCount),
    }))
    .sort((left, right) => {
      if (left.currency === "PHP") return -1;
      if (right.currency === "PHP") return 1;
      return left.currency.localeCompare(right.currency);
    });

  return {
    transactionCount: rows.reduce(
      (total, row) => total + Number(row.transactionCount),
      0,
    ),
    trackedVolumeByCurrency,
  };
}
