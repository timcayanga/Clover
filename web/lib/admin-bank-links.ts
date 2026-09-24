import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminRealUserSqlPredicate } from "@/lib/admin-data-scope";
import { summarizeBankLinks } from "@/lib/admin-bank-link-metrics";

// Match linked-bank allowance semantics: syncing/error connections still own
// their links; disconnected connections and deleted accounts do not count.
export async function loadAdminBankLinks(userIds?: string[]) {
  if (userIds?.length === 0) return { summary: summarizeBankLinks([]), counts: new Map<string, number>() };
  const rows = await prisma.$queryRaw<Array<{ userId: string; bankId: string; bankName: string; count: bigint }>>(Prisma.sql`
    SELECT w."userId", COALESCE(NULLIF(c."institutionId", ''), 'name:' || LOWER(TRIM(COALESCE(NULLIF(c."institutionName", ''), NULLIF(a.institution, ''), 'Unknown bank')))) AS "bankId",
      MIN(COALESCE(NULLIF(c."institutionName", ''), NULLIF(a.institution, ''), 'Unknown bank')) AS "bankName",
      COUNT(DISTINCT l."accountId")::bigint AS count
    FROM "FinverseAccountLink" l
    JOIN "FinverseConnection" c ON c.id = l."connectionId" AND c."workspaceId" = l."workspaceId"
    JOIN "Account" a ON a.id = l."accountId" AND a."workspaceId" = l."workspaceId"
    JOIN "Workspace" w ON w.id = l."workspaceId" AND w."userId" = c."userId"
    JOIN "User" u ON u.id = w."userId"
    WHERE c.status <> 'disconnected' AND ${adminRealUserSqlPredicate("u")}
      ${userIds ? Prisma.sql`AND u.id IN (${Prisma.join(userIds)})` : Prisma.empty}
    GROUP BY w."userId", "bankId"
  `);
  const counts = new Map<string, number>();
  const metrics = rows.map(row => ({ ...row, count: Number(row.count) }));
  for (const row of metrics) counts.set(row.userId, (counts.get(row.userId) ?? 0) + row.count);
  return { summary: summarizeBankLinks(metrics), counts };
}
