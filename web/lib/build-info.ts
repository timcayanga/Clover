export type AppBuildInfo = {
  buildId: string;
  deploymentId: string | null;
  gitSha: string | null;
  environment: string;
};

export const getAppBuildInfo = (): AppBuildInfo => ({
  buildId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_BUILD_ID ?? "local",
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
});
