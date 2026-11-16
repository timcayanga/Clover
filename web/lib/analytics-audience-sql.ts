import { Prisma } from "@prisma/client";
import { measurementConfig, syntheticSuffixes } from "./analytics-audience-rules";
/** Bound values only; caller supplies a fixed source alias, never a request parameter. */
export function customerAnalyticsSqlPredicate(alias: "u", environment: string) {
  const c=measurementConfig(), u=Prisma.raw(alias);
  return Prisma.sql`${u}."environment" = ${environment}
    AND ${u}."clerkUserId" NOT IN (${Prisma.join([...c.staffIds,...c.testIds])})
    AND LOWER(${u}."email") NOT IN (${Prisma.join([...c.staffEmails,...c.testEmails])})
    AND NOT EXISTS (SELECT 1 FROM "AdminMember" am WHERE am."clerkUserId"=${u}."clerkUserId" AND am."active"=true)
    ${Prisma.join(syntheticSuffixes.map(suffix=>Prisma.sql`AND LOWER(${u}."email") NOT LIKE ${`%${suffix}`}`)," ")}`;
}
