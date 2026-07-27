import { Prisma } from "@prisma/client";
import { getAdminDataEnvironment } from "@/lib/admin";
import { getAppBuildInfo } from "@/lib/build-info";

const SYNTHETIC_EMAIL_SUFFIXES = ["@placeholder.local", "@example.com"] as const;
const SYNTHETIC_CLERK_USER_IDS = [
  "local-admin",
  "staging-guest",
  "seed-demo-user",
] as const;

export const isSyntheticAdminUserIdentity = ({
  clerkUserId,
  email,
}: {
  clerkUserId: string;
  email: string;
}) => {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    SYNTHETIC_EMAIL_SUFFIXES.some((suffix) =>
      normalizedEmail.endsWith(suffix),
    ) || SYNTHETIC_CLERK_USER_IDS.includes(clerkUserId as never)
  );
};

export const getAdminRealUserWhere = (): Prisma.UserWhereInput => ({
  environment: getAdminDataEnvironment(),
  NOT: [
    ...SYNTHETIC_EMAIL_SUFFIXES.map((suffix) => ({
      email: { endsWith: suffix, mode: Prisma.QueryMode.insensitive },
    })),
    { clerkUserId: { in: [...SYNTHETIC_CLERK_USER_IDS] } },
  ],
});

export const getAdminRealWorkspaceWhere = (): Prisma.WorkspaceWhereInput => ({
  user: getAdminRealUserWhere(),
});

export const getCurrentDeploymentErrorWhere =
  (since?: Date): Prisma.AppErrorLogWhereInput => {
    const environment = getAdminDataEnvironment();
    const build = getAppBuildInfo();
    const deploymentScope = build.deploymentId
      ? {
          OR: [
            { deploymentId: build.deploymentId },
            { buildId: build.deploymentId },
          ],
        }
      : build.gitSha
        ? {
            OR: [
              { deploymentId: build.gitSha },
              { buildId: build.gitSha },
            ],
          }
        : {};

    return {
      environment,
      ...(since ? { occurredAt: { gte: since } } : {}),
      ...deploymentScope,
    };
  };

export const adminRealUserSqlPredicate = (
  alias: string,
): Prisma.Sql => Prisma.sql`
  ${Prisma.raw(alias)}."environment" = ${getAdminDataEnvironment()}
  AND LOWER(${Prisma.raw(alias)}."email") NOT LIKE '%@placeholder.local'
  AND LOWER(${Prisma.raw(alias)}."email") NOT LIKE '%@example.com'
  AND ${Prisma.raw(alias)}."clerkUserId" NOT IN (${Prisma.join([
    ...SYNTHETIC_CLERK_USER_IDS,
  ])})
`;
